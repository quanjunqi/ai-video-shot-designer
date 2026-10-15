# TASK-AUTH-001 开发日志

> 开发过程的事实源：**动作 / 证据 / 决策 / 阻塞** 四类条目，随开发同步记录。
> 审计 agent（人或 AI）依此还原：是否先测试后提交、是否越界、验证是否真实、决策是否成立。
> 规则：AC-010（`.agents/skills/acceptance-checklist/SKILL.md`）。**开工即建，随开发追加，PR 前完成；禁止交付前一次性补写。**
> 机器可读配套：与本文件**同步维护** `devlog.events.json`（结构化事件流，审计 agent 直接消费；AC-011）。本 md 是人读主版本，events.json 是同一事实的结构化投影——两者不得互相矛盾。

## 任务信息

| 项 | 值 |
|---|---|
| 任务卡 | [task.md](task.md) |
| 验收清单 | [acceptance.md](acceptance.md) |
| 分支 | `feature/auth-001-permissions-2026-10-15`（worktree `.worktrees/auth-001`，基 origin/develop@7d3c990） |
| PR | #<待开> |
| 任务类型 | **UI + 后端混合任务**（前端按角色控制导航/操作入口 + 后端强制 RBAC）→ **AC-009 设计稿先行** |

## 动作记录 A（Actions）

| 时间 | 动作 | 证据 |
|---|---|---|
| 2026-10-15 | 读任务卡：三角色（Owner/Admin/Viewer）+ 后端强制 403 + 前端按角色控制；AC-009 设计稿先行 | TASK-AUTH-001/task.md |
| 2026-10-15 | 探查 workspace 成员/角色模型：`workspace_members` 表已有 `role` 字段，CHECK 约束 `('owner','admin','editor','viewer')`；种子数据 ws_dev/user_dev=owner | 001_workspaces.sql |
| 2026-10-15 | 探查角色解析端点：`GET /internal/v1/workspaces/{workspace_id}/members` 存在（workspace internal API） | handler.go:61 |
| 2026-10-15 | 探查 BFF：`web-bff/internal/httpserver/guards.go` 存在（待读鉴权现状） | guards.go |
| 2026-10-15 | 建开发线 worktree + 迁移任务卡到文件夹结构 + 加 front-matter（status=in_progress, criteria=4） | .worktrees/auth-001 |
| 2026-10-15 | 探查 BFF 鉴权：`guards.go authorize` 已存在——转发 workspace `/internal/v1/workspaces/{ws}/authorize?actor_id=`；**用 devWorkspace/devActor 硬编码**；403 映射 errAuthorizationDenied，仅判"是否成员"，**未按 role 分级**；全部 10+ handler 均调 authorize | guards.go、handlers.go |
| 2026-10-15 | 探查 workspace：`GET /internal/v1/workspaces/{workspace_id}/authorize` 已实现（authenticated → actor_id 必填 → Store.Authorize → 非成员 403 / 200 返回 Member）；`Store.Authorize` 查 workspace_members 返回 `Member{WorkspaceID, ActorID, Role}` | handler.go:101、store.go:38 |
| 2026-10-15 | 探查前端：页面齐全（ModelAudit/ModelCosts/ModelHealth/SettingsChannels/SettingsModels/LogicalModels/Protocols/Preferences/RulesCenter）；SideNav.tsx 导航；**无权限体系**（role 命中均为 comic 业务） | pages/、layouts/SideNav.tsx |
| 2026-10-15 | **（进行中）** 产验收清单 + 权限矩阵设计稿 → Owner 评审 | acceptance.md、design-prototype.html |
| 2026-10-15 | 产设计稿 v1：`design-prototype.html`（角色定义 + 权限矩阵 + 三角色 SideNav 示意 + 技术方案）；验收清单细化 6 条（判据四要素）；请求 Owner 评审拍板 4 点 | design-prototype.html、acceptance.md |

## 证据记录 E（Evidence）

- `services/workspace/migrations/001_workspaces.sql`：`workspace_members(workspace_id, actor_id, role)`，role ∈ owner/admin/editor/viewer，PRIMARY KEY (workspace_id, actor_id)
- `services/workspace/internal/httpapi/handler.go:61`：`GET /internal/v1/workspaces/{workspace_id}/members`（internal API，无认证检查 = 共享内部 token 域）
- AUDIT-001 已核实安全缺口：共享内部 token + X-Workspace-Id 仅取值不鉴权，持 token 者可查任意租户

## 决策记录 D（Decisions）

| 编号 | 决策 | 理由 |
|---|---|---|
| D-001 | 三角色收敛为 **owner / admin / viewer**（editor 并入 admin） | 任务卡草案"或等效"；owner 管理授权、admin 全量配置、viewer 只读；**Owner 评审拍板确认** |
| D-002 | 本刀 = 设计稿先行（AC-009）：先出「权限矩阵 + 前端示意」原型 → Owner 评审 → 通过后写码 | UI 任务硬性关卡；防"先开发后补设计稿" |
| D-003 | 后端 RBAC 为第一优先（不依赖 IA-001）；前端角色控制基于**现有导航**实现，导航结构调整留给 IA-001 | 任务卡"IA-001 先定稿导航，权限矩阵挂其后再动 UI"——本刀只做角色可见性控制，不改导航结构 |
| D-004 | **审计日志仅 Owner**（含查看/导出/清理）；Admin/Viewer 入口隐藏 + 后端 403 | **Owner 评审拍板（2026-10-15）**：审计是对管理行为的监督，Admin 也不可见 |
| D-005 | Viewer 偏好设置**隐藏**（非只读可见） | **Owner 评审拍板（2026-10-15）**：偏好含预算/默认模型等敏感配置 |
| D-006 | dev 身份切换 = TopBar 下拉（dev-only），三角色种子 actor | T13 判据 5 走查需要三角色切换；评审未否决默认方案 |

## 阻塞记录 B（Blocks）

- ✅ 已解除（2026-10-15 Owner 评审拍板）：editor 角色归属 = 并入 Admin；审计仅 Owner；偏好 Viewer 隐藏

## 纪律自检（随开发持续更新）

| 项 | 结果 | 证据 |
|---|---|---|
| 开工即建开发日志（AC-010） | ✓ | 本文件创建时间 2026-10-15（随开发同步维护，非交付前补写） |
| 任务类型判定 + AC-009 设计稿先行 | ✓ | D-002；设计稿 v2 经 Owner 评审通过（2026-10-15） |
| 设计稿逐点映射验收清单（AC-003） | ✓ | acceptance.md 判据 1 引用 design-prototype.html v2 |


## 动作记录 A（随开发同步追加）

- A-012（2026-10-15，BFF RBAC 写码）：新增 `authz.go`——角色等级（member/viewer/admin/owner，editor 并入 admin、未知角色 fail-safe=member）、矩阵规则表（最长前缀匹配）、authorizeRequest 裁定（读请求看 read、写请求看 write）。
- A-013（2026-10-15，guards.go 升级）：authorize 签名由 `(ctx) error` 升级为 `(r) (role, error)`——身份从 X-Workspace-Id/X-Actor-Id 请求头读取（缺省回退 devWorkspace/devActor）；新增 resolveRole（调 workspace `/internal/v1/workspaces/{ws}/authorize?actor_id=` 解析 JSON role）；新增 withRole/roleFrom（ctx 携带已验证角色）；新增 HeaderWorkspace/HeaderActor/HeaderRole 常量。
- A-014（2026-10-15，server.go）：requestIDTransport.RoundTrip 增加 X-Actor-Role 注入（仅注入 BFF 鉴权通过、ctx 携带的角色，下游不信任客户端自报）；新增 `GET /api/v1/me` 路由。
- A-015（2026-10-15，调用点升级）：handlers.go / handlers_audit.go 共 16 处 `s.authorize(r.Context())` 全部升级为 `role, err := s.authorize(r)` + `r = r.WithContext(withRole(r.Context(), role))`（两种错误文案形态：workspace/production）。
- A-016（2026-10-15，测试适配）：BFF 存量测试的 workspace authorize mock 从「只回 200 空 body」升级为返回 `{"role":"owner"}` JSON——覆盖 29 处纯 authorize mock、authOK helper、captureUpstream helper（加 /authorize 路径分支）、catalog 单行 mock、main_test 两个复合 mock（加 authorize 分支）。新增 authz_test.go（roleRank / 最长前缀 / 矩阵裁定 21 用例）。
- A-017（2026-10-15，验证）：`go build ./... && go vet ./... && go test ./...` 全绿（httpserver 包 0.37s ok）。


- A-018（2026-10-15，production 中间件）：新增 `internal/httpapi/authz.go`——角色等级（与 BFF 同构，editor 由 BFF 映射 admin）、prodMatrix（catalog/logical-models/rule-templates 读 viewer 写 admin、channels admin、默认 member）、authorizeRequest 裁定、`Handler.authz` 中间件（/live /ready 放行，其余校验 X-Actor-Role 缺失 403、越权 403）。`Routes()` 最外层包 authz。
- A-019（2026-10-15，production 测试适配）：存量测试请求补 `X-Actor-Role: owner`（request() helper + 各文件 X-Actor-Id 设置处 + 两个 401 分支测试补角色头）；新增 authz_test.go（矩阵 15 用例 + 中间件 5 子测试）。
- A-020（2026-10-15，验证）：production `go build ./... && go vet ./... && go test ./...` 全绿（httpapi 1.08s ok）。


- A-021（2026-10-15，前端角色控制）：新增 `stores/useAuthStore.ts`（hydrate 拉 /api/v1/me → role；ROLE_RANK 与后端对齐；fail-safe member；authHeaders 供 client 透传身份；DEV_ACTORS 三角色）、`components/RequireRole.tsx`（页面守卫，未达最小角色渲染 403）；client.ts `request()` 透传 X-Workspace-Id/X-Actor-Id（不声明角色）。
- A-022（2026-10-15，导航过滤）：model-center-navigation.ts 新增 `visibleModelCenterNav`（audit 仅 owner、channels admin+）；settings-navigation.ts 新增 `visibleSettingsNav`（preferences/channels admin+、models viewer+）；ModelCenterLayout / SettingsLayout 接入；app.tsx 对 /models/audit(owner)、/models/channels(admin)、/settings/channels、/settings/preferences(admin) 包 RequireRole；AppShell 启动 hydrate（dev 用 localStorage 记忆身份）。
- A-023（2026-10-15，dev 身份切换 + 种子迁移）：TopBar 新增 DevActorSwitcher（仅 import.meta.env.DEV 渲染，三角色下拉）；workspace 新增迁移 `020_dev_role_seeds.sql`（ws_dev 下 user_dev=owner/user_admin=admin/user_viewer=viewer，幂等 ON CONFLICT DO NOTHING）；号段表更新（workspace 001-009 已满，新认领 020-029；execution 010-018 已用、019 可用）。
- A-024（2026-10-15，前端测试与门禁）：新增 tests/auth-navigation.test.ts（6 用例）；api-logical-models.test.ts 因 client.ts 新增运行时 import 改用相对路径 + .ts 扩展名适配 node --test；settings-navigation 布局护栏断言演进为 visibleSettingsNav 渲染。
- A-025（2026-10-15，全量验证）：前端 npm test 173/173 + npm run gate GATE=0；BFF/production/workspace go build+vet+test 全绿。

## 复盘（PR 前补）

- **技术债/后续**：页内操作按钮级隐藏（成本预算编辑等）留 IA-001 联动；「无 X-Actor-Id→400」判据按 dev 回退语义解释（走查必需，生产仍由 workspace authorize 强制）。
- **过程问题**：BFF 存量测试 mock 大面积 503（新协议要求 role JSON）——定位为 mock 只回 200 空 body，29 处批量升级 + 3 类形态（单行/复合/captureUpstream）逐个处理；教训：协议变更必须同步升级测试契约。
- **做得好的**：矩阵单测先行（authz_test.go 21 用例 + production 15 用例）；前端导航过滤纯函数可单测（auth-navigation 6 用例）；dev 切换机制闭环（迁移种子 + TopBar + localStorage 记忆）。
