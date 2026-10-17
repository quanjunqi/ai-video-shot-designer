---
id: TASK-MARKET-M11
title: 创作流真实消费修复（payload modelId 字段失配）
status: 待验收
priority: P1
depends_on:
  - TASK-MARKET-M10
---
# TASK-MARKET-M11 创作流真实消费修复

## 背景
M10 验收后端到端实测创作流：/create/image 提交图片任务 → 任务中心任务**失败**，错误 `missing modelId in payload`。
根因（代码实证）：execution 全链路统一消费 camelCase `modelId`（worker executeJob / writeSubmitAudit / handlers_generate 均 `json:"modelId"`），
BFF 对 payload **直接透传不重命名**（契约 CreateTaskRequest.payload：以服务端为准）；而前端 CreateWorkbench submit 只传 snake_case `model_id` → worker 解析 `payload.ModelID=""` → 拒绝。

## 范围（纯前端，零后端）
1. CreateWorkbench submit payload：**双写** `modelId`（execution worker/审计权威键）+ 保留 `model_id`（历史消费/草稿复用/详情展示兼容）
2. 测试：钉死「提交 payload 必须含 modelId 键」（谁删回 snake_case 即红）

## 验收要点
- /create/image 提交 1 张图 → 任务 queued → completed，产物回显
- 模型中心 audit 页出现该调用（model_id 归因）
- gate/ui:check/npm test 全绿
