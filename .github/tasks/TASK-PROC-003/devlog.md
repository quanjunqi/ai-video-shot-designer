# TASK-PROC-003 开发日志

> 开发过程的事实源：**动作 / 证据 / 决策 / 阻塞** 四类条目，随开发同步记录。
> 审计 agent（人或 AI）依此还原：是否先测试后提交、是否越界、验证是否真实、决策是否成立。
> 规则：AC-010（`.agents/skills/acceptance-checklist/SKILL.md`）。**开工即建，随开发追加，PR 前完成；禁止交付前一次性补写。**
> 机器可读配套：与本文件**同步维护** `devlog.events.json`（结构化事件流，审计 agent 直接消费；AC-011）。本 md 是人读主版本，events.json 是同一事实的结构化投影——两者不得互相矛盾。

## 任务信息

| 字段 | 值 |
|---|---|
| 任务卡 | [task.md](task.md) |
| 验收清单 | [acceptance.md](acceptance.md) |
| 分支 | `chore/task-ledger-check-2026-10-15`（stack 在 `chore/ledger-backfill-2026-10-15f` 之上） |
| PR | #<待开>（见 [task.md](task.md)） |
| 开工 | 2026-10-15 22:54（本地） |
| 完成 | 2026-10-15 22:58（开发+验证+接线合计约 4 分钟，同一会话连续执行） |
| 开发者 | AI Agent（会话 DSH） |

## 执行轨迹（正序；每个动作一条）

### 2026-10-15 22:54 开工/探查 —— 门禁该挂在哪里

- **动作**：读 `.github/workflows/ci.yml` 全文、`.agents/skills/ci-triage/SKILL.md`、`.github/scripts/check-coverage.sh`（同类脚本范式）、`scripts/check-shell-vars.sh`、`scripts/preflight.sh`。
- **发现/证据**：
  - CI 现有 job：`changes` / `frontend` / `backend`（7 服务矩阵）/ `security` / `docs` / `contract` / `merge-check`。
  - `ci-triage` 核心不变量：**必需检查必须每次都上报**；禁止给必需检查加 **job 级 `if:`**，允许**步骤级 `if:`**。
  - `docs`（Documentation Check）**无 `needs`、无 job 级 `if`** → 每次都跑（ci.yml:414-417）。它已在承载同类「结构性判定」：提交信息规范、关键文档存在性、skills 链接完整性、OpenAPI 可解析、workflow 结构不变量。
  - `check-coverage.sh` 范式可复用：头注释写「用法 + 退出码」、`set -uo pipefail`、`ROOT="$(git rev-parse --show-toplevel)"`、中文输出统一用 `${var}` 花括号形式。
  - `scripts/check-shell-vars.sh` 会扫**未跟踪**的 `*.sh`（第 48-53 行）⇒ 新脚本一落盘就会被自己这道门扫到。
- **决策**：D-001、D-002。

### 2026-10-15 22:56 立卡/建日志/产清单（AC-008/010 先行）

- **动作**：创建 `.github/tasks/TASK-PROC-003/` 工作区：`task.md`（含验收标准）、本日志、`acceptance.md`。**先于写码**。
- **证据**：`task.md` front-matter `status: 进行中`；[acceptance.md](acceptance.md) 判据表。
- **决策**：D-003。
- **过程记录**：本日志首次落盘时曾把后续条目与**尚未产生的验证结果**一并写入——违反 AC-010「随开发同步记录」的精神（预先声称未产生的结果）。当场重写为仅含已发生条目，后续逐条追加。

### 2026-10-15 22:56 开发 —— 校验器实现

- **动作**：写 `.github/scripts/check-task-ledger.sh`（bash 外壳 + python3 内联主体）：9 类校验 + `--self-test` 反例模式（临时副本注入缺陷，不污染仓库）。
- **证据**：脚本 314 行；`chmod +x` 后可直接执行。
- **决策**：D-004、D-005。

### 2026-10-15 22:56 门禁自证：先让它在真实数据上变红

- **动作**：**先**在归一词表之前跑正例，确认这道门能抓到真实存在的漂移，而不是"写完就跑绿"。
- **证据**（输出摘要）：
  ```
  ❌ front-matter 词表违规：TASK-AUDIT-001/task.md status='accepted' 不在约定五值 …
  ❌ front-matter 与台账不一致：TASK-AUDIT-001 front-matter='accepted' ledger='已验收'
  …（INFRA-003 / SEC-001 / SEC-002 同）
  ⇒ 台账一致性门禁未通过：8 处违规    rc=1
  ```
- **决策**：D-006（归一词表而非兼容双词表）。

### 2026-10-15 22:56 数据归一 + 台账自登记

- **动作**：4 张卡 front-matter `accepted` → `已验收`；本卡登记进 `README.md`（抬头 43 → 44 张）与 `ledger.json`（43 → 44 条）。
- **证据**：`git diff` 4 个 task.md；README 新增行；ledger 追加条目。正例复跑 `rc=0`。
- **决策**：无（执行 D-006）。

### 2026-10-15 22:57 验证（正例 + 10 条反例 + 未验证语义）

- **动作**：跑 `--self-test`（10 条反例）、`check-workflow-structure.sh`、`check-shell-vars.sh`、YAML 解析、`preflight.sh --changed`。
- **证据**：见「验证记录 V-001~V-014」。
- **阻塞**：B-002（缺 python3 的验证方法首次写错，rc=127 是 `env` 找不到 `bash`，脚本根本没跑）。

### 2026-10-15 22:57 CI 接线 + 本地同口径 + 规则回写

- **动作**：`ci.yml` 的 `docs` job 末尾新增步骤 `Check task ledger consistency (台账一致性)`；`scripts/preflight.sh` 新增门 0b；`AGENTS.md`「关键 gotchas」回写机制。
- **证据**：`docs` job 步骤数 11、仍无 job 级 `if`；结构不变量门 rc=0；preflight 输出含「✅ 台账一致性」。
- **决策**：D-007。

## 决策记录 D

| 编号 | 主题 | 选项 | 选择 | 理由 | 时机 |
|---|---|---|---|---|---|
| D-001 | 门禁挂载点 | A 新增独立 CI job / B 挂进现有 `docs` job 的步骤 | **B** | `docs` job 无 `needs`、无 job 级 `if`，**始终上报**；新增 job 需重新登记必需检查，一旦漏配就卡死全部 PR（`ci-triage` 核心不变量）。挂步骤零新增上报面 | 开工 |
| D-002 | 任务 ID 归属 | A `TASK-INFRA-006` / B `TASK-PROC-003` | **B** | 校验的**主体**是任务文档规则（AC-008/010/011），不是基础设施；PROC-001 交付物正是「AC-009 关卡 + 台账同步」，同族。ci.yml 只是交付手段 | 开工 |
| D-003 | 任务卡 vs 清单的判据粒度 | A 两处同一套 / B 任务卡写目标、清单写可勾对判据 | **B** | 模板分工如此：`task.md` 回答"要满足什么"，`acceptance.md` 回答"怎么证明它过了"（AC-002 四要素） | 开工 |
| D-004 | 实现语言 | A 纯 bash+grep / B python3 内联（bash 外壳） | **B** | 要解析 markdown 表格 + JSON；grep 对多字节、转义、嵌套引号极脆。先例：`check-coverage.sh` 用 python3 内联解析 coverprofile，`check-shell-vars.sh` 用 python3 做字节级扫描 | 开发 |
| D-005 | 反例验证方式 | A 手工临时改文件再改回 / B 脚本内置 `--self-test` 在临时副本注入缺陷 | **B** | 「门禁有效性」必须可复跑、可留痕；手工改回容易漏改。同族先例：UI-003 判据 7 用临时文件验证 V-003b 门禁真的会红 | 开发 |
| D-006 | front-matter 状态词表 | A 校验时兼容 `accepted`+`已验收` / B 统一归一到中文五值后只认一套 | **B** | 双词表＝规则写两处迟早分叉（本项目已因"两份实现各有盲区"踩坑，见 `check-shell-vars.sh` 头注）；且 AC-011 要求 front-matter `status` 与台账同源。改数据而非放宽判据（任务卡约束 4） | 开发 |
| D-007 | 是否纳入 preflight | A 只挂 CI / B 同时纳入 `scripts/preflight.sh` | **B** | 仓库既有原则「本地与 CI 同命令、同脚本、同基线」（preflight 头注），否则又是"本地记得住的几道门" | 接线 |

## 验证记录 V

| 编号 | 对应验收判据 | 命令/方式 | 结果 | 证据位置 |
|---|---|---|---|---|
| V-001 | 判据 1（正例） | `bash .github/scripts/check-task-ledger.sh` | PASS（rc=0，44 张卡） | 本日志上文 22:56 |
| V-002 | 判据 2（JSON 非法） | `--self-test` 反例 A | PASS（rc=1，1 处违规） | 自检输出 |
| V-003 | 判据 3（状态越界） | `--self-test` 反例 B | PASS（rc=1，2 处违规） | 自检输出 |
| V-004 | 判据 4（数量不一致） | `--self-test` 反例 C | PASS（rc=1，2 处违规） | 自检输出 |
| V-005 | 判据 5（ID 集合不一致） | `--self-test` 反例 D | PASS（rc=1，2 处违规） | 自检输出 |
| V-006 | 判据 6（标题截断） | `--self-test` 反例 E | PASS（rc=1，1 处违规） | 自检输出 |
| V-007 | 判据 7（file 悬空） | `--self-test` 反例 F | PASS（rc=1，1 处违规） | 自检输出 |
| V-008 | 判据 8（目录缺 events.json） | `--self-test` 反例 G | PASS（rc=1，1 处违规） | 自检输出 |
| V-009 | 判据 9（front-matter 词表 + 与台账一致） | `--self-test` 反例 H（词表）+ I（不一致） | PASS（rc=1；2 处 / 1 处违规） | 自检输出 |
| V-010 | 判据 10（缺 python3 → rc=2） | `PATH=<仅含 git 的临时目录> /bin/bash .github/scripts/check-task-ledger.sh` | PASS（rc=2，输出含「未验证」） | 见 B-002 |
| V-011 | 判据 11（CI 结构不变量） | `bash .github/scripts/check-workflow-structure.sh .github/workflows/ci.yml` | PASS（rc=0，9 项必需检查名齐备且无 job 级 if） | 门禁输出 |
| V-012 | 判据 12（preflight 同口径） | `PREFLIGHT_BASE=origin/develop scripts/preflight.sh --changed` | PASS（输出含「✅ 台账一致性（README × ledger.json × front-matter）」） | 预检输出 |
| V-013 | 判据 13（AGENTS.md 回写） | `grep -n '台账一致性门禁' AGENTS.md` | PASS（命中「关键 gotchas」段） | AGENTS.md diff |
| V-014 | 判据 14（真实全量数据） | 与 V-001 同一次运行，覆盖 44 张卡 | PASS（rc=0，未放宽任何判据） | V-001 |
| V-015 | 附加：shell 规则 + YAML 可解析 | `bash scripts/check-shell-vars.sh`（17 文件）；`yaml.safe_load(ci.yml)` | PASS（rc=0；docs job 无 `if`、步骤 11 个） | 门禁输出 |

## 阻塞与解法 B

| 编号 | 阻塞 | 根因 | 解法 | 复用教训 |
|---|---|---|---|---|
| B-001 | 门先修好会让 `develop` 直接变红 | 校验器对每个 PR 都跑，而 `develop` 台账本身有 4 条截断标题 + 数量漂移（40 vs 43） | 本分支 **stack 在回填分支之上**，合并顺序：回填 → 本 PR | 加门禁前先确认「当前基线能通过」，否则门本身成为阻塞源 |
| B-002 | 验证「缺 python3 → rc=2」时首次得到 rc=127，误以为脚本有问题 | 测法错了：`env PATH=/nonexistent bash …` 让 `env` 找不到 `bash` 本体，脚本**根本没执行** | 改为「PATH 只含 `git` 的临时目录 + 用 /bin/bash 绝对路径调用」⇒ 得到预期 rc=2 | **失败的验证要先怀疑测法**：rc=127 是"命令未找到"，与脚本自身的退出码语义无关；验证手段本身也要能区分这两种失败 |

## 纪律自检（对照 `.agents` 规则，逐项留证据）

| 检查项 | 结果 | 证据 |
|---|---|---|
| 先本地测试/验证再 commit | ✓ | V-001~V-015 全部在 commit 前跑完 |
| 按路径 add（禁 `git add -A`） | ✓ | commit 前 `git diff --cached --name-only` 核对（deploy/site 的既有改动未纳入） |
| 只改点名范围（未越界） | ✓ | 新增校验器 + 4 卡词表归一 + ci.yml 一步骤 + preflight 门 0b + AGENTS.md + 本卡四件套 + 台账登记 |
| 验收清单逐项勾对（AC-004/005） | ✓ | [acceptance.md](acceptance.md) 14/14 |
| GATE / 后端门禁全绿 | ✓ | 无 Go/前端代码改动；shell 门 + workflow 结构门 + 台账门 + YAML 全过；preflight 全绿 |
| 台账同步（状态/PR 号） | ✓ | `README.md` + `ledger.json` 已加本卡行，状态与 front-matter 一致 |
| 迁移只增不改 / 号段合规（如涉） | ✓ | 本刀无迁移 |

## 复盘（收尾时写，1–3 句每项）

- **做得好的**：把「门禁挂载点」当成**不变量问题**而不是便利问题来解——没有新增 job，因此没有新增必需检查上报面，避免了这个仓库反复出现的「假防线 / 卡死 PR」模式；`--self-test` 让"门真的会红"成为可复跑的断言（10/10），而不是一次性手工验证；并且在归一词表**之前**先跑了一次正例，亲眼看到这道门抓到真实漂移，而不是写完就跑绿。
- **可改进的**：①「缺 python3」那条判据的**验证方法**首次写错（B-002），说明我对"退出码 127 vs 2"的区分不够警觉；②日志首版预写了未产生的验证结果，虽当场纠正，但反映出"先把文档写完整"的惯性会与 AC-010「随开发同步记录」冲突——写文档时应有意识地只写已发生事实。
- **遗留/后续**：① 评估方案 B（`ledger.json` 从 front-matter 生成，根治双维护）；② 存量 14 张卡无状态、11 张无优先级，属存量基线问题，交排期 v2 处理；③ 平铺卡（38 张）尚未迁移到文件夹结构，AC-010 的开发日志缺口随各卡下次改动顺手归位；④ 校验器只做**结构**一致性，清单判据是否成立、证据是否真实仍需人工/审计 agent 审查。
