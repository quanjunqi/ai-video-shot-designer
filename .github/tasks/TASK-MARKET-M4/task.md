---
status: 已验收
priority: P1
depends_on: [TASK-MARKET-M3]
---

# TASK-MARKET-M4 图片试跑 async 支持（试跑路径分流 RunAsync）

## 背景
- M2 开放了图片试跑入口，但实测 Boogu Image 试跑报 `engine: async-task protocol not supported in sync test`。
- 根因：handlers_run_model.go 试跑路径直调 engine.Run（sync 路径，async.Enabled 时拒绝）；而 engine.RunAsync（submit→poll→result，6 分钟轮询）已完整实现但未被试跑路径使用。

## 范围
1. 试跑路径按模板 async 配置分流：async.Enabled → engine.RunAsync；否则 engine.Run（行为不变）。
2. 图片试跑（pt_builtin_openai_img）真实可用：Boogu Image / GPT-Image 2 能 submit+poll 真实上游（上游 503/超时如实展示）。
3. RunAsync 轮询逻辑补单测（submit→poll→done 状态机）。

## 非目标
- 不改 Run/RunAsync 引擎实现（已完整）。
- 视频试跑保持禁用（用户明确不开放）。
