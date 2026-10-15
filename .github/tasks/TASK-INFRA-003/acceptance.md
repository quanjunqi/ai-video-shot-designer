# TASK-INFRA-003 验收清单

> 对应任务卡：`task.md`（worker 可靠性：重试 / 死信 / 并发闸门）。模板 `templates/acceptance-checklist.md`。
> 实现已在 develop（008 迁移 + job 包 Backoff/Semaphore/Advance/FailOrRetry + worker 闸门接线），本清单按任务卡 8 条验收标准逐项验证（2026-10-15）。

## 总览

| # | 验收标准（任务卡原文） | 对应测试 / 证据 | 结果 |
|---|---|---|---|
| 1 | 退避指数增长并封顶（5s→10s→20s→…→300s），抖动不越界、不为负 | `TestBackoff_ExponentialAndCapped` + `TestBackoff_NeverBelowZeroAndNeverAboveMax` + `TestBackoff_JitterActuallyVaries` + `TestBackoff_AttemptBelowOneTreatedAsFirst` | ✅ |
| 2 | 闸门容量生效：占满后 TryAcquire 失败；Release 后可再获取；容量非正退化为 8 | `TestSemaphore_LimitsConcurrency` + `TestSemaphore_DefaultCapacityWhenNonPositive` + `TestSemaphore_CapsDispatchedGoroutines` | ✅ |
| 3 | 失败未达 max_attempts → queued、attempt+1、error 可查、dead_lettered_at 为空 | `TestIntegration_FailOrRetryThenDeadLetter`（真库 PASS）+ FailOrRetry SQL | ✅ |
| 4 | 退避期内不被重复认领（Advance 尊重 next_attempt_at） | Advance SQL `WHERE status='queued' AND next_attempt_at <= now()`（代码证据） | ✅ |
| 5 | 达 max_attempts → failed + dead_lettered_at 写入 | FailOrRetry SQL（attempt>=max → failed + dead_lettered_at=now()）+ 集成测试 | ✅ |
| 6 | job_attempts 留下逐次失败原因 | FailOrRetry 两段 UPDATE：当前行 failed+error，新行 queued（代码证据 + 集成） | ✅ |
| 7 | 非 running 状态调用 FailOrRetry 返回 ErrNotRunning | FailOrRetry `WHERE status='running'` 无行 → pgx.ErrNoRows → ErrNotRunning（代码证据） | ✅ |
| 8 | 闸门满时不永久滞留任务（撤销 executing 标记，下轮可再派发） | `worker.go:84-87` TryAcquire 失败 → executing.Delete + continue（代码证据） | ✅ |

**结论：8/8 全过。**

## 实现与接线证据

- **迁移 008**：`migrations/008_job_retry.sql`——`next_attempt_at`(默认 now)、`max_attempts`(默认 3 + CHECK>0)、`dead_lettered_at`；`jobs_claim_idx (status, next_attempt_at)` 认领索引 + `jobs_dead_letter_idx` 部分索引；先 DROP IF EXISTS 再 ADD（可重复执行）
- **job 包**：`internal/job/retry.go` Backoff（指数+抖动+封顶 300s，纯函数）+ Semaphore（容量/退化 8/TryAcquire/Release）；`store.go` Advance（只认领 `next_attempt_at <= now()`）+ FailOrRetry（退避重排/死信 + job_attempts 维护）
- **worker 接线**：`cmd/server/main.go:107` `gate := job.NewSemaphore(EXECUTION_MAX_CONCURRENT_JOBS 默认 8)`；`go worker.Run(..., gate, ...)`；`internal/worker/worker.go` 派发循环先 executing.LoadOrStore 防重复派发，闸门满撤销 executing 保下轮可派发
- **仅瞬态重试**：FailOrRetry 只在 running→失败路径调用；永久性配置错误仍直接 Complete(false)（任务卡约束）

## 验证记录（可复跑）

- `cd services/execution && go test ./internal/job/ -v -count=1` → Backoff 4 项 + Semaphore 3 项 PASS（纯函数单测，无需 DB）
- `EXECUTION_TEST_DATABASE_URL=... go test ./internal/job/ -run "Integration|FailOrRetry" -v -count=1` → 3 项 PASS（含 FailOrRetryThenDeadLetter 覆盖标准 3/5/6）
- gofmt/build/vet 全过（本刀无新代码）

## 例外与后续

1. **重试语义仅对新任务生效**（存量终态任务不变；任务卡风险说明）
2. **默认 max_attempts=3**；可经环境变量调整
3. worker 与 HTTP 同进程无法独立伸缩（任务卡"附：仍未处理"第 2 项，阶段 2）；任务级指标（队列深度等）属阶段 3
