---
taskId: TASK-EXEC-001
status: 待验收
priority: P1（真实调用链路打通；阻塞试跑/创作生成验证）
pr:
criteria: 5
criteriaPassed: 0
depends_on: TASK-MARKET-M2（已合并 #233；试跑暴露 403）
---

# TASK-EXEC-001：execution→catalog 调用透传 X-Actor-Role（修复真实调用 403）

> 依据：M2 试跑走查暴露真实链路 403——试跑点「发起试跑」→ execution `POST /internal/v1/tasks/run` → catalog 上游 `403 {"code":"FORBIDDEN","message":"missing actor role"}`。Owner 确认（2026-10-17）按「先把能用打通」优先级修此链路。
> 根因（已定位）：BFF `requestIDTransport.RoundTrip` **已注入** `X-Actor-Role`（经 authorize 验证的角色，下游不得自报）；但 execution `ctxOf` 只读 `X-Workspace-Id`/`X-Actor-Id` **丢弃 role**，且 `catalog.Client.Get` 转发到 production 时只设 `X-Actor-Id`——production `authz.go` 要求 `X-Actor-Role`（缺 → 403 missing actor role）。

## 范围与边界

- 只改 execution 侧：`catalog.Client.Get` 增加 role 透传；调用点（handlers_run_model.go / handlers_generate.go / handlers_audit.go / probe.go）从入站请求读 `X-Actor-Role` 传入。
- BFF 已注入 role，**不改 BFF**；production authz **不改**（纵深防御正确）。
- 角色语义：execution 不自行猜测/伪造角色，只透传 BFF 注入的可信值；缺失时按现状（不带 → production 403 如实上报）。
- 不新增迁移；不改 api 契约。

## 验收判据（5 条）

1. `catalog.Client.Get(ctx, workspaceID, actorID, role)` 设置 `X-Actor-Role: role`（与 X-Actor-Id 同处注入）。
2. 4 个调用点全部传 role（从入站请求 `X-Actor-Role` 读取；probe 同链路）。
3. role 为空时行为不变（不带 header → production 403 如实上报，不伪造成功）。
4. 测试钉死：client_test 断言 X-Actor-Role 注入；涉及 catalog 的集成测试补 role 透传断言；全量 go build/test/vet 绿。
5. 走查：本地栈 Owner 对文本模型发起试跑 → 不再 403（若上游凭据未配则如实展示引擎错误，而非 catalog 403）；台账 RC=0。

## 实现提示

- `catalog/client.go Get` 签名扩 role；4 调用点 `r.Header.Get("X-Actor-Role")`（probe 取 p 的入站请求同款）。
- 保持错误文案兼容（catalog: upstream %d 格式不变）。
