# Changelog

本文件记录**漫剧导演工坊**的显著变更。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。
版本策略、发布流程与回滚见 [`docs/RELEASE.md`](docs/RELEASE.md)。

> **状态说明**：仓库当前**尚无 git tag**（无正式发布）。下列条目按合并时间倒序记录，
> 待首次正式发布时归入对应版本号。

---

## [Unreleased]

### Added

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
  改动触发全量。设计约束与排障见 [`docs/CI.md`](docs/CI.md)。
- **shell 检查**：禁止 `$var` 紧跟非 ASCII 字符（bash 会把多字节字符并入变量名，
  在 `set -u` 下报 unbound variable）—— 本仓库已因此踩坑两次，故固化为 CI 检查。

### Changed

- **服务工程结构统一**：`outbox-relay` 的 `main.go` 迁入 `cmd/server/`，与其余 5 个服务一致。
- **站点运维材料归位**：`beian-page/` → `deploy/site/`。
- **权威文档归位**：根 `TECHNICAL_ARCHITECTURE.md`（706 行）与 `DESIGN.md`（547 行）移入 `docs/`；
  修复 `docs/adr/*`、CI、`AGENTS.md` 中长期失效的 `docs/` 引用。
- `RunResult` 新增 `ProviderTaskID`；`engine.Run` / `RunAsync` 标记 `Deprecated`（向后兼容）。

### Fixed

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
