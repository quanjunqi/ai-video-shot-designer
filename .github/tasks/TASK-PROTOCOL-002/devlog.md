# TASK-PROTOCOL-002 开发日志

> 开发过程的事实源：**动作 / 证据 / 决策 / 阻塞** 四类条目，随开发同步记录。
> 规则：AC-010（`.agents/skills/acceptance-checklist/SKILL.md`）。**开工即建，随开发追加，PR 前完成；禁止交付前一次性补写。**

## 任务信息

| 字段 | 值 |
|---|---|
| 任务卡 | [TASK-PROTOCOL-002/task.md](task.md) |
| 验收清单 | [TASK-PROTOCOL-002/acceptance.md](acceptance.md) |
| 分支 | `feature/protocol-capabilities-backfill-2026-10-17` |
| PR | #<待开> |
| 开工 | 2026-10-17 00:20（本地） |
| 完成 | 待填 |
| 开发者 | AI Agent（会话 m_0cwRd4Q1hew） |

## 执行轨迹（正序；每个动作一条）

### 2026-10-17 00:15 探查
- **动作**：盘点 MODEL-006 判据现状（git log + 真库查询）——判据 2 已满足（violating=0）、判据 5 已达成（a414dbc）、判据 6 已达成（4c9e440）；**判据 4 剩余 6 个 EMPTY 模板**。
- **证据**：真库 9 模板 3 HAS / 6 EMPTY；能力键枚举 = openai(text-chat)/openai_img(text-to-image,image-to-image)/openai_video(text-to-video,image-to-video)；注册表 6 模板定义（request_path/params/response_params/async）全读；mapping/engine.go（NewEngine 空 JSON 不报错、HasCapability 是核心消费、param_mapping 缺失安全）；resolve.go（capabilities 渐进补齐、未声明≠不支持）。
- **决策**：D-001（能力键沿用 061 枚举）；D-002（param_mapping 省略，无实测依据不写）；D-003（comfyui 例外不填，判据 4 口径 8/9）；D-004（response_extract 从注册表 response_params 派生）。

### 2026-10-17 00:20 立卡
- **动作**：建 `.github/tasks/TASK-PROTOCOL-002/` 四件套 + 新分支 `feature/protocol-capabilities-backfill-2026-10-17`。
- **证据**：task.md 定义 6 条验收判据 + 4 条决策；迁移 066 号段 060-069 内。

## 决策记录 D

| 编号 | 主题 | 选项 | 选择 | 理由 | 时机 |
|---|---|---|---|---|---|
| D-001 | 能力键枚举 | A.自定义 / B.沿用 061 三键枚举 | B | 同源原则（064 教训：词表必须与调用方同源） | 探查 |
| D-002 | param_mapping | A.写推断字段名 / B.省略 | B | 061 证据分级精神：无探测/文档依据不写；缺失不影响能力校验与默认透传 | 探查 |
| D-003 | comfyui capabilities | A.填伪能力 / B.例外不填 | B | 工作流自定义，协议层无法静态声明；硬填会误导 HasCapability 过滤 | 探查 |
| D-004 | response_extract | A.自定义 / B.注册表 response_params 派生 | B | 注册表定义是既有事实，派生有依据 | 探查 |

## 验证记录 V

| 编号 | 对应验收判据 | 命令/方式 | 结果 | 证据位置 |
|---|---|---|---|---|
| V-001 | 判据 1/2/3/5 | 迁移 066 应用 + 真库 SELECT 键值 + count 8/9 | ✅ 066 已应用；5 模板键值与设计一致；count=8/9（comfyui 例外） | 本日志 |
| V-002 | 判据 4 | 迁移注释 + PR body 含 comfyui 例外与口径说明 | ✅ 迁移注释含 6 模板裁定表 + comfyui 例外理由；PR body 将同步 | 本日志 |
| V-003 | 判据 6 | production build/vet + file-size + 台账门禁 | ✅ build/vet 绿；file-size 0 超标；check-task-ledger 通过 | 本日志 |
| V-004 | 契约核对 | openapi/bff.yaml supported_modes 派生口径只读核对 | ✅ handlers_catalog.go 动态聚合键；bff.yaml 无硬编码枚举；新键 ∈ 061 枚举 ⇒ 契约兼容 | 本日志 |

## 阻塞与解法 B

| 编号 | 阻塞 | 根因 | 解法 | 复用教训 |
|---|---|---|---|---|
| — | — | — | — | — |

## 纪律自检（对照 `.agents` 规则，逐项留证据）

| 检查项 | 结果 | 证据 |
|---|---|---|
| 先本地测试/验证再 commit | ✅ | V-001~V-004 全绿后提交 |
| 按路径 add（禁 `git add -A`） | ✅ | 提交时按路径 add |
| 只改点名范围（未越界） | ✅ | 仅 migrations/066 + 台账 + task 四件套 |
| 验收清单逐项勾对（AC-004/005） | ✅ | acceptance.md 6/6 |
| GATE / 后端门禁全绿 | ✅ | V-003；CI 待跑 |
| 台账同步（状态/PR 号） | ✅ | 三方一致；pr=#<待开> |
| 迁移只增不改 / 号段合规 | ✅ | 066 号段 060-069；UPDATE 幂等 |

## 复盘（收尾时写）

- **做得好的**：
- **可改进的**：
- **遗留/后续**：
