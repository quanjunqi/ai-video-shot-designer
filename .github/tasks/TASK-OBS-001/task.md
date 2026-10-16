---
taskId: TASK-OBS-001
status: 待验收
priority: P1（排期 v2 §3.2 并行候选池；无前置）
pr: "#<待开>"
criteria: 9
criteriaPassed: 9
depends_on: —
---

# TASK-OBS-001：任务中心展示「请求参数 / 进度 / 产物」

> 本卡由平铺文件 `.github/tasks/TASK-OBS-001-task-center-detail.md` 迁入文件夹结构
> （AC-008/010/011；旧文件随本 PR 移除）。
> 排期依据：`docs/product/task-queue-plan-v2-2026-10-15.md` §3.2 并行候选池（无依赖，可立即开工）。

## 基本信息

- **任务 ID**：TASK-OBS-001
- **创建日期**：2026-10-15（2026-10-15 迁入文件夹）
- **人类 Owner**：项目 Owner
- **AI 执行者**：AI Agent
- **优先级**：P1（v2 §3.2 并行候选池）
- **状态**：进行中
- **验收清单**：[acceptance.md](acceptance.md)
- **开发日志**：[devlog.md](devlog.md)

## 原始需求

Owner 提问："我们的任务中心能否看到每次请求发送给模型的详细参数、进度、以及生成的产物？"

## ⚠️ 范围修正（开工前核实，原卡三个缺口有 2 个**已修复**）

原卡写于 2026-10-14，其中两处前提已被后续任务消解。**按 IA-001 教训（B-002），开工第一件事是核实前提。**

| 原卡缺口 | 原卡判断 | **实测（2026-10-15）** | 处置 |
|---|---|---|---|
| **缺口 1**：`Store.Complete` 把结果写进 `intent_payload`，覆盖意图参数 | ❌ 真实缺陷，需新增 `result_payload` 列 + 迁移 | ✅ **已修复**：`services/execution/migrations/010_job_result_payload.sql` 已建列；`store.go:220-225` 注释明确"结果写入 result_payload —— **绝不覆盖 intent_payload**"；`:320-322` 另有 `normalizeLegacyResult` 把 010 之前历史行的 `intent_payload.result` 提升为 `result_payload`（新旧行 API 表现一致） | **不再处理** |
| **缺口 2**：产物未落盘，审计里的 URL 会过期 | ❌ 硬前置，需先做产物落盘 | ✅ **已修复**：`services/execution/internal/artifact/client.go` 在位（TASK-ASSET-001「产物落盘 MinIO」**已验收**） | **不再处理** |
| **缺口 3**：异步任务进度只写 0 → 100，轮询期间不回写中间进度 | ⚠️ 部分 | ⏳ **仍成立**：`store.go` 只有 `Complete`/`Fail` 两处写 progress，无轮询期回写 | **非范围**（原卡即写明"可单独一个切片"） |

### 剩余范围（本卡实际交付）

**前端任务中心缺少详情展示** —— 数据与契约都已就绪，只是没接出来：

| 能力 | 数据侧现状 | 前端现状 |
|---|---|---|
| 请求参数 | 契约 `Task.intent_payload` 已暴露（`openapi/bff.yaml:2554`） | ❌ 未展示 |
| 结果/产物 | 契约 `Task.result_payload` 已暴露（`:2561`），含历史行回退语义 | ❌ 未展示 |
| 进度与步骤 | 契约 `progress` / `steps` 已暴露 | ⚠️ 仅进度条，未展示 steps |
| 重试/错误 | 契约 `attempt` / `error` 已暴露 | ⚠️ 仅尝试数角标 |
| 单任务详情接口 | `GET /api/v1/tasks/{id}`（BFF `server.go:67`） | ✅ 前端 `api.getTask(id)` **已存在**（`lib/api/client.ts:267`）但无人调用 |
| 详情 UI 模式 | — | ✅ **已有先例**：`features/genworkbench/CreateWorkbench.tsx:1000-1083` 的右侧抽屉（Sheet）+ `result-utils.ts` 共享纯函数 |

⇒ 本卡 = **把已存在且已评审过的「结果详情抽屉」模式，从智能创作工作台推广到任务中心**。

## 范围

### 范围内

- ✅ 任务中心（`/tasks`）每行新增「详情」入口；打开右侧抽屉展示：状态 / 类型 / 费用 / 尝试 / 创建 / 更新 / 错误
- ✅ 展示 **请求参数**（`intent_payload` → `parseTaskPayload`）
- ✅ 展示 **结果与产物地址**（`result_payload` → `extractResultUrl`，兼容 010 之前的历史行）
- ✅ 展示 **步骤**（`steps`，有则展示）
- ✅ 复用 `features/genworkbench/result-utils.ts` 的共享纯函数（不重写解析逻辑）
- ✅ 新组件放在共享位置（`features/tasks/`），供任务中心使用

### 非范围

- ❌ 缺口 3 进度回写（execution 轮询期写中间进度）—— 单独切片
- ❌ 缺口 1/2（已修复，见上表）
- ❌ 实际渠道 / 扣费 / 重试历史（`gateway_audit_logs` + `job_attempts`）—— 需新增契约端点，另立卡
- ❌ 改造 `CreateWorkbench` 复用新组件（避免动无关功能；作为遗留项记录）
- ❌ 沿用参数 / 取消 / 重试等**写操作**入口（任务中心行内已有取消/重试；抽屉内不重复）

## 关键约束

1. **不得改变既有行点击行为**：当前点击行 → `navigate(context_path)`。详情入口必须是**独立可点元素**（按钮），不得抢占行点击
2. **契约零改动**：所需字段均已在 `Task` schema（`additionalProperties: false`，故不得新增字段）
3. **禁内联样式**（动态值除外）；**CRUD 三态**必过；无数据请求 UI 变更不涉及删除确认弹窗
4. `Task` schema 已于 TASK-FIX-004 加固：未枚举 kind/status 必须有兜底，不得裸下标（本卡同样适用）

## 验收标准

1. 任务中心每行有独立「详情」入口；点击打开右侧抽屉，**不触发** `context_path` 跳转
2. 抽屉展示请求参数（`intent_payload` 解析结果）；无参数时显示明确空态而非空白
3. 抽屉展示产物地址（`result_payload` → URL）且为可点链接（新窗口打开）；兼容 010 之前历史行（`intent_payload.result` 回退）
4. 抽屉展示状态/类型/费用/尝试/创建/更新时间/错误
5. `steps` 非空时展示步骤列表；为空时不渲染该区块（不出现空壳标题）
6. 单任务数据取自 `api.getTask(id)`（而非列表快照），打开时刷新
7. 三态齐备：loading（打开中）/ error（取详情失败，展示真实 message）/ empty（无参数、无产物、无步骤均各有明确文案）
8. 未知 kind/status 不崩溃（沿用 `KIND_FALLBACK` / `STATUS_FALLBACK` 口径）
9. `npm run gate` = 0/0；`npm test` 全绿；`npm run ui:check` 绿（新增组件须补清单）

## 测试命令

```bash
cd apps/web
npm run gate        # typecheck + eslint + quality-gate
npm test            # node:test + vitest
npm run ui:check    # 组件清单同步（新增组件必须）
npm run visual:check  # 视觉回归（本地）
```

## 附：任务类型判定（AC-009）

**判定：非 AC-009 设计稿先行任务。** 依据（AC-009 阈值为「新建页面 / 大改布局 / 视觉系统变更」）：

- 不新建页面：仍在既有 `/tasks` 页内
- 不大改布局：列表区结构与筛选区不动，仅每行加一个按钮
- 不变更视觉系统：复用既有 `Sheet` / `Badge` / `Button` 与既有抽屉样式
- **且已有先例可循**：`CreateWorkbench.tsx:1000-1083` 的同类抽屉已评审并上线；共享纯函数在 `result-utils.ts`

⇒ 属**既有模式的推广**，非新设计。判定过程与依据记录在 [devlog.md](devlog.md) 决策 D-003；若 Owner 不认可该判定，请指出，将补设计稿后再开发。
