# 文档索引

> 本目录按 Diátaxis 框架组织：**getting-started**（学东西）、**how-to**（做事情）、**reference**（查事实）、**explanation**（理解概念）。

## 我想…

| 我想… | 从这里进 |
|---|---|
| **我要跑起来** | 仓库根 [README.md](../README.md) 的「快速开始」→ [getting-started/local-setup.md](getting-started/local-setup.md) |
| **我要写代码、提 PR** | [getting-started/first-pr.md](getting-started/first-pr.md) + [../CONTRIBUTING.md](../CONTRIBUTING.md) |
| **我要发版 / 运维** | [how-to/release.md](how-to/release.md)、[how-to/observability.md](how-to/observability.md)、[how-to/ci.md](how-to/ci.md) |
| **我要查架构、数据、端口** | [architecture/](architecture/)（文字权威是 [technical-architecture.md](architecture/technical-architecture.md)） |
| **我要了解产品设计** | [product/design.md](product/design.md) |
| **我想知道某个决策为什么这么定** | [adr/](adr/) |

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
| [how-to/ci.md](how-to/ci.md) | CI 怎么工作、红了怎么排查 |
| [how-to/release.md](how-to/release.md) | 版本发布、回滚、热修 |
| [how-to/observability.md](how-to/observability.md) | 日志 / 健康检查规范 |
| [how-to/branch-protection.md](how-to/branch-protection.md) | 分支模型与保护规则 |
| [how-to/parallel-work.md](how-to/parallel-work.md) | 多开发线并行工作流 |

---

## reference/ — 机械事实

| 文件 | 内容 |
|---|---|
| [reference/environment.md](reference/environment.md) | 环境变量 + 端口（应用服务 + 基础设施） |

---

## explanation/ — 概念解释

| 文件 | 内容 |
|---|---|
| [explanation/service-boundaries.md](explanation/service-boundaries.md) | 为什么是 6 个微服务？ |
| [explanation/supply-pool.md](explanation/supply-pool.md) | 什么是供给池？ |

---

## architecture/ — 技术架构

**用途**：服务边界、数据归属、状态流转、部署形态。

| 文件 | 内容 |
|---|---|
| [architecture/technical-architecture.md](architecture/technical-architecture.md) | 技术架构（**文字权威**） |
| [architecture/c4-context-container.md](architecture/c4-context-container.md) | C4 Context + Container |
| [architecture/key-sequences.md](architecture/key-sequences.md) | 关键链路时序图 |
| [architecture/data-model.md](architecture/data-model.md) | ER 图（分库与表关系） |
| [architecture/state-machines.md](architecture/state-machines.md) | 状态机 |
| [architecture/deployment.md](architecture/deployment.md) | 部署拓扑 |

---

## adr/ — 架构决策记录

**用途**：记录"做错了代价很大"的决策及其理由。编号↔文件映射见 [adr/README.md](adr/README.md)。

| ADR | 标题 | 状态 |
|---|---|---|
| [adr/model-gateway-architecture.md](adr/model-gateway-architecture.md) | 001 · 模型聚合网关架构 | 已接受 |
| [adr/project-character-library.md](adr/project-character-library.md) | 002 · 项目级角色库作为唯一事实源 | 已接受 |
| [adr/model-routing-layer.md](adr/model-routing-layer.md) | 003 · 路由层 | 已确认 |
| [adr/relay-supply-pool.md](adr/relay-supply-pool.md) | 004 · 中转站接入与供给池设计 | 已确认 |
| [adr/settings-information-architecture.md](adr/settings-information-architecture.md) | 005 · 设置中心 IA 重设计 | 提议 |
| [adr/smart-creation-workbench.md](adr/smart-creation-workbench.md) | 006 · 智能创作信息架构 | 提议 |
| [adr/protocol-registry.md](adr/protocol-registry.md) | 007 · 协议注册表 | 提议 |
| [adr/protocol-docs-alignment.md](adr/protocol-docs-alignment.md) | 008 · 协议配置与上游文档对齐 | 已接受 |
| [adr/workspace-scoped-supply-pool.md](adr/workspace-scoped-supply-pool.md) | 009 · 租户级供给池 | 提议 |

---

## product/ — 产品与设计规范

| 文件 | 内容 |
|---|---|
| [product/design.md](product/design.md) | 产品边界与设计规范 |

> 前端交付质量门禁（R-* 规则库、六步硬门禁）是给 AI 的执行规则，位于
> `.agents/skills/frontend-quality/rules.md`，不在人类文档目录。

---

## 命名规范

| 位置 | 规则 | 示例 |
|---|---|---|
| 根目录 | 固定大写名 | `README.md`、`CONTRIBUTING.md` |
| 普通文档目录 | `kebab-case.md`，无数字前缀 | `local-setup.md`、`run-tests.md` |
| `adr/` | 语义名 + 头部 `编号：NNN` 字段 | `model-routing-layer.md`（编号：003） |
| `architecture/` | 语义名，无数字前缀 | `technical-architecture.md` |
| 目录索引 | 一律 `README.md` | — |

## 相关文档（仓库根）

| 文件 | 定位 |
|---|---|
| [../README.md](../README.md) | 项目介绍与快速开始 |
| [../ROADMAP.md](../ROADMAP.md) | 路线图（已交付 / 进行中 / 规划中） |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | 参与贡献入口 |
| [../SECURITY.md](../SECURITY.md) | 安全策略 |
| [../CHANGELOG.md](../CHANGELOG.md) | 变更记录 |
| [../AGENTS.md](../AGENTS.md) | AI Agent 快速上手指南 |
