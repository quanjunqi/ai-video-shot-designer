# TASK-UI-002：组件库展示页受众分离改版（产品/设计可用）

> 开工前须按 `.agents/skills/acceptance-checklist/SKILL.md` 产出验收清单文件
> （`TASK-UI-002-acceptance.md`，与本卡同目录）；本卡 §4 是清单判据的来源。

## 基本信息

- **任务 ID**：TASK-UI-002
- **任务名称**：`/dev/ui-kit` 从「工程审计视图」改为「受众分离的设计系统页」
- **创建日期**：2026-10-14
- **人类 Owner**：全君琦
- **AI 执行者**：AI Agent（分支 `chore/ui-kit-redesign-2026-10-14`）
- **优先级**：P1
- **预计工时**：3–4 小时
- **状态**：进行中

---

## 1. 目标

**目标**：让 `/dev/ui-kit` 成为**产品/设计同学不看任何工程信息也能看懂**的组件库页；工程细节另设视图，且让非开发同学能通过预览环境的 URL 直接打开。

**背景（Owner 原话）**：
> 「这个界面太乱了吧，我都不知道什么是什么，一点都不专业」
> 「如果我希望团队里其他人也能随手打开（例如产品/设计同学看组件）我感觉他们会晕」

**根因**：首版把**清单的完整性**直接倒在了首屏——每张卡片都展示 `导出(24)` / `Props` / `data-slot` / `使用 token` / 文件路径行数 / 引用数，55 个组件一路平铺，且 35 个零引用组件混在分类里。

---

## 2. 范围

### 范围内（In Scope）

- `UiKitPage.tsx` 重写为**三视图**：① 组件画廊（默认，面向产品/设计）② 设计基础（色彩/排版/圆角阴影）③ 工程规格（表格化，面向工程）
- 画廊卡片**只保留**：组件名 / 变体数 / 一行人话用途 / 预览 / 「查看用法 →」；工程信息移入详情弹层（默认折叠）
- 零引用组件**从分类中移出**，收进页面底部默认折叠的「未使用组件（N）」
- 「非开发同学也能打开」：新增 `VITE_ENABLE_UI_KIT=1` 开关（开发环境恒可用；开启后该页与路由枚举一并进入构建产物）
- 截图基线刷新；任务卡与验收清单落盘

### 范围外（Out of Scope）

- 组件本身的视觉/API 调整（不改 `src/components/ui/**`）
- 删除/合并 35 个零引用组件（另议，见 TASK-UI-001 遗留项）
- 接入权限控制（预览环境是否公开由 Owner 决定）

---

## 3. 相关文件

- `apps/web/src/pages/dev/ui-kit/UiKitPage.tsx`（及按需拆分的同目录文件）
- `apps/web/src/app.tsx`、`apps/web/vite.config.ts`、`apps/web/src/vite-env.d.ts`（开关）
- `.env.example`、`docs/reference/environment.md`（开关文档）
- `apps/web/tests/ui-inventory.server.test.ts`（守卫不变量）
- `apps/web/visual-baseline/ui-kit.png`（基线刷新）

---

## 4. 验收标准

> 可客观验证的完成条件（判据四要素：判据 / 对象 / 时点 / 例外）。

- [ ] 验收清单文件已产出：`.github/tasks/TASK-UI-002-acceptance.md`
- [ ] **首屏不晕**：1440 宽打开 `/dev/ui-kit`，首屏可见标题 + 搜索 + 视图切换 + 分类目录 + ≥6 张卡片，且卡片上**没有** exports/props/data-slot/引用数/文件路径（判据：截图 + DOM 断言）
- [ ] **三视图可切换**：画廊 / 设计基础 / 工程规格，各自内容齐备（工程规格含组件总表 + 54 行工具类映射）
- [ ] **零引用不干扰**：35 个零引用组件不在分类网格里，收在底部默认折叠区（判据：DOM 中该区默认 `closed`）
- [ ] **人话可读**：每张卡片显示组件用途一句话（来自注记 `何时用`），点开有何时用/别用/反例/相关
- [ ] **55 个 demo 不回归**：`npx vitest run src/pages/dev` 全过（56 条）
- [ ] **清单门禁不回归**：`npm run ui:check` = 55 组件 / 69 token / 死组件 35 / 注记 55 / demo 55
- [ ] **门禁 0/0**：`npm run gate`；`npm test` 全过
- [ ] **默认产物干净**：`npm run build` 后 dist 无 ui-kit 资源、`routes.json` 不含 `dev/ui-kit`
- [ ] **开关可用**：`VITE_ENABLE_UI_KIT=1 npm run build` 后 dist 有 ui-kit 资源且 `routes.json` 枚举 `/dev/ui-kit`（判据：两次构建对比）
- [ ] **截图基线刷新**：`npm run visual:check` 7 页 0.00%
- [ ] **文档同步**：`.env.example`、`docs/reference/environment.md` 已记录开关

---

## 5. 测试命令

```bash
cd apps/web
npx tsc -p tsconfig.app.json --noEmit
npx eslint src --max-warnings 0
node scripts/quality-gate.mjs
node scripts/ui-inventory.mjs --check
npx vitest run src/pages/dev        # 55 个 demo 渲染冒烟
npm test
npm run build                        # A) 默认：产物无 ui-kit
VITE_ENABLE_UI_KIT=1 npm run build   # B) 开启：产物含该页且路由被枚举
npm run visual:baseline && npm run visual:check
```

### 手动测试步骤

1. `npm run dev` → `/dev/ui-kit`：首屏应"一眼看懂"，点任意卡片能看用法与预览。
2. 切到「工程规格」：能看到组件总表与工具类映射；展开行可见 exports/props/data-slot。
3. 切到「设计基础」：色彩/排版/圆角阴影三类视觉样本都在。

---

## 6. 约束与禁止事项

### 必须遵守

- [ ] 只改展示页与其开关接线；**不动** `src/components/ui/**` 与 `demos/**`（55 个 demo 原样复用）
- [ ] 遵守 `.agents/skills/frontend-coding`（禁 `any`、禁内联样式，动态 token/字体样本除外、grid 列 `min-w-0`）与 `frontend-quality`（反例库）
- [ ] 单文件 ≤400 行，超出则拆文件

### 禁止操作

- [ ] 禁止为了让页面"看起来干净"而删掉工程信息（它必须移入「工程规格」与详情弹层，不能消失）
- [ ] 禁止把零引用组件直接删掉或从清单中隐藏（必须先与 Owner 确认）
- [ ] 禁止默认开启 `VITE_ENABLE_UI_KIT`（生产产物必须保持干净）

---

## 7. 风险与依赖

### 潜在风险

- 三视图 + 弹层增加页面复杂度：需用现有 `Tabs`/`Dialog`/`Badge` 等组件实现，避免自造轮子。
- 开关开启后 55 个 demo（含 35 个零引用组件的示例）会进入产物 ⇒ 已在 `.env.example` 与 `docs/reference/environment.md` 写明「仅建议预览/内网环境开启」。

### 回滚方案

- `git revert` 单个 merge commit；展示页是 DEV/开关控制的页面，不影响线上默认行为。

---

## 8. 输出物

- [ ] 分支：`chore/ui-kit-redesign-2026-10-14`
- [ ] PR 链接：待开
- [ ] 验收清单（勾对完毕）：`.github/tasks/TASK-UI-002-acceptance.md`
- [ ] PR body 含「🎯 验收勾对」小节
- [ ] 测试结果：见验收清单
- [ ] 文档更新：`.env.example`、`docs/reference/environment.md`

---

## 9. 完成确认

### AI 自检清单

- [ ] 验收标准全部满足（逐项勾对见验收清单文件；未过项已如实说明）
- [ ] 测试全部通过
- [ ] 无编译错误
- [ ] 无密钥泄露
- [ ] 只修改了必要文件
- [ ] 文档已同步
- [ ] 迭代自检已执行

### 人类审查

- [ ] **产品/设计同学能看懂**（Owner 亲自看首屏）
- [ ] 工程信息没丢（在工程规格视图与详情弹层里）
- [ ] 架构合规
- [ ] 测试充分
- [ ] 无安全风险

**审查结论**：✅ 批准合并 / ❌ 需要修改

**审查人**：__________ **日期**：__________
