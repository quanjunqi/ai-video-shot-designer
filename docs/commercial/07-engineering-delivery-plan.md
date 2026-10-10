# 软件工程实施与治理

## 1. 实施目标

本计划把微服务架构落到仓库、契约、环境、测试、发布和团队协作中。目标不是一次性拆出所有服务，而是从第一天建立清晰所有权和可演进边界。

## 2. 建议仓库策略

早期建议采用平台 Monorepo + 独立 Runtime/Agent 仓库：

```text
platform/
  apps/web
  services/gateway-bff
  services/identity-workspace
  services/project-production
  services/workflow-orchestrator
  services/model-compute-control
  services/job-scheduler
  services/asset-service
  services/metering-billing
  services/publication-community
  packages/contracts
  packages/go-sdk
  packages/ts-sdk
  deploy/helm
  deploy/terraform

shot-designer-runtime/
local-comfyui-agent/
cloud-runner-images/
```

Monorepo 便于统一契约、依赖升级和本地环境；Local Agent、领域 Runtime 和 Runner 镜像有不同发布周期与安全边界，保持独立更合理。

## 3. 服务模板

所有服务使用统一模板：

- `/cmd` 启动入口；
- `/internal/domain` 领域模型；
- `/internal/app` Use Case；
- `/internal/adapters` 数据库、消息和外部系统；
- `/api` OpenAPI/Protobuf/事件 Schema；
- `/migrations` 数据库迁移；
- `/tests` 契约、集成和夹具；
- `/deploy` Helm values；
- 标准健康检查、指标、Trace、日志和优雅退出。

禁止多个服务复制 Provider DTO、Capability Schema 和事件结构，公共契约由生成代码分发。

## 4. 分支与版本

- 主干开发，短生命周期分支；
- 保护 `main`，PR 必须通过测试、静态检查、Secret 扫描和契约兼容检查；
- 服务镜像使用 Git SHA + SemVer 发布标签；
- Workflow/Adapter/Capability 使用独立语义版本；
- 数据库迁移只前进，回滚使用补偿迁移；
- Feature Flag 控制未完成能力，不维护长期分支。

## 5. CI 流水线

每个 PR：

1. 格式化、lint、类型检查；
2. 单元测试和现有 Shot Designer 110 项回归；
3. OpenAPI/Protobuf/事件 Schema 兼容检查；
4. Consumer contract test；
5. 数据库迁移验证；
6. SAST、依赖漏洞、许可证和 Secret 扫描；
7. 构建 SBOM 和签名镜像；
8. 受影响服务的集成测试；
9. 前端关键流程组件测试。

合并后：部署临时环境，运行三类线路的沙箱/模拟 E2E。真实付费模型测试需要显式标签和预算上限。

## 6. CD 与发布

- Argo CD 管理环境期望状态；
- 数据库迁移先于兼容服务版本执行；
- 服务默认滚动/金丝雀发布；
- Job Scheduler、Billing 等核心服务使用小流量金丝雀并监控不变量；
- Adapter 和模型配置先发布到 Staging，完成黄金样本后逐步开放 Workspace；
- Local Agent 支持 N/N-1 两个协议版本并签名自动升级；
- Runner 镜像按摘要固定，运行中的 Job 不跟随 latest。

## 7. 测试金字塔

| 层级 | 覆盖重点 |
|---|---|
| 单元测试 | 状态机、路由评分、计价、权限和领域不变量 |
| 契约测试 | REST、gRPC、事件、Capability、Adapter |
| 集成测试 | PostgreSQL、Kafka、Temporal、S3、Vault |
| Adapter 测试 | Provider/ComfyUI 黄金输入输出和错误分类 |
| E2E | 图片、视频、工作流、漫剧、三类执行线路 |
| 故障测试 | 重启、断网、重复消息、Webhook 重放、GPU 故障 |
| 安全测试 | 越权、SSRF、上传、Secret、Agent 和供应链 |
| 性能测试 | 提交吞吐、事件积压、调度延迟和大文件并发 |

## 8. 必须持续检查的不变量

- 一个 Job 的相同幂等键只产生一个有效业务结果；
- 一个 Usage Event 只结算一次；
- 一个 Unit 同时只有一个 current adopted Take；
- 未完成 Asset Commit 的 Job 不能是 Succeeded；
- Secret 不出现在 API 响应、事件、日志和工作流快照；
- Runner 不能访问未授权 Asset；
- WorkflowVersion 发布后不可修改；
- 删除或失效上游只影响真实依赖的下游；
- 跨 Workspace 外键和事件引用被拒绝。

## 9. 本地开发环境

使用 Docker Compose/Dev Container 提供 PostgreSQL、Redis、Redpanda、Temporal、MinIO、Vault Dev 和 OpenTelemetry Collector。Provider 和 GPU 使用模拟器；开发者可选连接自己的 Local ComfyUI Agent。

一条命令应完成：生成契约代码、运行迁移、启动依赖、加载测试模型目录和执行核心冒烟。

## 10. 环境与配置

- 配置与 Secret 分离；
- 非敏感配置用 GitOps，Secret 用 Vault/KMS；
- 每个服务有明确配置 Schema 和启动校验；
- 禁止使用仓库内 `config.yaml` 保存真实凭据；
- Workspace 自带 Key 存独立 Secret Scope；
- Provider、Adapter 和价格配置都带版本与生效时间。

## 11. 数据库治理

- 每个服务独立数据库用户和 Schema；
- 禁止跨 Schema Join；
- 所有迁移在生产数据副本演练；
- 大表变更使用 expand/migrate/contract；
- Outbox 与业务写入同事务；
- 账本和审计表只追加；
- 定期进行恢复演练和数据一致性核对。

## 12. 事件治理

- Topic 按领域而非单个事件划分；
- 事件拥有者、保留期、PII 分类和消费者登记；
- Schema Registry 拒绝不兼容变更；
- 消费失败进入重试 Topic 和 DLQ；
- DLQ 必须有负责人、告警和回放工具；
- 禁止把数据库整行或 Secret 放入事件。

## 13. 团队所有权

建议三个工程小组：

| 小组 | 所有权 |
|---|---|
| Platform & Compute | 模型、Adapter、三类线路、Job、调度和 Agent |
| Creation & Workflow | 快速创作、Workflow、Asset、Web 和社区 |
| Professional Production | 漫剧领域 Runtime、Project、Review 和交付 |

IAM、Billing、SRE 与安全早期由 Platform 负责，但代码所有权和评审人必须明确。每个服务有 on-call、SLO、Runbook 和架构决策记录。

## 14. 里程碑

### M0：工程基线（2 周）

- 轮换现有明文 Secret；
- 建立 Monorepo 骨架、服务模板、CI 和本地依赖；
- 冻结 Capability、Job、Asset 和 Usage v1 契约；
- 建立 OpenTelemetry 和基础 Dashboard。

### M1：模型与 API 路线（4 周）

- Capability/Model/Adapter Registry；
- API Connector SDK；
- Job、Asset、Metering 和 Quote 闭环；
- 图片与视频快速生成工作台；
- 至少两个 Provider Adapter。

### M2：Local ComfyUI（4 周）

- Local Agent、设备配对和安全通道；
- Workflow JSON Adapter、依赖预检和文件传输；
- 断线恢复、取消、升级和本地用量；
- 快速创作可选择本地线路。

### M3：Cloud Compute（4-6 周）

- Compute Fleet、Runner Controller 和 GPU NodePool；
- 镜像/模型缓存、调度、租约和闲置回收；
- 任务成本分摊和线路降级；
- 容量、故障和安全演练。

### M4：Workflow 与漫剧（6-8 周，可部分并行）

- Workflow Definition + Temporal Orchestrator；
- 步骤/批量/画布三视图；
- Shot Designer Runtime 服务化；
- Shot / Unit / Take、审核、stale 和交付。

### M5：社区与商业 Beta（4 周）

- Publication Snapshot、Remix、DLP 和治理；
- 席位、钱包、配额和运营后台；
- 封闭客户迁移、压测和灾备演练。

## 15. Definition of Done

一项能力只有在以下条件全部满足后才算完成：

- PRD 验收场景通过；
- API/事件/Schema 文档已生成；
- 单元、契约和必要 E2E 测试通过；
- 指标、日志、Trace 和告警可用；
- 权限、Secret、数据分类和威胁模型已检查；
- 失败、取消、重试和回滚路径已验证；
- 成本计量和预算边界已验证；
- Runbook、Dashboard 和值班所有者已确定；
- 用户文案和空/错/加载状态已完成。
