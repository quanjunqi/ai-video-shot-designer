# 文档索引

> 本目录按 Diátaxis 框架组织：**tutorials**（学东西）、**how-to**（做事情）、**reference**（查事实）、**explanation**（理解概念）。

## 我想…

| 我想… | 从这里进 |
|---|---|
| **我要跑起来** | 仓库根 [README.md](../README.md) 的「快速开始」 |
| **我要写代码、提 PR** | [how-to/](how-to/) + [../CONTRIBUTING.md](../CONTRIBUTING.md) + [adr/](adr/) |
| **我要发版 / 运维** | [how-to/release.md](how-to/release.md)、[how-to/observability.md](how-to/observability.md)、[how-to/ci.md](how-to/ci.md) |
| **我要查架构、数据、端口** | [architecture/](architecture/)（文字权威是 [00-technical-architecture.md](architecture/00-technical-architecture.md)） |
| **我要了解产品设计** | [product/design.md](product/design.md) |

---

## getting-started/ — 新手教程

| 文件 | 内容 |
|---|---|
| [getting-started/local-setup.md](getting-started/local-setup.md) | 从零跑起来：装依赖、起服务、验证 |
| [getting-started/first-pr.md](getting-started/first-pr.md) | 提交第一个 PR 的完整流程 |

---

## how-to/ — 操作指南（任务导向）

> "我要做 X" → 从这里找。

| 文件 | 做什么 |
|---|---|
| [how-to/run-tests.md](how-to/run-tests.md) | 怎么跑测试、覆盖率要求 |
| [how-to/ci.md](how-to/ci.md) | CI 结构与核心不变量 |
| [how-to/release.md](how-to/release.md) | 版本发布、回滚、热修 |
| [how-to/observability.md](how-to/observability.md) | 日志 / 指标 / 追踪 / 健康检查 |
| [how-to/branch-protection.md](how-to/branch-protection.md) | 分支保护规则 |
| [how-to/parallel-work.md](how-to/parallel-work.md) | 多开发线并行工作流 |
| [how-to/backlog.md](how-to/backlog.md) | 待办清单（暂缓项 + 启动条件） |

---

## architecture/ — 技术架构

**用途**：服务边界、数据归属、状态流转、部署形态。

| 文件 | 内容 |
|---|---|
| [architecture/00-technical-architecture.md](architecture/00-technical-architecture.md) | 技术架构（**文字权威**） |
| [architecture/01-c4-context-container.md](architecture/01-c4-context-container.md) | C4 Context + Container |
| [architecture/02-key-sequences.md](architecture/02-key-sequences.md) | 关键链路时序图 |
| [architecture/03-data-model.md](architecture/03-data-model.md) | ER 图（分库与表关系） |
| [architecture/04-state-machines.md](architecture/04-state-machines.md) | 状态机 |
| [architecture/05-deployment.md](architecture/05-deployment.md) | 部署拓扑 |
| [architecture/README.md](architecture/README.md) | 图集索引 |

---

## adr/ — 架构决策记录

**用途**：记录"做错了代价很大"的决策及其理由。

| ADR | 标题 | 状态 |
|---|---|---|
| [adr/000-template.md](adr/000-template.md) | 模板 | — |
| [adr/001-model-gateway-architecture.md](adr/001-model-gateway-architecture.md) | 模型聚合网关架构 | 已接受 |
| [adr/002-project-character-library.md](adr/002-project-character-library.md) | 项目级角色库作为唯一事实源 | 已接受 |
| [adr/003-model-routing-layer.md](adr/003-model-routing-layer.md) | 路由层 | 已确认 |
| [adr/004-relay-supply-pool.md](adr/004-relay-supply-pool.md) | 中转站接入与供给池设计 | 已确认 |
| [adr/005-settings-information-architecture.md](adr/005-settings-information-architecture.md) | 设置中心 IA 重设计 | 提议 |
| [adr/006-smart-creation-workbench.md](adr/006-smart-creation-workbench.md) | 智能创作信息架构 | 提议 |
| [adr/007-protocol-registry.md](adr/007-protocol-registry.md) | 协议注册表 | 提议 |

---

## product/ — 产品与设计规范

| 文件 | 内容 |
|---|---|
| [product/design.md](product/design.md) | 产品与设计规范 |
| [product/frontend-design-rules.md](product/frontend-design-rules.md) | 前端交付质量门禁（R-* 规则库） |

---

## reference/ — 机械事实

| 文件 | 内容 |
|---|---|
| [reference/configuration.md](reference/configuration.md) | 全部环境变量（按服务分组） |
| [reference/ports.md](reference/ports.md) | 端口表（应用服务 + 基础设施） |

---

## explanation/ — 概念解释

| 文件 | 内容 |
|---|---|
| [explanation/service-boundaries.md](explanation/service-boundaries.md) | 为什么是 6 个微服务？ |
| [explanation/supply-pool.md](explanation/supply-pool.md) | 什么是供给池？ |

---

## 相关文档（仓库根）

| 文件 | 定位 |
|---|---|
| [../README.md](../README.md) | 项目介绍与快速开始 |
| [../ROADMAP.md](../ROADMAP.md) | 对外路线图 |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | 参与贡献入口 |
| [../SECURITY.md](../SECURITY.md) | 安全策略 |
| [../CHANGELOG.md](../CHANGELOG.md) | 变更记录 |
| [../AGENTS.md](../AGENTS.md) | AI Agent 快速上手指南 |
