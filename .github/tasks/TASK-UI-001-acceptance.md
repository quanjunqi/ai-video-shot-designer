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
| 2 | 「不要只做那几层，要做成专业级」 | 三层齐备：① token 清单（62 个，浅/深色 + Tailwind 映射）② 组件规格 ③ 可视化展示页 `/dev/ui-kit` | 对象：3 个产物 + 展示页；时点：dev 打开可见 | ☑ 过 |
| 3 | 「可成长」 | 新增组件只改代码 + 补注记 → `ui:generate` 即自动进入清单；漏补注记/demo 时 `ui:check` **红并指名** | 命令：`npm run ui:check`（故意删一段注记必须红） | ☑ 过 |
| 4 | （专业级应有）防漂移 | CI frontend job 有「UI inventory sync check」步骤跑 `npm run ui:check` | 对象：`.github/workflows/ci.yml`；时点：PR CI | ☑ 过 |
| 5 | （专业级应有）prod 不受影响 | `npm run build` 成功且产物不含 ui-kit 资源（DEV-only + 动态 import） | 命令：`npm run build` + 产物扫描 | ☑ 过 |
| 6 | （专业级应有）视觉留痕 | `visual-baseline/ui-kit.png` 入库；`npm run visual:check` 对本页 0 回归 | 命令：`npm run visual:check` | ☑ 过 |

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

| # | 检查 | 命令 | 结果 |
|---|---|---|---|
| 1 | 生成器 | `npm run ui:generate` | ☑ 过 |
| 2 | 漂移 + 成长门 | `npm run ui:check` | ☑ 过 |
| 3 | 前端 GATE=0 | `npm run gate` | ☑ 过 |
| 4 | 前端测试 | `npm test` | ☑ 过 |
| 5 | 生产构建（DEV 页不进包） | `npm run build` | ☑ 过 |
| 6 | 视觉基线 | `npm run visual:check` | ☑ 过 |
| 7 | L3 浏览器验证 | 手动打开 `/dev/ui-kit` + 截图 | ☑ 过 |

---

## 六、PR 附勾对结果（提交 PR 时随 body 附上）

```markdown
## ✅ 验收勾对（acceptance-checklist）
- 需求点：6/6 通过（未过项：无）
- 设计稿映射：1/1（按 Owner 总览图的信息架构实现，非像素级复刻）
- 三态与边界：5/5 通过
- 反模式自查：7/7 未命中（实现中修掉 2 个真问题：① 展示页 import 全部组件会污染"零引用"判定 → 生成器改为排除 `src/pages/dev/**`；② 死分支里的动态 import 仍会产出 chunk → 改条件表达式 + 路由枚举显式退出）
- 门禁：gate 0/0 / npm test 63 例全过 / build 成功且 dist 无 ui-kit 资源 / visual 基线新增 ui-kit
- 未过项及原因：无（两项已知取舍见任务卡 §7 风险：展示页写出的 demo 覆盖 35 个零引用组件，故配死组件棘轮；react-refresh 有 3 处带注释的最小豁免）
```

> 勾对必须**如实**。未过项在 PR 中说明原因与影响，由 Owner 决定是否放行；隐瞒勾对 = 违反 AC-005，评审直接打回。
