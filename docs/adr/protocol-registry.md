# ADR-007：接入方式用「代码注册表」，不用「用户可编辑的协议配置」
- **编号**：007

- **状态**：**部分被 ADR-008 修订**（2026-10-10）—— §1 结论表中「用户可编辑的协议配置」仍不需要，但「协议定义 + 与上游文档的对齐关系」按 ADR-008 保留为资产；本 ADR 其余结论不变
- **日期**：2026-10-10
- **相关**：ADR-003（路由层）、ADR-004（中转站与供给池）、ADR-005（设置中心 IA）
- **编号说明**：原拟 006，因与另一条并行线（智能创造工作台）的 ADR-006 冲突，本线让号为 007
- **触发**：Owner 提问"「协议配置」是否还需要"，并给出参考项目 `VOZEB-PRO`

---

## 1. 结论

| | 是否需要 |
|---|---|
| **「把不同上游 HTTP 形状统一起来」这个能力** | ✅ **必须保留** |
| **「用户可编辑的协议配置页面 + 表」** | ❌ **不需要** —— 这是我们的过度设计 |

正确形态：**协议定义在代码里（注册表）**；界面上只给一个「**接入方式**」下拉，其余自动。

---

## 2. 参考实现的实测证据（`VOZEB-PRO/web/src/lib/channel-protocol-registry.ts`，493 行）

```ts
export type ChannelProtocolDefinition = {
  id, label, description,
  apiFormat,               // openai / gemini / seedance …
  authMode, defaultBaseUrl,
  modelCatalogPaths: string[],              // 从哪拉模型清单
  capabilities: LogicalModelCapability[],
  operations: Partial<Record<Capability, {
    createPath, editPath, imageToVideoPath, queryPath,
    requestTemplate,        // ★ 带 {{占位符}} 的请求模板字符串
    resultField,            // 如 "data[0].url / data[0].b64_json"、"/videos/:task_id/content"
    statusField,            // 如 "status" / "done"
    referenceRule,          // ★ 人类可读的参考图规则说明
    supportsReferenceImage/Video/Audio,
    durationRange,
  }>>,
  builtInModels?,          // 内置模型清单
  strict?, advanced?,
}
```
另有 `retiredProtocolIds` 机制（协议定义可退役）、`channelProtocolOptions()`（供 UI 下拉）、
`protocolAuthHeaders(apiKey, {protocol, authMode, authHeader, authPrefix})`。

### 与我们现状的差异

| 维度 | 我们 | 参考实现 | 评判 |
|---|---|---|---|
| 协议定义位置 | **DB 表 + 用户可编辑 UI** | **代码注册表** | 代码更优：类型安全、可测试、可退役、可 code review |
| 参数映射 | `params[]` + `role=model/runtime` + `__passthrough` | **`requestTemplate` 字符串 + `{{占位符}}`** | **他们更优**：一眼看懂请求体；能表达"参考图塞进 multipart 的 input_reference" |
| 响应提取 | `response_params[]` 点号路径 | `resultField`（含 `data[0].url`、`binary`） | 平手，但他们把"二进制"也纳入表达 |
| 异步 | `async{enabled,pollPath,statusField,doneValue,failValue,taskIdField}` | `queryPath` + `statusField` | 平手；我们更显式 |
| 能力 | `capabilities` JSONB | `capabilities[]` + `supportsReference*` + `durationRange` + **`referenceRule`（人读说明）** | **他们更优**：能力带"人话解释"，可直接进 UI |
| 模型清单 | 用户手工建目录行 | `builtInModels` / `modelCatalogPaths` 自动拉 | **他们更优**，与 ADR-004 的"同步"同向 |
| 鉴权 | `auth_type` 枚举（bearer/apikey/sign/**token**/none） | `authMode` + **`authHeader`** + **`authPrefix`** | **他们更优** —— 见 §3 |

---

## 3. 一个直接命中我们痛点的设计：`authHeader` + `authPrefix`

我们为了对接 AutoDL（要求 `Authorization: <Token>`，**无 `Bearer ` 前缀**），
不得不：① 在 engine 三处改代码 ② 新增 `auth_type='token'` ③ **写迁移放宽 `auth_type` 的 CHECK**
（`workspace/005` + `production/024`）。

参考实现用**两个字段**通吃：`authHeader`（头名）+ `authPrefix`（前缀，可空）。

**教训**：`auth_type` 这种封闭枚举是**过度约束** —— 每遇到一种新形态就要改枚举 + 改 CHECK + 加迁移。
应改为**数据驱动**：`{ authHeader: string, authPrefix: string }`，「裸 token」= `("Authorization","")`。

---

## 4. 决策

### D1：协议定义迁到**代码注册表**，DB 表保留但降级为"覆盖项"
- 内置接入方式（openai 兼容 / 即梦 / MiniMax / Gemini / ComfyUI 工作流 / AutoDL …）定义在 Go 代码里
- `protocol_templates` 表**保留**（向后兼容：现有 4 个模板与 `model_catalog.protocol_template_id` 不动），但：
  - 内置项由**代码注册表**提供，不再要求用户编辑
  - 表只用于**专家模式的少量覆盖**（如某渠道路径不同）
- 现有 UI 的"协议配置"页面**取消一级导航**（ADR-005 D2 已定），且**不再提供"从零手写协议"的界面**

### D2：鉴权改为 `authHeader` + `authPrefix`（数据驱动）
- 新增两列；`auth_type` 保留并映射（`bearer` → `("Authorization","Bearer ")`，`token` → `("Authorization","")`）
- 新渠道一律用新字段；迁移**只增不改**

### D3：请求模板改用 `{{占位符}}` 字符串
- 从 `params[]` + `role` 抽象，改为**一个可读的模板字符串**
- 理由：能表达 multipart/嵌套结构；用户与开发者都能一眼核对；减少一类"role 语义"的学习成本
- **状态（2026-10-17 更新，TASK-PROTOCOL-001）**：渲染器 + 迁移 028 列已就绪；**等价可迁移子集已生效**
  （`pt_builtin_minimax_text` + `pt_builtin_comfyui`，各有金标准等价性测试锁定）；
  其余协议**不回填**——判别标准与逐协议裁定见迁移 `065_request_template_comfyui.sql` 注释：
  - 模板可安全迁移 ⇔ ① 占位符集合 ⊆ 执行器恒 Present 的 key 集合；
    ② 模板请求体字段集合 == params[] 形态发送集合（模板形态不再合并 params[] 组装的字段）；
    ③ 有金标准等价性测试（同输入，两边 json.Unmarshal 后 DeepEqual）
  - **pt_builtin_openai（14 字段含可选 runtime）禁止回填**：模板含 tools/user ⇒ 业务缺省即
    `ErrTemplateMissingValue`（破坏现有「缺省不发送」行为）；不含 ⇒ 丢字段。两者都不等价
  - grsai / jimeng_image / jimeng_video / minimax_video（空 params，靠 `__passthrough`）不回填：无增益
  - openai_img 列为候选（prompt Present 非恒真），待有真实业务调用时逐场景评估

### D4：`capabilities` 增加**人读说明**（`referenceRule` 等）
让"这个模型能不能用参考图、怎么用"能直接展示在 UI（ADR-005 D7「能力在选型时可被感知」）。

### D5：模型清单优先来自**同步/内置清单**，而非手工建目录行
与 ADR-004 的同步能力一致（`modelCatalogPaths` ↔ 我们的 `sync_models_path`）。

---

## 5. 迁移方案（增量，不破坏）

| 步骤 | 内容 |
|---|---|
| 1 | 在 `services/production/internal/catalog/` 增**代码注册表**（Go 结构体 + 内置定义），提供与现表同形的读取接口 |
| 2 | `model_channels` 增 `auth_header` / `auth_prefix`（可空）；`auth_type` 保留并映射 |
| 3 | 渠道向导的「接入方式」下拉数据源 = 注册表（不再让用户编辑协议模板） |
| 4 | 现有 `protocol_templates` 页降级为专家模式（只读内置 + 有限覆盖） |
| 5 | 评估 `requestTemplate` 是否替换 `params[]`（可并存过渡） |

---

## 6. 非目标与合规

- ❌ **不复制参考项目代码**。`VOZEB-PRO` 含 `LICENSE`、`COMMERCIAL_LICENSE.md`、
  `COMMERCIAL_LICENSE_AGREEMENT.md`、`CLA.md`、`THIRD_PARTY_LICENSES.md`
  ⇒ **只借鉴架构与字段设计，实现必须自研**；若日后要复用任何片段，须先做许可证审查。
- ❌ 不删除 `protocol_templates` 表（存量数据与引用必须继续可用）
- ❌ 不在本 ADR 决定"是否支持用户完全自定义异构上游"（建议：**先不支持**，走专家模式）

---

## 7. 待 Owner 确认

| # | 问题 | 我的建议 |
|---|---|---|
| 1 | 协议定义迁到代码注册表、取消"用户可编辑协议"界面 | **接受** —— 我们为它付出了 407 行/30 容器页面 + 1 个迁移 + 一个真实 bug（`pollPath` UI 配不了） |
| 2 | 鉴权改为 `authHeader` + `authPrefix`（消除枚举） | **接受** —— 枚举已让我们多写 2 个迁移 |
| 3 | 请求模板改 `{{占位符}}` 字符串 | 先评估兼容，**方向赞同** |
| 4 | 是否支持用户完全自定义异构上游 | 建议**先不支持**（专家模式 + 明确免责） |
