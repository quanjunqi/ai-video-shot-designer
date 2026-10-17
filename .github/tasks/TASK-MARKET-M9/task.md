---
id: TASK-MARKET-M9
title: 创作流默认模型消费修复（广场设默认生效）
status: 进行中
priority: P1
depends_on:
  - TASK-MARKET-M8
---
# TASK-MARKET-M9 创作流默认模型消费修复

## 背景
广场「设为默认」写入 preferences.default*Model（**name 语义**，M6 设计稿确认个人默认）。
消费端探查（2026-10-18）：
- StageModelPicker（漫剧创作流）：`options.find(m.name === personalDefault)` → name ✓
- ProjectParams（项目级默认）：name ✓；defaultPrefs 历史值（'gpt-image-2'/'MiniMax H3'）name ✓
- **useCreateControls（CreateWorkbench 通用创作流）**：`available.find(m.id === preferred)` → **id ✗**
  ⇒ 广场设默认对通用创作流（图片/视频创作页）不生效，回退目录首项。
- M8 遗漏：CreateWorkbench 空态 action 仍 `navigate('/models/catalog')`（已撤销）→ 死链。

## 范围
1. useCreateControls 首选匹配兼容 name（id 优先、name 兜底，向后兼容历史值）
2. CreateWorkbench 空态引导 /models/catalog → /models/market；空态文案「设置中心」→「模型中心」
3. 源码级护栏测试（偏好匹配 name 分支 + 空态落点）

## 验收要点
- 广场设默认（gpt-image-2）→ 图片创作页模型档位默认选中该模型（来源标注）
- 空态 action 落点 /models/market
- 后端零改动；gate/ui:check/npm test 全绿
