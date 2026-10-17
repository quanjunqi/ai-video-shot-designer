---
taskId: TASK-SETTINGS-P3A
status: 待验收
priority: P3（v14 §五 P3 分期第一刀；真实账号体系第一步）
pr: 225
criteria: 7
criteriaPassed: 7
depends_on: TASK-SETTINGS-P2（已合并 #222）
---

# TASK-SETTINGS-P3A：工作区成员真实接入（BFF 代理 + 前端替换 + 演示态降级）

> 依据：`prototypes/settings-redesign/设置中心与模型中心IA v14.html` §五 P3（真实账号体系/成员邀请）；
> P2 骨架 v15（成员区结构已定：信息卡全员 + 成员表仅 Admin+ + 邀请/调整/移除 P3 占位）。
> 摸底（2026-10-17）：workspace 服务已具备 `workspace_members` 表（001/020 迁移）+ `Store.Members()/Authorize()` +
> `GET /internal/v1/workspaces/{id}/members` 与 `/authorize` 端点；BFF 已有 `GET /api/v1/me`（TASK-AUTH-001）。
> **缺口**：BFF 未对前端暴露成员列表代理；前端 SettingsWorkspace 成员表仍用本地 DEV_ACTORS。
> 本卡 = 真实账号体系第一刀：BFF members 代理（Admin+ 纵深守卫）+ 前端真实接入（API 失败降级演示态）。

## 范围与边界

- 只做成员列表真实化；workspace 信息（名称/创建时间）、邀请、调整/移除、导出 = 后续卡（P3-B/C/D），保持 P3 占位。
- Viewer/member 请求 /members → BFF 403（纵深防御：隐藏不是纯 UI 层）；前端仍条件渲染隐藏成员区。
- API 失败（本地栈未起 workspace/后端不可达）→ 前端降级本地 DEV_ACTORS 演示态并标注来源，不阻塞页面。
