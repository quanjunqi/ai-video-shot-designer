---
taskId: TASK-SETTINGS-P3B
status: 进行中
priority: P3（真实账号体系第二刀；workspace 信息真实化）
pr:
criteria: 6
criteriaPassed: 0
depends_on: TASK-SETTINGS-P3A（已合并 #225）
---

# TASK-SETTINGS-P3B：workspace 信息真实化（信息卡名称/创建时间/标识）

> 依据：`prototypes/settings-redesign/设置中心与模型中心IA v14.html` §五 P3（真实账号体系）；
> P2 骨架 v15 §二（工作区信息卡：名称 / 工作区标识 / 创建时间 / 成员数量）。
> 摸底（2026-10-17）：`workspaces` 表已有 `name` / `created_at`（001_workspaces.sql）；
> workspace 服务 **缺** workspace 详情端点（只有 members/authorize/credentials/channels/budget）；
> BFF 已有 P3A 代理模式（authz 矩阵 + handlers_workspace.go + server.go 注册）可复用；
> 前端 SettingsWorkspace 信息卡：名称「镜序 Studio」硬编码、标识 `ws_${workspaceId.slice(-6)}` 假加工、
> 创建时间「—（P3 由 workspace 服务提供）」占位。
> 本卡 = 真实账号体系第二刀：workspace 服务新增详情端点 + BFF 代理（成员可读）+ 前端信息卡三态真实化。

## 范围与边界

- 只做信息卡真实化（名称/创建时间/标识）；成员数量已在 P3A 真实化，随信息端点一并返回保持一致。
- workspace 信息（名称/创建时间）低敏感：BFF 矩阵 read=roleMember（全员可读）；写（改名）不在本卡。
- 不新增数据库迁移（表字段已齐）。
- API 失败（本地栈未起 workspace/后端不可达）→ 前端降级当前静态值并标注来源，与 P3A 成员区同模式。
- 邀请、调整/移除、导出、workspace 信息编辑 = P3-C/D 后续卡，维持占位。

## 验收判据（6 条）

1. workspace 服务：`GET /internal/v1/workspaces/{workspace_id}` 返回 `{id, name, created_at}`（authenticated 守卫）。
2. workspace 服务：新增 store `Workspace(ctx, id)` 查询（SELECT id, name, created_at FROM workspaces WHERE id=$1）。
3. BFF：`GET /api/v1/workspace` 代理转发 workspace 服务详情端点；authz 矩阵 read=roleMember。
4. BFF：非成员请求 → 403（authorize 纵深防御，与 P3A 同模式）；上游不可达 → 503。
5. 前端：SettingsWorkspace 信息卡三态（loading/api/demo）；API 成功显示真实名称/创建时间/标识，失败降级静态值 + 标注来源；成员数量随信息端点（名称展示口径一致）。
6. 门禁全绿：workspace + web-bff `go build/vet/test`；前端 gate 0/0、node --test（新增 P3B 断言）、vitest、ui/visual 绿；浏览器走查 Owner 信息卡渲染；台账门禁 RC=0。
