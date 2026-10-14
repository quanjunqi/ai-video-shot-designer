# TASK-UI-004：死代码口径修正 + 零引用组件裁剪

> 开工前须按 `.agents/skills/acceptance-checklist/SKILL.md` 产出验收清单
> （`TASK-UI-004-acceptance.md`，与本卡同目录）；本卡 §4 是清单判据的来源。

## 基本信息

- **任务 ID**：TASK-UI-004
- **任务名称**：修正「零引用」口径（补 ui 组件间引用）+ 裁剪与产品无关的组件
- **创建日期**：2026-10-14
- **人类 Owner**：全君琦
- **AI 执行者**：AI Agent（branch `chore/dead-code-triage-2026-10-14`）
- **优先级**：P2
- **预计工时**：1–2 小时
- **状态**：待验收

---

## 1. 目标

**目标**：让「零引用组件」这个数字**可信**，并据此把与产品无关的组件裁掉，减少维护面。

**背景（TASK-UI-001 遗留 + 本次复核发现）**：
- 原口径把**整个 `components/ui/**` 排除**在引用统计之外 ⇒ 组件之间的正常引用被忽略。
  实测有 3 个被误判：`separator`（被 `button-group`/`field`/`item`/`sidebar` 用）、
  `skeleton`（被 `sidebar` 用）、`toggle`（被 `toggle-group` 用）⇒ 零引用数 **35 → 32**（修正后）。
- 逐个人工确认后：**13 个组件与产品方向无关或与现有实现重复**，裁剪后零引用进一步降为 **20**、
  组件总数 **55 → 42**。
- 收益：少维护 ~2.4k 行组件代码，且每个组件还连带一份注记与 demo 的维护成本（`ui:check` 强制覆盖）。

---

## 2. 范围

### 范围内（In Scope）

1. **口径修正**：`scripts/ui-inventory.mjs` 的引用统计不再排除整个 `components/ui/**`，
   改为「排除自身文件 + 排除展示页 `pages/dev/**` + 排除生成物」。
2. **裁剪 13 个组件**：`aspect-ratio`、`button-group`、`carousel`、`context-menu`、`drawer`、
   `hover-card`、`input-otp`、`kbd`、`menubar`、`navigation-menu`、`resizable`、`toggle`、`toggle-group`
   （连同其注记段、demo 条目、以及只服务这些 demo 的 import/常量）。
3. **棘轮基线同步**（`ui-debt-baseline.json`）、生成物重生成、ui-kit 视觉基线刷新。

### 范围外（Out of Scope）

- **不动 `package.json` / lockfile**：被裁组件用到的依赖（`vaul`、`embla-carousel-react`、
  `react-resizable-panels`、`input-otp`、若干 `@radix-ui/*`）**暂不清理**，避免 lockfile 大改动与
  连带风险；如需清理另开卡（`TASK-FE-DEPS-*`）。
- 保留的 20 个零引用组件（`form`/`field`/`table`/`pagination`/`chart`/`calendar`/`sidebar` 等）
  **不动**：属近期功能会用到的基建。

---

## 3. 相关文件

- `apps/web/scripts/ui-inventory.mjs`（口径 + 棘轮）
- `apps/web/src/components/ui/<13 个>.tsx`（删除）
- `apps/web/src/pages/dev/ui-kit/demos/*.tsx`（删条目 + 清未用 import/常量）
- `.agents/skills/frontend-coding/ui-components.notes.md`（删 13 段）
- `apps/web/ui-debt-baseline.json`、`src/generated/ui-catalog.ts`、两份清单 md（重生成）
- `apps/web/visual-baseline/ui-kit.png`（刷新）

---

## 4. 验收标准

- [ ] 验收清单文件已产出：`.github/tasks/TASK-UI-004-acceptance.md`
- [ ] **口径修正生效**：`separator`/`skeleton`/`toggle` 不再被判零引用（判据：重生成后 catalog 中三者的 `dead=false`，且 `usage.files` 含 `components/ui/...`）
- [ ] **口径不误报业务**：展示页（`pages/dev/**`）与生成物不参与引用统计（判据：代码中三处 filter 均存在）
- [ ] **裁剪完成**：13 个组件文件、13 段注记、13 条 demo 条目全部移除；`npm run ui:check` 绿（42 组件 / 注记 42 / demo 42）
- [ ] **无残留引用**：`npx tsc --noEmit` 0 error、`npx eslint src --max-warnings 0` 0 warning（判据：删条目后遗留的未用 import 必须清零）
- [ ] **棘轮一致**：`ui-debt-baseline.json` = 20（与 catalog 的 `stats.dead` 相等）
- [ ] **门禁 0/0**：`npm run gate`；`npm test` 全过
- [ ] **产物无回归**：`npm run build` 成功；默认构建 dist 内 0 个 ui-kit 资源
- [ ] **视觉**：`npm run visual:check` 通过（业务页应 0px 差异；ui-kit 因组件减少需刷新基线并说明）
- [ ] **文档同步**：两份清单 md 已重生成，人类清单的零引用清单只剩 20 个

---

## 5. 测试命令

```bash
cd apps/web
npx tsc -p tsconfig.app.json --noEmit
npx eslint src --max-warnings 0
node scripts/ui-inventory.mjs --check
node scripts/quality-gate.mjs
npm test
npm run build
npm run visual:baseline && npm run visual:check
```

---

## 6. 约束与禁止事项

### 必须遵守

- [ ] 删除前先确认「零引用」是**口径修正后**的结论（`separator`/`skeleton`/`toggle` 从零引用名单里出去）
- [ ] 删除要连带注记段与 demo 条目一起清（否则 `ui:check` 红）
- [ ] 保留组件与依赖不动

### 禁止操作

- [ ] 禁止为了让数字好看而删掉**仍被其它组件引用**的组件（必须看口径修正后的结果）
- [ ] 禁止动 `package.json`/lockfile（超出本卡范围）
- [ ] 禁止手工改生成物（catalog/两份 md 一律 `npm run ui:generate`）

---

## 7. 风险与依赖

### 潜在风险

- 被裁组件若将来要用，需从上游 shadcn 重新引入（**回滚成本≈0**，这是敢删的主要理由）。
- 视觉基线：ui-kit 页会因组件减少而变化，属预期；业务页应保持 0px（本次删除的组件业务零引用）。

### 回滚方案

- `git revert` 单个 merge commit；被删组件在上游可复原。

---

## 8. 输出物

- [ ] 分支：`chore/dead-code-triage-2026-10-14`
- [ ] PR 链接：待开
- [ ] 验收清单（勾对完毕）：`.github/tasks/TASK-UI-004-acceptance.md`
- [ ] PR body 含「🎯 验收勾对」小节

---

## 9. 完成确认

### AI 自检清单

- [ ] 验收标准全部满足（见验收清单；未过项如实说明）
- [ ] 测试全部通过
- [ ] 只修改了必要文件
- [ ] 文档已同步（生成物重生成）

### 人类审查

- [ ] 裁剪清单符合产品方向（13 个确认不再需要）
- [ ] 保留的 20 个零引用组件符合近期规划

**审查结论**：✅ 批准合并 / ❌ 需要修改　　**审查人**：__________ **日期**：__________
