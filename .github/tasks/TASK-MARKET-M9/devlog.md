# <TASK-ID> 开发日志

> 开发过程的事实源：**动作 / 证据 / 决策 / 阻塞** 四类条目，随开发同步记录。
> 审计 agent（人或 AI）依此还原：是否先测试后提交、是否越界、验证是否真实、决策是否成立。
> 规则：AC-010（`.agents/skills/acceptance-checklist/SKILL.md`）。**开工即建，随开发追加，PR 前完成；禁止交付前一次性补写。**
> 机器可读配套：与本文件**同步维护** `devlog.events.json`（结构化事件流，审计 agent 直接消费；AC-011）。本 md 是人读主版本，events.json 是同一事实的结构化投影——两者不得互相矛盾。

## 任务信息

| 字段 | 值 |
|---|---|
| 任务卡 | [TASK-XXX-….md](TASK-XXX-….md) |
| 验收清单 | [TASK-XXX-acceptance.md](TASK-XXX-acceptance.md) |
| 分支 | `<prefix>/<简述>-<日期>` |
| PR | #<n>（合并 sha：<sha>） |
| 开工 | YYYY-MM-DD HH:MM（本地） |
| 完成 | YYYY-MM-DD HH:MM |
| 开发者 | AI Agent（会话 <id>） |

## 执行轨迹（正序；每个动作一条）

> 一条 = 时间 + 阶段 + 动作 + 发现/证据（命令与输出摘要，完整输出引用 PR/文件）。决策单列 D-xxx。

### YYYY-MM-DD HH:MM 开工/探查
- **动作**：
- **发现/证据**：
- **决策**：D-001

### YYYY-MM-DD HH:MM 开发/验证/PR/验收（按实际追加）
- **动作**：
- **证据**：

## 决策记录 D

| 编号 | 主题 | 选项 | 选择 | 理由 | 时机 |
|---|---|---|---|---|---|
| D-001 |  | A / B | B |  | 开工 |

> 重要选择必须留痕（哪怕一句"选 B 因为 CI 更稳"）。审计以此判断拍板是否成立、有无被推翻。

## 验证记录 V

| 编号 | 对应验收判据 | 命令/方式 | 结果 | 证据位置 |
|---|---|---|---|---|
| V-001 | 判据 N | `go test -run X` | PASS | PR body / 本日志 |

> 结果只填 PASS / FAIL / 跳过+原因；证据位置可引用 PR、CI 链接、文件路径。禁止只写结论不写证据。

## 阻塞与解法 B

| 编号 | 阻塞 | 根因 | 解法 | 复用教训 |
|---|---|---|---|---|
| B-001 |  |  |  |  |

## 纪律自检（对照 `.agents` 规则，逐项留证据）

| 检查项 | 结果 | 证据 |
|---|---|---|
| 先本地测试/验证再 commit | ✓ / ✗ | V-xxx |
| 按路径 add（禁 `git add -A`） | ✓ / ✗ | commit 明细 |
| 只改点名范围（未越界） | ✓ / ✗ | diff 清单 |
| 验收清单逐项勾对（AC-004/005） | ✓ / ✗ | acceptance 文件 |
| GATE / 后端门禁全绿 | ✓ / ✗ | CI 结论 |
| 台账同步（状态/PR 号） | ✓ / ✗ | README 行 |
| 迁移只增不改 / 号段合规（如涉） | ✓ / ✗ | 迁移 diff |

> 任一 ✗ 必须写明原因与处置，不得空项带过。

## 复盘（收尾时写，1–3 句每项）

- **做得好的**：
- **可改进的**：
- **遗留/后续**（含转交其他卡的事项）：

### 2026-10-18 M9 开发全程
- **探查证据**：偏好语义三处消费——StageModelPicker/ProjectParams 按 name、useCreateControls 按 id（失配）；defaultPrefs 历史值 name 形态；M8 死链残留：CreateWorkbench 空态 + TopBar 全局搜索模型项 → /models/catalog
- **动作**：useCreateControls `m.id === preferred || m.name === preferred`（id 优先 name 兜底）；空态 action → /models/market + 文案「去模型中心」；TopBar 模型搜索落点 → /models/market
- **证据**：gate GATE=0 / ui:check ✓ / npm test 全过（新增 market-default-consumption.test.ts 3 分支）
- **证据（L3）**：/create/image 模型档位默认选中 PearAPI GPT-Image 2（偏好 name 匹配生效，修复前回退目录首项）
