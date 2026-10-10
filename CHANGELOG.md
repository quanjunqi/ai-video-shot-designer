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

### Changed

- **服务工程结构统一**：`outbox-relay` 的 `main.go` 迁入 `cmd/server/`，与其余 5 个服务一致。
- **站点运维材料归位**：`beian-page/` → `deploy/site/`。
- **权威文档归位**：根 `TECHNICAL_ARCHITECTURE.md`（706 行）与 `DESIGN.md`（547 行）移入 `docs/`；
  修复 `docs/adr/*`、CI、`AGENTS.md` 中长期失效的 `docs/` 引用。
- `RunResult` 新增 `ProviderTaskID`；`engine.Run` / `RunAsync` 标记 `Deprecated`（向后兼容）。

### Fixed

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
- **迁移并非全部幂等 → compose 重复 up 会失败**：`006_catalog_response_params.sql` 与
  `workspace/004` 的 `ADD COLUMN` 缺 `IF NOT EXISTS`、`production/011` 的 `DROP CONSTRAINT`
  无守卫。compose 的 migrate job 每次 up 都重跑全部迁移（无版本跟踪），
  **实测第二次执行在 006 报 `column "response_params" ... already exists`**。
  根治办法是让执行器改为版本跟踪（`schema_migrations` 表）。见 `.github/tasks/TASK-FIX-001` 附表。
- **审计写入失败被静默忽略**：`_ = h.AuditStore.Insert(...)` 与「审计日志不异步丢失」冲突。
- **状态跃迁未校验**：`022`/`023` 只保证状态**取值**合法，不保证**跃迁**合法
  （如 `archived → parsing` 仍会被允许）；且 `project.Update` 的 `sets` 不含 `status`，
  项目状态仍无法由 API 推进。需在服务层实现（含权限与审计）。
- **中间件未接入**：Redis / Kafka / Temporal / Keycloak 容器已提供但业务代码零接入。
- **信任模型仅适用于本地开发**：浏览器到 BFF 无真实身份校验（无 OIDC），
  服务间使用静态共享令牌。
- **可观测性缺失**：无指标、无追踪；日志混用 `log` 与 `slog`；仅 1 个健康端点。
- **测试覆盖薄弱**：前端仅 1 个测试文件（3 用例）；CI 覆盖率无阈值。

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
