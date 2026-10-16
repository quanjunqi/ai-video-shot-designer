# TASK-PROTOCOL-001 开发日志

> 开发过程的事实源：**动作 / 证据 / 决策 / 阻塞** 四类条目，随开发同步记录。
> 规则：AC-010（`.agents/skills/acceptance-checklist/SKILL.md`）。**开工即建，随开发追加，PR 前完成；禁止交付前一次性补写。**

## 任务信息

| 字段 | 值 |
|---|---|
| 任务卡 | [TASK-PROTOCOL-001/task.md](task.md) |
| 验收清单 | [TASK-PROTOCOL-001/acceptance.md](acceptance.md) |
| 分支 | `feature/request-template-backfill-2026-10-17` |
| PR | #<待开> |
| 开工 | 2026-10-16 23:19（本地） |
| 完成 | 待填 |
| 开发者 | AI Agent（会话 m_0cwRd4Q1hew） |

## 执行轨迹（正序；每个动作一条）

### 2026-10-16 23:19 开工/探查
- **动作**：读 ADR-007（D3 状态 =「建议方向，需评估兼容」）、迁移 028（request_template 列，只加列不回填）、execution 渲染器（request_template.go：占位符缺失响亮报错）+ 取值表构造（params.go resolveTemplateValues：Present 才进值表）+ MergeTemplates（DB 行优先）。
- **发现/证据**：
  - 模板形态 = 请求体**全文**（不再合并 params[] 组装的字段，仅注入 task_type/__passthrough）——request.go:184 渲染后直接返回
  - 占位符缺失 → ErrTemplateMissingValue（渲染器 64 行）
  - 8 个内置协议仅 minimax_text 有模板（注册表 215 行）；注释明说「DB 行优先，存量库上能力已就绪但未生效，需后续切片回填」
- **决策**：D-001（等价可迁移子集回填，不无脑回填 8 个）；D-002（openai chat 禁止回填，判别标准第一条反例）；D-003（无增益协议不做，防形式主义）。

### 2026-10-16 23:20 立卡
- **动作**：建 `.github/tasks/TASK-PROTOCOL-001/` 四件套（task.md / devlog.md / devlog.events.json / acceptance.md）。
- **证据**：task.md 定义 6 条验收判据；迁移 065 号段 060-069 内。

### 2026-10-16 23:35 写迁移 + 等价性测试
- **动作**：写 `services/production/migrations/065_request_template_comfyui.sql`（UPDATE 回填 comfyui 模板 + 8 协议可行性表注释 + 判别标准）；写 execution 金标准测试 `TestRequestTemplateEquivalenceBuiltinComfyUI`（常量 comfyuiLegacyParams/comfyuiRequestTemplate 入 request_template_assemble_test.go）。
- **证据**：迁移初稿模板字符串笔误（多一个 `}`）已当场修复；测试 6 场景全 PASS（默认/__key 覆盖/模型级覆盖/__passthrough 新增/__passthrough 覆盖/全部叠加 × 同步+异步入口）。
- **决策**：D-004（comfyui 模板写 `"task_type":"sync"`——与 minimax_text 先例一致，把请求体写成完整可见形状；异步覆盖语义不变）。

### 2026-10-16 23:45 更新 ADR-007 D3
- **动作**：D3 状态从「建议方向，需评估兼容」更新为「等价可迁移子集已生效 + 判别标准 + openai 禁止回填原因链」。
- **证据**：docs/adr/protocol-registry.md diff。

### 2026-10-16 23:50 真库应用迁移 + 验证
- **动作**：docker run postgres:16.8-alpine 执行 migrate.sh；`UPDATE schema_migrations SET checksum` 对齐 064（见 B-001）；应用 065。
- **证据**：迁移计划「待应用 1 · 已应用(跳过) 46 · 采纳 0」→ 应用 065 成功，当前版本 065_request_template_comfyui.sql。
- **验证**：`SELECT request_template` → `pt_builtin_comfyui | {"client_id":"{{client_id}}","task_type":"sync"}`；minimax_text = NULL（注册表补齐，符合既有设计）。

### 2026-10-16 23:55 门禁 + 台账
- **动作**：execution build/test -race/vet/gofmt 全绿；production build/vet/gofmt 绿（本次仅迁移文件）；file-size 0 超标；台账登记 TASK-PROTOCOL-001（README + ledger，字段对齐 MODEL-007 先例）→ check-task-ledger 通过。
- **证据**：见 V 记录。

## 决策记录 D

| 编号 | 主题 | 选项 | 选择 | 理由 | 时机 |
|---|---|---|---|---|---|
| D-001 | 迁移面 | A.回填全部 8 个 / B.仅等价可迁移子集（comfyui） | B | 模板形态=请求体全文 + 占位符缺失报错 ⇒ 空 params 协议无增益、openai 系不等价；只有 static 恒 Present 的协议能安全等价 | 开工 |
| D-002 | openai chat | A.回填 / B.禁止并写入判别标准 | B | 模板含 tools/user ⇒ 业务缺省即 ErrTemplateMissingValue（破坏现有「缺省不发送」行为）；不含 ⇒ 丢字段。两者都不等价 | 开工 |
| D-003 | 空 params 协议（grsai/jimeng×2/minimax_video） | A.回填 `{}` / B.不做 | B | params[] 形态 = {} + __passthrough 动态注入；模板表达不了映射产物，回填 = 形式主义，无任何增益 | 开工 |
| D-004 | comfyui 模板是否写 task_type | A.不写 / B.写 `"task_type":"sync"` | B | 与 minimax_text 先例一致，把请求体写成一眼可见的完整形状；执行器按 async 声明注入/覆盖，语义不变 | 开发中 |

## 验证记录 V

| 编号 | 对应验收判据 | 命令/方式 | 结果 | 证据位置 |
|---|---|---|---|---|
| V-001 | 判据 3 | `cd services/execution && go test ./internal/engine/ -run TestRequestTemplateEquivalenceBuiltinComfyUI -v` | ✅ 6/6 PASS（默认/__key/模型级/__passthrough 新增/覆盖/叠加 × 同步+异步） | 本日志 |
| V-002 | 判据 1/2/5 | migrate.sh 应用 065 + `SELECT request_template` | ✅ 当前版本 065；comfyui=`{"client_id":"{{client_id}}","task_type":"sync"}`；minimax_text=NULL（注册表补齐） | 本日志 |
| V-003 | 判据 6 | execution+production build/test -race/vet/gofmt + file-size + 台账门禁 | ✅ 全绿：execution 全包 ok；production build/vet 绿；file-size 0 超标；check-task-ledger 通过 | 本日志 |
| V-004 | 判据 4 | ADR-007 D3 diff | ✅ D3 状态已更新（等价子集生效 + 判别标准 + openai 禁止回填） | docs/adr/protocol-registry.md |

## 阻塞与解法 B

| 编号 | 阻塞 | 根因 | 解法 | 复用教训 |
|---|---|---|---|---|
| B-001 | migrate.sh fail-closed 拒绝：064 校验和不匹配（记录 b14d468f vs 当前 2f8b1601） | develop 上 a7a4de4（21:53）对**已应用**的 064 追加了 29 行 `--` 注释（「为什么没有自动化守卫」说明）；SQL 语句零变更 ⇒ schema 无分叉，仅校验和记录过期。migrate.sh 无校验和更新机制（ADOPT 只管无跟踪记录库） | 先全量核对 46 个已应用迁移：**仅 064 不匹配**（其余 45 全一致）；`git diff 4c9e440 a7a4de4` 实证 +29 行全为注释、无 SQL 变更 ⇒ `UPDATE schema_migrations SET checksum='2f8b1601...' WHERE version='064'` 对齐后重跑，065 应用成功 | 已应用迁移文件**连注释都不要追加**（migrate.sh 按整文件校验和判定，注释变更也会触发 fail-closed）；本地对齐属「采纳文件最终态」，须先实证 SQL 语义一致再改记录 |

## 纪律自检（对照 `.agents` 规则，逐项留证据）

| 检查项 | 结果 | 证据 |
|---|---|---|
| 先本地测试/验证再 commit | ✅ | V-001~V-004 全绿后提交 |
| 按路径 add（禁 `git add -A`） | ✅ | 提交时按路径 add（见 commit 明细） |
| 只改点名范围（未越界） | ✅ | 改动仅：migrations/065（新）+ execution 两个测试文件 + ADR-007 + 台账；未动渲染器/注册表代码 |
| 验收清单逐项勾对（AC-004/005） | ✅ | acceptance.md 6/6 + 边界 4/4 + 反模式 6/6 |
| GATE / 后端门禁全绿 | ✅ | V-003 |
| 台账同步（状态/PR 号） | ✅ | ledger.json / README / task.md 三方一致；pr=#<待开> |
| 迁移只增不改 / 号段合规 | ✅ | 065 号段 060-069 内；UPDATE 幂等；B-001 对齐仅改记录表（实证 SQL 无分叉） |

## 复盘（收尾时写）

- **做得好的**：
- **可改进的**：
- **遗留/后续**：
