# 路线图（Roadmap）

> 本文件只写能从仓库现状确证的内容，按「已交付 / 进行中 / 规划中」三段陈述。
> **不承诺时间表** —— 每项附启动条件；条件满足即开工。
>
> **发布状态**：仓库当前尚无 git tag、无正式发布。用户可见变更按合并时间倒序记录在
> [CHANGELOG.md](CHANGELOG.md)，条目尚在 `[Unreleased]` 下。

---

## 已交付（可从仓库现状验证）

### 平台底座

- **6 个微服务 + BFF 网关**：`workspace`（租户/成员/授权/渠道凭据）、`production`（项目/剧集/分镜/模型目录）、
  `execution`（Job 调度/模型网关/审计日志）、`asset`（资产上传/媒体校验）、`web-bff`（前端唯一入口）、
  `outbox-relay`（事务性消息投递）。每个服务拥有自己的一类事实，服务间不共享表。
- **模型聚合网关内置于 `execution`**：渠道 → 协议装配 → 上游 HTTP → 响应映射提取的真实链路已打通，
  所有模型调用写入 `gateway_audit_logs`。决策见 [ADR：模型网关架构](docs/adr/model-gateway-architecture.md)。
- **协议定义以代码注册表为权威**：8 个内置接入方式由 `services/production/internal/catalog/protocol_registry.go`
  定义，DB 行优先可覆盖。鉴权已改为数据驱动（`authHeader` + `authPrefix`）。
- **迁移可执行、可校验**：`deploy/local/migrate.sh` 记录每个已应用迁移文件的校验和。
- **本地栈一键起**：`deploy/local/compose.yaml` 提供 PostgreSQL / Redis / Kafka / Temporal / Keycloak / MinIO。
- **字段级 API 契约**：`openapi/` 与本仓库代码同步维护。

### 前端

- **三大产品线**：漫剧工坊（`/comic/projects`）、无限画布（`/canvas`）、智能创造（`/create/image|video|audio`）。
- Vite 8 + React 19 + TypeScript 5.9 + Tailwind CSS 4 + React Router + Zustand。
- **前端交付质量门禁**：`npm run gate` = typecheck + ESLint + `scripts/quality-gate.mjs`，
  规则库见 `.agents/skills/frontend-quality/rules.md`。

### 工程治理

- **CI 按改动范围执行**：各线只跑自己动过的服务/前端；必需检查始终上报。
- **覆盖率棘轮**：不得低于 `.github/coverage-baseline.txt` 的下限。
- **架构决策记录（ADR）机制**：已有一份模板 + 九份决策记录，索引见 [docs/adr/](docs/adr/)。
- **架构图集**：C4 / 时序 / ER / 状态机 / 部署，见 [docs/architecture/](docs/architecture/)。
- **文档按受众分区**并提供唯一索引：[docs/README.md](docs/README.md)。

---

## 进行中

- **智能创造（三工作台）UI 重构**：只重构 composer，对未接入执行链路的缺口如实标注。
  依据 [ADR：智能创作信息架构](docs/adr/smart-creation-workbench.md)。
- **路由层落地**：[ADR：模型路由层](docs/adr/model-routing-layer.md)。
- **接入方式 / 协议注册表落地**：[ADR：协议注册表](docs/adr/protocol-registry.md)。
- **设置中心 IA 改版**：[ADR：设置中心信息架构](docs/adr/settings-information-architecture.md)。
- **任务中心与 Worker 可靠性**。

---

## 规划中（含启动条件）

| # | 项 | 为什么暂缓 | 启动条件 |
|---|---|---|---|
| 1 | 无限画布（React Flow） | 节点都是模型调用，引用的是会失效的上游 URL | 模型网关可用 + 画布调研完成 + ADR 定稿 |
| 2 | 项目知识库（道具/场景建表 + 镜头/风格库接后端） | 优先级低于底座 | 底座就绪后可立即开工（技术不依赖底座） |
| 3 | 生成产物落盘 MinIO | 上游结果 URL 有效期短（可灵 30 天清理、Vidu 24 小时过期），"生成成功但图打不开"是通病 | **建议提前做**：execution 成功后写入 asset，或前端下载后经 asset 上传 |
| 4 | AutoDL 云端 ComfyUI 接入 | 前置已就绪，依赖底座 | 底座可用 + 提供 `workflow_id` 与工作流入参示例 |
| 5 | 媒体处理（缩略图/转码/时长/封面/EXIF） | 必须有产物落盘才有输入 | #3 完成 |
| 6 | Agent 双入口（Skill 接口） | 战略项，需底座提供稳定能力面 | 底座稳定 + 单独调研 |
| 7 | 可观测性 / 测试分层 / 前端首屏 | 阶段 3 | 底座与主要功能稳定 |
| 8 | 音频模型类型缺口 | `model_catalog.type` 枚举无 `audio`，音频模型无法入库执行 | Owner 决定是否扩展枚举（需迁移 + 适配器） |
| 9 | 补齐协议模板 `capabilities` 声明 | 仅 2/9 有声明，空表单无法由能力生成 | 补齐 7 个模板的能力声明 |
| 10 | `capability` 表达力不足（无条件支持、无档位清单） | 只能表达支持/不支持 | 追加 `aspectRatios[]`、`qualityOptions[]` 字段 |
| 11 | 积分账本（credits ledger） | 无账本，无法扣费/退回/明细 | 账本设计定稿；在此之前 UI 只做预估展示并如实声明 |
| 12 | 取消语义未区分 queued / running | 与计费口径绑定 | 与 #11 一起做 |
| 13 | 生成结果写回链路缺失 | 任务 succeeded 也没有产物地址 | worker 写回 `intent_payload.result`，最好同时落 asset/MinIO（#3） |
| 14 | 任务无删除接口 | 需软删除/归档语义（含审计留痕） | 与 #11/#12 同批评估 |
| 15 | 无限画布/智能创造的产物进漫剧候选 | 执行结果未归 Asset | #3 + #13 完成后 |

---

## 明确不在当前范围

- **本地 ComfyUI 执行器**：不支持，只接入云端 GPU 算力。
- **不宣称已具备生产交付能力**：OIDC 会话、Temporal 业务 Workflow、生产级 HA、媒体扫描转码、
  完整漫剧工坊业务闭环等仍未完成，详见
  [技术架构文档](docs/architecture/technical-architecture.md) §1.2。
- **架构决策效力边界**：ADR-001/002 已接受，003/004 已确认；005/006/007/008 状态见
  [docs/adr/](docs/adr/) 索引。
- **不承诺时间表与版本号**：首次正式发布时由维护者定义版本策略（见
  [docs/how-to/release.md](docs/how-to/release.md)）。
