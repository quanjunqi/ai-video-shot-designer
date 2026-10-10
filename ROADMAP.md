# 路线图（Roadmap）

> **这份文件只写能从仓库现状确证的内容**，并按「已交付 / 进行中 / 规划中」三段陈述。
> **不承诺时间表** —— 具体优先级、暂缓理由与**启动条件**以
> [docs/development/backlog.md](docs/development/backlog.md) 为唯一权威；本文件是面向外部读者的摘要。
>
> **发布状态**：仓库当前**尚无 git tag、无正式发布**。用户可见变更按合并时间倒序记录在
> [CHANGELOG.md](CHANGELOG.md)，条目尚在 `[Unreleased]` 下。

---

## 已交付（可从仓库现状验证）

### 平台底座

- **6 个微服务 + BFF 网关**：`workspace`（租户/成员/授权/渠道凭据）、`production`（项目/剧集/分镜/模型目录）、
  `execution`（Job 调度/模型网关/审计日志）、`asset`（资产上传/媒体校验）、`web-bff`（前端唯一入口）、
  `outbox-relay`（事务性消息投递）。每个服务拥有自己的一类事实，服务间不共享表。
- **模型聚合网关内置于 `execution`**（而非新建服务）：渠道 → 协议装配 → 上游 HTTP → 响应映射提取的
  真实链路已打通，所有模型调用写入 `gateway_audit_logs`。决策见 [ADR-001](docs/adr/001-model-gateway-architecture.md)。
- **协议定义以代码注册表为权威**：8 个内置接入方式（`pt_builtin_*`）由
  `services/production/internal/catalog/protocol_registry.go` 定义，DB 行优先可覆盖、缺失由注册表补齐。
  见 [ADR-007](docs/adr/007-protocol-registry.md)（**状态：提议**）。
  鉴权已改为数据驱动（`authHeader` + `authPrefix`），新增 header 形态无需改代码或加迁移。
- **迁移可执行、可校验**：`deploy/local/migrate.sh` 记录每个已应用迁移文件的校验和，改动已应用文件会被拒绝执行。
- **本地栈一键起**：`deploy/local/compose.yaml` 提供 PostgreSQL / Redis / Kafka / Schema Registry /
  Temporal / Temporal UI / Keycloak / MinIO，并含各服务独立数据库的初始化与迁移 job。
- **字段级 API 契约**：`openapi/`（含 `bff.yaml`）与本仓库代码同步维护。

### 前端

- **三大产品线**：漫剧工坊（`/comic/projects`）、无限画布（`/canvas`）、智能创造（`/create/image|video|audio`），
  对应 `apps/web/src/features/{comic,canvas,genworkbench,rules,settings,home}`。
- Vite 8 + React 19 + TypeScript 5.9 + Tailwind CSS 4 + React Router + Zustand。
- **前端交付质量门禁**已固化为可执行纪律：`npm run gate` = typecheck + ESLint + `scripts/quality-gate.mjs`，
  配套规则库 R-* 与反例库，见 [docs/development/frontend-quality-gate.md](docs/development/frontend-quality-gate.md)。

### 工程治理

- **CI 按改动范围执行**（`.github/scripts/detect-changes.sh`），各线只跑自己动过的服务/前端；
  **必需检查始终上报**，不因跳过而缺失。
- **覆盖率棘轮**：不得低于 `.github/coverage-baseline.txt` 的下限。
- **架构决策记录（ADR）机制**：已有 ADR-001 至 ADR-007 七份记录，索引见 [docs/adr/](docs/adr/)。
- **架构图集**：C4 / 时序 / ER / 状态机 / 部署，见 [docs/architecture/](docs/architecture/)。
- **文档按受众分区**并提供唯一索引：[docs/README.md](docs/README.md)。

---

## 进行中

> 判定依据：`docs/development/backlog.md` 中标记为**已启动**，且仓库内已有对应任务卡（`.github/tasks/`）的项。

- **智能创造（三工作台）UI 重构**（backlog #2，已启动）：分片任务卡为
  `.github/tasks/TASK-CREATE-001..006`。本轮范围是**只重构 composer，并对未接入执行链路的缺口如实标注**。
  其依据 [ADR-006](docs/adr/006-smart-creation-workbench.md) **尚为「提议」状态**。
- **路由层落地**（ADR-003）：任务卡 `TASK-ROUTE-001`、`TASK-ROUTE-002`。
- **接入方式 / 协议注册表落地**（ADR-007）：后端注册表与鉴权数据驱动已交付，
  余下能力声明（`capabilities`）补全仍在推进（backlog #10）。
- **设置中心 IA 改版**（ADR-005，**状态：提议**）：导航收敛与供给池可见性规则按任务卡推进。
- **任务中心与 Worker 可靠性**：`TASK-OBS-001`、`TASK-INFRA-003`。

---

## 规划中（已识别、暂缓，附启动条件）

> 本节只列标题；**为什么暂缓、什么条件才启动**以
> [docs/development/backlog.md](docs/development/backlog.md) 为准，此处不复制其内容。

| # | 项 | 一句话 |
|---|---|---|
| 1 | 无限画布（React Flow） | 节点即模型调用，依赖网关可用 + 调研 + ADR 定稿 |
| 3 | 项目知识库（道具/场景建表、镜头语言库/风格库接后端） | 相关 store 目前 0 个 API 调用 |
| 4 | 生成产物落盘到 MinIO | 上游结果 URL 有效期短，是"生成成功但图打不开"的根因；**建议提前做** |
| 5 | AutoDL 云端 ComfyUI 接入 | 前置已就绪，待提供 workflow 示例 |
| 6 | 媒体处理（缩略图/转码/时长/封面/EXIF） | 必须有产物落盘（#4）才有输入 |
| 7 | Agent 双入口（Skill 接口） | 战略项，需底座提供稳定能力面 |
| 8 | 可观测性 / 测试分层 / 前端首屏 | 阶段 3，底座与主要功能稳定后 |
| 9 | 音频模型类型缺口 | 需 Owner 决定是否扩展 `model_catalog.type` 枚举 |
| 10 | 补齐其余内置协议模板的 `capabilities` | 当前仅 2/9 有声明 |
| 11 | `capability` 表达力不足（无条件支持、无比例/档位清单） | 随 ADR-006 D3-B 一起做 |
| 12 | 积分账本（credits ledger） | 当前无账本，UI 只做口径声明，不假装已退款 |
| 13 | 取消语义未区分 queued / running | 需与计费口径绑定 |
| 14 | 生成结果写回链路缺失 | 任务 succeeded 也没有产物地址，前端只能显示占位图 |
| 15 | 任务无删除接口 | 需要软删除/归档语义（含审计留痕） |

---

## 明确不在当前范围

- **不宣称已具备生产交付能力**：[docs/architecture/00-technical-architecture.md](docs/architecture/00-technical-architecture.md)
  §1.2「当前已完成与尚未完成的边界」已逐项列明**仍未完成**的能力（真实 OIDC 会话与多租户身份、
  Temporal 业务 Workflow、Go Director Worker、Catalog Service、Projection/SSE、Provider/ComfyUI 执行面、
  媒体扫描与转码、生产级迁移历史、HA/备份恢复、完整漫剧工坊业务闭环）。
  其中 Execution 与 Asset 已交付**首版真实闭环**，但明确**不是生产级**。
- **架构决策的效力边界**：仅 [ADR-001](docs/adr/001-model-gateway-architecture.md)、
  [ADR-002](docs/adr/002-project-character-library.md)（已接受）与
  [ADR-003](docs/adr/003-model-routing-layer.md)、[ADR-004](docs/adr/004-relay-supply-pool.md)（已确认）
  是已定决策；**ADR-005 / 006 / 007 仍为「提议」**（待 Owner 确认），不作为实现依据。
  状态含义与编号规则见 [docs/README.md](docs/README.md)。
- **不承诺时间表与版本号**：仓库无 tag，首次正式发布时由维护者定义版本策略与发布流程
  （见 [docs/development/release.md](docs/development/release.md)）。
