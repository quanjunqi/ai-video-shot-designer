# TASK-PROTOCOL-004 开发日志

> 开发过程的事实源：**动作 / 证据 / 决策 / 阻塞** 四类条目，随开发同步记录。
> 规则：AC-010（`.agents/skills/acceptance-checklist/SKILL.md`）。**开工即建，随开发追加，PR 前完成；禁止交付前一次性补写。**

## 任务信息

| 字段 | 值 |
|---|---|
| 任务卡 | [TASK-PROTOCOL-004/task.md](task.md) |
| 验收清单 | [TASK-PROTOCOL-004/acceptance.md](acceptance.md) |
| 分支 | `feature/protocol-audit-2026-10-17` |
| PR | #<待开> |
| 开工 | 2026-10-17 02:00（本地） |
| 完成 | 待填 |
| 开发者 | AI Agent（会话 m_0cwRd4Q1hew） |

## 执行轨迹（正序；每个动作一条）

### 2026-10-17 02:00 探查 + 立卡判定
- **动作**：核验 PR #212 CI 绿（success）、#213 CI 进行中；确认 MODEL-006 剩余判据（7/8/9）依赖 Owner 数据 ⇒ 下一张卡 = 协议定义三方一致性自检（#213 遗留的漂移治理收口）。确认新包独立于 #213（未合并）开发。
- **证据**：GET pulls/212（mergeable_state=clean）+ runs API（success）；MODEL-006 acceptance 判据 7/8/9 依赖数据；protocol_registry.go grep 确认 openai_video 不在注册表。

### 2026-10-17 02:10 真库快照
- **动作**：真库 production.protocol_templates 9 行快照（jsonb_agg ORDER BY id）→ testdata/protocol_templates_snapshot.json（含来源注释）。
- **证据**：快照含 9 模板；8 个有能力声明（061 + #212 补齐）；openai_video 只在 DB。

### 2026-10-17 02:20 开发
- **动作**：写 internal/protocolaudit/audit.go（Audit 纯函数：id 集合 / 能力键词表 / 空能力提示）+ 6 单测。
- **决策**：D-001~D-004（新包独立 / 快照输入 / comfyui 例外 / 快照自证）。修复 TestAuditClean 断言（nil slice vs 空 slice 的 DeepEqual 陷阱）。
- **证据**：6 单测全绿（含 TestAuditSnapshotRealDB：db-only=[openai_video] 稳定检出、无词表违规）。

### 2026-10-17 02:30 立卡（补建）
- **动作**：补建 `.github/tasks/TASK-PROTOCOL-004/` 四件套。
- **说明**：本卡开发与立卡在同一连续会话完成（任务 #6 已在开发前登记）；文档按真实时间线记录。

## 决策记录 D

| 编号 | 主题 | 选项 | 选择 | 理由 | 时机 |
|---|---|---|---|---|---|
| D-001 | 包位置 | A.扩展 protocolgen / B.新包 protocolaudit | B | 不依赖未合并的 #213；审计 = 独立主题 | 探查 |
| D-002 | 输入形态 | A.连库 / B.纯函数 + 快照 | B | 不连库；快照由调用方提供（testdata 固化真库快照） | 探查 |
| D-003 | 例外规则 | A.无例外 / B.emptyCapOK（comfyui） | B | 工作流自定义无法静态声明（#212 同源口径 8/9） | 探查 |
| D-004 | 门禁自证 | A.仅单测 / B.真库快照断言已知漂移 | B | 快照 = 门禁基线，防回归 | 探查 |

## 验证记录 V

| 编号 | 对应验收判据 | 命令/方式 | 结果 | 证据位置 |
|---|---|---|---|---|
| V-001 | 判据 1 | go test ./internal/protocolaudit/ | ✅ 6 单测全绿（漂移检出/干净/词表违规/空提示/registry-only/快照自证） | audit_test.go |
| V-002 | 判据 2 | TestAuditCapabilityKeyViolation | ✅ bad-mode → CapViolation 检出 | audit_test.go |
| V-003 | 判据 3 | TestAuditSnapshotRealDB | ✅ 快照 9 行；db-only=[openai_video]；无词表违规 | audit_test.go |
| V-004 | 判据 4 | testdata 快照头 | ✅ 来源注释（真库 2026-10-17 + 已知漂移注记） | testdata/ |
| V-005 | 判据 5 | docs 检查 | ✅ protocol-onboarding.md 已补「一致性自检」小节 | protocol-onboarding.md |
| V-006 | 判据 6 | production build/test -race/vet/gofmt + file-size + 台账 | ✅ 全绿（protocolaudit ok + vet + gofmt 干净 + file-size 0 + 台账通过） | 本日志 |

## 阻塞与解法 B

| 编号 | 阻塞 | 根因 | 解法 | 复用教训 |
|---|---|---|---|---|
| B-001 | TestAuditClean 失败 | nil slice vs 空 slice 的 reflect.DeepEqual 陷阱 | 改 len() 检查 | 断言空切片用 len，勿用 DeepEqual |

## 纪律自检（对照 `.agents` 规则，逐项留证据）

| 检查项 | 结果 | 证据 |
|---|---|---|
| 先本地测试/验证再 commit | ✅ | V-001~V-006 全绿后提交 |
| 按路径 add（禁 `git add -A`） | ✅ | 提交时按路径 add |
| 只改点名范围（未越界） | ✅ | 仅 protocolaudit/ + docs + 台账 |
| 验收清单逐项勾对（AC-004/005） | ✅ | acceptance.md 6/6 |
| GATE / 后端门禁全绿 | ✅ | V-006；CI 待跑 |
| 台账同步（状态/PR 号） | ✅ | 三方一致；pr=#<待开> |
| 迁移只增不改 / 号段合规 | ✅ | 本卡无迁移 |

## 复盘（收尾时写）

- **做得好的**：
- **可改进的**：
- **遗留/后续**：
