# TASK-PROC-002：开发日志机制落地（AC-010）

- **来源**：Owner 2026-10-15 要求「设计开发日志，方便审计 agent 进行开发审计和其他流程；写到 agent 规则中，不能换一个对话/换一个模型就全部忘记」
- **状态**：已落地（PR #192 合并后生效）

## 目标（一句话）

把「开发过程留痕」变成强制规则：每张任务卡开工即建开发日志，随开发同步记录动作/证据/决策/阻塞，审计 agent 可据此还原开发过程（先测后提交/边界/验证真实性/决策成立性），且规则写入 AGENTS.md（项目规则入口），换会话/换模型不失效。

## 范围

- ✅ `.agents/skills/acceptance-checklist/SKILL.md`：新增 AC-010 规则、强制流程加「建开发日志」步骤、禁止事项补充
- ✅ `.agents/skills/acceptance-checklist/templates/devlog.md`：专业级模板（任务信息/执行轨迹/决策记录 D/验证记录 V/阻塞与解法 B/纪律自检/复盘）
- ✅ `AGENTS.md`：关键 gotchas 加「开发日志强制（AC-010）」+ 新增「每次开发的强制流程」小节 + 场景化 Skills 行更新——跨会话/跨模型生效的规则入口
- ✅ `.github/tasks/README.md`：本卡登记

## 非范围

- ❌ 不改变现有 AC-001~009 语义（只新增）
- ❌ 不为历史任务补写日志（机制向前生效；已验收卡的洞由验收记录兜底）

## 验收标准

1. AC-010 规则存在于 acceptance-checklist/SKILL.md（含"禁止交付前一次性补写"）
2. templates/devlog.md 存在且含四类条目（动作/证据/决策/阻塞）+ 纪律自检 + 复盘
3. AGENTS.md 含开发日志强制条款（gotchas + 强制流程小节）
4. 台账登记本卡
5. 下一张开工卡按 AC-010 建日志（以 INFRA-004 验收为实践对象）

## 输出

- 分支 `docs/proc-002-devlog-2026-10-15` + PR（base develop）
