# TASK-CREATE-005：风格库与镜头语言库接入提示词

> ADR-006 分片计划第 5 片（决策 D7）。**这是本平台相对通用生成产品的差异化所在**
> —— 对标报告把 Vidu 的 `@镜头库` 称为「最值得抄的一招」，而我们的镜头语言库/风格库
> 在改造前于智能创作页的引用数为 **0**。

## 基本信息

- **任务 ID**：TASK-CREATE-005
- **任务名称**：把风格库 / 镜头语言库作为提示词片段接入 composer
- **创建日期**：2026-10-10
- **AI 执行者**：AI Agent（分支 `feat/create-workbench-2026-10-10`）
- **优先级**：P2
- **预计工时**：60 分钟

---

## 1. 目标

**目标**：让创作者不用手写风格词与运镜词 —— 点一下风格/镜头语言 chip，
把该条目的提示词片段并入提示词，再点一下移除。

---

## 2. 关键设计取舍：单向追加，不做双向绑定

提示词是用户可自由编辑的 textarea。若把「已选风格」做成独立状态再合成提示词，
用户一旦手改文本，状态与文本就会失配（改哪边算准？）。

因此本片把片段当作**纯文本操作**：

- 点击 = 把片段文字并入提示词（幂等，重复点不会写两次）
- 再点 = 把这段文字精确移除，并收拾多余分隔符
- chip 高亮 = 由「提示词里现在是否含这段片段」**派生**，永远与文本一致

**踩坑记录**：首版移除实现用 `prompt.split(',')` 过滤，但**风格提示词自身就是一串逗号分隔的词**
（如 `cel shaded anime style, clean bold outlines, ...`），按逗号切会把一个片段切碎，导致永远匹配不上。
单测直接暴露了这个问题，改为「词序列 + 允许其间任意空白/逗号」的正则匹配。

---

## 3. 范围

### 范围内（In Scope）

- 新增 `apps/web/src/features/genworkbench/prompt-presets.ts`（纯逻辑 + 7 组单测）：
  `appendFragment` / `removeFragment` / `isFragmentApplied` / `toggleFragment` /
  `normalizeFragment` / `styleFragment` / `lensFragment`
- composer 新增「预设」折叠区：
  - **风格**（图片 / 视频）：来自 `useStyleStore` 的**启用**风格；片段取 `prompt`，缺省回退 `description`
  - **镜头语言**（仅视频）：来自 `useLensStore`；片段取英文 `prompt`，缺省回退 `shotParams`；
    chip 的 tooltip 展示镜头参数与适用场景
  - chip 高亮表示已并入；区域限高可滚动，避免风格/镜头条目多时撑爆面板

### 范围外（Out of Scope）

- ❌ 镜头语言/风格库**接后端**：`BACKLOG.md` #3 记录这两个 store 目前 **0 个 API 调用**；
  本次只接本地 store，接后端沿用 #3 的启动条件
- ❌ 把镜头参数（焦段/机位）结构化传给上游：上游协议未声明对应字段，
  按 ADR-006 D2 红线，前端不得臆造参数映射
- ❌ 自动改写锁定剧本（`DESIGN.md` §3.4 的既有约束）

---

## 4. 相关文件

- `apps/web/src/features/genworkbench/prompt-presets.ts` — 新增
- `apps/web/tests/create-prompt-presets.test.ts` — 新增（7 组）
- `apps/web/src/features/genworkbench/CreateWorkbench.tsx` — 「预设」折叠区与 chip
- `apps/web/src/stores/useStyleStore.ts` / `useLensStore.ts` — 数据源（只读）

---

## 5. 验收标准

- [ ] 图片/视频工作台可见「风格」chips；视频工作台额外可见「镜头语言」chips
- [ ] 点风格 chip → 提示词末尾追加该风格片段，chip 高亮；再点 → 精确移除，高亮消失
- [ ] 重复点同一 chip 不会写入两份
- [ ] 用户手动编辑提示词后，chip 高亮状态与文本保持一致（派生而非缓存）
- [ ] 停用的风格不出现在 chips 中
- [ ] `npm run gate` GATE=0；`npm test` 全绿（57）；`npm run build` 通过

---

## 6. 测试命令

```bash
cd apps/web
npm test
npm run gate
npm run build
```

### 手动测试步骤（L3 · 浏览器）

1. `/create/image` → 展开「预设」→ 点「赛璐璐动画」→ 提示词末尾出现该风格片段且 chip 高亮
2. 再点同一 chip → 片段被移除且不留多余逗号
3. 手动删掉提示词里的风格片段 → chip 高亮自动消失（证明是派生状态）
4. `/create/video` → 「预设」里同时有风格与镜头语言；点「跟拍长镜头」→ 片段并入
5. 在风格库页停用某风格 → 该 chip 不再出现
6. `/create/audio` → 不显示风格/镜头语言预设（音频的输入是合成文本，不是画面提示词）

---

## 7. 约束与禁止事项

- [ ] 禁止臆造上游参数映射（本片只改提示词文本）
- [ ] 禁止改写锁定剧本
- [ ] 禁止直接 push master；禁止跳过测试

---

## 8. 风险与依赖

| 风险 | 影响 | 缓解 |
|---|---|---|
| 片段与用户手写内容重复 | 提示词冗余 | `appendFragment` 幂等；`isFragmentApplied` 归一化比较（忽略大小写与空白） |
| 移除正则误伤相同词序列 | 误删用户内容 | 只在整段词序列匹配时移除；找不到则原样返回 |
| 风格/镜头条目过多撑爆面板 | 布局问题 | 区域限高 28 且可滚动 |
| 中英混排分隔符 | 提示词可读性 | 统一用 `, ` 分隔，移除后收拾多余逗号 |

### 回滚方案

`git revert` 本片提交；`prompt-presets.ts` 与测试为新增文件，composer 的接入点集中在「预设」折叠区。

---

## 9. 迁移号段

**本片不新增迁移**，不占用号段。

---

## 10. 交付记录（2026-10-10）

- 静态门禁：`npm run gate` → exit 0（0 error / 37 warning，与基线一致）
- 单元测试：`npm test` → **57/57**（本片新增 7 组）
- 构建：`npm run build` → 成功
- 测试发现并修复的缺陷：首版 `removeFragment` 按逗号切分，遇到**自身含逗号的风格片段**永远匹配不上
  → 改为词序列正则匹配
- **未完成**：L3 浏览器实测（本环境无浏览器工具）
