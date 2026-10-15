# 任务卡：修复任务中心 kind=text 崩溃（T13 验收缺口 1）

> 按 `.github/TASK_TEMPLATE.md` 填写。来源：TASK-INFRA-005 全链路验收缺口 #1（P0）。

## 基本信息

- **任务 ID**：TASK-FIX-004
- **任务名称**：任务中心 /tasks 崩溃修复（KIND_META 缺 kind="text"）
- **创建日期**：2026-10-15
- **人类 Owner**：quanjunqi
- **AI 执行者**：Doubao MainAgent
- **优先级**：P0（阻断 T13 判据 1「拿产物」与判据 4 UI 展示）
- **预计工时**：0.5 人日

---

## 1. 问题描述

真机走查 `http://localhost:5174/tasks` 页面直接崩溃：

```
Cannot read properties of undefined (reading 'icon')
```

**根因**（已定位）：`apps/web/src/pages/Tasks.tsx:52` 渲染任务列表时执行 `const km = KIND_META[task.kind]; const Icon = km.icon;`。`KIND_META` 枚举为 `split / interpret / image / video / audio / canvas_export`，但 execution API 返回的任务 `kind` 含 `"text"`（本地库 50 条任务中 4 条 kind=text），`KIND_META["text"]` 为 `undefined` → `km.icon` 抛异常 → 整个任务中心页渲染失败。

**影响**：任务中心整体不可用；T13 判据 1「拿产物」步骤与判据 4（succeeded 任务产物地址展示）被阻断。

## 2. 修复要求

- ✅ `KIND_META` 补 `text` 枚举（label「文本生成」等，icon 复用合理图标）；`JobKind` 类型同步确认含 `text`
- ✅ 防御性兜底：`KIND_META[task.kind] ?? KIND_META.image`（或等价），未枚举 kind 不崩溃（future-proof）
- ✅ 三态与边界：kind 为 undefined / 未枚举时不崩溃、有兜底展示
- ❌ 不改 API 契约（kind 值由 execution 定义，前端适配）
- 交付前跑 `cd apps/web && npm run gate`（GATE=0）+ `npm test`；浏览器验证 /tasks 渲染 50 条任务正常（截图）

## 3. 验收判据（四要素）

| # | 判据 | 对象 | 时点 | 例外 |
|---|---|---|---|---|
| 1 | `/tasks` 页面不崩溃，任务列表渲染（含 kind=text 任务） | 真机走查 5174 | 修复后 | 数据为空时显示空态 |
| 2 | kind=text 任务卡片显示合理 label 与图标 | 截图 | 修复后 | — |
| 3 | GATE=0 / 测试全绿 | CI | 提交时 | — |
| 4 | T13 验收报告 §一 判据 1 缺口的闭环依据 | TASK-INFRA-005-acceptance.md 更新 | 修复后 | — |

## 4. 禁止事项

- ❌ 顺手修其它验收缺口（积分 NaN 等走 TASK-FIX-005）
- ❌ 改 execution API 的 kind 契约
