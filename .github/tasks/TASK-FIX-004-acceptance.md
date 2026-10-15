# 需求验收清单：TASK-FIX-004（任务中心 kind=text 崩溃修复）

> 按 acceptance-checklist 模板填写；随开发完成逐项勾对，PR 附勾对结果。

---

## 任务信息

- 任务名称：任务中心 /tasks 崩溃修复（KIND_META 缺 kind="text"）
- 关联需求/任务卡：TASK-FIX-004（来源 T13 验收缺口 1）
- 开发者（AI）：Doubao MainAgent
- 开工日期：2026-10-15
- 目标一句话：/tasks 页面不崩溃，任务列表（含 kind=text）正常渲染，T13 判据 1「拿产物」闭合。

---

## 一、需求点 → 可验证判据

| # | 需求点（任务卡） | 验收判据（可客观验证） | 判据四要素备注 | 自检结果 |
|---|---|---|---|---|
| 1 | /tasks 页面不崩溃 | 浏览器打开 /tasks → 任务列表渲染成功，无 `reading 'icon'` 报错（截图 + 页面文本） | 判据/对象：5174 /tasks；时点：修复后 | ☑ 过 |
| 2 | kind=text 任务显示合理 label 与图标 | 页面含 4 条 kind=text 任务卡片，label 非空、图标渲染 | 同上 | ☑ 过 |
| 3 | 未枚举 kind/status 不崩溃（兜底） | KIND_META/STATUS_META 查表有兜底；代码审查确认无裸下标 | 代码审查 | ☑ 过 |
| 4 | JobKind 类型含 text | `src/types/index.ts` JobKind 联合含 'text' | 代码审查 | ☑ 过 |
| 5 | 前端门禁全绿 | `cd apps/web && npm run gate` → GATE=0；`npm test` 全绿 | 提交前 | ☑ 过 |

---

## 二、三态与边界

| # | 场景 | 预期 | 自检结果 |
|---|---|---|---|
| 1 | kind=text（此前崩溃） | 正常渲染 | ☑ 过 |
| 2 | 未来未知 kind | 兜底渲染，不崩溃 | ☑ 过 |
| 3 | 任务列表为空 | 空态展示（既有逻辑不回归） | ☑ 过 |

---

## 三、门禁与测试

| # | 检查 | 命令 | 结果 |
|---|---|---|---|
| 1 | GATE=0 | `cd apps/web && npm run gate` | ☑ 过 |
| 2 | 前端测试 | `cd apps/web && npm test` | ☑ 过 |
| 3 | L3 浏览器验证 | /tasks 渲染 + kind=text 卡片（截图） | ☑ 过 |
