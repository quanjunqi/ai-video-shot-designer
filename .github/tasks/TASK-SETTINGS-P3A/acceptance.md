# TASK-SETTINGS-P3A 验收清单

> 设计稿映射：设置中心 P2 骨架 v15 §二（工作区与成员）——成员表结构沿用 v15，仅数据源由本地 DEV_ACTORS 替换为真实 API（降级路径保留演示态）。
> 判据四要素：判据 / 对象 / 时点 / 例外。

| # | 需求点 | 判据 | 对象 | 时点 | 例外 | 状态 |
|---|---|---|---|---|---|---|
| 1 | BFF 暴露成员列表代理 | `GET /api/v1/workspace/members` 存在，转发 workspace `/internal/v1/workspaces/{ws}/members`，透传 items 数组 | web-bff httpserver | 路由注册 + 集成测试 | — | ✅ 已通过 |
| 2 | Admin+ 纵深守卫 | role < admin 请求 /members → 403 FORBIDDEN（viewer/member 不可读） | BFF handler | 单测 | BFF dev 降级角色不参与 | ✅ 已通过 |
| 3 | 前端真实接入 | SettingsWorkspace 成员表数据源 = `GET /api/v1/workspace/members`（actor_id/role），Admin+ 渲染 | 前端页面 | 页面渲染 + 测试 | API 失败 → 演示态 | ✅ 已通过 |
| 4 | 降级路径 | API 不可达时 fallback DEV_ACTORS，页面标注「演示数据」，不白屏 | 前端页面 | 测试 + 走查 | — | ✅ 已通过 |
| 5 | 信息卡与 P3 占位不变 | 工作区信息卡（名称/标识/成员数量）+ 邀请/调整/移除/共享预设库 = P3 占位，不因接入成员而改动 | 前端页面 | 走查 | — | ✅ 已通过 |
| 6 | 契约与测试 | BFF 代理测试（转发+守卫+透传）+ 前端测试（成功渲染/降级）；后端 go build/vet/test + 前端 gate/node --test/vitest/ui/visual 全绿 | 前后端 | 门禁 | — | ✅ 已通过 |
| 7 | 台账与 PR | 立卡四件套 + README/ledger 同步 + 门禁 RC=0；PR 附勾对结果 | 台账 | PR 时 | — | ✅ 已通过 |

## 反模式自查（命中即改）

- FE-*：成员区不做僵尸按钮；API 失败不白屏；三态（loading/error/empty）成员表必过。
- BE-*：BFF 代理沿用既有 proxy 模式（authorize → withRole → 转发），错误码复用契约（FORBIDDEN/UPSTREAM_UNAVAILABLE）。
