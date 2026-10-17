# TASK-SETTINGS-P3A 开发日志

> 模板：`templates/devlog.md`。四类条目：动作（A）/ 决策（D）/ 证据（E）/ 阻塞（B）。

## 2026-10-17

- **A** 摸底后端能力：workspace 服务已有 `workspace_members` 表（001_workspaces.sql 建表、020_dev_role_seeds.sql 种子）+ `Store.Members()/Authorize()`（store.go）+ `GET /internal/v1/workspaces/{id}/members` 与 `/authorize` 端点（handler.go）；BFF 已有 `GET /api/v1/me`（server.go，TASK-AUTH-001，guards.go `s.me`，authorize→workspace 授权返回 workspace_id/actor_id/role）。
- **A** 确认缺口：BFF 无 `/api/v1/workspace/members` 代理（server.go 路由 58-96 无）；前端 `fetchMe` 调 /api/v1/me 正常（TASK-AUTH-002 链路），SettingsWorkspace 成员表仍渲染本地 DEV_ACTORS。
- **D** 范围锁定：P3-A 只做成员列表真实化；信息卡（名称/创建时间）、邀请/调整/移除、导出 = P3-B/C/D，维持占位。BFF 加 Admin+ 守卫（viewer/member → 403），纵深防御而非纯 UI 隐藏。API 失败 → 前端降级 DEV_ACTORS 演示态并标注来源。
- **D** 沿用既有 proxy 模式：`workspaceChannels`（handlers_workspace.go）为模板（authorize → withRole → 转发 → 透传 items）。
- **A** 立卡四件套：task.md/acceptance.md（7 判据）/devlog.md/devlog.events.json；README/ledger 同步。
- **E** 摸底证据：store.go Member{WorkspaceID,ActorID,Role}；handler.go Routes() 路由表；server.go 91-96 me 端点；前端 useAuthStore fetchMe（DEV 下 X-Actor-Id 透传，PROD 走真实身份）。

## 2026-10-17（开发与验证）

- **A** BFF：authz.go 矩阵加 `/api/v1/workspace/members`（read/write=admin）；handlers_workspace.go 追加 `workspaceMembers`（GET 转发 + authorize + withRole）；server.go 注册 `GET /api/v1/workspace/members`。
- **A** BFF 测试 `handlers_members_test.go` 3 条：admin 转发透传 items / viewer 403 / 上游 503，全过；`go build/vet/test` 全绿。
- **A** 前端：`features/settings/workspace-members.ts`（fetchWorkspaceMembers，DEV 透传 X-Actor-Id）；SettingsWorkspace 三态（loading/api/demo）+ 降级演示态标注 + 成员数量真实化。
- **A** 测试 `tests/settings-p3a-members.test.ts` 4 条（矩阵规则/handler 转发/API 模块/页面三态与降级）；修断言 `!=` 与 `!==`。
- **A** 门禁：gate 0/0、node --test 181/181、vitest 50/50、ui:check 绿、visual:check 全绿。
- **E** 浏览器走查（Owner）：本地栈 workspace 不可达 → 降级演示态渲染 DEV_ACTORS + 来源标注 ✅；真实路径由 BFF mock 测试覆盖。
- **B** 无。

### 验证记录
- V-001（10-17）：web-bff `go build ./... && go vet ./... && go test ./...` 全绿（含新 3 条 members 测试）。
- V-002（10-17）：前端 gate 0/0、node --test 181/181（新增 settings-p3a-members 4 项）、vitest 50/50、ui:check/visual:check 绿。
- V-003（10-17）：浏览器走查 Owner 视角——成员区渲染 + 降级标注（workspace 不可达）；Viewer 隐藏由既有 P2 走查 + canManage 条件覆盖。
- V-004（10-17）：台账门禁 RC=0；acceptance 7 判据全过。

1. BFF：handlers_workspace.go 新增 `workspaceMembers`（GET /api/v1/workspace/members，admin+ 守卫），server.go 注册路由。
2. BFF 测试：代理转发（mock upstream）+ 守卫（viewer→403）+ 透传（items 形状）。
3. 前端：新增 members API 层（features/settings 或页面内 fetch），SettingsWorkspace Admin+ 时拉取、失败降级 DEV_ACTORS。
4. 前端测试：settings-p2-skeleton 扩展或新增 members 测试（成功渲染/降级）。
5. 门禁：backend build/vet/test + 前端 gate/node --test/vitest/ui/visual + 台账 RC=0。
6. PR → CI → 合并 → 台账回填。
