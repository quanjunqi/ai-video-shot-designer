# TASK-UI-001：UI 组件与设计 token 清单（专业级 · 可成长）

> 开工前须按 `.agents/skills/acceptance-checklist/SKILL.md` 产出验收清单文件
> （`TASK-UI-001-acceptance.md`，与本卡同目录）；本卡 §4 是清单判据的来源。

## 基本信息

- **任务 ID**：TASK-UI-001
- **任务名称**：UI 组件清单体系（token 清单 + 55 组件规格 + 可视化展示页 + 成长机制）
- **创建日期**：2026-10-14
- **人类 Owner**：全君琦
- **AI 执行者**：AI Agent（分支 `chore/ui-inventory-2026-10-14`）
- **优先级**：P1
- **预计工时**：4–6 小时
- **状态**：进行中

---

## 1. 目标

**目标**：把「前端有哪些组件、每个组件怎么用、用了哪些设计 token」变成**代码生成、CI 防漂移、可随组件增长**的清单体系；此前项目**没有任何组件清单**，55 个组件里 35 个零引用也无人知晓。

**背景**：Owner 提出「专业前端会先设计好 UI 组件清单（类似设计系统总览图），我们现在没有」；评审实测确认：无清单、无 Storybook、无展示页、`ui/**` 还被 ESLint 整体忽略。清单若靠人手写必然腐烂（本项目已有文档漂移前科），故按 `npm run api:check` 的既有范式做**生成 + 漂移门禁**。

---

## 2. 范围

### 范围内（In Scope）

- `apps/web/scripts/ui-inventory.mjs`：从代码抽取组件/变体/引用/token，渲染 3 个产物
- 产物：`src/generated/ui-catalog.ts`（机器）、`.agents/skills/frontend-coding/ui-components.md`（agent）、`docs/reference/ui-components.md`（人类）
- 人手输入：`ui-components.notes.md`（55 组件语义注记，缺段即门禁红）
- 可视化展示页 `/dev/ui-kit`（**仅 DEV 注册**）+ 截图基线
- 成长机制：`npm run ui:generate` / `ui:check` / `ui:debt` + CI 漂移门 + 死组件棘轮基线 + 不变量测试

### 范围外（Out of Scope）

- 删除或合并 35 个零引用组件（只提供清单与棘轮，删留由 Owner 决策）
- 打通 Storybook（不引入新依赖，用自建展示页）
- 修复 `ui/**` 被 ESLint 忽略、TS strict 等其他评审项（各自独立任务）

---

## 3. 相关文件

- `apps/web/scripts/ui-inventory.mjs` — 生成器（唯一实现）
- `apps/web/src/generated/ui-catalog.ts` — 生成物（机器可读）
- `.agents/skills/frontend-coding/ui-components.md` + `ui-components.notes.md`
- `docs/reference/ui-components.md`
- `apps/web/src/pages/dev/ui-kit/**` — 展示页与 demo 注册
- `apps/web/src/app.tsx` — DEV-only 路由注册
- `.github/workflows/ci.yml` — 新增「UI inventory sync check」步骤
- `apps/web/ui-debt-baseline.json` — 死组件棘轮基线

---

## 4. 验收标准

> 可客观验证的完成条件，必须全部满足。每条写清「怎么证明它过了」。

- [ ] 清单文件已产出：`.github/tasks/TASK-UI-001-acceptance.md`
- [ ] 生成器可跑通：`cd apps/web && npm run ui:generate` 退出 0，且 3 个产物被更新
- [ ] 漂移门生效：`npm run ui:check` 在产物与代码不一致时退出 1（判据：故意改一个组件的行数后重跑，必须红）
- [ ] 成长门生效：删掉任一组件在 `ui-components.notes.md` 的段落，`npm run ui:check` 必须红并指名该组件
- [ ] demo 覆盖齐：`UI_DEMOS` 覆盖 catalog 全部 55 个组件（判据：`ui:check` 无「缺展示页 demo」）
- [ ] 展示页可访问：`npm run dev` 后 `/dev/ui-kit` 渲染出 token 色板 + 全部分区与组件卡片
- [ ] prod 不含展示页：`npm run build` 成功，且产物里不含 ui-kit chunk（判据：构建输出无 `ui-kit` 资源）
- [ ] 截图基线：`visual-baseline/ui-kit.png` 入库，`npm run visual:check` 对本页 0 回归
- [ ] CI 接入：frontend job 出现「UI inventory sync check」步骤并跑 `npm run ui:check`
- [ ] 前端门禁 0/0：`npm run gate` = 0 error / 0 warning；`npm test` 全过（含新增不变量测试）
- [ ] 规则指向：UC-006 与 `frontend-coding/SKILL.md` 已指向清单；`docs/README.md` 索引已收录

---

## 5. 测试命令

### 前端

```bash
cd apps/web
npm run ui:generate     # 生成
npm run ui:check        # 漂移 + 成长门禁（CI 同款）
npm run gate            # typecheck + eslint + quality-gate
npm test                # node 断言式测试 + vitest
npm run build           # 验证 prod 不含展示页
npm run visual:baseline # 刷新截图基线（只提交新增的 ui-kit.png）
```

### 手动测试步骤

1. `npm run dev` → 打开 `/dev/ui-kit`：分类导航可跳转；每个组件卡片显示变体/引用数/零引用徽标；缺 demo 的组件显示占位。
2. 生产构建产物里搜不到 `ui-kit`（DEV-only 路由生效）。
3. 随意改一个组件的 variants → `npm run ui:check` 必须红；`npm run ui:generate` 后恢复绿。

---

## 6. 约束与禁止事项

### 必须遵守

- [ ] 生成物**禁止手改**（文件头已声明）；改代码/注记后重新生成
- [ ] 展示页遵守 `.agents/skills/frontend-coding`（怎么写）与 `frontend-quality`（门禁）：禁 `any`、禁内联样式（token 色块的动态值除外）、grid 列带 `min-w-0`、禁硬编码色值
- [ ] 不引入新依赖（不装 Storybook/Chromatic 等）

### 禁止操作

- [ ] 禁止把展示页打进生产包（必须 DEV-only + 动态 import）
- [ ] 禁止为了让 `ui:check` 变绿而删组件或伪造注记
- [ ] 禁止修改 `ui-debt-baseline.json` 来掩盖新增死组件（只允许在真正清理后收紧）

---

## 7. 风险与依赖

### 依赖项

- 本机 Google Chrome（`visual-regression.mjs` 用 headless 截图）

### 潜在风险

- 生成器是静态解析（正则 + 花括号计数），极端写法（cva 值里嵌套对象）可能抽取不准 → 已用「值必须以字符串开头」的规则收敛噪声，并在 `ui:check` 用产物内容做兜底。
- 展示页会给 35 个零引用组件写出 demo，可能被视为"鼓励保留死代码" → 展示页与清单都显式标注零引用，并配死组件棘轮（只能减少不能新增）。

### 回滚方案

- 纯新增文件 + 少量接线；`git revert` 单个 merge commit 即可，无数据影响。

---

## 8. 输出物

- [ ] 分支：`chore/ui-inventory-2026-10-14`
- [ ] PR 链接：待开
- [ ] 验收清单（勾对完毕）：`.github/tasks/TASK-UI-001-acceptance.md`
- [ ] PR body 含「🎯 验收勾对」小节（汇总 + 未过项，AC-005）
- [ ] 测试结果：见验收清单
- [ ] 文档更新：`docs/reference/ui-components.md`、`docs/README.md`、`.agents/skills/frontend-coding/*`

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

- [ ] 功能符合预期
- [ ] 代码质量达标
- [ ] 架构合规
- [ ] 测试充分
- [ ] 无安全风险

**审查结论**：✅ 批准合并 / ❌ 需要修改

**审查人**：__________ **日期**：__________
