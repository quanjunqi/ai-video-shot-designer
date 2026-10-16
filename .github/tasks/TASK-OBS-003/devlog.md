# TASK-OBS-003 开发日志

> 规则：AC-010。**开工即建，随开发追加；禁止交付前一次性补写。**
> 机器可读配套：[devlog.events.json](devlog.events.json)（AC-011）。

## 任务信息

| 字段 | 值 |
|---|---|
| 任务卡 | [task.md](task.md) |
| 验收清单 | [acceptance.md](acceptance.md) |
| 分支 | 待定（开工时从 `origin/develop` 拉） |
| PR | #<待开> |
| 立卡 | 2026-10-16 |
| 状态 | 进行中（已完成根因定位，未改代码） |

## 执行轨迹（正序）

### 2026-10-16 立卡：根因定位（已完成，未改码）

- **触发**：跑仓库自带的 `scripts/audit-verdicts.sh`（V1–V6，本地桩、零成本、可复现），
  实测输出 `❌ V5c 耗时仍为 0 ⇒ 异步任务会被排除在耗时分布之外`；结论「通过 19 项 / 失败 1 项」。
- **动作**：按 §5 第 8 条先查证据链，**逐层定位到行号**，未凭印象下判断。
- **根因链（五层，全部带行号）**：
  1. `latency_ms` 全仓库**只有一个同步写点**：`internal/httpapi/handlers_generate.go:270`
     `LatencyMs: int(time.Since(startTime).Milliseconds())`
  2. 异步终态写入点**支持**该字段：`internal/audit/store.go:116`
     `UpdateResultByJobID(..., latencyMs, ...)` → `:128 latency_ms = $5`
  3. 中间层**本来透传**：`internal/worker/audit.go:78` `auditTerminalT(..., latencyMs int, ...)`
     → `:92` 传给 store
  4. **但三个便捷封装全部硬编码 0**：`internal/worker/audit.go` 的 `auditTerminal` /
     `auditTerminalWithStatus`，调参里 `latencyMs` 位置传 `0`
  5. 聚合**刻意排除 0**：`internal/audit/query.go:236` 原文「`latency_ms` 是 NOT NULL DEFAULT 0，
     **0 表示"没有测量到"而不是"瞬时完成"**…百分位因此同样用 `latency_ms > 0` 排除零」
- **结论**：**修复落点明确、且不需要 schema 变更**（列已在、参数已在、透传已在）；
  唯一待定的是"耗时口径"（端到端 vs 单次上游调用），已列入验收判据 3 要求先定后写。
- **决策**：D-001（先立卡再改码，纠正此前 motion token 一次未立卡的流程偏差）。

### 2026-10-16 根因精化：不是"硬编码 0"，而是 Executor 层丢了 ElapsedMs

前一轮我把根因写成「三个便捷封装硬编码 0」——**那不完整**。逐层查下去发现修复其实**大部分已做过**：

| 层 | 事实 | 证据 |
|---|---|---|
| 引擎 | **已算好并写了** `ElapsedMs` | `engine.go:108-113` `withElapsed` 同时写 `Duration`(字符串) + `ElapsedMs`(int)；**4 个构造点全部调用它**（`engine.go:128/179/238/378`） |
| 注释 | **该修复已被记录** | `engine.go:90-96` 与 `worker/audit.go:87-89` 都写着「原来硬编码 0 ⇒ 异步任务耗时永远是 0…引擎本来就测了 Duration，这里把它传下去」 |
| worker | **已透传**（用量路径） | `worker.go:368/374` 传 `result.ElapsedMs`；`audit.go:72` `auditTerminalUsage(..., elapsedMs, ...)` 接收并透传 |
| **Executor 层** | **❌ 唯独这里没搬** | **`api_connector.go:70-77`**：构造 `ExecutorResult` 时传了 `Status`/`Extracted`/`RawBody`/`HTTPStatus`，还**另算**了 `Duration: time.Since(submittedAt)`，**但没传 `out.ElapsedMs`** |

**关键推论（有依据）**：V5b（用量落库）**通过** ⇒ V5 走的就是 `auditTerminalUsage` 这条**会透传 elapsedMs** 的路径
⇒ 所以 0 **不是**来自"硬编码"，而是来自 **`result.ElapsedMs` 本身为 0** ⇒ 缺口就在 `api_connector.go` 这一次字段搬运上。

**待核实（B-002）**：`ExecutorResult` 类型是否根本没有 `ElapsedMs` 字段？
`grep -rn ElapsedMs internal/engine/` 只命中 `engine.go`（含 `RunResult.ElapsedMs`），**未命中 `ExecutorResult` 的定义**。
若确实缺字段 ⇒ 修复 = 给 `ExecutorResult` 加字段 + 在 `api_connector.go:70` 赋值 + 让 worker 读它（**三处小改，不需要迁移**）。
若只是未赋值 ⇒ 修复 = 一行。

### 2026-10-16 修复完成：亚毫秒耗时被 Round 抹成 0（V5c 转绿）

- **动作**：先证伪自己的推论，再实测定位，最后改一处收口函数。
- **推翻了两个中间结论**：
  1. 「缺口在 `api_connector.go` 未搬 `ElapsedMs`」—— **无效**：worker 走的是
     `worker.go:306/308` 的 `engine.Run/RunAsync`（返回 `RunResult`，**有** `ElapsedMs`），
     **根本没经过 Executor** ⇒ 那条路与 V5c 无关。
  2. 五层链路（`RunAsync` 用 `withElapsed` → worker 传 `result.ElapsedMs` → audit 透传 → store 写 `$5`）
     **全部通畅** ⇒ 说明 0 不是"没传"，而是**传的就是 0**。
- **实测定位（决定性证据）**：`scripts/stub-upstream.py` 往返耗时 20 次采样 ——
  **中位数 0.351ms，17/20 低于 0.5ms**。
  而 `engine.go:109` 是 `time.Since(start).Round(time.Millisecond)` ⇒
  **亚毫秒被四舍五入成 0** ⇒ `ElapsedMs = 0` ⇒ 审计 `latency_ms = 0`。
- **这本身是真缺陷**：`audit/query.go:236` 规定 `latency_ms = 0` 的语义是【没有测量到】，
  聚合一律 `> 0`；但**已测到、只是很快**的调用也被报成 0 ⇒ **两种语义被混为一谈**。
- **修复**（`internal/engine/engine.go` `withElapsed`）：耗时为正值但不足 1ms 时**向上取整到 1ms**，
  保住"测到了"这一事实，且不误导为"瞬时完成"（1ms 已是该字段表示精度下限）。
- **实验即验证**：改后重跑套件 ⇒ **`✅ V5c 耗时落库（latency_ms=1）`，结论 20 通过 / 0 失败，EXIT=0**。
- **如实修正我自己写错的两条判据**（见 acceptance.md）：
  - 原判据 4「早退/panic 应保持 0」—— **错**：那时我以为早退无法测量；实际 `CreatedAt` 恒存在、
    `withElapsed` 对早退也执行 ⇒ **能测就该测**，"0" 只留给"确实无测量"。
  - 原判据 5「同步路径行为不变」—— **已被改变**：`withElapsed` 是同步/异步**共用**收口，
    亚毫秒取整修正对两者同时生效。这是**语义修正应有的效果**，不是回归。

## 决策记录 D

| 编号 | 主题 | 选项 | 选择 | 理由 | 时机 |
|---|---|---|---|---|---|
| D-001 | 是否先立卡再改码 | A 直接改 / B 先立卡 | **B** | 上一次（动效 token）未事先立卡，属 AC-010 偏差；本次纠正 | 立卡 |
| D-002 | 耗时口径 | A 端到端（提交→终态）/ B 单次上游调用 | **B（最终采用）** | **修正**：`withElapsed` 测的是**本次引擎调用**的耗时（`engine.go:108`），非端到端。原倾向 A 是因为没读实现；读后确认收口点即"单次调用"。**端到端另有数据**（`job.Job.CreatedAt/FinishedAt`）但本卡不改聚合口径 | 实现 |
| D-003 | 亚毫秒如何处理 | A 保持 0 / B 向上取整到 1ms | **B** | `query.go:236` 规定 0 = 没有测量到；把已测到的亚毫秒报成 0 会让"快"与"没测到"不可分。向上取整保住事实且不误导 | 实现 |

## 验证记录 V

| 编号 | 对应判据 | 命令/方式 | 结果 | 证据位置 |
|---|---|---|---|---|
| V-001 | 缺陷存在性（判据 1 的前置） | `bash scripts/audit-verdicts.sh` | FAIL（复现成功：V5c ❌，19 通过 / 1 失败） | 本日志 立卡条目 |
| V-002 | 根因定位（初版：硬编码 0） | grep + 逐层读码 | **PARTIAL —— 后被推翻** | 见下 |
| V-003 | 根因精化（真正的缺口） | 逐层读码至 `api_connector.go:70-77` | PASS：Executor 层未搬 `out.ElapsedMs` | 本日志「根因精化」段 |
| V-004 | 口径所需字段是否存在 | 读 `job.Job` 定义 | PASS：`CreatedAt`/`StartedAt`/`FinishedAt` 均在 ⇒ 不需要迁移 | 同上 |
| V-005 | 证伪「api_connector 缺口」 | 查 worker 调用路径 | **PASS（证伪成功）**：worker 走 `engine.Run/RunAsync`，不经 Executor | worker.go:306/308 |
| V-006 | 桩往返耗时实测 | stub 20 次采样 | PASS：中位数 0.351ms，**17/20 < 0.5ms** | 本日志 |
| V-007 | **修复后 V5c** | `bash scripts/audit-verdicts.sh`（保留真实退出码） | ✅ **PASS：V5c `latency_ms=1`，20 通过 / 0 失败，EXIT=0** | /tmp/verdict.out |
| V-008 | 门禁 | build / vet / gofmt / test -race | ✅ 全绿（engine 包 ok 22.867s） | 同上 |
| — | （判据 1~8 待实现后逐条追加） | | | |

## 阻塞与解法 B

| 编号 | 阻塞 | 根因 | 解法 | 复用教训 |
|---|---|---|---|---|
| B-001 | ~~耗时口径未定~~ **已解除** | `job.Job` 是否带提交时刻 | **已核实：带**。`job.Job` 有 `CreatedAt` / `StartedAt *` / `FinishedAt *`（`internal/job/store.go`）⇒ **端到端可算、不需要迁移**。口径定为**端到端**（依据：同步路径 `handlers_generate.go:270` 用 `time.Since(startTime)` 亦为端到端，两者须可比） | 先核实字段再定口径 |
| B-002 | `ExecutorResult` 是否缺 `ElapsedMs` 字段 | `grep ElapsedMs internal/engine/` 只命中 `engine.go`，未命中 `ExecutorResult` 定义 | 实现时先确认类型定义；缺则加字段（3 处小改），有则一行赋值 | 逐层核实，不接受"看起来对" |

## 纪律自检

| 检查项 | 结果 | 证据 |
|---|---|---|
| 开工前建日志（AC-010） | ✓ | 本文件 |
| 开工前产出验收清单（AC-008） | ✓ | acceptance.md 8 条判据 |
| 任务卡带 front-matter（AC-011） | ✓ | status/priority/depends_on/criteria |
| 立卡前核实前提（排期 v2 §5 第 8 条） | ✓ | V-001/V-002：实测复现 + 行号级根因 |
| **尚未改码** | ✓ | 本卡只有四件套文档 |

## 复盘（收尾时写）

- **做得好的**：判据来自**仓库自带的套件**（不是我的印象）；根因定位到行号；
  先立卡再动码（纠正上次偏差）。
- **可改进的**：跑套件时我用了 `| tail`，导致命令行报的退出码是 `tail` 的而非脚本的
  —— **今天第三次踩这个坑**；真实判据以输出文本为准（19/1）。
- **遗留/后续**：口径待定（D-002）。
