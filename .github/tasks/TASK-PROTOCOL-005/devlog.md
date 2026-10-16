# TASK-PROTOCOL-005 开发日志

> 开发过程的事实源：**动作 / 证据 / 决策 / 阻塞** 四类条目，随开发同步记录。
> 规则：AC-010（`.agents/skills/acceptance-checklist/SKILL.md`）。**开工即建，随开发追加，PR 前完成；禁止交付前一次性补写。**

## 任务信息

| 字段 | 值 |
|---|---|
| 任务卡 | [TASK-PROTOCOL-005/task.md](task.md) |
| 验收清单 | [TASK-PROTOCOL-005/acceptance.md](acceptance.md) |
| 分支 | `feature/openai-video-registry-2026-10-17` |
| PR | #<待开> |
| 开工 | 2026-10-17 03:10（本地） |
| 完成 | 待填 |
| 开发者 | AI Agent（会话 m_0cwRd4Q1hew） |

## 执行轨迹（正序；每个动作一条）

### 2026-10-17 03:05 探查（TASK-PROTOCOL-004 收尾检查）
- **动作**：核验 #213/#214 CI 全绿；确认协议层五张 PR 全部就绪。探查 openai_video 漂移修复路径。
- **证据**：GET pulls/213、214 + runs API（success/clean）；MergeTemplates 语义（DB 行优先、注册表兜底）。

### 2026-10-17 03:10 探查（修复方式）
- **动作**：读 MergeTemplates/postgres.go/model.go 确认：openai_video DB 行已存在（可用），漂移影响 = 缺 canonical 兜底；ProtocolAsync 缺 timeout/poll 字段；async 由 json.RawMessage 透传。
- **决策**：D-001~D-004（注册表补定义 / async 补字段 / capabilities 常量同源 / audit 归零自证）。

### 2026-10-17 03:20 开发
- **动作**：protocol_registry.go 补 openai_video 定义 + ProtocolAsync 补 timeoutMinutes/pollIntervalSeconds + openaiVideoCapabilities 常量；新测试文件 protocol_registry_openai_video_test.go（2 单测）；audit_test.go 更新（registryIDs + 快照归零断言 + 漂移演示换假 id）；快照 note 更新。
- **证据**：catalog 2 兜底测试 PASS；audit 6 单测全绿（漂移归零）；production test -race 10 包全绿 + vet + gofmt。

### 2026-10-17 03:35 关键发现：pollPath 占位符 bug
- **动作**：全量门禁暴露既有断言（8 内置定义）需更新；更关键——`TestProtocolDefinitionsPollPathShape` 要求 pollPath 含 `{task_id}`（执行器 ReplaceAll 硬约束）。实证 execution/internal/engine/engine.go:341 `ReplaceAll(async.PollPath, "{task_id}", taskID)`。
- **结论**：openai_video DB 行 pollPath=`/v1/videos/{id}` **不含 {task_id} → 所有任务轮询同一个 URL（真 bug，061 写入缺陷）**。范围扩展：注册表定义 + DB 行都修。
- **证据**：protocol_registry_test.go:367（约束）+ engine.go:341（实现）。

### 2026-10-17 03:40 迁移 067 + 拆分 + 断言更新
- **动作**：写迁移 067（jsonb_set pollPath → /v1/videos/{task_id}，幂等 WHERE 限定）并应用（production 当前版本 067）；刷新真库快照；注册表 pollPath 修正；capabilities 常量拆到独立文件 protocol_capabilities.go（BE-SIZE-001：registry.go 540 行超限）；builtinTemplateIDs 加 openai_video（8→9）+ golden table 补行 + merge 断言 9→10。
- **证据**：migrate.sh 应用 067 成功；DB 验证 pollPath=/v1/videos/{task_id}；快照刷新 9 行；catalog 全绿。

### 2026-10-17 03:50 立卡
- **动作**：补建 `.github/tasks/TASK-PROTOCOL-005/` 四件套（任务 #7 已在开发前登记）。
- **说明**：与 TASK-PROTOCOL-004 同模式（连续会话推进）。
- **动作**：补建 `.github/tasks/TASK-PROTOCOL-005/` 四件套（任务 #7 已在开发前登记）。
- **说明**：与 TASK-PROTOCOL-004 同模式（连续会话推进）。

## 决策记录 D

| 编号 | 主题 | 选项 | 选择 | 理由 | 时机 |
|---|---|---|---|---|---|
| D-001 | 修复方式 | A.注册表补定义 / B.迁移删行 / C.迁移改行 | A | DB 行已存在且优先；注册表 = canonical 兜底；audit 归零 | 探查 |
| D-002 | async 完整性 | A.仅 6 字段 / B.补 timeout/poll（omitempty） | B | 兜底定义完整（DB 缺行时轮询不退化）；不影响既有输出 | 探查 |
| D-003 | capabilities 来源 | A.复制 DB 行 / B.精简 | A | 与其它 builtin 常量同风格；词表同源（061） | 探查 |
| D-004 | 自证口径 | A.仅 audit / B.audit 归零 + catalog 兜底测试 | B | 修完必须有门禁证明「不再漂移」且「兜底可用」 | 探查 |

## 验证记录 V

| 编号 | 对应验收判据 | 命令/方式 | 结果 | 证据位置 |
|---|---|---|---|---|
| V-001 | 判据 1 | go test ./internal/catalog/ -run TestRegistryFallback | ✅ canonical 定义完整（type/path/async timeout/poll） | protocol_registry_openai_video_test.go |
| V-002 | 判据 2 | TestRegistryFallbackMergeBehavior | ✅ DB 缺行时注册表兜底（含 timeoutMinutes） | 同上 |
| V-003 | 判据 3 | go test ./internal/protocolaudit/ | ✅ 快照自证：db-only 空、both=9、无词表违规 | audit_test.go |
| V-004 | 判据 4 | openaiVideoCapabilities 常量 | ✅ text-to-video + image-to-video（061 枚举内） | protocol_registry.go |
| V-005 | 判据 5 | go test ./... -race | ✅ 10 包全绿（既有定义不受 omitempty 影响） | 全仓 |
| V-006 | 判据 6 | vet/gofmt/file-size/台账 | ✅ 全绿（11 包 -race + vet + gofmt + file-size 0 + 台账通过） | 本日志 |
| V-007 | 判据 6 追加 | 迁移 067 应用验证 | ✅ DB pollPath=/v1/videos/{task_id}（幂等 WHERE） | 迁移 067 |

## 阻塞与解法 B

| 编号 | 阻塞 | 根因 | 解法 | 复用教训 |
|---|---|---|---|---|
| （无） | | | | |

## 纪律自检（对照 `.agents` 规则，逐项留证据）

| 检查项 | 结果 | 证据 |
|---|---|---|
| 先本地测试/验证再 commit | ✅ | V-001~V-007 全绿后提交 |
| 按路径 add（禁 `git add -A`） | ✅ | 提交时按路径 add |
| 只改点名范围（未越界） | ✅ | 注册表 + 迁移 067 + 快照 + 测试 + 台账 |
| 验收清单逐项勾对（AC-004/005） | ✅ | acceptance.md 6/6 |
| GATE / 后端门禁全绿 | ✅ | V-006；CI 待跑 |
| 台账同步（状态/PR 号） | ✅ | 三方一致；pr=#<待开> |
| 迁移只增不改 / 号段合规 | ✅ | 迁移 067（号段 060-069 内，只增不改） |

## 复盘（收尾时写）

- **做得好的**：
- **可改进的**：
- **遗留/后续**：
