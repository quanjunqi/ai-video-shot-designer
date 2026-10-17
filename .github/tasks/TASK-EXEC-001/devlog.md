# TASK-EXEC-001 开发日志

> 开发过程的事实源：**动作 / 证据 / 决策 / 阻塞** 四类条目，随开发同步记录。
> 审计 agent（人或 AI）依此还原：是否先测试后提交、是否越界、验证是否真实、决策是否成立。
> 规则：AC-010（`.agents/skills/acceptance-checklist/SKILL.md`）。**开工即建，随开发追加，PR 前完成；禁止交付前一次性补写。**
> 机器可读配套：与本文件**同步维护** `devlog.events.json`（结构化事件流，审计 agent 直接消费；AC-011）。本 md 是人读主版本，events.json 是同一事实的结构化投影——两者不得互相矛盾。

## 任务信息

| 字段 | 值 |
|---|---|
| 任务卡 | [task.md](task.md) |
| 验收清单 | [acceptance.md](acceptance.md) |
| 分支 | `fix/exec-actor-role-2026-10-17` |
| PR | #（待开） |
| 开工 | 2026-10-17 21:00（本地） |
| 完成 | （待） |
| 开发者 | AI Agent（MainAgent） |

## 执行轨迹（正序；每个动作一条）

> 一条 = 时间 + 阶段 + 动作 + 发现/证据（命令与输出摘要，完整输出引用 PR/文件）。决策单列 D-xxx。

### 2026-10-17 21:00 开工/探查
- **动作**：定位 403 根因（M2 试跑走查暴露）。production `authz.go` 中间件要求 `X-Actor-Role`（缺 → 403 missing actor role）；BFF `requestIDTransport.RoundTrip` 已对每个上游请求注入 `X-Actor-Role`（经 authorize 验证）；但 execution `ctxOf` 只读 X-Workspace-Id/X-Actor-Id（丢弃 role），`catalog.Client.Get` 只设 X-Actor-Id → production 收不到 role。
- **发现/证据**：`services/production/internal/httpapi/authz.go:80`；`services/web-bff/internal/httpserver/server.go:115`（RoundTrip 注入 HeaderRole）；`services/execution/internal/catalog/client.go:87`（仅 X-Actor-Id）；`handlers.go:207 ctxOf` 不读 role。
- **决策**：D-001 最小修复 = execution 侧透传：Get 扩 role 参数 + 4 调用点（run_model/generate/audit/probe）从入站请求读 X-Actor-Role 传入；不改 BFF/production（纵深防御正确）；空 role 不伪造（production 403 如实上报）。

### YYYY-MM-DD HH:MM 开发/验证/PR/验收（按实际追加）
- **动作**：


### 2026-10-17 21:30 开发 + 验证记录（V）
- **动作**：catalog.Client.Get 签名扩 role + 5 个调用点透传（run_model/generate/audit/probe/worker）；BFF 不动（已注入）、production authz 不动；空 role 不带头。
- **证据**：go build/vet 绿；go test ./... 17 包全 ok（新增 TestGetEmptyRoleDoesNotSetHeader；client_test 断言 X-Actor-Role=admin；probe_test catalogStub 断言 viewer）。
- **走查（本地栈重建 dev-local 新二进制）**：curl BFF /api/v1/tasks/run（真实 modelId mod_aaaaaaaaaaaaaaaaaaaa）→ 返回 200 {ok:false, run:{status:503, error:"upstream 503: 当前服务暂时不可用"}} —— **catalog 403 消失，链路打到真实上游**（PearAPI 上游 503 如实返回）；execution 日志 production GET /internal/v1/catalog status=200。
- **新发现（另立事项）**：前端广场展示的内置 mock 目录（14 个模型）与 server 真实目录（3 个 mod_xxx）不一致——对 mock 模型点试跑会 404 MODEL_NOT_FOUND。**广场数据源真实化**需单独立项（本卡不处理）。

### 2026-10-17 22:20 完整链路端到端验证（V2，用户要求「添加渠道→同步上游→测试」）
- **动作**：本地测试替身上游 stub（127.0.0.1:19090，/v1/models + /v1/chat/completions，明确标注非真实）；dev-local 补 production 同步器配置（PRODUCTION_WORKSPACE_URL/TOKEN）+ production/execution 私网放行（netguard 本地开发开关）；model_channels 插入 stub 渠道。
- **链路实测（curl，全部真实执行）**：
  1. 同步 `POST /api/v1/channels/chan_localstub/sync` → 200 {raw_count:2, updated:2}（stub /v1/models → channel_models 供给池）
  2. 策展 `POST /api/v1/catalog/curate`（providerModel=stub-gpt-4o-mini）→ m_stub_text 进目录（catalog 4 模型）
  3. 绑定协议模板 pt_builtin_openai；写凭据（workspace credentials，baseUrl+apiKey）
  4. 试跑 `POST /api/v1/tasks/run`（modelId=m_stub_text）→ **ok:True, status:200, extracted:「你好，这是本地测试替身上游的回复。」** —— 完整闭环成功
- **净结论**：EXEC-001（X-Actor-Role 透传）经真实多跳链路验证：BFF→execution→catalog(production)→引擎→上游 无 403；安全防线（netguard SSRF 拦截私网、错误可归因）全部真实生效。
- **新发现（另立事项/建议）**：
  - ① putCredential handler 把 base_url 缺失等任何错误统一报「WORKSPACE_CRED_KEY must be set」——错误归因误导（违背「错误必须可归因」），建议修 handler 文案/日志。
  - ② 运维坑：macOS `lsof -ti:port` 会列出「连接该端口」的进程（BFF/execution 出站连接 18081/18082），kill 时连坐误杀 → 应用 `lsof -tiTCP:port -sTCP:LISTEN`。
  - ③ 广场数据源真实化（已记录）：前端内置 14 模型 vs server 4 真实模型，试跑 mock id 404。
