# 需求验收清单：TASK-EXEC-001 execution→catalog 透传 X-Actor-Role

> 对应任务卡：`.github/tasks/TASK-EXEC-001/task.md`
> 开工日期：2026-10-17 ｜ 开发者（AI）：MainAgent ｜ 目标一句话：execution 调 production catalog 时透传 BFF 注入的 X-Actor-Role，真实调用不再 403。

---

## 一、需求点 → 可验证判据

| # | 需求点 | 验收判据（可客观验证） | 判据四要素 | 自检结果 |
|---|---|---|---|---|
| 1 | Get 注入 X-Actor-Role | `catalog.Client.Get` 签名含 role 且设置 `X-Actor-Role` header（与 X-Actor-Id 同处） | 判据=源码+单测断言；对象=catalog/client.go | ✅ 过 / ☐ 未过 |
| 2 | 4 调用点全传 role | handlers_run_model / handlers_generate / handlers_audit / probe 均从入站请求读 X-Actor-Role 传入 | 判据=源码+集成测试 | ✅ 过 / ☐ 未过 |
| 3 | 空 role 不伪造 | role 为空时不带 header（production 403 如实上报） | 判据=源码+单测 | ✅ 过 / ☐ 未过 |
| 4 | 测试钉死 | client_test 断言 X-Actor-Role；集成测试补透传断言；go build/test -race/vet 全绿 | 判据=命令 RC | ✅ 过 / ☐ 未过 |
| 5 | 走查+台账 | 本地栈试跑不再 catalog 403（凭据未配则引擎错误如实展示）；台账 RC=0 | 判据=走查+命令 RC | ✅ 过 / ☐ 未过 |

## 二、设计稿逐点映射（UI 任务必填）

非 UI 任务（后端链路修复），本项「如有」：不适用。

## 三、边界与反模式自查（AC-007）

- 不改 BFF / production authz / api 契约 / 迁移 —— 只透传已注入角色，不伪造。
- 错误文案兼容：`catalog: upstream %d` 格式不变；上游失败如实上报。
