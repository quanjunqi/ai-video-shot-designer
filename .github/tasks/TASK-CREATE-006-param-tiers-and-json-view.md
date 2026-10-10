# TASK-CREATE-006：参数三级披露 + 字段说明 + 表单/JSON 双视图

> **专业级改造第 1 片**。依据 [`docs/research/pro-tools-generation-workbench-ux-2026-10.md`](../../docs/research/pro-tools-generation-workbench-ux-2026-10.md)
> §3.1 借鉴表 **B1（schema 驱动 + 表单/JSON 双视图）** 与 **B2（参数分组 + 逐参数内联说明）**，
> 以及 §3.2 E2（**不要**把 30+ 参数平铺，要"基础/进阶/专家三层，默认只露基础"）。

## 基本信息

- **任务 ID**：TASK-CREATE-006
- **任务名称**：参数三级披露 + 每字段说明（`?`）+ 表单/JSON 双视图
- **创建日期**：2026-10-10
- **AI 执行者**：AI Agent（分支 `feat/create-workbench-2026-10-10`）
- **优先级**：P1
- **预计工时**：90 分钟

---

## 1. 目标

把参数区从"一堆平铺控件"升级为专业工作台的形态：**默认只露必要项，深度按需展开，
每个字段可自解释**；同时提供**同一份 schema 的第二种投影（JSON）**，服务集成方与排障复现。

---

## 2. 范围

### 范围内（In Scope）

- `control-schema.ts`：
  - `ControlDef` 新增 `tier: 'basic' | 'advanced' | 'expert'`
  - 新增 `TIER_LABEL` / `controlsUpToTier`（**累积披露**）/ `hasTier`
  - **为每一个控件补 `hint`**（目录产出的每个控件都必须有层级与说明 → 契约测试保证）
  - 档位分配：`prompt`/`ratio`/`count`/`voice` = 基础；`duration`/`quality`/`negative` = 进阶
- 新增 `apps/web/src/features/genworkbench/param-json.ts`：
  - `toParamJson(values, controls)` — 按控件顺序导出，只含认识的键，缺值回退默认值
  - `parseParamJson(text, controls)` — 只接受对象；标量接受 string/number/boolean；
    非法 JSON / 数组根 / 嵌套值给出**可读的字段级原因**；未知键报出为 `ignoredKeys`（不静默塞进提交负载）
- 新增 `apps/web/src/stores/useCreatePrefsStore.ts`（`mdp:create-prefs`）：
  档位与视图**按 kind 分桶**持久化 —— 「怎么看」与「写了什么」（草稿）分开存
- `CreateWorkbench`：
  - 参数区改为**统一的类型化渲染器**（替换原先"常显 + 高级折叠"两套并行机制）
  - 档位分段控件（该档无控件则**不显示该档按钮**，避免点进去是空的）
  - 表单 / JSON 视图切换；JSON 可编辑 + 「应用」+「从当前值重载」+ 行内错误
  - 每个字段旁 `?` Tooltip 展示 `hint`；advanced/expert 字段带档位徽标

### 范围外（Out of Scope）

- ❌ **专家档当前为空**：provider 级参数覆盖需要 execution 支持"任务级参数覆盖"通道，
  而模型级 `params` 覆盖由设置中心管理与执行器读取；前端**不得**自造这个通道（ADR-006 D2 红线）。
  档位按钮仅在目录真有 expert 控件时才出现。
- ❌ 不做 30+ 参数平铺、不做文本 DSL、不做显存/精度开关（研究 §3.2 明列为"过于专家化，不要抄"）

---

## 3. 相关文件

- `apps/web/src/config/create/control-schema.ts` — tier / hint / 层级工具
- `apps/web/src/features/genworkbench/param-json.ts` — 新增（双视图逻辑）
- `apps/web/src/stores/useCreatePrefsStore.ts` — 新增（显示偏好）
- `apps/web/src/features/genworkbench/CreateWorkbench.tsx` — 统一渲染器 + 档位 + 视图切换
- `apps/web/tests/create-param-views.test.ts` — 新增（11 组断言）

---

## 4. 验收标准

- [ ] 默认只显示基础档；切「进阶」出现时长/清晰度/负面提示词；该档控件为空时不显示档位按钮
- [ ] **目录产出的每个控件都有 tier 与非空 hint**（契约测试逐模型逐类型校验）
- [ ] 每个字段旁有 `?`，悬停/聚焦可读到该字段的含义与影响
- [ ] 表单 / JSON 切换：JSON 显示当前值；改 JSON 点「应用」后表单同步
- [ ] JSON 含未知键 → 应用后按 toast 如实告知被忽略的键；JSON 非法 → 行内报错且**不写入任何值**
- [ ] 档位与视图选择刷新后保留（按 image/video/audio 各自独立）
- [ ] `npm run gate` GATE=0；`npm test` 全绿（67）；`npm run build` 通过

---

## 5. 测试命令

```bash
cd apps/web
npm test
npm run gate
npm run build
```

### 手动测试步骤（L3 · 浏览器）

1. `/create/video` 默认只见提示词/比例 → 点「进阶」→ 出现时长与清晰度，且带「进阶」徽标
2. 鼠标悬停某字段的 `?` → 显示该字段说明（含来自模型能力的区间，如"支持 5–15 秒"）
3. 点「JSON」→ 显示当前参数的 JSON；把 `duration` 改成 `99` → 应用 → 表单出现越界校验
4. JSON 里加一个不存在的键 → 应用 → toast 告知被忽略
5. JSON 写坏（缺引号）→ 应用 → 行内报错，且表单值不变
6. 刷新页面 → 档位与视图保持

---

## 6. 约束与禁止事项

- [ ] **禁止用 JSON 视图绕过目录构造任意协议字段**（只接受 schema 认识的键）
- [ ] 禁止把专家专属项做成创意用户默认界面（研究 §3.2）
- [ ] 禁止直接 push master；禁止跳过测试

---

## 7. 风险与依赖

| 风险 | 影响 | 缓解 |
|---|---|---|
| 专家档为空 | 用户点开看到空档 | `hasTier` 判定，空档不渲染按钮 |
| JSON 视图被误用为参数映射入口 | 违反架构红线 | 只接受当前 schema 的键；未知键报出而不透传 |
| 档位切换导致"参数消失了"的困惑 | 用户找不到字段 | 档位是**累积**披露；进阶/专家字段带徽标；字段数可见 |

### 回滚方案

`git revert` 本片提交；两个新增文件删除，`control-schema.ts` 的 tier 字段不影响旧调用（可选字段）。

---

## 8. 迁移号段

**本片不新增迁移**，不占用号段。

---

## 9. 交付记录（2026-10-10）

- 静态门禁：`npm run gate` → exit 0（0 error / 37 warning，与基线一致）
- 单元测试：`npm test` → **67/67**（本片新增 11 组，含"每个目录控件必须有 tier 与 hint"的契约测试）
- 构建：`npm run build` → 成功
- **本片踩到的真实坑（值得记入迭代台账）**：
  1. `apps/web/tsconfig.app.json` 是 **`"strict": false`**，因此
     `{ ok: true } | { ok: false }` 这类**布尔字面量判别联合不会被收窄**，
     `if (parsed.ok) {...} else { parsed.error }` 直接报 `Property 'error' does not exist`。
     → 改用**扁平结果结构 + 可选 `error` 字段**，不依赖任何收窄行为。
  2. 原先"常显参数 + 高级参数折叠"两套披露机制与本片的档位机制**语义重叠**，
     已合并为单一的档位机制，避免同一页面出现两种"隐藏参数"的方式。
- **未完成**：L3 浏览器实测（本环境无浏览器工具）
