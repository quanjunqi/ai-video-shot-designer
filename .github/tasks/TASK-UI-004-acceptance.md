# 需求验收清单：TASK-UI-004 死代码口径修正 + 零引用组件裁剪

> 规则见 `.agents/skills/acceptance-checklist/SKILL.md`（AC-001~AC-008）；本文件是勾对留痕，PR body 附汇总。

---

## 任务信息

- 任务名称：修正「零引用」口径（补 ui 组件间引用）+ 裁剪与产品无关的组件
- 关联需求/任务卡：`.github/tasks/TASK-UI-004-dead-code-triage.md`
- 开发者（AI）：AI Agent（branch `chore/dead-code-triage-2026-10-14`）
- 开工日期：2026-10-14
- 目标一句话：让「零引用组件」这个数字可信，并据此裁掉与产品无关的组件。

---

## 一、需求点 → 可验证判据（实测结果）

| # | 需求点 | 验收判据 | 实测结果 | 自检 |
|---|---|---|---|---|
| 1 | 「零引用」口径要可信 | 组件之间的引用必须算使用 | 生成器原先把**整个 `components/ui/**` 排除**在引用统计外 ⇒ 改为「排除自身文件 + 排除展示页 + 排除生成物」。恢复 3 个误判：`separator`（被 button-group/field/item/sidebar 用）、`skeleton`（被 sidebar 用）、`toggle`（被 toggle-group 用） | ☑ 过 |
| 2 | 展示页不能污染该口径 | `pages/dev/**` 与生成物不参与统计 | 三处 filter 齐备（自测：删掉该 filter 后展示页会让零引用"复活"） | ☑ 过 |
| 3 | 裁剪与产品无关的组件 | 13 个组件文件 + 13 段注记 + 13 条 demo 条目全部移除，且 `ui:check` 绿 | 删除 `aspect-ratio`/`button-group`/`carousel`/`context-menu`/`drawer`/`hover-card`/`input-otp`/`kbd`/`menubar`/`navigation-menu`/`resizable`/`toggle`/`toggle-group`；组件 **55 → 42**，零引用 **32 → 20**，注记/demo 覆盖 42/42 | ☑ 过 |
| 4 | 无残留引用 | tsc / eslint 全干净 | 删条目后遗留 **14 处"只被被删 demo 用过"的 import/常量**（`Image`/`SLIDES`/`Avatar*`/6 个 lucide 图标/3 个图标）已清除 ⇒ `tsc` 0 error、`eslint src --max-warnings 0` 0 warning | ☑ 过 |
| 5 | 棘轮一致 | `ui-debt-baseline.json` == catalog 的 `stats.dead` | 20 == 20 | ☑ 过 |
| 6 | 门禁与测试 | `npm run gate` / `npm test` | gate 0 error / 0 warning；`npm test` 全过 | ☑ 过 |
| 7 | 产物无回归 | `npm run build` 成功且默认构建无 ui-kit 资源 | 成功；dist 内 **0** 个 ui-kit 资源 | ☑ 过 |
| 8 | 视觉无回归 | `npm run visual:check` | 6 个业务页 **0px** 差异（**证明被删组件确实没被产品使用**）；ui-kit 因组件数变化刷新基线 | ☑ 过 |

---

## 二、三态与边界

| # | 场景 | 预期 | 实测 | 自检 |
|---|---|---|---|---|
| 1 | 被删组件是否仍被其它 ui 组件引用 | 若有引用则不能删 | 逐个核查：`toggle` 仅被 `toggle-group`（同批删除）引用；其余 12 个零引用。`separator`/`skeleton` 因有引用**保留** | ☑ 过 |
| 2 | 删除后 demo 覆盖率门禁 | 必须仍 42/42 | ✓ 42/42（连带把只服务这些 demo 的 import/常量清掉，否则 eslint 报未使用） | ☑ 过 |
| 3 | 保留组件是否受影响 | 20 个零引用组件（form/field/table/pagination/chart/calendar/sidebar…）不动 | 未改动；`ui/**` 保留件均通过 tsc/eslint | ☑ 过 |
| 4 | 依赖是否连带清理 | 本卡**不**动 package.json/lockfile | 未改（`vaul`/`embla-carousel-react`/`react-resizable-panels`/`input-otp` 等成为未使用依赖，已在卡 §2 声明为范围外） | ☑ 过（已声明） |
| 5 | 本线基线错误（曾从过期 develop 拉线） | 必须基于最新 develop | 发现后已 `fetch` + `rebase` 到 `origin/develop`（bad6bcd，含 PR #175），并重生成全部产物 | ☑ 过 |

---

## 三、反模式自查

| # | 检查 | 命中？ | 处理 |
|---|---|---|---|
| 1 | 为让数字好看而删仍被引用的组件 | ☑ 否 | 先修口径再决策，`separator`/`skeleton`/`toggle` 的处置各有依据 |
| 2 | 只删组件文件、漏删注记/demo | ☑ 否 | 三类登记全部清理，`ui:check` 绿为证 |
| 3 | 手工改生成物 | ☑ 否 | 一律 `npm run ui:generate` |
| 4 | 连带改 lockfile（超范围） | ☑ 否 | 未动 package.json |
| 5 | 声明"零引用"却不给出处 | ☑ 否 | 每个删除/保留都有引用事实（`usage.files`）支撑 |

---

## 四、门禁与测试（实测输出）

| # | 检查 | 命令 | 结果 |
|---|---|---|---|
| 1 | 类型检查 | `npx tsc -p tsconfig.app.json --noEmit` | ✅ 0 error |
| 2 | ESLint | `npx eslint src --max-warnings 0` | ✅ 0 warning |
| 3 | 质量门禁 | `node scripts/quality-gate.mjs` | ✅ 0 error / 0 warning |
| 4 | 清单门禁 | `node scripts/ui-inventory.mjs --check` | ✅ 42 组件 / 69 token / 死组件 20 / 注记 42 / demo 42 |
| 5 | 全量测试 | `npm test` | ✅ 全过 |
| 6 | 生产构建 | `npm run build` | ✅ 成功；dist 内 0 个 ui-kit 资源 |
| 7 | 视觉基线 | `npm run visual:baseline && npm run visual:check` | ✅ 7 页 0.00%（6 个业务页 0px） |

---

## 五、PR 附勾对结果

```markdown
## ✅ 验收勾对（acceptance-checklist）
- 需求点：8/8 通过（未过项：无）
- 三态与边界：5/5（含 1 项已声明的范围外：依赖清理）
- 反模式自查：5/5 未命中
- 门禁：gate 0/0；npm test 全过；build 成功且默认无 ui-kit 资源；visual 7 页 0.00%（业务页 0px）
- 结论：零引用 **35 → 32（修口径）→ 20（裁剪 13 个）**；组件 55 → 42
- 未过项及原因：无
```

> 勾对必须**如实**；隐瞒勾对 = 违反 AC-005。
