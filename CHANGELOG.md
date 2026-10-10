# Changelog

本文件记录**漫剧导演工坊**的显著变更。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。
版本策略、发布流程与回滚见 [`docs/RELEASE.md`](docs/development/release.md)。

> **状态说明**：仓库当前**尚无 git tag**（无正式发布）。下列条目按合并时间倒序记录，
> 待首次正式发布时归入对应版本号。

---

## [Unreleased]

### Added
#### 审计能力（④ 合规留痕 / 成本归因 / 故障定位 / 质量评估）

- **审计覆盖率：失败分支不再留痕缺失**（PR #84 / #88）：审计骨架原先在 `generate()` 的
  早退守卫**之后**才建立，导致 `EXECUTION_UNAVAILABLE`/`INVALID_BODY`/`MODEL_NOT_FOUND` 等
  **失败分支完全不写审计**（实测 71 个 jobs 只对应 4 条审计且全停在 `queued`）。
  现骨架前移，**15 处失败返回中 14 处留痕**（唯一例外 `INVALID_CONTEXT`：那一刻
  `workspace_id` 取不到，而该列 NOT NULL，写入空串是**数据污染**而非留痕）。
  真机判据：审计行 4 → 7 → 9，且 `channel_id` 在模型已解析的失败中为**真实渠道**。
- **异步链终态写回审计**（PR #85）：worker 此前**不持有 auditStore** ⇒ 异步链零审计，
  而异步任务主要是**视频类长任务（主要付费路径）**。新增 `UpdateResultByJobID`
  （按 `job_id` 定位，**无需 schema 变更**：任务表无 `request_id`，而审计表已有 `job_id`），
  在 `executeJob` 的 **11 处**终态与 `failOrRetry` 的 **2 处终态**（重试耗尽/死信）写回；
  **非终态的"还会重试"分支刻意不写** —— 提前写会把"还在重试"记成"已失败"。
- **用量落库**（PR #87）：`token_input`/`token_output`/`token_cached` 三列此前**从不写入**
  （恒 0），而 `quota` 的日/月成本上限比的是 `SUM(cost_amount)` ⇒ **上限永不触发（失效的安全阀）**。
  真机判据：一次真实文本调用写入 `in=35 out=38`。**金额（`cost_amount`）本片未写**：
  `capability.billing` 的单位（积分 / CNY）未定，写错币种是数据缺陷。
- **密钥 L0 脱敏**（PR #89）：脱敏放在 `audit.Store` 的**两个写入口**，任何调用方都不可能忘记
  （对照：两处 probe 都记得发占位串，但审计 payload 一直是原文）；纯函数 ⇒ `audit` 包
  **首批单测**锁定"密钥形状必打码 + 脱敏后仍是合法 JSON + 正常内容一字不动"。
  真机：prompt 内与 `api_key` 字段两处 `<REDACTED>`，JSON 结构完整。
- **审计查询可筛选、真 `total`、服务端聚合**（PR #90）：此前只有 `limit`/`offset`（表上
  早有 status/model 索引却无人使用）、`total` 实为**当前页条数**、统计在前端**当前页**上算
  （翻页即变，是假统计）。现支持 5 个筛选、`total` 用 `COUNT(*) OVER()` 取筛选后总数、
  `stats` 在筛选后全集上聚合。真机：`limit=2` 时 `items=2` 而 **`total=10`**，与 SQL 直查一致。
- **前端改用服务端统计 + 状态筛选 + CSV 导出入口**（PR #91 / #95）：并加**源码级护栏测试**
  断言"不得再对当前页做 filter/reduce"—— 这类缺陷不报错、不崩溃，只能靠不变量守住。
- **审计导出 CSV**（PR #93）：`GET /api/v1/audit/export`，流式不缓冲，
  筛选口径与列表**共用同一解析函数**。**刻意不导出 payload 原文**（L1 未定案）。
  修复中发现并修掉真实缺陷：BFF 的 `copyHeaders` 原先只透传 `Content-Type`/`Location`
  ⇒ **CSV 能下载、内容也对，但浏览器拿不到文件名**（只验响应体会漏掉 ⇒ 已加响应头断言）。
- **审计「身份不可变」约束**（PR #92）：表注释写着"不可变追加"，但**无触发器**且代码确有
  UPDATE（D2 要回填终态）⇒ 不写"绝对不可变"，而是区分：**身份字段永不可改**（含
  `request_id`/`workspace_id`/`model_id`/`request_payload`/`created_at`…），
  **完成字段允许回填**（`status`/`response_payload`/`token_*`/`cost_*`…）；
  `DELETE` 默认拒绝，仅 `SET LOCAL app.allow_audit_purge='on'` 放行（留给保留期清理）。
  同时把误导性表注释改成**实际约定**。
- **审计保留期清理**（PR #94）：**默认关闭**（清理是破坏性操作，未显式配置不启动）；
  两个窗口（成功行 / 非成功行）；**删除本身写一条审计**（`product=system`、`mode=audit_purge`），
  挂在哨兵 `workspace_id=__system__` 下以免误归因到真实租户。

#### 渠道探测（接入验证）

- **渠道探测合流为一份实现并加上 SSRF 防护**（`refactor(execution)` / PR #71）：
  原先 production 与 BFF 各有一份等价实现，且**都没有 SSRF 防护**（BFF 那份的自定义渠道
  `baseUrl` 完全由请求体控制）。现统一由 **execution** 实现（`internal/probe`），BFF 改为转发；
  production 的探测包与内部路由已移除（同时消除了它对 workspace 表的跨服务直读）。
- **修复：用户自建渠道的探测不再报 400**。此前 `POST /api/v1/channels/{id}/probe`
  对用户渠道要求请求体里带 `baseUrl`，缺失即 `400 INVALID_CHANNEL`；现在服务端自行解析地址，
  **请求体不再被读取**（这也正是消除 SSRF 面的方式）。
- **行为变化（如实上报）**：本地/内网目标（如本机 ComfyUI）在默认策略下会返回
  「目标被出站策略拒绝（未发起连接，非网络故障）」并提示 `EXECUTION_ALLOW_PRIVATE_UPSTREAM=1`，
  而不是此前的 `connection refused`。**按渠道粒度的私网开关与留痕**另立切片。

### Changed

- **联合并行开发规范**（`docs/PARALLEL_DEVELOPMENT.md` + `AGENTS.md` §12.7）：面向多条开发线
  同时改同一仓库的操作规范。核心为四条硬规则 —— ①一条线一个 worktree（禁止共用 checkout）
  ②编号资源（迁移号段/ADR/任务卡）先认领后使用，撞号即刻让号 ③禁止用 `&&`/`-q`/`2>/dev/null`/
  管道推断 git 成功，push 后必须**比对本地 HEAD 与远端 SHA** ④禁止 `git add -A`，按路径提交。
  每条规则都附**真实事故台账**（10 项）。

- **协议定义迁到代码注册表（ADR-007 D1 后端）**：新增 `catalog/protocol_registry.go`，
  把 8 个内置接入方式（`pt_builtin_*`）从迁移 SQL **等价搬迁**到 Go 代码，作为内置默认值的
  权威来源；`PostgresStore.Directory()` 读出后经 `MergeTemplates` 合并 ——
  **DB 行优先**（管理员可覆盖）、DB 缺失的内置项由注册表补齐、自定义模板原样保留、
  输出按 id 稳定有序。`ProtocolTemplate` 追加 `source`（builtin/custom，omitempty），
  既有 JSON 消费者不受影响。含「异步一致性」断言：把 `enabled=true` 但缺 `pollPath`
  或状态字段的内置项列为**已知缺陷台账**（当前 2 条：jimeng_video、minimax_video），
  修好或新增违规都会使测试失败并提示更新台账。

- **ADR-007 接入方式改用代码注册表**：参照本地参考项目 `VOZEB-PRO` 的实测做法
  （其 `channel-protocol-registry.ts` 用代码定义接入方式，**没有"协议配置"这个用户概念**），
  决定：协议定义迁到代码注册表并取消"用户可编辑协议"界面；鉴权由 `auth_type` 封闭枚举
  改为 `authHeader` + `authPrefix`；请求模板改 `{{占位符}}` 字符串（兼容并存过渡）；
  `capabilities` 增加人读说明。**只借鉴架构，不复制代码**（该项目含商业许可条款）。
- **鉴权数据驱动（ADR-007 D2）**：新增 `auth_header` / `auth_prefix`（workspace/007、
  production/027，均可空不回填），`execution` 的 `applyAuth` 改为数据驱动 ——
  `authHeader` 非空时按其写头（空前缀即裸 Token），否则按 `auth_type` 兜底映射，
  **既有渠道行为逐字不变**。从此新增 header 形态**无需改代码或加迁移**。

- **ADR-005 设置中心信息架构重设计**：按「用户任务」重组设置（导航 6 项 → 4 项：
  模型/渠道/用量/偏好），明确**供给池的可见性不变量**（机舱不是驾驶舱；仅在接入向导
  与用户自己渠道详情出现），接入向导 8 步收敛为 3 步，禁用内部术语并要求专家模式，
  并规定「专业能力长在创作流而非设置页」。附可验证验收指标（单页交互容器 ≤8、
  最大页面 ≤300 行、用户需理解内部词 3 个）。
- **任务中心展示缺口记录**（`TASK-OBS-001`）：核实 `gateway_audit_logs` 已有
  `request_payload`/`response_payload`/`channel_id`/`cost_amount` 等，但发现
  `jobs.intent_payload` 在任务完成时被**结果覆盖**（`store.go:220`），且 `jobs`
  无 `result_payload` 列、产物未落盘、异步进度不回写。

- **逻辑模型管理与候选绑定界面（ADR-003 第 2 步）**：设置中心新增「逻辑模型管理」
  （列表 / type·status 过滤 / 新建 / 编辑 / 启用停用 / 右侧候选绑定面板）。
  `id` 只读并说明它是对外契约；**不提供删除**（后端无该端点，避免"点了必失败"），
  下线用停用；解绑文案明确为"解除绑定"而非删除（语义是置 NULL 不删行）；
  候选优先级明确"小者优先"；业务错误码（`ID_IMMUTABLE` / `MODEL_ALREADY_BOUND` 等）
  分门别类展示且不吞服务端根因。含 11 个纯函数单测。

- **BFF 暴露逻辑模型与候选绑定（ADR-003 第 2 步后半）**：新增 `/api/v1/logical-models*`
  代理（4 个 path / 7 个 operation），照抄既有 `catalogProxy`/`ruleTemplates` 模式，
  状态码与业务错误码**原样透传**（`ID_IMMUTABLE` / `MODEL_ALREADY_BOUND` /
  `MODEL_NOT_FOUND` / `CANDIDATE_NOT_FOUND`）；`client.ts` 新增 7 个方法与类型
  （零 `any`）；`openapi/bff.yaml` 同步登记契约。

- **逻辑模型与候选绑定 API（production，ADR-003 第 2 步）**：新增 7 个内部端点，
  支持逻辑模型 CRUD 与"把 `model_catalog` 行绑为候选 + 设 `route_priority`"。
  `id` 不可修改（400 `ID_IMMUTABLE`）、候选已被占用返回 409 且整体回滚、
  解绑置 NULL 不删行、并发绑定用 `SELECT … FOR UPDATE` 保证不静默抢占。
  含真库集成测试（env 门控）。

- **模型聚合网关·路由层 schema（ADR-003 第 1 步）**：新增 `logical_models`（对外统一标识），
  `model_catalog` 增加 `logical_model_id` 与 `route_priority` —— 同一逻辑模型的多行即为
  **候选渠道集合**（`provider_model` 为行级字段，各渠道模型 id 可互不相同，无需新绑定表）；
  新增租户级 `workspace_routing_policies`（默认平台渠道启用、自带渠道关闭、最多尝试 3 个）。
  `logical_model_id IS NULL` 的行**行为完全不变**，向后兼容。

- **`docs/BACKLOG.md` 待办清单**：记录已识别但**暂缓**的工作及其**启动条件**，并记入
  「先做模型中心底座」的决策依据。与 `.github/tasks/`（正在做的事）区分。

- **`auth_type=token`（无前缀 Authorization）**：为对接要求 `Authorization: <Token>`
  的上游（如 AutoDL 的 ComfyUI 工作流 API）而新增。engine 中原先三处硬编码
  `Bearer ` 前缀，现统一走 `applyAuth`；`workspace/005` 与 `production/024`
  放宽 `auth_type` 的 CHECK 以允许 `token`。**既有 `bearer/apikey/sign` 行为不变**
  （default 分支仍为 Bearer）。

- **并行开发规范**（`AGENTS.md` §12）：明确「一个工作目录只能在一个分支」的硬约束与
  `git worktree` 用法、分支基线（禁止堆叠/禁止 squash）、**迁移文件号段分配表**、
  热点文件「只追加不重排」规则、每条线的本地栈端口隔离、以及开工前检查清单。

- **架构图集**（`docs/architecture/`）：C4 上下文/容器、4 条关键链路时序图、4 库 23 张表 ER 图、
  状态机、部署拓扑 —— 共 18 张 Mermaid 图，每张注明事实来源。
- **环境变量权威清单**（`.env.example`）：39 个变量，覆盖 5 个服务 + 本地基础设施，
  并以脚本校验「模板覆盖全部代码读取的变量」。
- **前端质量门禁权威文档**（`docs/FRONTEND_QUALITY_GATE.md`）：合并原三份重叠文档，
  保留全部 14 条规则编号（R-UI / R-DATA / R-CRUD / R-HOOK）与反例库 R1–R10。
- **测试策略**（`docs/TESTING.md`）、**可观测性规范**（`docs/OBSERVABILITY.md`）、
  **发布规范**（`docs/RELEASE.md`）、**安全策略**（`SECURITY.md`）。
- **统一 Executor 接口与 API Connector**（TASK-P2-001）：`Submit/Poll/Cancel/GetResult`
  抽象 + 把既有 `Run`/`RunAsync` 适配为 `APIConnector`，含 11 个测试。
- 各服务 `.dockerignore`（此前仅 production 有）。
- **BFF 接口契约**（`openapi/`）：OpenAPI 3.1，38 path / 57 operation，
  覆盖前端 53 个 API 方法 100%、BFF 21 个路由模式 100%；含离线校验脚本与破坏性变更规则。
- **CI 增强**：`gofmt` 格式门禁；`golangci-lint`（**仅新问题**模式，避免存量告警堵死 PR）；
  覆盖率**棘轮**门禁（`.github/coverage-baseline.txt`
  + `.github/scripts/check-coverage.sh`，覆盖率不得低于基线）；Dependabot
  （npm + 6 个 Go 模块 + GitHub Actions）；CI 校验 OpenAPI 契约可解析性；
  文档存在性检查扩展到全部关键文档。
- **`npm audit` 分级门禁**：生产依赖高危/严重**阻断**，全量（含 dev）先报告不阻断。
- **贡献治理**：`CONTRIBUTING.md`（导航入口，规则指向 AGENTS.md）、
  `.github/INCIDENT_TEMPLATE.md`（事故复盘模板）、Conventional Commits
  三级强制（husky 钩子 / 校验脚本 / CI）、`release.yml`
  （tag 触发构建 7 个镜像到 GHCR + 生成 GitHub Release）。
- **CI 按改动范围执行**：新增 `changes` 判定 job 与
  `.github/scripts/detect-changes.sh` —— 仅 `apps/web/**` 改动时不再跑 6 个 Go 服务门禁；
  仅某服务改动时只跑该服务。**关键设计**：只过滤**步骤**而不过滤**检查** ——
  必需状态检查对应的 job 始终运行并上报，否则被跳过的 job 不上报会让必需检查
  永远停在 `Expected`，**卡死所有 PR**。判定异常一律 **fail-safe 到全量**、
  检测失败时各检查 **fail-closed 失败**（不给假绿）；`.github/**` 与 `deploy/**`
  改动触发全量。设计约束与排障见 [`docs/CI.md`](docs/development/ci.md)。
- **shell 检查**：禁止 `$var` 紧跟非 ASCII 字符（bash 会把多字节字符并入变量名，
  在 `set -u` 下报 unbound variable）—— 本仓库已因此踩坑两次，故固化为 CI 检查。

### Changed

- **分支模型改为三层（企业级 GitFlow 子集）**：`master`（生产）/ `develop`（集成与验收）/
  `feature/*`（开发）。feature **统一从 `develop` 拉取**；验收通过后 `develop → master`；
  **hotfix 从 `master` 拉并必须合回 `develop`**（否则会被下次 develop→master 覆盖）。
  `AGENTS.md` §12.2/§12.6、`docs/PARALLEL_DEVELOPMENT.md` §2、`docs/branch-protection.md` 已同步。

- **服务工程结构统一**：`outbox-relay` 的 `main.go` 迁入 `cmd/server/`，与其余 5 个服务一致。
- **站点运维材料归位**：`beian-page/` → `deploy/site/`。
- **权威文档归位**：根 `TECHNICAL_ARCHITECTURE.md`（706 行）与 `DESIGN.md`（547 行）移入 `docs/`；
  修复 `docs/adr/*`、CI、`AGENTS.md` 中长期失效的 `docs/` 引用。
- `RunResult` 新增 `ProviderTaskID`；`engine.Run` / `RunAsync` 标记 `Deprecated`（向后兼容）。

### Fixed

- **协议模板补齐异步轮询路径 `pollPath`**：实测该 UI **完全无法配置** `pollPath`
  （而其它 4 个 async 字段均可编辑），导致内置视频模板漏配，引擎退化到**硬编码**的
  `/v1/images/tasks/{task_id}` 兜底 —— 对多数渠道是错的（PearAPI 实测应为
  `GET /v1/video/generations/{task_id}`）。现补齐字段，并加两道校验（必填、
  必须含 `{task_id}` 占位符），预览区未声明时显式报警。
  另修正 `model-catalog.ts` 中「按提交端点兜底轮询」这一与实现不符的注释。

- **配额与限流（阶段 1 第 3 项 P0）**：此前 `ratelimit`/`quota`/`budget`/`throttle` 全仓库
  零命中，`gateway_audit_logs.cost_amount` 只被写入、**从未用于拦截** ——
  单个用户或一次脚本错误即可无限刷上游付费模型。现新增
  `execution/internal/quota`：按 workspace 的 **QPS 令牌桶**（允许突发、不许持续高速）
  + **日/月成本上限**（从审计表聚合，带 30s 缓存避免每请求扫表），
  并在生成入口**任何下游调用之前**判定：超限返回 **429** 并写审计
  （`status=rate_limited` / `quota_exceeded`），使「被限流」「超预算」可查。
  聚合失败时 **fail-open**（放行）—— 拒绝全部请求的代价大于超支风险。
  默认 QPS 宽松（50，挡失控循环），**成本上限默认不限制**（额度属业务决策，需显式配置）。
  验证：配额单测 10 项 + HTTP 层 429 测试与「未启用时不拦截」对照测试。

- **任务自动重试与死信（阶段 1 第 2 项 P0）**：原先 `executeJob` 遇到任何失败都直接
  `Complete(false)` **进入终态**，`jobs.attempt` 字段存在却从不被写入 —— 上游抖动一次
  即任务永久失败，且无法区分「待重试」与「已耗尽」。现新增
  `008_job_retry.sql`（`next_attempt_at` / `max_attempts` / `dead_lettered_at` + 认领索引）
  与 `Store.FailOrRetry`：未达上限则**指数退避**（5s 起、上限 5min、20% 抖动防惊群）
  回到 `queued`，达到上限则进**死信**；`job_attempts` 逐次记录失败原因（可查）。
  仅**瞬态**失败（上游错误、依赖临时不可用）重试，配置类永久错误仍直接终态。
  同时新增**并发闸门**（`EXECUTION_MAX_CONCURRENT_JOBS`，默认 8），
  修复原先「每任务一个 goroutine、无上限」的问题。
  验证：退避与闸门单测 7 项 + **真库集成测试**（退避期内不被重复认领 → 达上限进死信 →
  尝试历史留痕）。

- **迁移执行器改为版本跟踪（`schema_migrations` + 校验和）**：原先 compose 的 migrate job
  每次 up 都重跑全部迁移，而迁移**并非全部幂等**（`006_catalog_response_params.sql` 与
  `workspace/004` 的 `ADD COLUMN` 缺 `IF NOT EXISTS`、`production/011` 的
  `DROP CONSTRAINT` 无守卫）→ **实测第二次执行在 006 报
  `column "response_params" of relation "model_catalog" already exists`**。
  新增 `deploy/local/migrate.sh`：每个文件**只执行一次**（不再要求迁移幂等）、
  逐文件独立事务、advisory lock 防并发、**校验和强制 `AGENTS.md` §7**
  （改动已应用迁移会被拒绝执行 —— 把"约定"变成"机制"）；
  对「已有表但无跟踪记录」的库采用**显式采纳**（`MIGRATE_ADOPT=[1]` /
  `MIGRATE_ADOPT_UNTIL=<version>`）而非静默 baseline。
- **状态模型三处不一致（约束层）**：全部以**新增迁移**修复，未修改任何已执行文件。
  - `execution/007_job_timeout_status.sql` —— `jobs`/`job_attempts` 的 `CHECK` 由 5 值放宽为 6 值，
    使 Go 的 `TaskStatusTimeout`（`IsTerminal()` 视其为终态）能如实落库。
  - `production/022_projects_status_machine.sql` —— `projects.status` 的
    `CHECK (status = 'pending_parse')` 放宽为前端 6 态，解除项目状态推进的约束阻塞。
  - `production/023_episodes_state_checks.sql` —— `episodes.status` 默认值由 `draft` 归一为
    `pending`（对齐 Go/TS 实际使用的取值），并为 `status`（6 值）与 `stage`（8 值）补 `CHECK`；
    存在未预期取值时抛出**可操作**的错误信息且**不静默改写**数据。
  - 实测覆盖接受路径、拒绝路径、历史数据归一、响亮失败与幂等性五类。
- **`project_characters` 缺失建表迁移（P0 阻塞级）**：该表被 Go 代码读写、被迁移 `020` 写入，
  但全仓库无 `CREATE TABLE`；迁移执行器 `psql -v ON_ERROR_STOP=1` + `sh -e` 首个错误即中止，
  故**全新数据库上 `app` profile 无法启动、021 永不执行**。
  用真实 PostgreSQL 16 实证：修复前执行到 020 报 `relation "project_characters" does not exist`。
  新增 `019a_project_characters.sql`（字典序位于 020 之前），**未修改任何已执行迁移**。
- **迁移 `020` 的重复主键缺陷**：其 `id = md5(project_id || '-' || name)` 且 `NOT EXISTS`
  只检查语句执行前的表状态，故同项目下**跨剧集同名角色**（主角常态）会插入相同 id
  并触发主键冲突 —— 带数据升级必失败。新增 `019b_project_characters_backfill.sql`
  在 020 之前完成**去重回填**，使 020 步骤 1 退化为空操作、步骤 2/3 仍正常关联。
  实测：修复前同名跨集 → 主键冲突；修复后 → 合并为 1 条角色记录，所有同名资产指向它。
- **文档与实现不符 8 处**：含 workspace 启动命令用错环境变量（`EXECUTION_DATABASE_URL`
  → 实际应为 `WORKSPACE_DATABASE_URL`，按原文执行会启动失败）、技术栈版本（React 18 → 19）、
  目录树、数据库清单、ADR 位置冲突等。
- **分支保护门禁空转**：`required_status_checks.contexts` 为空导致规则无约束力，
  已补齐 9 项必需检查。
- **分支保护死锁**：单账号仓库下 `require approvals = 1` + `enforce_admins = true`
  使任何人都无法合并 PR；审批数调整为 0，保留 PR + CI + 管理员不可绕过。
- **仓库体积**：清除历史中的 8.5MB 编译产物（`services/web-bff/server`），
  `.git` 由 9.1M 降至 2.5M；`.gitignore` 增加 Go 产物规则。
- 前端 TypeScript 遗留类型错误 77 处、ESLint 错误 7 处清零。
- CI 的 Node 版本 20 → 22（`npm test` 使用 Node 22.6+ 的 `--experimental-strip-types`，
  在 Node 20 下以 exit code 9 失败）。
- 后端测试修复：production 的 stub 缺失接口方法、`DefaultTextModel` 缺失、
  execution 引擎包因缺失 `api_connector.go` 无法编译。

### Removed

- Python 规则/校验线迁出为独立仓库
  [ai-video-shot-designer-skill](https://github.com/quanjunqi/ai-video-shot-designer-skill)
  （`SKILL.md`、`references/`、`scripts/`、`tests/`、`config/`）。
- `SELF_CHECK_RULES.md`、`docs/development-rules.md`（内容合并入
  `docs/FRONTEND_QUALITY_GATE.md`）；`ITERATION_QA.md` 降级为追加式教训台账并移入 `docs/`。

### Known Issues

> 以下为已确认、**尚未修复**的缺陷，均需人类决策后以新增迁移/新任务处理。

- **依赖漏洞门禁曾长期空转，存量漏洞待修**：`apps/web/.npmrc` 指向 npmmirror，
  该镜像未实现 audit 端点（`NOT_IMPLEMENTED`），叠加 CI 的 `continue-on-error: true`，
  导致依赖漏洞检查**从未真正生效**。改用官方 registry 实测：
  **生产依赖 4 个 moderate（0 high / 0 critical）**；
  **开发构建链 2 critical + 20 high**（`concurrently`→`shell-quote` 命令注入、
  eslint 工具链、vite、`@tailwindcss/node`）。生产依赖已改为阻断门禁，dev 链存量待修。
- **审计写入失败被静默忽略**：`_ = h.AuditStore.Insert(...)` 与「审计日志不异步丢失」冲突。
- **状态跃迁未校验**：`022`/`023` 只保证状态**取值**合法，不保证**跃迁**合法
  （如 `archived → parsing` 仍会被允许）；且 `project.Update` 的 `sets` 不含 `status`，
  项目状态仍无法由 API 推进。需在服务层实现（含权限与审计）。
- **中间件未接入**：Redis / Kafka / Temporal / Keycloak 容器已提供但业务代码零接入。
- **信任模型仅适用于本地开发**：浏览器到 BFF 无真实身份校验（无 OIDC），
  服务间使用静态共享令牌。
- **可观测性缺失**：无指标、无追踪；日志混用 `log` 与 `slog`；仅 1 个健康端点。
- **测试覆盖薄弱**：前端仅 1 个测试文件（3 用例），对应 19 个页面/13 个 store；
  后端各服务 8.3%–35.0%（asset 0%）。CI 已加覆盖率**棘轮**门禁（只禁止回退，
  阈值锁的是现状而非目标）；按 `docs/TESTING.md` §3.1 的分级目标补齐测试。

---

## [0.1.0] - 初始导入

### Added

- 全栈应用首次导入：`apps/web`（Vite + React + TypeScript）+ 6 个 Go 服务
  （workspace / production / execution / asset / web-bff / outbox-relay）。
- 模型聚合网关：统一 `/v1/generate` 入口、能力校验、动态参数透传、异步任务。
- 审计日志：`gateway_audit_logs` 表（23 字段 + 5 索引）+ 网关拦截层 + BFF 转发 + 前端查看页。
- 项目级角色库（Character Bible）：引用而非复制，单集只存状态变体（见
  [`docs/adr/002`](docs/adr/002-project-character-library.md)）。
- AI 协作开发规范（`AGENTS.md`）与架构决策记录（`docs/adr/`）。
- 本地 Compose 栈：PostgreSQL / Redis / Kafka / Temporal / MinIO / Keycloak。

[Unreleased]: https://github.com/quanjunqi/ai-video-shot-designer/commits/master
