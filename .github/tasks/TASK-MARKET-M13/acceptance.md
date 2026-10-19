# TASK-MARKET-M13 验收清单

## 需求点 → 验收判据（四要素：判据 / 对象 / 时点 / 例外）

| # | 需求点 | 验收判据 | 对象 | 时点 | 结果 |
|---|---|---|---|---|---|
| 1 | resolveTaskResult 新格式任务可提取产物 | extractResultUrl(parseTaskPayload(task)) 对 `result_payload.result` 含 `output.data.0.url` 的任务返回该 URL | 单测 + /tasks 10-19 成功行 | 开发后 | ☑ |
| 2 | 旧格式任务不回归 | `intent_payload.result` 含 URL 的任务仍能提取（10-08/09/10 任务缩略图保持） | 单测 + /tasks DOM img 日期分布 | 开发后 | ☑ |
| 3 | 平铺形态兼容 | result_payload 直接含 URL_KEYS 键（无 result 嵌套）也能提取 | 单测 | 开发后 | ☑ |
| 4 | L3 实证 | /tasks 刷新后 10-18 00:33 与 10-19 22:25/22:27 成功任务行出现 54px 缩略图；旧 32 图不消失不裂图 | 浏览器 DOM | 开发后 | ☑ |
| 5 | 门禁全绿 | npm run gate（GATE=0）+ npm run ui:check + npm test 通过 | CI 等价本地 | 提交前 | ☑ |
| 6 | 台账闭环 | task.md/README/ledger.json 三方一致 + check-task-ledger.sh exit=0 | 仓库 | PR 前 | ☑ |

## 验证记录
- npm test：215 pass / 0 fail（M13 新增 2 条：嵌套层断言 + legacy 分支断言）
- npm run gate：0 error 0 warning
- npm run ui:check：42 组件同步
- L3 DOM img 分布（修复后）：{2026-10-19:2, 2026-10-18:2, 10-12:1, 10-11:2, 10-10:3, 10-09:19, 10-08:10} = 39 个全部可见（hidden=0）；修复前 10-18/10-19 均为 0
