# TASK-CREATE-004：草稿持久化（按工作台分桶）

> ADR-006 分片计划第 4 片（决策 D6 的「草稿持久化」部分）。
> 前置：TASK-CREATE-002（composer 布局）、TASK-CREATE-003（结果复用）。

## 基本信息

- **任务 ID**：TASK-CREATE-004
- **任务名称**：智能创作草稿持久化（参数文本 + 模型档位；参考图不入草稿）
- **创建日期**：2026-10-10
- **AI 执行者**：AI Agent（分支 `feat/create-workbench-2026-10-10`）
- **优先级**：P1
- **预计工时**：60 分钟

---

## 1. 目标

**目标**：刷新或切走页面不再丢失未提交的提示词与参数 —— 这是改造前最直接的体验缺陷之一
（`values` 曾是组件内 `useState`，刷新即丢）。

---

## 2. 范围

### 范围内（In Scope）

- 新增 `apps/web/src/features/genworkbench/draft-utils.ts`（纯逻辑 + 5 组单测）：
  - `pickKnown(values, allowedKeys)` — 只保留当前 schema 认识的键
  - `isDraftExpired(draft, now, ttl)` — 30 天保留期；容忍时钟回拨（未来时间戳不判过期）；
    坏时间戳视为过期
  - `countFilled` / `hasRecoverableContent` — 避免对空草稿做无意义提示
- 新增 `apps/web/src/stores/useCreateDraftStore.ts`（`mdp:create-drafts`）：
  - 按 `image` / `video` / `audio` 分桶，各存 `{ values, modelId, updatedAt }`
  - `readRawDraft` **不做写操作**，可安全在渲染期调用（把 `Date.now()` 留在 store 内，
    规避 `react-hooks/purity`）
- `useCreateControls`：
  - 挂载时从草稿恢复参数与模型档位；模型已不可用时自动回退到目录可用模型
  - 写入防抖 400ms（输入是高频事件，避免每次按键都写 localStorage）
  - `submitValues` —— 提交前过滤，**换模型残留的键不会发给上游**
  - `draftRestored` —— 供 UI 如实提示；`resetDraft` 同时清本地与持久化
- composer 顶部「已恢复上次未提交的输入（参考图不在草稿中，需重新添加）」+ 一键「清空」

### 范围外（Out of Scope）

- ❌ **参考图不入草稿**：参考图是 dataURL，写 localStorage 会爆配额（ADR-006 §9 已列为风险）；
  刷新后需重新添加，UI 已如实说明
- ❌ 服务端草稿（跨设备同步）：需要后端表与接口，另开任务
- ❌ 风格库/镜头语言库接入 → TASK-CREATE-005

---

## 3. 相关文件

- `apps/web/src/features/genworkbench/draft-utils.ts` — 新增
- `apps/web/tests/create-draft-utils.test.ts` — 新增（5 组断言）
- `apps/web/src/stores/useCreateDraftStore.ts` — 新增
- `apps/web/src/hooks/useCreateControls.ts` — 恢复/落盘/过滤
- `apps/web/src/features/genworkbench/CreateWorkbench.tsx` — 恢复提示与清空；提交改用 `submitValues`

---

## 4. 验收标准

- [ ] 填写提示词与参数后刷新页面，内容被恢复，并显示「已恢复」提示
- [ ] 点「清空」后本地与持久化草稿都被清除，提示消失
- [ ] 三个工作台草稿**互不串台**（image 的草稿不会出现在 video）
- [ ] 超过 30 天的草稿不再恢复
- [ ] 切换模型后提交，请求体**不含**上一个模型残留的参数键
- [ ] 写入有防抖（连续输入不在每次按键时写 localStorage）
- [ ] `npm run gate` GATE=0；`npm test` 全绿（50）；`npm run build` 通过

---

## 5. 测试命令

```bash
cd apps/web
npm test
npm run gate
npm run build
```

### 手动测试步骤（L3 · 浏览器）

1. 在 `/create/video` 填提示词与时长 → 刷新 → 内容恢复且出现恢复提示
2. 点「清空」→ 内容清空、提示消失；再刷新仍为空
3. 在 `/create/image` 填内容 → 切到 `/create/video` → 不应看到 image 的草稿
4. 用 localStorage 检查 `mdp:create-drafts` 的结构（应只有 values/modelId/updatedAt，**无图片数据**）
5. 选 Kling 1.6 填写后切到 Seedance 2.5 并提交 → 请求体参数应与当前模型一致

---

## 6. 约束与禁止事项

- [ ] **禁止把参考图（dataURL）写进草稿**
- [ ] 禁止在渲染期调用 `Date.now()`/`Math.random()` 等非纯函数（本片已因此被 lint 拦截并修正）
- [ ] 禁止直接 push master；禁止跳过测试

---

## 7. 风险与依赖

| 风险 | 影响 | 缓解 |
|---|---|---|
| localStorage 配额 | 写入失败 | 只存文本参数；参考图不入草稿；单条草稿按 key 过滤 |
| 草稿里的键与当前模型不匹配 | 提交无关参数给上游 | 提交前 `pickKnown` 过滤；恢复时不过滤但会在提交时收敛 |
| 草稿过期判断受系统时间影响 | 误判 | 时钟回拨（未来时间戳）不判过期；坏时间戳判过期 |
| 防抖期间的写入丢失（关页面过快） | 最后几个字未保存 | 400ms 较短；切页/刷新前的草稿以最近一次落盘为准 |

### 回滚方案

`git revert` 本片提交；两个新增文件删除即可，hook 中的草稿逻辑随之移除。

---

## 8. 迁移号段

**本片不新增迁移**，不占用号段。

---

## 9. 交付记录（2026-10-10）

- 静态门禁：`npm run gate` → exit 0（0 error / 37 warning，与基线一致）
- 单元测试：`npm test` → **50/50**（本片新增 5 组）
- 构建：`npm run build` → 成功
- 过程中被门禁拦截并修复的问题：
  1. `react-hooks/purity`：在 `useMemo` 里调用 `Date.now()` → 过期判定下沉到 store 的 `readRawDraft`
  2. `react-hooks/exhaustive-deps`：submit 读 `values.count` 但依赖数组里是 `submitValues` → 统一改读 `submitValues`
- **未完成**：L3 浏览器实测（本环境无浏览器工具）
