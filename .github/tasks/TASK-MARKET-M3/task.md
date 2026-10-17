---
status: 待验收
priority: P1
depends_on: [TASK-EXEC-001]
---

# TASK-MARKET-M3 模型中心数据源真实化（广场/目录接 server 真实目录）

## 背景
- 后端真实链路已打通（EXEC-001）：BFF `GET /api/v1/catalog` 返回真实目录（7 模型：DeepSeek/Claude/Boogu/GPT-Image/Stub/Seedance）。
- useSettingsStore 已有 server 分支骨架（catalogSource: demo/server/offline-fallback + syncCatalog + serverModelToLocal）。
- UI 走查实测目录页仍显示 demo 内置逻辑模型清单（MiniMax/gemini），未切到 server 态。

## 范围
1. 定位并修复 UI 未切到 server 态的原因（初始化路径 / getCatalog 失败分支 / 三态切换）。
2. 广场 + 目录页展示 server 真实目录（7 模型），策展的真实模型（m_pearapi_claude_haiku2 等）可见、可试跑（text/image 按 M2 约束）。
3. 三态（server/demo/offline-fallback）语义正确、切换可观测。
4. 前端展示无回归：模型卡字段（type/能力/计费/渠道归属）与 server 数据一致。

## 非目标
- 不重做 M1/M2 能力（供给池/试跑已就绪）。
- 不改后端 catalog 契约（已真实）。
