# 任务卡：规则流程治理（AC-009 UI 设计稿先行 + 台账同步）

> 按 `.github/TASK_TEMPLATE.md` 填写。本卡登记 2026-10-14 的规则变更（PR #179）并同步台账状态。

## 基本信息

- **任务 ID**：TASK-PROC-001
- **任务名称**：规则流程治理——acceptance-checklist 补入 AC-009 UI 设计稿先行关卡
- **创建日期**：2026-10-14
- **人类 Owner**：quanjunqi
- **AI 执行者**：Doubao MainAgent
- **优先级**：P1（流程治理，不阻塞功能开发）
- **预计工时**：30 分钟
- **依赖**：无

---

## 1. 目标

**目标**：修复流程缺口——原 AC-003 为「如有设计稿才逐点映射」，无"先产出设计稿 → Owner 评审 → 再开发"的强制关卡；UI 任务需求→直接写码，返工成本高。本次把设计稿先行定为硬规则（AC-009），并同步台账修正 T4 已验收状态。

**背景**：Owner 2026-10-14 提出「当前开发流程涉及 UI 设计时是否先产出原型设计稿供评审」；评估结论：规则有"设计稿逐点映射"但无"设计稿先行"强制门，实践中 UI-001/002 均注明"无正式设计稿"。返工风险高（一个页面重做 1-2 天）。

---

## 2. 范围

### 范围内（In Scope）

- `.agents/skills/acceptance-checklist/SKILL.md`：AC-003 收紧 + 新增 AC-009 + 强制流程插入步骤 0（设计稿评审门）+ 禁止事项 +3
- `.agents/skills/acceptance-checklist/templates/acceptance-checklist.md`：章节二标题改「UI 任务必填」+ 设计稿信息行（来源/评审人/结论/日期）
- `.github/tasks/README.md`：新增本卡索引；修正 TASK-ROUTE-003（T4）状态为已验收（PR #177 已合并）

### 范围外（Out of Scope）

- frontend-coding / frontend-quality 规则的连带修改（如需另立卡）
- PR 模板的「设计稿评审记录」检查项（建议项，未强制）

---

## 3. 验收标准（AC-009 生效判定）

| # | 判据 | 对象 | 时点 | 例外 |
|---|---|---|---|---|
| 1 | SKILL.md 规则表含 AC-009，且含"未过评审不得写码"字样 | `.agents/skills/acceptance-checklist/SKILL.md` | 提交后 | 无 |
| 2 | 强制流程含步骤 0（设计稿评审门），6 步变 7 步 | 同上 | 提交后 | 无 |
| 3 | 模板章节二标题含"UI 任务必填"，且有评审信息行 | `templates/acceptance-checklist.md` | 提交后 | 无 |
| 4 | README 索引含本卡；T4（ROUTE-003）状态为已验收 | `.github/tasks/README.md` | 提交后 | 无 |
| 5 | 规则变更随 PR 合并入 develop | GitHub PR | CI 通过后 | 无 |

---

## 4. 交付记录

- PR #179（docs/ui-design-gate-2026-10-14）已合并，merge commit `09a9700`。
- 本卡补建：台账索引 37→38 张；T4 状态修正为已验收。
