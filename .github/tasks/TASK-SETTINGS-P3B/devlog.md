# TASK-SETTINGS-P3B 开发日志

> 开发过程的事实源：**动作 / 证据 / 决策 / 阻塞** 四类条目，随开发同步记录。
> 审计 agent（人或 AI）依此还原：是否先测试后提交、是否越界、验证是否真实、决策是否成立。
> 规则：AC-010（`.agents/skills/acceptance-checklist/SKILL.md`）。**开工即建，随开发追加，PR 前完成；禁止交付前一次性补写。**
> 机器可读配套：与本文件**同步维护** `devlog.events.json`（结构化事件流，审计 agent 直接消费；AC-011）。本 md 是人读主版本，events.json 是同一事实的结构化投影——两者不得互相矛盾。

## 任务信息

| 字段 | 值 |
|---|---|
| 任务卡 | [task.md](task.md) |
| 验收清单 | [acceptance.md](acceptance.md) |
| 分支 | `feature/settings-info-p3b-2026-10-17` |
| PR | #（待开） |
| 开工 | 2026-10-17 16:00（本地） |
| 完成 | 2026-10-17 17:00（本地） |
| 开发者 | AI Agent（MainAgent） |

## 执行轨迹（正序；每个动作一条）

> 一条 = 时间 + 阶段 + 动作 + 发现/证据（命令与输出摘要，完整输出引用 PR/文件）。决策单列 D-xxx。

### 2026-10-17 16:00 开工/探查
- **动作**：摸底 workspace 服务现状（handler.go Routes / store.go / 001 迁移）、BFF P3A 代理模式、前端 SettingsWorkspace 信息卡。
- **发现/证据**：workspaces 表已有 name/created_at（001_workspaces.sql）；workspace 服务无详情端点（只有 members/authorize/credentials/channels/budget）；store 无 Workspace() 方法；BFF devWorkspace=ws_dev（channel_sync_test）；authz 矩阵最长前缀匹配，`/api/v1/workspace` 需插在 members 条目之后；前端信息卡名称/标识硬编码、创建时间占位。
- **决策**：D-001 信息卡低敏感 → BFF 矩阵 read=roleMember（全员可读），write=roleAdmin 预留改名；不新增迁移（表字段已齐）；复用 P3A 代理/降级模式。

### YYYY-MM-DD HH:MM 开发/验证/PR/验收（按实际追加）
- **动作**：
- **证据**：

## 决策记录 D

| 编号 | 主题 | 选项 | 选择 | 理由 | 时机 |
|---|---|---|---|---|---|
| D-001 |  | A / B | B |  | 开工 |

> 重要选择必须留痕（哪怕一句"选 B 因为 CI 更稳"）。审计以此判断拍板是否成立、有无被推翻。

## 验证记录 V

| 编号 | 对应验收判据 | 命令/方式 | 结果 | 证据位置 |
|---|---|---|---|---|
| V-001 | 判据 N | `go test -run X` | PASS | PR body / 本日志 |

> 结果只填 PASS / FAIL / 跳过+原因；证据位置可引用 PR、CI 链接、文件路径。禁止只写结论不写证据。

## 阻塞与解法 B

| 编号 | 阻塞 | 根因 | 解法 | 复用教训 |
|---|---|---|---|---|
| B-001 |  |  |  |  |

## 纪律自检（对照 `.agents` 规则，逐项留证据）

| 检查项 | 结果 | 证据 |
|---|---|---|
| 先本地测试/验证再 commit | ✓ / ✗ | V-xxx |
| 按路径 add（禁 `git add -A`） | ✓ / ✗ | commit 明细 |
| 只改点名范围（未越界） | ✓ / ✗ | diff 清单 |
| 验收清单逐项勾对（AC-004/005） | ✓ / ✗ | acceptance 文件 |
| GATE / 后端门禁全绿 | ✓ / ✗ | CI 结论 |
| 台账同步（状态/PR 号） | ✓ / ✗ | README 行 |
| 迁移只增不改 / 号段合规（如涉） | ✓ / ✗ | 迁移 diff |

> 任一 ✗ 必须写明原因与处置，不得空项带过。

## 复盘（收尾时写，1–3 句每项）

- **做得好的**：
- **可改进的**：
- **遗留/后续**（含转交其他卡的事项）：

## 2026-10-17 16:30-17:00（开发与验证）

- **A** workspace 服务：store.go 加 `WorkspaceInfo` + `Workspace()`（SELECT id,name,created_at）；handler.go 接口加 `Workspace`、路由 `GET /internal/v1/workspaces/{workspace_id}`、`workspaceInfo` handler（authenticated；ErrNotFound→404、其他→503）。
- **A** workspace 测试：handler_test.go fakeStore 补 Workspace 方法 + `TestWorkspaceInfoReturnsProfile` / `TestWorkspaceInfoMapsNotFoundAndUnavailable`，全过；`go build/vet/test` 全绿。
- **A** BFF：authz.go 矩阵加 `{prefix:"/api/v1/workspace", read: roleMember, write: roleAdmin}`（信息低敏感全员可读，写 admin 预留改名）；handlers_workspace.go 加 `workspaceInfo`（GET-only、authorize、转发 /internal/v1/workspaces/{devWorkspace}）；server.go 注册 `GET /api/v1/workspace`。
- **A** BFF 测试：handlers_members_test.go 追加 3 条（viewer 可读透传 profile / 非成员 403 / 上游 503），workspace 相关 6 条全过。
- **A** 前端：`features/settings/workspace-info.ts`（fetchWorkspaceInfo，DEV 透传 X-Actor-Id，失败 null）；SettingsWorkspace 信息卡三态（infoSource loading/api/demo）+ 静态值降级 + 来源标注 + formatDate 创建时间格式化。
- **A** 前端测试：settings-p3a-members.test.ts 追加 P3B 4 条（矩阵/转发/API 模块/信息卡三态），文件 8/8 全过。
- **E** 门禁：gate 0/0、tsc 过、node --test 185/185、vitest 50/50、ui:check 绿、visual:check 全绿；workspace+web-bff go build/vet/test 全绿。
- **E** 浏览器走查（Owner）：信息卡降级态正确（静态值 + 「workspace 服务不可达时降级」标注，与成员区同源）；真实路径由 BFF mock 测试覆盖。
- **B** 无。

### 验证记录
- V-001（10-17）：workspace 服务 go build/vet/test 全绿（新增 2 测试）。
- V-002（10-17）：web-bff go build/vet/test 全绿（workspace 相关 6 测试：P3A 3 + P3B 3）。
- V-003（10-17）：前端 gate 0/0、node --test 185/185、vitest 50/50、ui:check/visual:check 绿。
- V-004（10-17）：浏览器走查 Owner——信息卡降级态 + 来源标注；台账门禁 RC=0。
