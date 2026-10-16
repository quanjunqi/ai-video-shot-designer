---
taskId: TASK-OBS-003
status: 进行中
priority: **P1（可观测性对最贵路径失明）**
pr: "#<待开>"
criteria: 8
criteriaPassed: 0
depends_on: —（独立）
---

# TASK-OBS-003：异步任务耗时落库（V5c）

## 来源：不是推测，是仓库自带验收套件的判定

`scripts/audit-verdicts.sh`（V1–V6，用本地桩、零成本、可复现）**实测输出**：

```
❌ V5c 耗时仍为 0 ⇒ 异步任务会被排除在耗时分布之外
════ 结论：通过 19 项 / 失败 1 项 ════
```

**影响**：视频生成**全部是异步任务**，即**最慢、最贵的付费路径**；
而聚合口径**刻意排除 0** ⇒ 该路径在耗时统计里**彻底不可见**。

## 根因（已闭合，含行号证据）

| # | 事实 | 证据 |
|---|---|---|
| 1 | `latency_ms` 全仓库**只有一个同步写点** | `internal/httpapi/handlers_generate.go:270` `LatencyMs: int(time.Since(startTime).Milliseconds())` |
| 2 | 异步终态写入点**支持**它 | `internal/audit/store.go:116` `UpdateResultByJobID(..., latencyMs, ...)` → `:128 latency_ms = $5` |
| 3 | **但三个便捷封装全部硬编码 0** | `internal/worker/audit.go`：`auditTerminal` / `auditTerminalWithStatus` 的调参里 `latencyMs` 位置传 `0` |
| 4 | 中间层**本来透传** | `internal/worker/audit.go:78` `auditTerminalT(..., latencyMs int, ...)` → `:92` 传给 store |
| 5 | **聚合刻意排除 0** | `internal/audit/query.go:236` 原文：「`latency_ms` 是 NOT NULL DEFAULT 0，**0 表示"没有测量到"而不是"瞬时完成"**…百分位因此同样用 `latency_ms > 0` 排除零」 |

⇒ **修复落点**：在 worker 侧算出异步耗时，经既有 `latencyMs` 参数传入 —— **不需要 schema 变更**（列已在、参数已在、透传已在）。

## 需要先定的语义（实现前必须写进注释）

异步任务的"耗时"有两种口径，**必须先定一个**：
- **(a) 端到端**：提交 → 终态（分钟级，对应用户实际等待）—— **与「耗时分布」的产品含义一致**
- **(b) 单次上游 HTTP 调用耗时**（毫秒级，与会话/轮询次数无关）

V5c 的判定措辞是「异步任务会被排除在**耗时分布**之外」⇒ 指向 **(a)**。
**待确认**：`job.Job` 是否带可用的起始时间字段（提交时刻）；若无，需从 `jobs` 表补读或新增列（后者要迁移）。

## 验收标准

1. `scripts/audit-verdicts.sh` 的 **V5c 由 ❌ 变 ✅**（这是本卡唯一的机器判据，可复现、零成本）
2. 异步终态行的 `latency_ms > 0`（用桩跑一次后直接查库确认）
3. **口径写进代码注释**：明确是端到端还是单次调用，避免后来者误解
4. 早退失败路径（`auditTerminal` 的 panic/早退分支）**不被误填**为真实耗时 —— 无测量时应保持 0（与 `query.go:236` 的"0 = 没有测量到"语义一致）
5. 同步路径（`handlers_generate.go:270`）行为不变
6. `go build ./... && go test ./... -race && go vet ./...` 全绿
7. `scripts/check-shell-vars.sh` 与台账门通过（若涉及脚本/台账）
8. 台账 + CHANGELOG 同步

## 非范围

- ❌ 不改 `latency_ms` 的列语义或聚合口径（`query.go` 排除 0 是有意设计）
- ❌ 不重构 worker 的审计链路
- ❌ 不做前端展示改动

## 附：本卡立卡依据（可复现）

```bash
# 复现 V5c（零成本，用本地桩）
bash scripts/audit-verdicts.sh 2>&1 | grep -E 'V5c|结论'
# 预期：❌ V5c 耗时仍为 0 … / 结论：通过 19 项 / 失败 1 项
```
