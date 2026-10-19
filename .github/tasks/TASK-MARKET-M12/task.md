---
id: TASK-MARKET-M12
title: 任务中心产物回显（成功任务直接展示生成图）
status: 已验收
priority: P1
depends_on:
  - TASK-MARKET-M11
---
# TASK-MARKET-M12 任务中心产物回显

## 背景
M11 打通创作流真实消费后，任务中心列表行成功态只显示「成功 + —」，产物 URL 需打开详情抽屉才可见（TaskDetailSheet 已渲染）。
主流产品（Midjourney / SD 生成历史 / 即梦）任务面板均直接展示产物缩略图。

## 范围（纯前端）
1. Tasks.tsx 列表行：succeeded 且产物为 image 时，行首渲染 48-56px 缩略图（点击新窗口原图），无产物保持原 kind icon
2. 复用 result-utils 的 parseTaskPayload + extractResultUrl + mediaKind（M10 产物键加强，单一实现防漂移）
3. 测试：钉死「成功任务行渲染产物缩略图 + 复用 result-utils」

## 验收要点
- /tasks 成功图片任务行直接可见生成图缩略图（不再只有「—」）
- 无产物/失败任务行保持原样式
- gate/ui:check/npm test 全绿
