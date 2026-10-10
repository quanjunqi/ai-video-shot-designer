# TASK-INFRA-003：worker 可靠性（重试 / 死信 / 并发闸门）

> 按 `AGENTS.md` §5.3 填写。阶段 1 三项 P0 的第 2 项。

## 目标

让任务失败可自动恢复、失败原因可查、并发不失控。

## 背景（能力体检实测）

| 缺陷 | 证据 |
|---|---|
| 失败即终态 | `executeJob` 全部失败路径都调 `s.Complete(ctx, id, false, …)`，无重试 |
| `attempt` 从不被写 | `jobs.attempt` 字段存在，但 worker 只读不写；`job_attempts` 无法体现重试历史 |
| 无并发上限 | 派发循环对每个任务直接 `go func(){…}()`，无信号量/闸门 |
| 无法区分待重试与已耗尽 | 没有 `next_attempt_at` / `dead_lettered_at` |

后果：上游一次 503/超时 = 任务永久失败；批量提交 = 同时打满上游配额并可能耗尽本进程连接。

## 范围

- ✅ 迁移 `008_job_retry.sql`：`next_attempt_at`、`max_attempts`(默认 3)、`dead_lettered_at`
  + `(status,next_attempt_at)` 认领索引 + 死信索引
- ✅ `Store.Advance` 只认领 `next_attempt_at <= now()`
- ✅ `Store.FailOrRetry`：退避重排 / 进死信；并维护 `job_attempts`（逐次失败原因）
- ✅ `job.RetryConfig.Backoff`（指数退避 + 抖动，**纯函数可单测**）
- ✅ `job.Semaphore`（并发闸门，**可单测**）+ `EXECUTION_MAX_CONCURRENT_JOBS`（默认 8）
- ✅ 仅**瞬态**失败重试；永久性配置错误仍直接终态

## 非范围

- ❌ 不改 `jobs.status` 的取值集合（`timeout` 已在 TASK-FIX-002 中放开）
- ❌ 不做配额/限流（阶段 1 第 3 项）
- ❌ 不引入 Temporal/Kafka（阶段 2）

## 验收标准

1. 退避为指数增长并封顶（5s→10s→20s→…→300s），抖动不越界、不为负
2. 闸门容量生效：占满后 `TryAcquire` 失败；`Release` 后可再获取；容量非正时退化为 8
3. 失败未达 `max_attempts` → 回到 `queued`、`attempt+1`、`error` 可查、`dead_lettered_at` 为空
4. **退避期内不被重复认领**（`Advance` 尊重 `next_attempt_at`）
5. 达到 `max_attempts` → `failed` + `dead_lettered_at` 写入
6. `job_attempts` 留下逐次失败原因
7. 非 `running` 状态调用 `FailOrRetry` 返回 `ErrNotRunning`（不静默成功）
8. 闸门满时**不永久滞留**任务（撤销 executing 标记，下轮可再派发）

## 测试命令

```bash
cd services/execution
go test ./internal/job/ -v                       # 纯函数单测（无需数据库）
# 真库集成（与 TASK-FIX-001 相同的验证习惯）
docker run --rm -d --name mdpjob -p 55432:5432 -e POSTGRES_PASSWORD=test -e POSTGRES_DB=execution postgres:16-alpine
for f in migrations/*.sql; do docker exec -i mdpjob psql -U postgres -d execution -v ON_ERROR_STOP=1 -q < "$f"; done
EXECUTION_TEST_DATABASE_URL="postgres://postgres:test@127.0.0.1:55432/execution?sslmode=disable" \
  go test ./internal/job/ -run Integration -v
docker rm -f mdpjob
```

## 约束与禁止事项

- 迁移只增不改；先 `DROP CONSTRAINT IF EXISTS` 再 `ADD`
- 不得对**永久性**配置错误重试（会白白消耗尝试次数）
- 闸门满时不得让任务永久滞留

## 输出

- 分支 `feat/worker-reliability-2026-10-10` + PR
- 测试结果：见 PR（7 项单测 + 1 项真库集成）
- 风险说明：默认 `max_attempts=3`；已失败任务的重试语义仅对新任务生效（存量终态任务不变）

## 附：仍未处理

| # | 问题 | 去向 |
|---|---|---|
| 1 | 无配额/限流 → 成本失控 | TASK-SEC-002（阶段 1 第 3 项） |
| 2 | worker 与 HTTP 同进程，无法独立伸缩 | 阶段 2 |
| 3 | 无任务级指标（队列深度/最老待处理时长） | 阶段 3（docs/OBSERVABILITY.md 已定义指标） |
