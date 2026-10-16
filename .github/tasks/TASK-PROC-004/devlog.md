# TASK-PROC-004 开发日志

> 开发过程的事实源：**动作 / 证据 / 决策 / 阻塞** 四类条目，随开发同步记录。
> 规则：AC-010。**开工即建，随开发追加；禁止交付前一次性补写。**
> 机器可读配套：[devlog.events.json](devlog.events.json)（AC-011）。

## 任务信息

| 字段 | 值 |
|---|---|
| 任务卡 | [task.md](task.md) |
| 验收清单 | [acceptance.md](acceptance.md) |
| 分支 | `chore/ledger-truth-2026-10-15`（stack 在 `feature/obs-001-task-detail-2026-10-15` 之上） |
| PR | #<待开> |
| 开工 | 2026-10-15 23:26（本地） |
| 完成 | 2026-10-15 23:35 |
| 开发者 | AI Agent（会话 DSH） |

## 执行轨迹（正序；每个动作一条）

### 2026-10-15 23:12 前置核实（本轮开工前，随 OBS-001 等待期并行完成）

- **动作**：对 13 张 `unknown` 卡做只读核实，逐条比对验收标准与代码。
- **发现/证据**（明细见「V 记录」）：
  - **FIX-002**：三迁移齐备且约束取值完整——`007` jobs/job_attempts 含 `timeout`；
    `022` projects 六值（`pending_parse/parsing/awaiting_confirm/in_production/review/archived`）；
    `023` episodes status 六值 + stage 八值；`state-machines.md` 已同步；CHANGELOG:280-282。
  - **FIX-003**：`SettingsProtocols.tsx:96-100` 必填 + `{task_id}` 校验、`:371` 可编辑字段；
    `ProtocolPreview.tsx:75` 展示；迁移 `029_async_poll_path.sql`；CHANGELOG:237 —— **4/4 验收标准命中**。
  - **SEC-003**：迁移 `024` 的 CHECK 含 `token`。
  - **SEC-004**：迁移 `027` 加 `auth_header`/`auth_prefix`（可空、不回填，NULL 走 auth_type 兜底——
    正是卡片的兼容性底线）；`engine.go:61-69` 字段、`:499` 数据驱动分支；`credentials.go:132` `keepOr` 三态。
  - **P2-001**：`executor.go:123` `type Executor interface` 含 `Submit/Poll/Cancel/GetResult`
    ——**正是卡片「范围」里点名要新建的那个文件与接口**；`api_connector.go` 为适配实现。
  - **INFRA-002**：`detect-changes.sh` + CI `Detect Changes` job；**判据 3/4/5/6 实测跑通**
    （见 V-006）。偏差：卡片测试命令写的「分类逻辑单元测试（8 条路径）」实际是
    `docs/how-to/ci.md:71` 记录的**手工命令**，仓库无自动化单测。
  - **PLAN-a-and-adr008**：ADR-008 已接受（`docs/adr/protocol-docs-alignment.md`）。
- **决策**：D-001（不能一刀切闭合）、D-002（CREATE 编号以 ADR 分片表为权威）。

### 2026-10-15 23:20 CREATE-001~006 逐条判据核实（委派只读子 agent）

- **动作**：因 6 张卡判据较多，委派**只读**子 agent 逐卡比对（禁改文件、禁跑 npm/go）。
- **发现/证据**：**代码侧 6/6 全部判为「已实现」**，提交 f1959c3/f6243d6/3220e50/cd8c0cf/8b0ad54/ebff8ef
  与整片恢复 41c9988（PR #54）均在 develop。**但六卡都不能直接闭合**：
  - 全缺 AC-008 验收清单 + AC-010 devlog/front-matter（均为无 front-matter 的平铺文件）
  - **五卡自己的 `## 交付记录` 就写明「未完成：L3 浏览器实测」**，001 无交付记录
  - 涉及 `npm run gate` / `npm test` / L3 的判据**一律未执行**（子 agent 只读）
  - 已知偏差：`control-schema.ts:383` 视频侧 `maxRefImages` 未与 `modes` 耦合（无现存触发样本）；
    `CREATE-006` 判据 1 字面偏差（见 D-002）
- **决策**：D-002（CREATE-001~005 可闭合为待验收；CREATE-006 暂停）。

### 2026-10-15 23:26 立卡 + 裁定编号冲突

- **动作**：建 `.github/tasks/TASK-PROC-004/`（AC-008/010/011 四件套）；核对 ADR 分片表与平铺卡。
- **发现/证据**：`docs/adr/smart-creation-workbench.md:158-168` 分片表**逐片标状态**，
  分片 1–5 标「✅ 已交付」；**分片 6 = `capability.aspectRatios`（D3-B）= 「⏳ 待 Owner 确认」**；
  而平铺卡 `TASK-CREATE-006-param-tiers-and-json-view.md` 是前端档位+双视图。
  `grep -rn 'aspectRatios' services/ openapi/` **无输出** ⇒ 分片 6 未交付。
  同族：ADR 分片 7=个人素材、分片 10=队列抽屉，而提交 `0248cca` 自标「CREATE-007=队列分组」。
- **决策**：D-002（以 ADR 分片表为权威；建议平铺卡重编号为 `TASK-CREATE-010`；
  **未经 Owner 确认不重编号、不闭合 CREATE-006**）。

### 2026-10-15 23:33 台账回填 + 验证

- **动作**：更新 `ledger.json` 与 `README.md`：FIX-002/FIX-003 → 已验收；
  SEC-003/SEC-004/P2-001/INFRA-002/CREATE-001~005 → 待验收；CREATE-006 维持 `unknown`；
  登记 TASK-PROC-004 本卡。
- **证据**：见「验证记录 V」；台账门禁 rc=0。
- **决策**：无（执行 D-001/D-002）。

## 决策记录 D

| 编号 | 主题 | 选项 | 选择 | 理由 | 时机 |
|---|---|---|---|---|---|
| D-001 | 13 张卡能否一刀切闭合 | A 全部记「已验收」/ B 按核实结果分级处置 | **B** | 各卡证据强度不同：FIX-002/003 逐条对上其验收标准；SEC-004 缺真库实测；INFRA-002 有文档偏差；CREATE 五卡自认 L3 未做。一刀切＝把"未验证"当"通过"（`ci-triage` 明令禁止） | 核实 |
| D-002 | CREATE 编号冲突以谁为准 | A 平铺卡/提交 / B ADR 分片表 | **B（ADR 为权威）** | 分片表有日期、逐片状态、是设计决策记录；平铺卡与提交的编号是松散用法。且**分片 6（aspectRatios）实测无任何实现痕迹**，若按标题闭合会把未做的后端片记成已验收。裁定留 PR 评审复核 | 裁定 |
| D-003 | 是否为已实现卡补写 acceptance.md | A 逐卡补四件套 / B 以本卡核实记录作为其验收证据 | **B** | 补文档是形式主义且产生 24 个文件；本卡 devlog 的逐条证据已可追溯。若 Owner 要求正式四件套，另立卡做 | 立卡 |
| D-004 | 是否执行各卡真库集成测试/L3 | A 本卡一并跑 / B 记为残留项 | **B** | 那属各卡自身的验收动作，且需 Docker 栈/浏览器；本卡只做**代码级**核实并如实标注残留 | 立卡 |

## 验证记录 V

| 编号 | 对应验收判据 | 命令/方式 | 结果 | 证据位置 |
|---|---|---|---|---|
| V-001 | 判据 3：FIX-002 逐条核实 | `sed`/`grep` 读三迁移约束取值 + 文档 | **PASS** | 本日志 23:12；CHANGELOG:280-282 |
| V-002 | 判据 3：FIX-003 逐条核实 | `grep` 读 UI 字段/校验/预览 + 迁移 029 | **PASS**（4/4 标准） | 本日志 23:12；CHANGELOG:237 |
| V-003 | 判据 4：SEC-003 | 读迁移 `024` CHECK 取值 | **PASS** | `024_auth_type_token.sql` |
| V-004 | 判据 4：SEC-004 | 读迁移 `027` + `engine.go:61-69,499` + `credentials.go:132` | **PASS（代码级）**；真库集成**未执行** | 本日志 23:12 |
| V-005 | 判据 4：P2-001 | 读 `executor.go:123` 接口方法 + `api_connector.go` | **PASS** | 本日志 23:12 |
| V-006 | 判据 4：INFRA-002 判据 3/4/5/6 **实测** | `printf '<path>' \| bash .github/scripts/detect-changes.sh --from-stdin` ×4 | **PASS**：`apps/web/**`→frontend=true/backend=false；`services/asset/**`→services=["asset"]；`README.md`→全 false；`.github/workflows/ci.yml`→全量 | 本日志 23:12 |
| V-007 | 判据 2/8：台账一致性 | `bash .github/scripts/check-task-ledger.sh` | **PASS**（rc=0） | commit 前复跑 |
| V-008 | 判据 8：门禁有效性 | `check-task-ledger.sh --self-test` | **PASS**（10/10 反例拦截） | commit 前复跑 |
| V-009 | 判据 5：CREATE 编号裁定证据 | 读 ADR 分片表 + `grep -rn aspectRatios services/ openapi/` | **PASS**（无输出 ⇒ 未交付） | 本日志 23:26 |
| V-010 | 判据 4：CREATE-001~005 逐条核实 | 委派只读子 agent 逐卡比对判据 | **PASS（代码级 6/6）**；gate/test/L3 **未执行** | 本日志 23:20 |

### 各卡残留的未验证项（如实列出，交 Owner 裁定）

| 卡 | 残留 | 影响 |
|---|---|---|
| SEC-003 | 未跑单测/真库集成 | 迁移本身为纯 CHECK 放宽，风险低 |
| SEC-004 | 未跑「单测 + 真库集成测试」（卡片范围明确要求） | 数据驱动分支与 `keepOr` 三态为**代码审查**结论 |
| P2-001 | 未验证「现有 HTTP API 已适配为 API Connector」的运行时行为 | 接口与适配文件在位 |
| INFRA-002 | 「8 条路径单测」实为手工命令，**仓库无自动化测试** | 判据 3/4/5/6 已手工实测通过 |
| CREATE-001 | 无交付记录；视频侧 `maxRefImages` 未与 `modes` 耦合（无现存触发样本） | 见子 agent 报告 |
| CREATE-002 | `MentionTextarea` @ 下拉无键盘导航（既有行为，非本卡引入）；L3 未做 | — |
| CREATE-003/004/005/006 | 交付记录自认「未完成：L3 浏览器实测」 | 五卡共同缺口 |

## 阻塞与解法 B

| 编号 | 阻塞 | 根因 | 解法 | 复用教训 |
|---|---|---|---|---|
| B-001 | CREATE-006 无法闭合 | 同号不同事：ADR 分片 6 = 后端 `aspectRatios`（未交付），平铺卡 = 前端档位+双视图（已实现） | 以 ADR 为权威作出裁定并登记；**不擅自闭合、不重编号**，留 Owner 确认 | 编号是软约定，**跨文档引用前必须查权威源**；按标题对号入座会把 A 的完成记成 B 的完成 |
| B-002 | 13 张卡"未排期"实为"已完成" | 台账双维护无校验（已由 PROC-003 修）＋ **无"交付物是否已存在"的开工核实纪律** | 本卡回填；并把该纪律写入排期 v2 §5 第 8 条 | 台账只保证"自洽"，不保证"真实"；**"描述是否仍成立"只能靠开工核实** |

## 纪律自检（对照 `.agents` 规则，逐项留证据）

| 检查项 | 结果 | 证据 |
|---|---|---|
| 先本地测试/验证再 commit | ✓ | V-001~V-010 全部在 commit 前完成；V-007/V-008 复跑 |
| 按路径 add（禁 `git add -A`） | ✓ | commit 前 `git diff --cached --name-only` 核对 |
| 只改点名范围（未越界） | ✓ | 仅本卡四件套 + `ledger.json` + `README.md`；**零代码改动** |
| 验收清单逐项勾对（AC-004/005） | ✓ | [acceptance.md](acceptance.md) 8/8 |
| GATE / 后端门禁全绿 | ✓（N/A + 脚本门） | 本卡无 Go/前端改动；台账门 + shell 门绿 |
| 台账同步（状态/PR 号） | ✓ | 本次回填即台账同步本身 |
| 迁移只增不改 / 号段合规（如涉） | ✓ | 本卡无迁移 |
| 未验证项如实标注（不冒称通过） | ✓ | 见「各卡残留的未验证项」表 |

## 复盘（收尾时写，1–3 句每项）

- **做得好的**：①**拒绝一刀切闭合**——13 张卡按证据强度分三级处置，而不是顺手全标已验收；②发现并**停住**了 CREATE-006 的同号不同事（若按标题闭合，会把 ADR 未交付的后端片记成已验收，属实质性错误）；③CREATE 系列委派只读子 agent 逐条核实，父 agent 复核后采信，且**未执行项一律标 ⚠️ 而非默认通过**；④INFRA-002 我没停在"文件存在"，而是**实际跑通了四类路径分类**。
- **可改进的**：①本卡的核实其实**早该做**——它是我自己在 v2 §3 犯错的根因，若制定 v2 前先核实存量卡，就省掉一整轮返工；②D-003 选择"不补 acceptance.md"是效率取舍，但会让这些卡的验收证据分散在本卡 devlog 里，可追溯性弱于独立文件——若 Owner 要求正式四件套，需另立卡。
- **遗留/后续**：①等 Owner 确认 CREATE 编号裁定后重编号并闭合 CREATE-001~006；②SEC-004 真库集成测试、CREATE 系列 L3 走查属各卡验收动作；③「ADR 分片 6 = aspectRatios」应正式登记为未交付项（建议立卡）。


> ✅ **执行记录（2026-10-15，后续提交）**：Owner 授权「按专业建议执行」后，本裁定已落地——
> 平铺卡已 `git mv` 为 `TASK-CREATE-010-param-tiers-and-json-view.md`（内容不变，记「待验收」）；
> **ADR 分片 6 = `capability.aspectRatios` 归位为独立待办**，列入 `.github/tasks/plans/` 分片待办台账。
> 上文保留裁定当时的表述与旧文件名，作为审计链的一部分。
