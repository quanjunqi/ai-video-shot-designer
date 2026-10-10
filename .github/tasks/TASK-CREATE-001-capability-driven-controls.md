# TASK-CREATE-001：能力驱动的生成参数控件 schema

> 本卡是 `docs/adr/006-smart-creation-workbench.md` 分片计划的第 1 片（D2 决策的落地）。
> 也是 `docs/development/backlog.md` P0 #2「智能创造三工作台 UI 重构」**启动条件**的直接兑现：
> 「能力层补全（`capabilities` 用于生成表单与前置校验）」。

## 基本信息

- **任务 ID**：TASK-CREATE-001
- **任务名称**：能力驱动的生成参数控件 schema（纯前端，不改后端）
- **创建日期**：2026-10-10
- **人类 Owner**：待指派
- **AI 执行者**：AI Agent（分支 `feat/create-workbench-2026-10-10`）
- **优先级**：P1
- **预计工时**：60–90 分钟

---

## 1. 目标

**目标**：让「智能创作」的参数控件由**模型目录能力**推导出来，而不是由三个页面各写一份硬编码数组 ——
从而做到"换模型/改目录不需要改前端"。

**背景**：改造前的事实（可复核）：

- `CreateImage.tsx` / `CreateVideo.tsx` / `CreateAudio.tsx` 各 20–22 行，`params` 数组里写死
  `options: ['SDXL','Flux','MJ-V6']`、`['官方 API','合规中转 API']`、`['16:9','9:16','1:1']`；
  而内置目录里的模型实际是 `nano-banana-2-lite` / `gpt-image-2` / `Seedance 2.0/2.5` / `MiniMax H3` / `Kling 1.6`，
  渠道是 即梦 / MiniMax / Grsai / Google / OpenAI / ComfyUI。**参数面板与目录完全脱钩。**
- 目录的能力/计费字段（`refImage` / `aspectRatioCount` / `qualityTiers` / `modes` /
  `minDurationSeconds` / `maxDurationSeconds` / `maxRefImages` / `billing`）在
  `apps/web/src` 中只被 `pages/SettingsModels.tsx`（18 处）与 `config/rules/capacity-policy.ts`（2 处）消费，
  `components/common/GenWorkbench.tsx` 消费 **0 处**。
- `apps/web` 全仓 `capabilities` 关键字命中 **0**。

---

## 2. 范围

### 范围内（In Scope）

- 新增 `apps/web/src/config/create/control-schema.ts`：以纯函数把
  `CatalogModel.capability`（+ 可选协议模板 `capabilities`）映射为**控件清单**与**前置校验规则**：
  - `modes` → 生成方式（文生 / 图生 / 首尾帧 / 多模态参考）；无 `i2v` 则**不渲染**参考图入口
  - `maxRefImages` / `maxRefAudios` → 参考图/音频张数上限（超限即阻止提交并给出原因）
  - `minDurationSeconds` / `maxDurationSeconds` → 时长控件的范围与步进（视频）
  - `qualityTiers` → 清晰度档位数量
  - `billing` → 费用预估函数（`perImage` × 张数；`perSecondStart` × 秒数）
  - `aspectRatioCount` → 比例候选（过渡策略，见 ADR-006 D3 选项 C，并在返回值中带
    `aspectRatioSource: 'count-fallback'` 标记，供 UI 如实提示"比例清单待目录声明"）
- 新增 `apps/web/src/hooks/useCreateControls.ts`：把 `useSettingsStore` 的目录
  （渠道 enabled + 模型 enabled + 类型匹配）与所选模型接到上面的 schema，
  输出 `{ controls, validate, estimateCost, runnableModels, selectedModel }`
- 单元测试 `apps/web/tests/create-control-schema.test.ts`：
  - 无 `i2v` 的模型不产出参考图控件（MiniMax H3：`['i2v','multi_ref','audio_ref']` → 有；
    Kling 1.6：`['t2v','i2v']` → 有；构造一个仅 `['t2v']` 的模型 → **无**）
  - 时长边界：`seedance-2.5` 上限 30、`kling-1.6` 上限 15；越界被 `validate` 拦下
  - 费用：`nano-banana-2-lite`（perImage 2）× 3 张 = 6；`seedance-2.0`（perSecondStart 0）× 8 秒 = 0
  - 比例降级：`aspectRatioCount: 4` 时返回 4 项且 `aspectRatioSource === 'count-fallback'`
  - 禁用渠道/停用模型不出现在 `runnableModels`

### 范围外（Out of Scope）

- ❌ 不改 `GenWorkbench` 的布局（第 2 片 TASK-CREATE-002 负责 composer 重写）
- ❌ 不改后端/迁移（`capability` 现有字段语义不动；`aspectRatios` 追加见 TASK-CREATE-006）
- ❌ 不接真实产物落盘（见 BACKLOG #4）
- ❌ 不改音频执行链（见 ADR-006 D8，登记 BACKLOG）
- ❌ 不做协议模板 `capabilities` 的补齐（2/9 的缺口 → 独立任务卡）

---

## 3. 相关文件

- `apps/web/src/config/models/model-catalog.ts` — `CatalogModel` / `ImageCapability` / `VideoCapability` / `billing` 事实源
- `apps/web/src/stores/useSettingsStore.ts` — `models` / `channels` / `templates` / `catalogSource`（server → offline-fallback → demo）
- `apps/web/src/config/rules/capacity-policy.ts` — 已有的容量策略，避免重复实现时长上限逻辑
- `apps/web/src/components/common/GenWorkbench.tsx` — 现状消费方（本片只读不改）
- `services/production/migrations/004_catalog.sql:78+` — 服务端 `capability` seed 的真实形状（字段名以此为准）
- `services/production/internal/httpapi/handler.go:435` — 能力合并端点（本片不调用；记录为后续增强入口）

---

## 4. 验收标准

- [ ] 参数控件由 `CatalogModel.capability` 推导，`CreateImage/Video/Audio.tsx` 中的
      `options: ['SDXL','Flux','MJ-V6']` 等硬编码模型名**被移除或不再作为唯一数据源**
- [ ] 模型不支持的能力**不渲染控件**（而非渲染后置灰）
- [ ] 时长/参考图张数越界在**提交前**被拦下，并给出字段级原因
- [ ] 费用由 `billing` 计算，张数/秒数变化时随之变化（不再是与目录无关的 `¥0.06` 字面量）
- [ ] 禁用渠道与停用模型不进入可运行模型列表
- [ ] `catalogSource === 'demo' | 'offline-fallback'` 时 UI 有可见提示（沿用既有徽标约定）
- [ ] 新增单元测试全部通过：`cd apps/web && npm test`
- [ ] `cd apps/web && npm run gate` → GATE=0（typecheck + eslint + quality-gate）
- [ ] 无控制台错误

---

## 5. 测试命令

```bash
cd apps/web
npm test
npm run typecheck
npm run lint:eslint
npm run gate
```

### 手动测试步骤

1. 打开 `/create/video`，把模型切到 `Kling 1.6`（`modes: ['t2v','i2v']`）→ 时长上限应为 15，参考图上限 1
2. 切到 `Seedance 2.5`（上限 30 秒、`maxRefImages: 9`）→ 时长范围与参考图上限随之变化
3. 切到仅支持 `t2v` 的模型（可在设置中心临时构造）→ 参考图入口应消失
4. 时长填 99 → 提交应被拦下并说明原因，而不是提交后由 execution 报错
5. 图片工作台把张数从 2 改到 4 → 费用预估应随之变化

---

## 6. 约束与禁止事项

### 必须遵守

- [ ] 遵循 `AGENTS.md` §4.1 前端规范（TS 严格模式、禁止 `any`、Tailwind、统一 api client）
- [ ] 前端只能调用 BFF（`/api/v1/*`）
- [ ] 遵循 `docs/development/frontend-quality-gate.md`：交付前完整执行六步硬门禁

### 禁止操作

- [ ] **禁止把「provider 参数映射」硬编码进前端**（AGENTS.md 禁区）——
      默认 schema 只允许声明**控件种类与顺序**，不得声明具体协议字段名/取值
- [ ] 禁止修改已执行迁移
- [ ] 禁止直接 push master
- [ ] 禁止跳过测试

> **红线说明（本片最容易踩的坑）**：本片必然要有一段"默认控件清单"的代码。
> 它的合法性来自区分：**「图片模型有比例选择器」是 UI 语法（可以兜底）**，
> 而 **「aspect_ratio 这个字段要发到 request 的哪个位置」是协议映射（必须来自目录/模板）**。
> 前者允许兜底，后者一律不允许出现在前端。

---

## 7. 风险与依赖

### 依赖项

- 无后端依赖（`model_catalog.capability` 已在目录响应中返回）

### 潜在风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| 7/9 协议模板无 `capabilities` | 模板级映射覆盖不全 | 本片以 `model.capability` 为主数据源；模板级作为增强，缺失即降级 |
| `aspectRatioCount` 只有数量没有清单 | 无法显示真实比例 | 返回 `aspectRatioSource: 'count-fallback'` 如实标注，TASK-CREATE-006 补齐 |
| 目录为 demo/离线降级 | 控件与真实能力不符 | 沿用既有 `catalogSource` 三态徽标，不伪装成服务端事实 |
| 音频无模型类型（DB 约束） | 音频工作台无目录可用 | 本片不覆盖音频控件推导；登记 BACKLOG（ADR-006 D8） |

### 回滚方案

纯新增文件（schema + hook + 测试），不改变现有页面行为即可回滚：删除新增文件与测试。
第 2 片接入布局后才产生用户可见变化，届时按片回滚。

---

## 8. 迁移号段

**本片不新增迁移**，不占用号段。
