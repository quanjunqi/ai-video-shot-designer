# TASK-FIX-002：状态模型三处不一致的约束修复

> 按 `AGENTS.md` §5.3 填写。承接 `TASK-FIX-001`，修的是**缺陷**。

## 目标

消除 DB 约束/默认值与代码枚举之间的三处不一致，使状态机的**取值**在数据库层可信
（合法值可写、非法值被拒），为后续实现状态跃迁打好基础。

## 背景与相关文件

三处不一致均由 `docs/architecture/state-machines.md` 的绘图/取证过程发现：

| # | 不一致 | 证据 |
|---|---|---|
| 1 | Go `engine.TaskStatus` 有 6 值（含 `timeout`）且 `IsTerminal()` 视其为终态，但 `jobs`/`job_attempts` 的 `CHECK` 只有 5 值 | `executor.go:32-39`、`001_execution.sql` |
| 2 | `projects.status` 的 `CHECK` 为 `status = 'pending_parse'`（**仅一个值**），而前端有 6 态 | `001_projects.sql:12`、`types/index.ts` |
| 3 | `episodes.status` DB 默认 `'draft'`，而前端 `EpisodeStatus` 无此值；且 `stage`/`status` **完全无 CHECK**，而 `episode.Update` 会把请求里的 status 直接写库 | `016_episodes.sql:11-12`、`postgres.go:107` |

## 范围

- ✅ `execution/migrations/007_job_timeout_status.sql`
- ✅ `production/migrations/022_projects_status_machine.sql`
- ✅ `production/migrations/023_episodes_state_checks.sql`
- ✅ 同步 `docs/architecture/state-machines.md`、`CHANGELOG.md`
- ✅ 用 Docker 真实验证接受路径与拒绝路径

## 非范围

- ❌ 不修改任何已执行迁移（`AGENTS.md` §7 禁区）
- ❌ **不实现状态跃迁校验**（只做取值约束；`archived → parsing` 这类非法跃迁仍会被允许）
- ❌ 不在 `project.Update` 里暴露 status（属功能实现，另立任务）
- ❌ 不改 Go / TS 业务代码

## 验收标准

1. 全新库执行全部迁移零错误（production + execution）
2. `jobs` / `job_attempts` 可写入 `timeout`，非法值被拒
3. `projects.status` 可推进到 6 态中任意值，非法值被拒
4. 新建剧集 `status` 默认 `pending`；`draft` 被拒；6 个 status、8 个 stage 可写，非法值被拒
5. 存在历史 `draft` 数据时，`023` 能归一为 `pending`
6. 存在未预期取值时，`023` 给出**可操作的错误信息**且**不静默改写**数据
7. 三个新迁移**可重复执行**（执行器无版本跟踪，会重跑）

## 测试命令

```bash
docker run --rm -d --name mdp-chk -e POSTGRES_PASSWORD=test -e POSTGRES_DB=production postgres:16-alpine
docker exec -i mdp-chk psql -U postgres -c "CREATE DATABASE execution;"
for f in services/production/migrations/*.sql; do docker exec -i mdp-chk psql -U postgres -d production -v ON_ERROR_STOP=1 -q < "$f" || echo "失败: $f"; done
for f in services/execution/migrations/*.sql;  do docker exec -i mdp-chk psql -U postgres -d execution  -v ON_ERROR_STOP=1 -q < "$f" || echo "失败: $f"; done
# 约束定义复核
docker exec -i mdp-chk psql -U postgres -d execution -c "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname LIKE '%status_check';"
docker rm -f mdp-chk
```

## 约束与禁止事项

- 迁移文件**只增不改**
- 不静默改写未知取值（避免掩盖数据问题）
- 每个新迁移必须可重复执行（先 `DROP CONSTRAINT IF EXISTS` 再 `ADD`）

## 输出

- 分支 `fix/status-model-alignment-2026-10-10` + PR
- 测试结果：见 PR 描述（接受/拒绝/归一化/响亮失败/幂等 五类）
- 风险说明：`022` 只放宽约束，既有数据无需清理（旧值 `pending_parse` 属新集合）；
  `023` 会把历史 `draft` 归一为 `pending`，属有意的数据修正

## 附：本任务确认但仍未处理的问题

| # | 问题 | 说明 |
|---|---|---|
| 1 | 状态**跃迁**未校验 | 本任务只保证取值合法，不保证跃迁合法。需在服务层实现（含权限与审计） |
| 2 | `project.Update` 不暴露 status | 项目状态仍无法由 API 推进 |
| 3 | 迁移执行器无版本跟踪 | 见 `TASK-FIX-001` 附表，建议改 `schema_migrations` |
