---
id: TASK-MARKET-M10
title: 试跑结果图片渲染（output. 前缀抽取修复）
status: 待验收
priority: P1
depends_on:
  - TASK-MARKET-M9
---
# TASK-MARKET-M10 试跑结果图片渲染

## 背景
Owner 验收（M7/M8/M9 最终形态）实测：广场详情抽屉试跑 gpt-image-2 → HTTP 200 成功（24s）但显示「上游未返回可读内容」。
curl 实证：真实调用成功，extracted 含 `output.data.0.url` / `output.image_urls.0`（执行器统一 `output.` 前缀），
而前端 runSummary 只抽 `choices.0.message.content`（文本路径）→ 图片 URL 被丢弃。

## 范围（纯前端，零后端）
1. ModelDetailSheet：runSummary 多键兜底（文本键 + output./data.0.url/image_url/url/result 图片键）
2. 试跑结果区：图片类型命中 URL 时渲染 <img> 缩略图（点击新窗口看原图），替代「未返回可读内容」
3. market-model-run.test.ts 扩展 URL 抽取断言

## 验收要点
- 抽屉试跑 gpt-image-2 → 展示生成图片（真实 URL），不再「未返回可读内容」
- 文本模型试跑仍显示文本正文
- gate/ui:check/npm test 全绿
