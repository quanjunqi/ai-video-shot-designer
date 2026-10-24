---
id: TASK-MARKET-M13
title: 修复任务中心新格式任务产物缩略图不显示（result_payload 嵌套层）
status: 已验收
priority: P1
depends_on:
  - TASK-MARKET-M12
---
# TASK-MARKET-M13 修复任务中心新格式任务产物缩略图不显示

## 背景
M12 集中验收发现：任务中心列表成功任务缩略图只对「旧格式任务」（结果写在 `intent_payload.result`）生效；
**新格式任务（execution 010+，结果在 `result_payload`）全部不显示缩略图**（10-18 00:32/00:33 与 10-19 22:24 提交的成功任务行均只有「成功 —」）。

## 根因（L3 + API 实证）
`result-utils.ts` 的 `resolveTaskResult` 对 `result_payload` 直接 `return explicit`（整个对象 = `{result:{...}, modelId, runtime}`），
而 `extractResultUrl` 遍历的是 `payload.result` 下的 URL_KEYS（`output.data.0.url` 等）——URL 实际在 `result_payload.result.output.data.0.url` 嵌套层，
取不到 → 返回 undefined → 行首回退 kind icon。
旧任务走 `intent_payload.result` 回退分支（该分支取的是 `.result` 层），所以旧任务正常。

## 范围（纯前端，result-utils.ts 单点）
1. `resolveTaskResult`：explicit（result_payload）分支优先取 `explicit.result`（对象则返回该层），无嵌套 result 时回退整个 explicit（兼容平铺形态）；legacy 分支不动
2. 补单测钉死：新格式（result_payload.result 有 URL）能提取；旧格式（intent_payload.result）不回归；平铺形态兼容

## 验收要点
- 10-18/10-19 成功任务行直接可见产物缩略图（不再只有「—」）
- 10-08/09/10 旧任务缩略图不回归（32 个保持渲染）
- gate/ui:check/npm test 全绿
