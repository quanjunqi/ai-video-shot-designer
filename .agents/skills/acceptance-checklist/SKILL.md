---
name: acceptance-checklist
description: 当承接任何开发任务（新功能、修复、重构）时加载。包含「需求点 → 设计稿 → 开发 → 验收」的逐项可追溯清单机制：AI 先产出验收清单，开发后逐项自检勾对，PR 附勾对结果供 Owner 抽查。解决漏项风险、需求理解偏差与「验收靠人记」的问题。
---

# 需求验收清单

> 模板见 `templates/acceptance-checklist.md` 与 `templates/devlog.md`（本目录）。本文件是 AI 执行时的快速参考。
> 与 `frontend-coding` / `backend-coding` / `frontend-quality` 互补：本 skill 管「需求到验收的追溯链 + 开发过程留痕」，编码规范管「怎么写」。

## 任务文档结构（一个任务一个文件夹）

```
.github/tasks/
  README.md              # 台账索引（人读；每卡一行：状态/优先级/PR）
  ledger.json            # 台账机器可读视图（审计 agent 消费；与 README 同步维护）
  plans/                 # 排期 / 治理提案（PLAN-*）
  <TASK-ID>/             # 单任务工作区（卡/清单/日志天然聚拢）
    task.md              # 任务卡（YAML front-matter：status / priority / depends_on）
    acceptance.md        # 验收清单
    devlog.md            # 开发日志（人读；四类条目 + 纪律自检 + 复盘）
    devlog.events.json   # 开发日志结构化事件流（审计 agent 机器消费；与 devlog.md 同步维护）
```

> 存量平铺文件**渐进迁移**：新任务一律用文件夹结构；旧任务在后续改动时顺手归位（不阻塞业务）。

## 什么时候加载这个 skill

- 任何开发任务开工前（必须）：先建开发日志、产验收清单，再写代码
- **UI 任务（新建页面 / 大改布局 / 视觉系统变更）开工前（必须）：先产出设计稿/原型 → Owner 评审通过 → 再写代码**（AC-009）
- 开发完成、提交 PR 前（必须）：开发日志补全（含验证记录与纪律自检）、按清单逐项自检勾对
- 收到需求但范围/验收标准不明确时：先补清单，再向用户确认

## 核心规则速查

| 编号 | 规则 | 检测方式 |
|---|---|---|
| AC-001 | 开工前必须产出验收清单（需求点逐条可验证） | 代码审查 |
| AC-002 | 清单每项有客观判据（判据/对象/时点/例外 四要素） | 审查 |
| AC-003 | 设计稿/高保真稿逐点映射到需求点（防理解偏差）；**UI 任务的设计稿映射为必填，非 UI 任务保持「如有」** | 审查 |
| AC-004 | 开发完成后逐项自检勾对，未过项不得交付 | 审查 |
| AC-005 | PR 必须附勾对结果（通过项/未过项/原因） | PR 审查 |
| AC-006 | 三态（loading/error/empty）与边界逐项过 | 审查 |
| AC-007 | 反模式速查逐条自查（FE-*/BE-* 命中即改） | GATE + 审查 |
| AC-008 | 清单必须落成文件：`.github/tasks/<TASK-ID>/acceptance.md`（任务工作区内；无任务卡时用 `.github/tasks/<日期>-<简述>/acceptance.md`） | 文件存在 |
| AC-009 | **UI 任务设计稿先行**：开工前必须产出可评审设计稿/原型（高保真 HTML / 截图 / SVG / Figma），经 Owner 评审通过后方可进入开发；未过评审不得写码 | 审查 + PR 评审 |
| AC-010 | **开发日志先行与同步记录**：开工即建 `.github/tasks/<TASK-ID>/devlog.md`（模板 `templates/devlog.md`），随开发同步记录动作/证据/决策/阻塞四类条目；PR 前完成全部条目（含验证记录与纪律自检）；**禁止交付前一次性补写**（日志必须随开发同步写，事后补 = 审计不可信） | 文件存在 + 时间戳轨迹 + 审查 |
| AC-011 | **结构化配套**：开发日志同步维护 `.github/tasks/<TASK-ID>/devlog.events.json`（时间戳+阶段+动作+证据引用的事件流）；台账双视图 `.github/tasks/README.md`（人读）+ `.github/tasks/ledger.json`（机器读，含 id/status/priority/pr/criteria）；任务卡带 YAML front-matter（status/priority/depends_on）——审计 agent 直接消费结构化数据，不解析 md 表格 | JSON 有效 + 字段完整 |

## 强制流程（每次开发）

```
需求 → 0. 判定任务类型：UI 任务 → 产出设计稿/原型 → Owner 评审 → 评审通过
      → 1. 建开发日志（复制 templates/devlog.md → `.github/tasks/<TASK-ID>/devlog.md`；随开发同步记录，并同步维护 devlog.events.json）
      → 2. 产验收清单（复制 templates/ → `.github/tasks/<TASK-ID>/acceptance.md`；UI 任务含设计稿逐点映射必填）
      → 3. 对照设计稿逐点映射（以评审通过版本为基准，设计稿每个模块都有需求来源）
      → 4. 开发（按编码规范写；日志同步记动作/决策/证据/阻塞）
      → 5. 自检勾对（清单逐项：过/未过/原因）
      → 6. GATE + 测试（结果写入日志「验证记录 V」与 events.json）
      → 7. PR 附勾对结果 + 开发日志链接
```

> 8 步缺一不可。**未建开发日志 = 不得开工；未产出清单 = 不得开工；UI 任务未过设计稿评审 = 不得开发；未勾对 = 不得开 PR。**
> 审计 agent 依开发日志还原过程（先测后提交 / 边界 / 验证真实性 / 决策成立性），日志缺证据 = 按未执行对待。

## 禁止事项

- ❌ 跳过清单直接写代码
- ❌ 清单项写成模糊话术（"体验好""界面美观"）——必须可验证
- ❌ 自检勾对"全过"但 GATE 不绿 / 测试不过（判据造假）
- ❌ PR 不附勾对结果
- ❌ 用「验收靠人」替代清单——清单让 Owner 只需抽查
- ❌ UI 任务未产出设计稿/原型直接写代码
- ❌ 设计稿未经 Owner 评审（或评审未通过）即进入开发
- ❌ 开发完成后才补设计稿「走流程」（设计稿必须先行，不是交付后补的文档）
- ❌ 跳过开发日志直接开发（开工即建，AC-010）
- ❌ 交付前一次性补写开发日志（日志必须随开发同步写；事后补 = 审计不可信）
- ❌ 开发日志只写结论不写证据（动作/证据/决策/阻塞四类条目缺一不可，验证记录须可复核）

## 完整文档

→ `templates/acceptance-checklist.md`（验收清单模板，逐字段说明）
→ `templates/devlog.md`（开发日志模板，四类条目 + 纪律自检 + 复盘；AC-010）
→ `templates/devlog.events.json`（结构化事件流样例，审计 agent 消费；AC-011）
→ `.github/tasks/README.md`（台账索引）+ `.github/tasks/ledger.json`（台账机器视图，AC-011）
→ `.agents/skills/frontend-coding`（怎么写代码，MUST 规则）
→ `.agents/skills/backend-coding`（怎么写代码，MUST 规则）
