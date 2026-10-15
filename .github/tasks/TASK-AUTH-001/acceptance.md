# TASK-AUTH-001 验收清单

> 对应任务卡：`task.md`（模型中心权限矩阵 · 三角色）。模板 `templates/acceptance-checklist.md`。
> 本清单为**细化版**（任务卡草案 4 条 → 可验证判据），设计稿评审通过后为最终基准。
> 四要素：判据 / 对象 / 时点 / 例外。

## 总览

> 评审定稿（2026-10-15）：审计日志**仅 Owner**（含导出/清理）；editor 并入 Admin（三角色）；偏好设置 Viewer 隐藏；dev 切换 TopBar 下拉。

| # | 验收标准 | 判据（四要素） | 结果 |
|---|---|---|---|
| 1 | 三角色权限矩阵符合设计稿 | 矩阵每格按 design-prototype.html v2 裁定（导航可见性 × 操作），实现一致；对象：SideNav 导航项 + 各页操作入口；时点：三角色各自登录 | ✅（导航可见性+路由守卫+后端矩阵一致；页内操作按钮精细隐藏按评审范围留 IA-001，后端 403 兜底） |
| 2 | 越权 API 调用返回 403（后端强制） | 以 viewer 身份调用 admin 级 API（渠道/凭据/模型写操作）→ 403；以 admin 身份调用 audit 相关 API → 403（仅 Owner）；对象：BFF 各 handler；时点：请求时；例外：公开/健康读接口 | ✅（BFF authz.go 矩阵 + production authz.go 矩阵，矩阵单测 21+15 用例；TestProxyAuthorizationUnavailable 保留） |
| 3 | 无角色/未授权租户访问被拒 | actor 非 workspace 成员 → 403（既有 authorize 语义保持）；无 X-Actor-Id → 400 INVALID_CONTEXT；对象：BFF 入口 | ✅△（非成员 403 保持；「无 X-Actor-Id→400」例外：BFF 单栈 dev 回退为既定行为（AGENTS），走查必需；生产前端必带身份头，后端仍由 workspace authorize 强制） |
| 4 | 前端按角色控制（单套界面） | viewer 登录：审计/渠道/偏好入口不渲染；admin 登录：审计入口不渲染；直输 URL 越权 → 403 态/重定向；对象：apps/web；时点：登录后 | ✅（visibleModelCenterNav/visibleSettingsNav 过滤 + RequireRole 守卫；auth-navigation 单测 6 用例锁定） |
| 5 | 身份注入链路（BFF → 模型中心） | BFF 将已验证角色注入下游请求头（X-Actor-Role），模型中心 API 中间件校验（缺失/越权 403）；对象：web-bff + production；时点：转发时 | ✅（requestIDTransport 注入 X-Actor-Role（仅 ctx 可信角色）；production authz 中间件缺失/越权 403，测试覆盖） |
| 6 | T13 判据 5 走查通过 | Owner 真机三角色切换走查模型中心全导航，权限矩阵符合预期；对象：本地栈；时点：验收期 | ⏳（机制已交付：TopBar dev 切换 + 迁移 020 三角色种子；待 Owner 真机走查） |

## 例外与边界（评审确认）

- 创作流权限不在本刀（任务卡非范围）
- 计费/账单多角色不在本刀
- 导航结构调整（IA-001）不在本刀——本刀只做角色可见性控制
- 「无 X-Actor-Id → 400」判据按 dev 回退语义解释（本地单栈走查既定行为）；生产由 workspace authorize 强制成员校验
- dev 环境身份切换机制（三角色走查入口）属于本刀开发范围（T13 判据 5 需要）

## 测试命令（开发后执行）

- 后端：`cd services/web-bff && go build ./... && go test ./... -race && go vet ./...`；workspace/production 同
- 前端：`cd apps/web && npm run gate`（GATE=0）
- 集成（真库）：BFF 层三角色 × 路由矩阵的 403/200 测试
- 手工：三角色切换走查（Owner）
