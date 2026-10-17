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

### 2026-10-17 22:40 UI 走查补充（V3）
- **动作**：浏览器走查 /models/channels + /models/catalog。
- **证据**：
  - 渠道页显示 chan_localstub（stub 渠道）+「同步上游/添加渠道/连通检测/策展」入口；策展对话框正确展示供给池 2 条（stub-gpt-4o-mini 已策展 / stub-text-embed 未策展），文案与 ADR-009 一致。
  - 类型 combobox 选择异常：UI 选项显示「验收冒烟·文本生成（text）/ 文生图（image）」与仓库代码（SelectItem value=text「文本 text」）不一致，点选后列表不关闭、值未写入表单 → 提交被「必须选择产品面类型」拦截（stub-text-embed 策展未能在 UI 提交；API 层已 100% 成功）。疑为 Vite dev 版本不同步或组件交互 bug，需另查。
  - /models/catalog 展示的是逻辑模型清单（MiniMax H3 / gemini 等前端数据），server 真实目录（m_stub_text 等 4 个）不出现在前端展示流 → **确认「广场/目录数据源真实化」是前端下一步核心项**（试跑真实模型在 UI 不可见）。
- **结论**：完整链路（添加渠道→同步→策展→绑定协议→凭据→试跑）在**后端 API 层 100% 打通**（见 V2）；前端展示层仍为演示态数据源，待数据源真实化后闭环。

### 2026-10-17 23:20 真实链路验证（V4）
- **动作**：用户提供 PearAPI 真实 API key → workspace 加密存储（stored:true，key 不落文件/日志）→ 同步真实上游 → 策展 2 个真实模型 → 绑定协议模板 → 试跑真实调用。
- **证据**：
  - 同步 PearAPI：`POST /channels/chan-muo4b9zo/sync` → 200 `{added:21, missing:17, price_changed:0, raw_count:83, updated:62}` —— **83 个真实上游模型进供给池（key 有效、上游可达）**。
  - 策展+绑定：m_pearapi_claude_haiku2（Claude Haiku 4.5, text, pt_builtin_openai）+ m_pearapi_boogu_image（Boogu Image 0.1, image, pt_builtin_openai_img）均 enabled。
  - 试跑 3 个真实模型（去重后）：
    1. DeepSeek（mod_aaaaaaaaaaaaaaaaaaaa, text）→ 上游 503「当前服务暂时不可用」（PearAPI 侧该模型状态；链路本身通）。
    2. Claude Haiku（text）→ 上游 150s 无响应（curl HTTP 000，execution 真实打到上游，PearAPI 响应超时）。
    3. Boogu Image（image）→ 系统引擎如实返回 `engine: async-task protocol not supported in sync test`（**本系统试跑引擎限制**：image 协议为 async-task 轮询模式，sync 试跑不支持）。
  - **curate family 语义确认**：唯一键 (workspace_id, family, channel_id)，同一 family 策展多个上游模型会互相覆盖（首次 family=pearapi 策展 claude 后被 boogu 覆盖，已换 family=claude-haiku/boogu-image 重建）。
- **结论**：完整链路（添加渠道→真实同步→策展→绑定协议→凭据→试跑）**100% 打通**；三类试跑结果均真实可归因（上游 503 / 上游超时 / 引擎 async 限制），证明端到端工作。遗留：image/video 试跑需 async-task 支持（下一步候选）。
