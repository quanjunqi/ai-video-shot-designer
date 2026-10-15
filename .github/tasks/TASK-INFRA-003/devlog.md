# TASK-INFRA-003 开发日志

> 开发过程的事实源：**动作 / 证据 / 决策 / 阻塞** 四类条目，随开发同步记录。
> 审计 agent（人或 AI）依此还原：是否先测试后提交、是否越界、验证是否真实、决策是否成立。
> 规则：AC-010（`.agents/skills/acceptance-checklist/SKILL.md`）。**开工即建，随开发追加，PR 前完成；禁止交付前一次性补写。**
> 机器可读配套：与本文件**同步维护** `devlog.events.json`（结构化事件流，审计 agent 直接消费；AC-011）。本 md 是人读主版本，events.json 是同一事实的结构化投影——两者不得互相矛盾。

## 任务信息

| 项 | 值 |
|---|---|
| 任务卡 | [task.md](task.md) |
| 验收清单 | [acceptance.md](acceptance.md) |
| 分支 | `docs/infra-003-acceptance-2026-10-15`（worktree `.worktrees/infra-003`，基 origin/develop@0210c88） |
| PR | #<待开> |

## 动作记录 A（Actions）

| 时间 | 动作 | 证据 |
|---|---|---|
| 2026-10-15 | 读任务卡：8 条验收标准 + 测试命令；确认排期第 7 刀（阶段 1 三项 P0 第 2 项） | task.md、排期文档 §3 序 7 |
| 2026-10-15 | 探查 develop 现状：**实现已在 develop**（008 迁移 + job 包 + worker 闸门接线） | 008_job_retry.sql、retry.go/store.go、main.go:107、worker.go:84-94 |
| 2026-10-15 | 跑验收测试：job 包纯函数单测 7 项（Backoff 4 + Semaphore 3）全 PASS；真库集成 3 项 PASS（FailOrRetryThenDeadLetter 覆盖标准 3/5/6） | go test ./internal/job/ -v、带 EXECUTION_TEST_DATABASE_URL 集成测试 |
| 2026-10-15 | 补查标准 4/7/8 代码证据：Advance 认领 SQL、FailOrRetry ErrNotRunning、worker 闸门满撤销 executing | store.go Advance/FailOrRetry、worker.go:84-87 |
| 2026-10-15 | 落任务文档：task.md front-matter、acceptance.md（8/8）、devlog.md、devlog.events.json；台账/ledger 同步 | .github/tasks/TASK-INFRA-003/ |

## 证据记录 E（Evidence）

- **标准 1**：Backoff 单测 4 项 PASS（指数封顶 300s、抖动不越界不为负、attempt<1 当首轮）
- **标准 2**：Semaphore 单测 3 项 PASS（容量生效、Release 后可再获取、非正退化 8、封顶 goroutine）
- **标准 3/5/6**：`TestIntegration_FailOrRetryThenDeadLetter` 真库 PASS；FailOrRetry SQL 三段 CTE（jobs 更新 + job_attempts 当前行 failed/error + 新行 queued）
- **标准 4**：Advance SQL `WHERE status='queued' AND next_attempt_at <= now()` + `jobs_claim_idx (status, next_attempt_at)`
- **标准 7**：FailOrRetry `WHERE status='running'`，无行 → ErrNotRunning
- **标准 8**：worker.go `if !gate.TryAcquire() { executing.Delete(j.ID); continue }`——任务保持 running，下轮 ticker 再列出
- **门禁**：gofmt / build / vet / execution 全量（带 DB）全绿

## 决策记录 D（Decisions）

| 编号 | 决策 | 理由 |
|---|---|---|
| D-001 | 本刀 = 验收闭环，不重新开发 | 实现已随阶段 1 落地（任务卡阶段 1 表已标 ✅）；8 条标准全部有测试或代码证据 |
| D-002 | 不补新测试 | 标准 1-3 有自动化测试；标准 4/7/8 由 SQL/代码结构直接保证（有单测反而脆） |

## 阻塞记录 B（Blocks）

无。

## 纪律自检

| 项 | 结果 | 证据 |
|---|---|---|
| 先本地验证再 commit | ✓ | 测试全 PASS 后提交 |
| 按路径 add（禁 git add -A） | ✓ | commit 明细按路径 |
| 只改点名范围 | ✓ | 仅任务文档（无代码改动） |
| 验收清单逐项勾对 | ✓ | acceptance.md 8/8 |
| GATE / 后端门禁 | ✓ | gofmt/build/vet/test 全绿 |
| 台账同步 | ✓ | README + ledger.json |
| 迁移只增不改 | ✓ | 本刀无迁移（008 已在 develop） |

## 复盘

- **好**：任务卡测试命令直接可复跑；SQL 级保证（Advance/FailOrRetry）无需测试即可判定标准 4/7/8
- **可改进**：任务卡建议"专用 55432 容器跑集成"，实际用现有本地库（已应用 008 迁移）同样有效且更快——后续验收可直接复用
- **后续**：阶段 1 三项 P0（SSRF/worker 可靠性/配额限流）**实现 + 验收全部闭合**；worker 独立伸缩属阶段 2、任务级指标属阶段 3
