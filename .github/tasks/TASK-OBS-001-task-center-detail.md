# TASK-OBS-001：任务中心展示「请求参数 / 进度 / 产物」

> Owner 提问："我们的任务中心能否看到每次请求发送给模型的详细参数、进度、以及生成的产物？"
> 本任务卡记录**已核实**的现状与差距（不是猜测）。

## 结论摘要

**好消息**：`gateway_audit_logs` 已经把截图里几乎每一列的数据都存下来了。
**坏消息**：有三个具体缺口，其中一个是**真实缺陷**。

## 已核实的字段清单（实库查询）

```
gateway_audit_logs: id, request_id, workspace_id, project_id, episode_id, asset_id,
  user_id, product, model_id, channel_id, provider_model, mode,
  request_payload, response_payload, error_message, status, latency_ms,
  token_input, token_output, token_cached, cost_amount, cost_currency,
  job_id, provider_task_id, created_at

jobs: workspace_id, id, idempotency_key, request_hash, intent_id, kind, label,
  project_id, episode_id, asset_id, shot_id, status, progress, attempt, steps,
  cost_estimate, error, context_path, created_by, created_at, updated_at,
  started_at, finished_at, scope_epoch, intent_payload,
  next_attempt_at, max_attempts, dead_lettered_at
  ← **没有 result_payload**

job_attempts: workspace_id, job_id, attempt, status, error, created_at, started_at, finished_at
```

## 对照 Owner 截图里的每一列

| 截图列 | 我们的现状 | 结论 |
|---|---|---|
| 任务 ID | `jobs.id` / 审计 `provider_task_id` | ✅ |
| 类型 | `jobs.kind` + 审计 `product` | ✅ |
| 模式（同步/异步） | 审计 `mode`；可根据协议模板 `async.enabled` 推导 | ✅ |
| 模型 | 审计 `model_id` / `provider_model`（**且含实际命中 `channel_id`**） | ✅ |
| 状态 | `jobs.status`（6 态）+ 审计 `status` / `error_message` | ✅ |
| 进度 | `jobs.progress` —— **但异步任务只写 0 → 100**，轮询期间不回写中间进度 | ⚠️ **部分** |
| 扣费 | 审计 `cost_amount` + `cost_currency` | ⚠️ 字段有，**但数据本身不可信**（我们手写 billing 与实价差 33 倍，见 ADR-004 D3） |
| 详情（请求参数） | 审计 **`request_payload`** ✅ | ✅ **数据已存在** |
| 响应 | 审计 `response_payload` ✅ | ✅ |
| 耗时 | `jobs.started_at/finished_at` + 审计 `latency_ms` | ✅ |
| 生成时间 | 审计 `created_at` | ✅ |
| 重试历史 | `job_attempts`（每次失败原因，008 迁移后可用） | ✅ |
| **生成的产物** | 只在 `response_payload` 里是**上游临时 URL**，未落盘 ⇒ **会过期** | ❌ **关键缺口** |

## ❌ 缺口 1（真实缺陷）：结果覆盖了意图参数

`services/execution/internal/job/store.go:220`：

```sql
UPDATE jobs SET status=$1,progress=$2,error=$3,intent_payload=$4::jsonb,
  finished_at=now(),updated_at=now() WHERE id=$5
```

其中 `$4` 是**结果** payload（`resultPayload`），而列名是 `intent_payload`。
代码注释（:216）写着"只有当 resultPayload 非空时才更新 intent_payload" —— 说明这是**有意为之但语义错误**。

**后果**：任务成功后，`jobs.intent_payload` 里是**结果**，**当初提交的意图参数被覆盖** ⇒
任务详情页无法显示"我提交了什么"（虽然审计表有 `request_payload`，但需要 join 且语义分散）。

**修法**：新增独立列 `result_payload`，`Complete` 写结果到该列，`intent_payload` 只读不移。
迁移编号需按 `AGENTS.md` §12.3 认领（execution 号段 010–019）。

## ❌ 缺口 2：无产物列 / 产物未落盘

- `jobs` 无 `result_payload`（同上）
- 生成产物目前**未落盘到 MinIO**（`docs/development/backlog.md` #4）⇒ 审计里的 URL 会过期
- 这是"任务中心能看产物"的**硬前置**：不落盘，历史任务的产物必然打不开

## ⚠️ 缺口 3：进度只有 0 → 100

异步任务（视频）轮询期间不回写 `jobs.progress`。用户只能看到"运行中"，看不到百分比。
若要对齐截图里的 `100%`，需要在轮询循环里回写进度（引擎已有 `maxPolls` 计数可换算）。

## 范围（建议）

1. 迁移：`jobs` 增 `result_payload jsonb`（execution 号段）
2. `Store.Complete` 写 `result_payload`；`intent_payload` 不再被覆盖
3. 任务中心（前端）展示：请求参数（审计 `request_payload`）· 响应 · 实际渠道 · 扣费 · 耗时 · 重试历史
4. （依赖）产物落盘 —— 见 `docs/development/backlog.md` #4

## 非范围

- 进度回写（缺口 3）可单独一个切片
- 成本数据可信度（属 ADR-004 D3 的成本同步）
