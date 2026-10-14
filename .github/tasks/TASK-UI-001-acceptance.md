# 需求验收清单：TASK-UI-001 UI 组件与设计 token 清单

> 规则见 `.agents/skills/acceptance-checklist/SKILL.md`（AC-001~AC-008）；本文件是勾对留痕，PR body 附汇总。
> 每项判据必须可验证——能用命令/数据证明的，不写模糊话术。

---

## 任务信息

- 任务名称：UI 组件与设计 token 清单（专业级 · 可成长）
- 关联需求/任务卡：`.github/tasks/TASK-UI-001-component-inventory.md`
- 开发者（AI）：AI Agent（branch `chore/ui-inventory-2026-10-14`）
- 开工日期：2026-10-14
- 目标一句话：让"有哪些组件、怎么用、用了哪些 token"由代码生成、CI 防漂移、随组件增长。

---

## 一、需求点 → 可验证判据

| # | 需求点（用户原话） | 验收判据（可客观验证） | 判据四要素备注 | 自检结果 |
|---|---|---|---|---|
| 1 | 「我还没有看到我们的 UI 组件清单」 | 存在 55 个组件的规格清单（导出/变体/尺寸/props/引用数/死组件标记），且与代码一致 | 对象：`ui-components.md` + `ui-catalog.ts`；时点：`ui:check` 绿 | ☑ 过 |
| 2 | 「不要只做那几层，要做成专业级」 | 三层齐备：① 设计 token 清单（**69 个**语义 token：`@theme`/`:root`/`.dark` + 54 条 Tailwind 映射 + 排版：3 字体族与 36 条 prose 映射）② 组件规格 ③ 可视化展示页 `/dev/ui-kit` | 对象：3 个产物 + 展示页；时点：dev 打开可见 | ☑ 过 |
| 3 | 「可成长」 | 新增组件只改代码 + 补注记 → `ui:generate` 即自动进入清单；漏补注记/demo 时 `ui:check` **红并指名** | 命令：`npm run ui:check`（故意删一段注记必须红） | ☑ 过 |
| 4 | （专业级应有）防漂移 | CI frontend job 有「UI inventory sync check」步骤跑 `npm run ui:check` | 对象：`.github/workflows/ci.yml`；时点：PR CI | ☑ 过 |
| 5 | （专业级应有）prod 不受影响 | `npm run build` 成功且产物不含 ui-kit 资源（DEV-only + 动态 import） | 命令：`npm run build` + 产物扫描 | ☑ 过 |
| 6 | （专业级应有）视觉留痕 | `visual-baseline/ui-kit.png` 入库；`npm run visual:check` 对本页 0 回归 | 命令：`npm run visual:check` | ☑ 过 |

---

## 补充：本轮补强（目标复核时发现的两处缺口）

| # | 缺口 | 判据 | 修复 | 结果 |
|---|---|---|---|---|
| A | 目标要求「从 @theme/**typography** 抽取」，但首版只抽了 `:root`/`.dark` 语义 token，排版维度近乎为空 | 清单需列出字体族与 prose 映射 | 生成器新增 `@theme inline` 工具类映射表（54 条）与 `typography.css` prose 抽取（36 条） | ✅ token 62 → **69**（找回被漏掉的 3 字体族与 5 个 shadow）、人类版新增 §3/§3.1、展示页新增「工具类映射与排版」面板 |
| B | 抽取器按行匹配 CSS 变量 → **跨行值被漏**（`--font-sans`/`--font-serif`/`--shadow-sm·md·lg·xl`） | 变量值跨行也必须抽出 | `varsOf` 改为按 `;` 收口并归一化空白 | ✅ 见 A 的 token 增量 |

> 两处都是"清单少报了事实"，属静默失真；已由 `ui:check` 与不变量测试覆盖，不会再退化。

| # | 缺口 | 判据 | 修复 | 结果 |
|---|---|---|---|---|
| C | `ui:check` 是**字节比对**：渲染器若漏 append 一行（如某分类无小节、某张表少一行），产物与生成器仍自洽 ⇒ 漂移门不红，但**清单已不完整** | 需有"生成物内容完整性"守卫 | 新增第 8 条不变量测试：逐项断言 55 个组件明细小节、55 行规格、69 个 token、54 条工具类映射、36 条 prose 映射都真的落在两份清单里 | ✅ 反例验证：改坏 `badge` 明细小节标题 → 测试 #7 红并报「agent 清单漏组件明细小节」；还原后 8/8 通过 |

---

## 二、设计稿逐点映射

| # | 设计稿模块 | 对应需求点 | 实现位置 | 偏差说明 | 自检结果 |
|---|---|---|---|---|---|
| 1 | Owner 上传的设计系统总览图（分区块列组件 + token 色板） | 需求点 2 | `src/pages/dev/ui-kit/UiKitPage.tsx`（分类分区 + token 色板） | 用真实组件而非静态图；缺 demo 的组件显式占位 | ☑ 过 |

> 说明：无正式设计稿，参照 Owner 提供的组件总览图做**信息架构**（分区 + 色板 + 变体穷举）。

---

## 三、三态与边界

| # | 场景 | 预期 | 自检结果 |
|---|---|---|---|
| 1 | 组件缺 demo | 卡片显示「待补 demo」占位（含文件路径），页面不崩 | ☑ 过 |
| 2 | 组件零引用 | 卡片显示「零引用」徽标（35 个） | ☑ 过 |
| 3 | token 无深色值 | 深色列显示 `—`，不报错 | ☑ 过 |
| 4 | 注记缺段 | `ui:check` 红并列出组件名（不允许静默通过） | ☑ 过 |
| 5 | 死组件变多 | `ui:check` 红（棘轮只允许减少） | ☑ 过 |

> 本任务无数据请求 UI（不涉及 loading/error 网络态）。

---

## 四、反模式自查

| # | 反模式检查 | 命中？ | 处理 |
|---|---|---|---|
| 1 | 前端 `any` / `as any`（FE-TS-001） | ☑ 否 | |
| 2 | store 整对象解构（FE-STATE-001） | ☑ 否 | |
| 3 | 组件内裸 fetch（FE-API-001） | ☑ 否 | |
| 4 | 页面级 max-w-xl / grid 列缺 min-w-0（R3/R2） | ☑ 否 | |
| 5 | 硬编码色值 / 内联样式（V-002/R-UI-001） | ☑ 否 | token 色块的动态值是唯一例外 |
| 6 | 纯图标按钮缺 title/aria-label | ☑ 否 | |
| 7 | 新增依赖（禁止） | ☑ 否 | |

---

## 五、门禁与测试

| # | 检查 | 命令 | 结果（实测） |
|---|---|---|---|
| 1 | 生成器 | `npm run ui:generate` | ✅ 55 组件 / **69 token** / 35 死组件 / 注记 55 / demo 55 |
| 2 | 漂移 + 成长门 | `npm run ui:check` | ✅ 全绿；**反例验证**：改 `button.tsx` 行数 → exit 1 并列出 3 个漂移产物；删注记段 → exit 1 并指名组件 |
| 3 | 前端 GATE=0 | `npm run gate`（typecheck + eslint `--max-warnings 0` + quality-gate） | ✅ 0 error / 0 warning |
| 4 | 前端测试 | `npm test` | ✅ node 断言式 **146** 例 + vitest 63 例（8 条清单不变量 + 56 条 demo 渲染） |
| 5 | 生产构建（DEV 页不进包） | `npm run build` | ✅ `dist` 内 ui-kit 资源 **0** 个；`routes.json` 27 条业务路由且不含 `dev/ui-kit` |
| 6 | 视觉基线 | `npm run visual:check` | ✅ 7 页全部 **0.00%** 差异（含新增 `visual-baseline/ui-kit.png`，1440×3400） |
| 7 | L3 浏览器验证 | `npm run dev` 打开 `/dev/ui-kit` + 截图 | ✅ 截图即基线：token 色板（含字体族字样/阴影盒预览）+ 工具类映射表 + 6 分类 55 卡片 |

---

## 六、PR 附勾对结果（提交 PR 时随 body 附上）

```markdown
## ✅ 验收勾对（acceptance-checklist）
- 需求点：6/6 通过（未过项：无）
- 设计稿映射：1/1（按 Owner 总览图的信息架构实现，非像素级复刻）
- 三态与边界：5/5 通过
- 反模式自查：7/7 未命中；实现中修掉 **4 个真问题**——① 展示页 import 全部组件会污染「零引用」判定（35→23，棘轮失效）→ 生成器排除 `src/pages/dev/**`；② DEV 守卫用「常量+死分支」时打包器仍产出 `UiKitPage` chunk → 改条件表达式 + 路由枚举 `ui-route:dev-only` 退出；③ 抽取器按行匹配 CSS 变量 → 跨行值（3 字体族 + 5 个 shadow）被静默漏掉 → 改为按 `;` 收口；④ 目标要求 typography 维度，首版近乎为空 → 补 `@theme` 工具类映射表（54 条）与 prose 抽取（36 条）
- 门禁：gate 0/0 / npm test 63 例全过 / build 成功且 dist 无 ui-kit 资源 / visual 7 页 0.00%
- 未过项及原因：无（两项已知取舍见任务卡 §7 风险：展示页写出的 demo 覆盖 35 个零引用组件，故配死组件棘轮；react-refresh 有 3 处带注释的最小豁免）
```

> 勾对必须**如实**。未过项在 PR 中说明原因与影响，由 Owner 决定是否放行；隐瞒勾对 = 违反 AC-005，评审直接打回。
