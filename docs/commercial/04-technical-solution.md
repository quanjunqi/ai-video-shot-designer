# 微服务技术架构

版本：1.0  
目标：支撑 API、本地 ComfyUI、云端算力三类执行线路，以及快速生成、工作流和漫剧三种创作方式。

## 1. 架构结论

采用“控制面、编排面、执行数据面”三层微服务架构：

```text
控制面：身份、项目、模型、资产、计费、社区和治理
编排面：Workflow、Execution Plan、Job、调度和事件
执行数据面：API Connector、Local ComfyUI Agent、Cloud Runner
```

核心设计不是让每个工作台直接适配不同模型，而是建立统一执行协议：

```text
Capability Request
  -> Model Resolution
  -> Adapter Compilation
  -> Route Selection
  -> Deployment Scheduling
  -> Execution
  -> Asset + Usage + Evidence
```

快速创作、工作流和漫剧只提交标准 Capability Request。新增 Provider、ComfyUI Workflow 或 GPU 集群时，不修改上层领域代码。

## 2. 架构原则

1. **领域边界优先**：按业务能力拆服务，不按数据库表拆服务。
2. **控制面与执行面分离**：控制面不运行重型推理，Runner 不持有业务数据库权限。
3. **服务拥有数据**：每个服务拥有自己的 Schema，禁止跨服务直接读表。
4. **同步查询、异步执行**：短查询走 REST/gRPC，任务和状态传播走事件。
5. **至少一次投递、业务幂等**：不假设消息只消费一次。
6. **版本不可变**：Workflow、Adapter、Artifact、Model Profile 发布后不可覆盖。
7. **Secret 不进入任务载荷**：执行时换取短期凭据。
8. **先定义逻辑微服务，再控制物理部署数量**：边界完整，但早期可合并低流量服务部署。

## 3. 总体架构

```text
Web / Desktop / Local Agent
          |
      CDN + WAF
          |
   API Gateway / BFF
          |
  +-------+---------------------------------------------------+
  |                       Control Plane                        |
  | IAM | Workspace | Project | Asset | Catalog | Billing     |
  | Review | Publication | Community | Audit | Notification   |
  +-------------------------------+----------------------------+
                                  |
                         Workflow Orchestrator
                                  |
              Execution Planner -> Job Service -> Scheduler
                                  |
        +-------------------------+-------------------------+
        |                         |                         |
  API Connector Pool      Local Agent Gateway       Cloud Fleet
  official/aggregator     outbound secure tunnel    K8s GPU pools
        |                         |                         |
 Provider APIs            User ComfyUI               Cloud ComfyUI /
                                                   inference container

Shared platform: Event Bus | Object Storage | Observability | Secret Store
```

## 4. 微服务清单与职责

### 4.1 Edge 层

#### API Gateway

- TLS、WAF、限流、请求大小控制和路由；
- 校验访问令牌并注入 Workspace Context；
- 外部 REST API 版本管理；
- 不承载业务编排。

#### Web BFF

- 面向 Vue Web 聚合页面数据；
- 将多个服务查询聚合为页面 ViewModel；
- SSE/WebSocket 事件订阅；
- 不直接访问服务数据库。

### 4.2 身份与租户域

#### IAM Service

- User、Session、OAuth、MFA、API Token；
- 可接入成熟 IdP，避免自研密码安全；
- 签发短期 JWT/opaque token。

#### Workspace Service

- Workspace、Membership、Role、Policy；
- 个人空间也是单成员 Workspace；
- 提供资源动作授权判断；
- 发送成员和策略变更事件。

### 4.3 创作与项目域

#### Project Service

- Project、Folder、Tag、ProjectMember；
- Quick Project 自动创建与升级；
- 项目归档、导出和删除编排；
- 不保存模型执行状态。

#### Professional Production Service

- 漫剧 Series、Episode、Scene、Shot、Unit、Take；
- 阶段 Gate、聚合状态和领域命令；
- 调用 Shot Designer Runtime 进行编译与校验；
- 保留 Shot / Unit / Take 不变量。

#### Review Service

- ReviewRequest、Assignment、Decision、Comment；
- 决定绑定 ArtifactVersion/Take 和内容哈希；
- 不能由 Job 成功事件自动批准。

### 4.4 工作流域

#### Workflow Definition Service

- Workflow、WorkflowDraft、WorkflowVersion；
- 节点、连接、变量、输入表单和输出声明；
- 步骤/批量/画布视图都读写同一 Draft；
- 发布时完成 Schema、环路、依赖和权限校验；
- WorkflowVersion 发布后不可变。

#### Workflow Orchestrator

- 建议采用 Temporal；
- 负责 WorkflowRun、步骤依赖、人工等待、超时、补偿和恢复；
- 只保存编排状态，不保存媒体文件；
- Activity 通过 Job Service 进入执行层；
- 长达小时或天的漫剧/云实例流程可跨服务重启恢复。

#### Execution Planner

- 将 WorkflowVersion + Run Input 编译为 ExecutionPlan；
- 解析模型、Adapter、线路策略和数据位置约束；
- 在执行前锁定版本、生成费用估算和依赖清单；
- Planner 输出不可变 Plan，重试不得静默更换模型版本。

### 4.5 模型与算力域

#### Capability Catalog Service

- 标准 Capability 及输入输出 JSON Schema；
- 参数语义、媒体限制、计量单位和安全等级；
- 对前端提供能力驱动表单元数据；
- Schema 使用语义化版本。

#### Model Registry Service

- Vendor、ModelFamily、ModelVersion、License、Lifecycle；
- 关联 Capability、性能基线、质量标签和弃用计划；
- 不保存 Provider Secret；
- 模型下线前发布 deprecation event。

#### Adapter Registry Service

- API Adapter 和 ComfyUI Adapter 的定义、版本与兼容矩阵；
- 将标准请求编译为 Provider Payload 或 ComfyUI Workflow JSON；
- 输出 Extractor 将结果转为标准 Asset Manifest；
- Adapter 发布必须通过契约和黄金样本测试。

#### Provider Integration Service

- API Endpoint、Webhook、限流和健康状态；
- Secret 只保存引用；
- 标准化提交、查询、取消、错误和用量；
- 每个 Provider Connector 以插件/独立进程隔离故障。

#### Compute Fleet Service

- Local Agent、Cloud Account、Cluster、NodePool、Deployment；
- GPU 型号、显存、区域、镜像、模型缓存和容量；
- Agent/Runner 注册、租约、心跳、隔离和版本升级；
- 管理云实例启动、预热、闲置回收和成本标签。

#### Routing & Scheduling Service

- 输入：Capability、ModelConstraint、Policy、DataPolicy、Quote、Queue、Health；
- 输出：Route + Deployment Reservation；
- 支持固定、平衡、最低成本、最快和隐私优先策略；
- 首版使用可解释规则和打分，不使用黑盒调度模型；
- 调度决定及其依据写入审计。

### 4.6 执行域

#### Job Service

- Job、JobAttempt、Lease、Progress、ExternalTaskRef；
- 幂等键、优先级、重试、取消、超时和死信；
- Job 状态是系统事实，不表示内容审批；
- 通过事件发布状态，不让客户端轮询各执行端。

#### API Connector Workers

- 消费 API 类 Job；
- 获取短期 Provider Secret；
- 提交、轮询或接收 Webhook；
- 原始响应进入受限对象存储，标准结果进入 Asset Service；
- Connector 不访问 Project/Workflow 数据库。

#### Local Agent Gateway

- 维持 Agent 主动发起的 mTLS WebSocket/gRPC 通道；
- 设备身份、在线状态、命令流和回执；
- 不把用户局域网 ComfyUI 暴露到公网；
- 大文件不穿过 Gateway，使用签名对象存储或受控直传。

#### Local ComfyUI Agent

- 运行在用户设备；
- 探测 ComfyUI、Python、GPU、节点和模型；
- 领取授权任务并把标准请求编译后的 Workflow 提交给本机 ComfyUI；
- 监听进度、取消任务、校验输出哈希；
- 维护允许目录和资源配额；
- 本地敏感资产可选择不上传，仅返回派生结果或元数据。

#### Cloud Runner Controller

- 运行在 Kubernetes 控制集群；
- 为 Job 选择热 Runner 或创建短生命周期 Runner；
- 注入只读模型缓存、临时工作卷和短期凭据；
- Runner 完成后上传结果、上报用量并清理；
- 支持 ComfyUI Runner 与原生推理 Runner 两种模板。

#### Cloud Runners

- 无状态或任务级有状态执行容器；
- 只能访问 Job 声明的输入和输出路径；
- 不持有平台数据库凭据；
- 节点包和镜像签名，禁止运行未允许的 ComfyUI 自定义节点；
- 定期报告 GPU、显存、队列和模型缓存。

### 4.7 资产与商业域

#### Asset Service

- MediaBlob、Asset、AssetVersion、LineageEdge；
- 签名上传/下载、哈希、MIME、尺寸、时长和可见范围；
- 对象存储事件校验文件完整性；
- 有引用版本采用软删除和延迟回收。

#### Metering Service

- 收集 Provider token、图片数、视频秒数、GPU 秒、存储和带宽；
- 去重 Usage Event；
- 保留供应商原始计量和平台标准计量。

#### Billing Service

- PriceBook、Quote、Reservation、LedgerEntry、Invoice；
- 生成前预占，完成后结算，失败释放或补偿；
- 不直接修改余额，使用不可变账本；
- 本地 ComfyUI 记录用量但不扣模型调用费。

#### Secret Service

- 封装 Vault/KMS；
- Provider Key、Cloud Credential、Webhook Secret；
- 只写、轮换、过期和访问审计；
- 执行端只获得短期动态凭据。

### 4.8 社区与平台支撑域

#### Publication Service

- PublicationSnapshot、DependencyManifest、LicensePolicy、RemixLineage；
- 发布前冻结版本并调用 DLP/权限检查；
- Remix 创建独立 Project/Workflow，不修改原快照。

#### Community Service

- 关注、收藏、评论、举报和作者主页；
- 不保存可变 Workflow 内容；
- Feed 只引用 PublicationSnapshot。

#### Search Service

- 基于 OpenSearch；
- 索引项目、资产、模型、工作流和公开内容；
- 私有索引查询必须携带 Workspace ACL Token。

#### Notification Service

- 站内、邮件和 Webhook；
- 只发送高信号事件：任务失败、审核、预算、Runner 离线和发布结果。

#### Audit Service

- 追加式安全审计；
- 记录主体、资源、动作、策略结果、前后版本和 Trace ID；
- 高风险操作写 WORM/不可变存储。

## 5. 三类执行线路协议

### 5.1 统一执行请求

```json
{
  "job_id": "job_xxx",
  "capability": "video.image_to_video@1",
  "model": {"id": "model_x", "version": "2026-08"},
  "adapter_version": "adapter_x@3.2.0",
  "inputs": [{"asset_version_id": "av_x", "role": "first_frame"}],
  "parameters": {"prompt": "...", "duration_sec": 5},
  "output_contract": {"mime": ["video/mp4"], "count": 2},
  "execution_policy": {"route": "auto", "max_cost": 12.0},
  "trace": {"workspace_id": "ws_x", "run_id": "run_x"}
}
```

真实消息中只放 Asset 引用和 Secret 引用，不放大文件、永久下载地址或明文密钥。

### 5.2 API 路线时序

```text
Job -> API Connector -> Secret Lease -> Provider Submit
    -> External Task ID -> Webhook/Poll -> Result Download
    -> Asset Commit -> Usage Commit -> Job Succeeded
```

要求：Webhook 签名与重放保护；稳定幂等键；外部任务 ID 唯一；超时后先查询再重提；Provider 错误映射为标准重试分类。

### 5.3 本地 ComfyUI 时序

```text
Job -> Scheduler reserves Local Agent
    -> Gateway command -> Agent dependency preflight
    -> signed input download / local asset mapping
    -> ComfyUI prompt queue -> progress events
    -> output validation -> upload/retain local
    -> Asset + Usage -> Job Succeeded
```

断线时 Job 进入 `WAITING_AGENT`，租约在宽限期内保留；Agent 重连后用 ComfyUI prompt id 查询，不重复提交。

### 5.4 云端算力时序

```text
Job -> Scheduler -> Capacity Reservation
    -> warm Runner or provision GPU instance
    -> model/workflow cache check -> execute
    -> output upload -> metering
    -> release reservation -> scale down when idle
```

启动实例和执行任务是两个独立 Job/状态机。实例创建失败不能被伪装为模型生成失败。

## 6. 工作流执行模型

### 6.1 定义与运行分离

- WorkflowDraft：可变协作草稿；
- WorkflowVersion：发布后不可变；
- ExecutionPlan：一次运行锁定的模型、Adapter 和路由约束；
- WorkflowRun：业务运行实例；
- Job：一个具体执行单元；
- JobAttempt：一次实际尝试。

### 6.2 节点类型

首版只提供经过治理的节点类型：Input、Capability、Transform（轻量平台函数）、Condition、Parallel、HumanApproval、Output、SubWorkflow。第三方任意代码节点不进入 SaaS MVP。

### 6.3 缓存

缓存键由 NodeVersion、AdapterVersion、规范化参数、输入 Asset 哈希和模型版本组成。随机生成默认不缓存；用户明确固定 Seed 且模型声明可复现时才允许结果复用。

### 6.4 人工等待

HumanApproval 由 Temporal Signal 恢复。审批事件包含用户、版本和哈希。等待期间不占用 Worker 或 GPU。

## 7. 数据与存储

| 数据类型 | 技术建议 | 原因 |
|---|---|---|
| 事务数据 | PostgreSQL，每服务独立 Schema/实例演进 | 强一致、约束和成熟运维 |
| 工作流编排 | Temporal Persistence（PostgreSQL） | 长流程恢复、Timer、Signal |
| 缓存/限流 | Redis Cluster | 短期状态，不作业务事实源 |
| 事件总线 | Kafka/Redpanda | 可回放事件和消费隔离 |
| 媒体文件 | S3 兼容对象存储 | 大文件、版本和生命周期 |
| 搜索 | OpenSearch | 多类型检索与公开内容索引 |
| 指标分析 | ClickHouse | Job/Usage/产品事件聚合 |
| Secret | Vault + 云 KMS | 动态凭据、轮换和审计 |

每个服务使用自己的迁移和 Repository。禁止通过共享 ORM Model 形成隐式耦合。

## 8. 事件设计

统一事件信封：

```json
{
  "event_id": "evt_x",
  "event_type": "job.succeeded.v1",
  "occurred_at": "2026-09-19T10:00:00Z",
  "producer": "job-service",
  "workspace_id": "ws_x",
  "aggregate_id": "job_x",
  "aggregate_version": 8,
  "trace_id": "tr_x",
  "payload": {}
}
```

关键事件：

- `workflow.version.published`
- `workflow.run.requested/completed/failed`
- `job.dispatched/progressed/succeeded/failed`
- `deployment.health.changed`
- `agent.connected/disconnected`
- `asset.version.created`
- `usage.recorded`
- `ledger.entry.posted`
- `take.adopted`
- `artifact.invalidated`
- `publication.published/remixed`

生产者使用 Transactional Outbox；消费者使用 Inbox/ProcessedEvent 去重。事件 Schema 放入 Registry 并做兼容检查。

## 9. 一致性与事务

- 单服务内使用数据库事务；
- 跨服务流程使用 Saga/Temporal Workflow；
- Quote -> Reservation -> Execution -> Usage -> Settlement 是可补偿事务；
- Asset Commit 成功后才能标记 Job Succeeded；
- Usage 去重键为 `job_attempt_id + meter_type + sequence`；
- Adopt Take 使用乐观锁和部分唯一索引，确保同一 Unit 只有一个 current adopted Take；
- 删除 Workspace 使用长事务编排，不同步级联所有服务。

## 10. API 与契约治理

- 外部 API：REST/JSON + OpenAPI；
- 内部低延迟调用：gRPC + Protobuf；
- 异步：Kafka + Schema Registry；
- 前端 API 由 OpenAPI 生成类型；
- Capability、Workflow Node、Adapter 使用 JSON Schema；
- 所有破坏性变化发布新版本，不原地修改；
- Consumer-driven contract test 进入 CI。

示例外部 API：

```text
POST /v1/generations:quote
POST /v1/generations
POST /v1/workflows/{id}/versions
POST /v1/workflow-versions/{id}/runs:quote
POST /v1/workflow-versions/{id}/runs
POST /v1/local-agents:pair
POST /v1/cloud-deployments
GET  /v1/capabilities/{id}/execution-options
POST /v1/jobs/{id}:cancel
POST /v1/takes/{id}:adopt
POST /v1/publications:preflight
```

## 11. 多租户与安全

- 每个访问令牌含 Workspace Context，服务端再次授权；
- 数据库表带 `workspace_id`，关键服务使用 PostgreSQL RLS 作为第二道防线；
- 对象存储按 Workspace 前缀与独立短期签名隔离；
- Local Agent 使用设备证书、mTLS、短期任务 Token；
- Cloud Runner 使用 Workload Identity，不分发静态云密钥；
- Provider Secret 只写，前端永不回显；
- ComfyUI 自定义节点使用允许列表、镜像签名和 SBOM；
- 上传进行类型、大小、恶意文件和内容安全检查；
- 日志默认不记录 Prompt 附件、Secret、签名 URL 和完整 Provider 响应；
- 高额执行、公开发布、正式批准和权限变更必须二次确认并审计。

## 12. 可观测性与 SRE

采用 OpenTelemetry，统一 Trace ID 贯穿：

```text
HTTP Request -> WorkflowRun -> Job -> JobAttempt
-> Provider/Agent/Runner -> AssetVersion -> UsageRecord -> LedgerEntry
```

核心 SLI：

- 控制面 API 可用性和 P95/P99；
- 任务排队、调度、执行和端到端时长；
- 三类线路的成功率、取消率和重试率；
- Local Agent 在线率和断线恢复率；
- 云 GPU 利用率、冷启动、缓存命中和闲置成本；
- Provider 限流、Webhook 延迟和价格偏差；
- 重复计费、孤立资产和未结算 Reservation；
- Take 采纳率和每个有效结果成本。

Beta SLO：控制面 99.9%；已接受任务不丢失；重复计费事件为 0；账本每日可对账；RPO 15 分钟，RTO 2 小时。

## 13. 部署拓扑

### 13.1 环境

- `dev`：本地依赖 + 共享开发集群；
- `staging`：与生产同拓扑、使用测试 Provider 和小型 GPU 池；
- `prod`：多可用区控制面、独立数据与执行集群。

### 13.2 Kubernetes

- Control Cluster：API、业务服务、Temporal Worker；
- CPU Worker Pool：Connector、轻量编译和后台任务；
- GPU Runner Pools：按 GPU 型号、区域和镜像划分；
- 独立 Namespace、NetworkPolicy、ResourceQuota 和 Pod Security；
- HPA/KEDA 根据 Kafka、Temporal 和 GPU 队列扩缩容。

### 13.3 灾备

- PostgreSQL PITR 与跨区备份；
- 对象存储版本和生命周期；
- Kafka Topic 复制与重放策略；
- Vault/KMS 备份和密钥恢复演练；
- Deployment/Model Cache 可重建，不作为唯一事实源。

## 14. 服务物理拆分策略

逻辑上保持上述边界，首期不需要启动二十多个独立团队。建议第一阶段形成 9 个部署单元：

1. `gateway-bff`
2. `identity-workspace`
3. `project-production`
4. `workflow-orchestrator`
5. `model-compute-control`
6. `job-scheduler`
7. `asset-service`
8. `metering-billing`
9. `publication-community`

执行端独立为 `api-connectors`、`local-agent-gateway`、`cloud-runner-controller` 和各类 Runner。随着吞吐、故障域或团队所有权变化，再按逻辑边界拆分，不允许先合并数据所有权再靠代码约定隔离。

## 15. 现有项目映射

| 现有项目 | 目标归属 | 处理方式 |
|---|---|---|
| `ai-worker` 模型与 Provider | model-compute-control / api-connectors | 提取接口，补版本、Secret、计量和可靠任务 |
| `ai-worker` 通用任务 | job-scheduler | 替换进程内执行，保留适配逻辑 |
| `ai-worker-frontend` 生成控件 | Web App 快速创作 | 组件拆分和能力驱动重构 |
| `ai-worker-frontend` DAG | Workflow 多视图中的画布视图 | 不作为默认唯一入口 |
| `ai-video-shot-designer` | project-production 的 Domain Runtime | Python 服务/Worker，版本化契约 |
| `depth-video-converter` | 当前范围外 | 不接入、不迁移、不作为 MVP 依赖 |

## 16. 技术选型建议

| 层 | 建议 |
|---|---|
| Web | Vue 3 + TypeScript + Pinia + Vue Router |
| Gateway/BFF | Go |
| 业务微服务 | Go，领域 Runtime 保留 Python |
| 编排 | Temporal |
| 事件 | Redpanda/Kafka + Schema Registry |
| 事务库 | PostgreSQL |
| 缓存 | Redis |
| 对象存储 | MinIO/OSS/S3 |
| 搜索 | OpenSearch |
| 分析 | ClickHouse |
| Secret | Vault + KMS |
| 平台 | Kubernetes + Helm + Argo CD |
| 观测 | OpenTelemetry + Prometheus + Grafana + Loki/Tempo |

技术选型可按团队能力替换，但服务边界、执行协议和数据所有权不能因工具变化而丢失。

## 17. 架构验收

- 同一 Capability Request 能通过 API、本地 ComfyUI 和云 Runner 中至少两条线路得到标准结果；
- WorkflowVersion 不变时，可以更换 Execution Policy 而不改节点定义；
- 任一控制面实例和 Worker 重启不会丢 Job；
- Local Agent 断线重连不会重复提交 ComfyUI Prompt；
- 云 Runner 失败可隔离 Deployment 并重新调度；
- Asset、Usage 和 Ledger 可从 JobAttempt 完整核对；
- 服务间没有跨库查询；
- 事件重复投递不会造成重复资产、重复采纳或重复扣费；
- Workspace 越权、Secret 回显和签名 URL 泄露测试通过；
- 漫剧领域规则不在多个服务中重复实现。
