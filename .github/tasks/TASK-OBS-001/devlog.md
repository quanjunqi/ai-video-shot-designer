# TASK-OBS-001 开发日志

> 开发过程的事实源：**动作 / 证据 / 决策 / 阻塞** 四类条目，随开发同步记录。
> 规则：AC-010（`.agents/skills/acceptance-checklist/SKILL.md`）。**开工即建，随开发追加，PR 前完成；禁止交付前一次性补写。**
> 机器可读配套：与本文件**同步维护** `devlog.events.json`（AC-011）。

## 任务信息

| 字段 | 值 |
|---|---|
| 任务卡 | [task.md](task.md) |
| 验收清单 | [acceptance.md](acceptance.md) |
| 分支 | `feature/obs-001-task-detail-2026-10-15`（stack 在 `docs/ia-001-design-2026-10-15` 之上） |
| PR | #<待开> |
| 开工 | 2026-10-15 23:10（本地） |
| 完成 | 进行中 |
| 开发者 | AI Agent（会话 DSH） |

## 执行轨迹（正序；每个动作一条）

### 2026-10-15 23:10 开工/探查 —— 核实原卡三个缺口是否仍成立

- **动作**：逐条核实原卡的缺口 1/2/3 与「数据已在、前端未接」的判断。
- **发现/证据**：
  - **缺口 1 已修复**：`services/execution/migrations/010_job_result_payload.sql` 已建 `result_payload`；
    `services/execution/internal/job/store.go:220-225` 现写 `result_payload`，注释「**绝不覆盖 intent_payload**」；
    `:320-322` 另有 `normalizeLegacyResult` 把 010 之前历史行的 `intent_payload.result` 提升（新旧行 API 一致）。
    原卡引用的 `store.go:220` 已被取代。
  - **缺口 2 已修复**：`services/execution/internal/artifact/client.go` 在位；TASK-ASSET-001「产物落盘 MinIO」已验收。
  - **缺口 3 仍成立**：`store.go` 仅 `Complete`(:225) 与 `Fail`(:233) 两处写 `progress`，无轮询期回写。
    原卡已注明"可单独一个切片" ⇒ 维持非范围。
  - **前端确实未接**：`apps/web/src/pages/Tasks.tsx`（66 行）只渲染 label/kind/status/attempt/进度条/cost_estimate/updated_at/error，无详情视图。
  - **数据与契约已就绪**：`openapi/bff.yaml:2554`(`intent_payload`)、`:2561`(`result_payload`，含历史回退语义)、`progress`/`steps`/`attempt`/`error`；BFF 路由 `server.go:67`；前端 `api.getTask(id)` **已存在**（`lib/api/client.ts:267`）但无人调用。
  - **已有可照抄的先例**：`apps/web/src/features/genworkbench/CreateWorkbench.tsx:1000-1083` 的「结果详情（右侧抽屉）」；共享纯函数在 `features/genworkbench/result-utils.ts`（`parseTaskPayload` / `extractResultUrl` / `formatTaskTime` / `attemptsNote` / `canCancel` / `canRetry`）。
- **决策**：D-001（缺口 1/2 不再处理）、D-002（缺口 3 维持非范围）、D-003（任务类型判定：非 AC-009 设计稿先行任务）。

### 2026-10-15 23:11 迁移任务卡到文件夹结构（AC-008/010/011）

- **动作**：平铺卡 `TASK-OBS-001-task-center-detail.md` → `.github/tasks/TASK-OBS-001/`（task.md + 本日志 + acceptance.md）；旧平铺文件随本 PR 移除；README 与 ledger 的 `file` 字段改指新路径。
- **证据**：本目录 3 个文件（+ `devlog.events.json`）；[task.md](task.md) 含范围修正表。
- **决策**：无（执行既定迁移约定）。

### 2026-10-15 23:18 开发 —— 详情抽屉 + 任务元数据抽共享

- **动作**：新增 `apps/web/src/features/tasks/`：
  - `TaskDetailSheet.tsx`（184 行）：右侧抽屉，打开时 `api.getTask(id)` 取**单任务新鲜数据**（非列表快照）；分节展示 信息网格 / 错误 / 产物地址 / 参数快照 / 步骤；三态齐备。
  - `task-meta.ts`（60 行）：把原先内联在 `Tasks.tsx` 的 `KIND_META`/`STATUS_META` 抽为共享模块，并加 `kindMeta()`/`statusMeta()` 访问器（`hasOwnProperty` 判存在，避免 `in` 命中原型链上的 `constructor` 这类键 —— TASK-FIX-004 的口径）。
  - `task-detail-utils.ts`（36 行）：参数值归一为可渲染文本（对象 JSON 化 / null 记破折号 / 循环引用 `try-catch` 退化），**不重复实现解析**，解析仍走 `features/genworkbench/result-utils.ts`。
- **动作（改）**：`apps/web/src/pages/Tasks.tsx` 每行新增「详情」按钮（`Eye` 图标）；**`event.stopPropagation()` 保证不抢占既有行点击 → `context_path` 跳转**；顶部内联元数据改为 import 共享模块。
- **证据**：三文件行数 184/60/36；`Tasks.tsx` 66 → 65 行（内联元数据外移后净减）。
- **决策**：D-004（放共享 `features/tasks/`，避免第三份 `DetailRow`/元数据复制）。

### 2026-10-15 23:22 验证（独立复跑，不采信 subagent 自述）

- **动作**：由父 agent **独立**执行三条命令（非复用被中断 subagent 的自述结论）。
- **证据**：
  - `npm run gate` → `[quality-gate] 0 error(s), 0 warning(s)` + `✓ 未命中已知反模式`
  - `npm test` → vitest `Test Files 3 passed / Tests 50 passed`（且 node --test 21 个文件先行通过，否则 `&&` 不会进入 vitest）
  - `npm run ui:check` → `✓ UI 清单与代码同步（42 组件 / 69 token / 死组件 20 / 注记 42 / demo 42）`
  - 三清单已由 `ui:generate` 同步：`apps/web/src/generated/ui-catalog.ts`、`.agents/skills/frontend-coding/ui-components.md`、`docs/reference/ui-components.md`
- **过程记录**：首个 subagent 长时间未产出文件，经催办后由父 agent 中断；**其遗留的两个 helper 文件经审阅质量合格被保留复用**（未丢弃重写）。第二个 subagent 完成实现与 `ui:generate` 后被中断（当时正在补写组件测试）。
  ⇒ 诚实声明：**组件级单测（抽屉三态）未由本次交付补齐**，见「未过项」。

## 决策记录 D

| 编号 | 主题 | 选项 | 选择 | 理由 | 时机 |
|---|---|---|---|---|---|
| D-001 | 缺口 1/2 是否仍要做 | A 按原卡做迁移 + 产物落盘 / B 确认已修复、不再处理 | **B** | 实测 `010_job_result_payload.sql` 与 `artifact/client.go` 均已在 develop；重复做会产生空转迁移（违反"迁移只增不改"精神） | 探查 |
| D-002 | 缺口 3（进度回写）是否纳入 | A 纳入本卡 / B 维持非范围 | **B** | 原卡已写明"可单独一个切片"；本卡聚焦展示层，混入 execution 轮询改动会跨服务放大改动面 | 探查 |
| D-003 | **任务类型判定（AC-009）** | A 视为 UI 任务，先出设计稿评审 / B 视为既有模式推广，直接开发 | **B** | AC-009 阈值为「新建页面 / 大改布局 / 视觉系统变更」，三者均不满足；且 `CreateWorkbench.tsx:1000-1083` 已有同类抽屉先例 + `result-utils.ts` 共享纯函数 ⇒ 属模式推广而非新设计。**依据已写入 task.md 附录与本日志，供 Owner 复核** | 探查 |
| D-004 | 新组件放哪 | A 内联进 `Tasks.tsx` / B 放共享 `features/tasks/` | **B** | 任务详情是共享语义（CreateWorkbench 后续可收敛）；放共享位置避免第三份 `DetailRow` 复制 | 设计 |
| D-005 | 是否顺带重构 CreateWorkbench 复用新组件 | A 一起重构 / B 不动，记遗留 | **B** | 它是无关功能且体量大（1149 行），混入会放大回归面；作为遗留项记录 | 设计 |

## 验证记录 V

| 编号 | 对应验收判据 | 命令/方式 | 结果 | 证据位置 |
|---|---|---|---|---|
| V-001 | 判据 9（门禁） | `cd apps/web && npm run gate` | **PASS**（0 error / 0 warning；未命中反模式） | 独立复跑，本日志 23:22 |
| V-002 | 判据 9（测试） | `cd apps/web && npm test` | **PASS**（vitest 3 文件 50 用例；node --test 21 文件先行通过） | 独立复跑，本日志 23:22 |
| V-003 | 判据 9（清单同步） | `cd apps/web && npm run ui:check` | **PASS**（42 组件 / 69 token / 20 死组件 / 42 注记 / 42 demo） | 独立复跑，本日志 23:22 |
| V-004 | 判据 6（取单任务详情） | 代码审查 `TaskDetailSheet.tsx` | **PASS**（打开时调 `api.getTask(id)`，非列表快照） | 本日志 23:18 开发条目 |
| V-005 | 判据 1（不抢占行点击） | 代码审查：详情按钮 `event.stopPropagation()` | **PASS**（静态审查；**未经浏览器实测**，见未过项） | `Tasks.tsx` diff |
| V-006 | 判据 2/3/4/5（展示内容） | 代码审查：复用 `parseTaskPayload`/`extractResultUrl`/`parameterRows` | **PASS**（静态审查；无产物/无步骤时区块不渲染，空参数有文案） | `TaskDetailSheet.tsx` |
| V-007 | 判据 8（未知 kind/status 不崩） | 代码审查：`kindMeta()`/`statusMeta()` 兜底 | **PASS**（`hasOwnProperty` 判存在 + FALLBACK） | `task-meta.ts` |
| V-008 | 判据 7（三态） | 代码审查 | **部分 PASS**：loading/error/empty 均有实现；**error 态取真实 message**。但**无组件级单测**覆盖（见未过项） | `TaskDetailSheet.tsx` |
| V-009 | L3 浏览器验证 | 人工走查（打开抽屉 / 无产物行 / 历史行） | **未执行**（本环境无浏览器工具） | 见未过项 |

## 未过项（如实声明，交 Owner 裁定）

| # | 判据 | 状态 | 说明与影响 |
|---|---|---|---|
| 1 | 判据 1「点击详情不触发 `context_path` 跳转」 | ⚠️ **仅静态审查，未浏览器实测** | 代码已 `stopPropagation()`，但真机点击未验证。低风险，建议 Owner 走查时顺带确认 |
| 2 | 判据 7「三态」 | ⚠️ 实现齐备，**缺组件级单测** | 补测在实现后被打断，未补齐。建议随下一位改动补 `TaskDetailSheet.test.tsx`（三态 + 空 payload + 非字符串参数值） |
| 3 | 判据 3「010 之前历史行回退」 | ⚠️ **依赖既有共享函数，未用历史数据实测** | 回退逻辑在 `result-utils.ts`（已由 CREATE-003 交付并经其测试覆盖），本卡未重复验证历史行样本 |
| 4 | 判据 5「`steps` 非空渲染」 | ⚠️ 静态审查 | 未构造 `steps` 非空样本实测 |

> 未过项均**不影响门禁**（gate/test/ui:check 全绿），且属"验证证据不足"而非"实现缺陷"。按 AC-005 如实列出，由 Owner 决定是否放行。

## 阻塞与解法 B

| 编号 | 阻塞 | 根因 | 解法 | 复用教训 |
|---|---|---|---|---|
| B-001 | 原卡两个"关键缺口"已不存在 | 卡片写于 2026-10-14，其后 TASK-ASSET-001 等已消解前提，但卡片未回填 | 开工先核实三条缺口，把"已修复"写进 task.md 范围修正表 | **同 IA-001 B-002**：任务卡会过时；开工第一步永远是核实前提，否则会照着旧描述做无人要的东西 |

## 纪律自检（对照 `.agents` 规则，逐项留证据）

| 检查项 | 结果 | 证据 |
|---|---|---|
| 先本地测试/验证再 commit | ✓ | V-001~V-003 由父 agent **独立复跑**（不采信 subagent 自述） |
| 按路径 add（禁 `git add -A`） | ✓ | commit 前 `git diff --cached --name-only` 核对（deploy/site 既有改动未纳入） |
| 只改点名范围（未越界） | ✓ | 新增 `features/tasks/` 3 文件 + `Tasks.tsx` + 三清单生成物 + 本卡文档/台账；未动 `CreateWorkbench`/`CharacterStage` |
| 验收清单逐项勾对（AC-004/005） | ✓（含 4 项未过项如实列出） | [acceptance.md](acceptance.md) + 本日志「未过项」 |
| GATE / 后端门禁全绿 | ✓（前端）；后端 N/A | gate 0/0；`npm test` 全绿；`ui:check` 绿；本卡无 Go 改动 |
| 台账同步（状态/PR 号） | ✓ | README 行 + ledger `file`/`status` 已更新 |
| 迁移只增不改 / 号段合规（如涉） | ✓ | 本刀无迁移 |
| 设计稿先行（AC-009） | ✓ | 判定为非 AC-009 任务，依据写入 task.md 附录 + 本日志 D-003（供 Owner 复核） |

## 复盘（收尾时写，1–3 句每项）

- **做得好的**：①复用而非重写——解析走 `result-utils.ts`，元数据抽共享模块避免第三份复制；②父 agent **独立复跑**门禁而不采信 subagent 自述；③被中断 subagent 遗留的两个 helper 经审阅质量合格后**保留复用**，未因"换人就重写"浪费已完成工作；④把 4 项"证据不足"如实列为未过项，而非含糊成"全部通过"。
- **可改进的**：①**子 agent 委派失败两次**（首个长时间零产出、第二个实现完但未收尾），根因是提示词给了过宽的探索空间；若一开始就"禁止探索、先写文件"会更快——教训：委派实现类任务要**限定阅读清单 + 强制写文件优先**。②组件级单测被打断后未补齐，属交付不完整（已如实列入未过项）。
- **遗留/后续**：①补 `TaskDetailSheet.test.tsx`（三态 + 空 payload + 非字符串参数值）；②`CreateWorkbench.tsx:1000-1083` 的同类抽屉可后续收敛到本共享组件（D-005 显式推迟）；③缺口 3（异步进度回写）仍待单独切片。
