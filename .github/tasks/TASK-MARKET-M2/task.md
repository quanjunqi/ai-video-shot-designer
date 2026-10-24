---
taskId: TASK-MARKET-M2
status: 已验收
priority: P1（模型中心核心体验；真实调用验证）
pr: 231
criteria: 6
criteriaPassed: 6
depends_on: TASK-MARKET-M1（已合并 #229）
---

# TASK-MARKET-M2：模型中心「模型试跑」入口（真实 runModelTest）

> 依据：v14 §2.2 广场=真实调用模型+详情；Owner 确认（2026-10-17）：「模型测试在哪里」→ 要模型中心有**可见的试跑入口**。
> 摸底（2026-10-17）：① **真实调用链路已完整**——execution `POST /internal/v1/tasks/run`（同步真实等待上游：文本 ~5s、图片 30-120s、视频异步不在此同步执行；审计写回）；BFF `/api/v1/tasks/` 通用路由透传；前端 `api.runModelTest(modelId, runtime)` → `RunModelTestResponse {ok, run:{status,extracted,rawBody}}`；**业务已在用**（角色库/道具库剧本抽取）。② **渠道连通检测已真实化**——`testChannel` 调 `api.probeChannel` → BFF `/api/v1/channels/{id}/probe`（真实 HTTP 探测网络层+鉴权层，结果如实上报；接口注释「假调通」为旧残留）。③ **缺口 = 模型中心无可见试跑 UI**。
> 本卡 = 广场详情抽屉加「试跑」（Admin+）→ `api.runModelTest` 真实调用 → 结果展示（ok/上游 status/耗时/响应摘要/错误）。**纯前端；后端/BFF/契约零改动。**

## 范围与边界

- 只加前端试跑入口与结果展示；后端 execution/BFF/probe 链路不触碰。
- 试跑 = 真实调用（有真实成本）；按钮 Admin+（`canDefault` 同源权限），Viewer 不渲染。
- runtime 默认构造：text=`{messages:[{role:'user',content:'你好，请回复一句简短测试。'}]}`（最小可验证）；image/video **不支持同步试跑**（execution 语义：视频异步不在此同步执行）→ 按钮禁用 + tooltip/文案说明，不伪造。
- 已停用/渠道停用的模型不可试跑（disabled）。
- 不重复：渠道连通检测（已真实）、角色库/道具库抽取（已存在）、`testChannel` 假调通注释（只清理注释，不改行为）。
- 不新增迁移；不改 api 契约。

## 验收判据（6 条）

1. 广场详情抽屉新增「试跑」按钮（Admin+ 渲染；Viewer/停用模型隐藏或禁用）。
2. 点击 → `api.runModelTest(modelId, runtime)`（text 默认 runtime；禁止直接 fetch，统一 client 入口）。
3. 结果展示区：idle（说明文案）/ running（加载态）/ result（ok、上游 status、耗时、响应摘要 extracted 或 rawBody 截断）/ error（真实错误消息）；试跑失败 HTTP 200 但 ok=false 也如实展示。
4. text 可试跑；image/video 禁用并说明「同步试跑仅支持文本（图片/视频走异步任务）」。
5. 测试钉死：node --test 断言（按钮权限/统一 client/三态/结果字段/图片视频禁用）；现有 market 相关测试全绿。
6. 门禁全绿 + 走查（Owner 对 text 模型试跑真实调用展示；Viewer 无按钮）+ 台账 RC=0。

## 实现提示

- 试跑入口放 `ModelDetailBody`（广场详情抽屉，`canDefault` 已有 Admin+ 语义）；结果区放抽屉内按钮下方。
- 耗时 = 请求前后 Date.now 差；响应摘要 = `res.run?.extracted?.['choices.0.message.content'] ?? rawBody?.slice(0,200)`。
- 清理 `useSettingsStore.ts` 接口行旧注释「假调通」→「真实探测（probeChannel）」保持注释与实现一致（低风险）。
