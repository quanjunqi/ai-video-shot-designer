# 文档索引

> **这份目录按「受众」分区**：先确认你是谁，再进对应目录。本文件是 `docs/` 的**唯一索引入口**。

## 这份目录怎么用

| 我想… | 从这里进 |
|---|---|
| **我要用**（跑起来、看功能） | 仓库根 [README.md](../README.md) 的「快速开始」；产品边界见 [product/design.md](product/design.md) |
| **我要改**（写代码、提 PR） | [development/](development/) 全目录 + [../CONTRIBUTING.md](../CONTRIBUTING.md) + [adr/](adr/) |
| **我要运维 / 发布** | [development/release.md](development/release.md)、[development/observability.md](development/observability.md)、[development/ci.md](development/ci.md)、[development/branch-protection.md](development/branch-protection.md) |
| **我要查**（架构、数据、状态、端口） | [architecture/](architecture/)（文字权威是 [00-technical-architecture.md](architecture/00-technical-architecture.md)） |

> **当前尚未分区的内容**：`getting-started/`（安装 / 配置 / 首次跑通）、`guides/`（面向使用者的操作指南）、
> `reference/`（API 字段级索引）、`operations/`（值班 / 故障处理）**目前不存在**——没有源文件可搬，
> 因此本索引不列出它们（列出不存在的目录会让索引立刻腐坏）。

---

## architecture/ — 技术架构

**用途**：服务边界、数据归属、状态流转、部署形态。文字论证以 `00-` 为准，其余为图形化图集。

| 文件 | 内容 |
|---|---|
| [architecture/00-technical-architecture.md](architecture/00-technical-architecture.md) | 技术架构（**文字权威**，含目标态与已知未完成项） |
| [architecture/01-c4-context-container.md](architecture/01-c4-context-container.md) | C4 Context + Container |
| [architecture/02-key-sequences.md](architecture/02-key-sequences.md) | 关键链路时序图 |
| [architecture/03-data-model.md](architecture/03-data-model.md) | ER 图（分库与表关系） |
| [architecture/04-state-machines.md](architecture/04-state-machines.md) | 状态机（任务与产物流转） |
| [architecture/05-deployment.md](architecture/05-deployment.md) | 部署拓扑（本地与目标生产形态） |
| [architecture/README.md](architecture/README.md) | 本目录的图集索引与阅读约定 |

---

## adr/ — 架构决策记录

**用途**：记录"做错了代价很大"的决策及其理由。**索引以本表为准**（`adr/README.md` 是历史遗留的规范说明，其决策清单未随新增 ADR 同步）。

**编号规则**

- 文件命名 `NNN-short-title.md`，`NNN` 为**三位零填充**、全局唯一、只增不减。
- **先认领后使用**：开工前认领编号（同迁移号段、任务卡编号）；**撞号时后到者立即让号**，并同时改文件名与内部标题。
- 已接受的 ADR **不修改**，只能新增替代 ADR 并回链。

**状态含义**

| 状态 | 含义 |
|---|---|
| **提议** / **已提议** | 已写出、尚未获 Owner 认可；**不作为实现依据** |
| **已接受** / **已确认** | Owner 已认可，是实现与评审的依据；不修改，只能被替代 |
| **已弃用** | 停止适用，且无替代方案 |
| **已替代** | 被更新的 ADR 取代，保留原文仅供追溯（新 ADR 必须回链） |

> ⚠️ **现状提醒（词汇漂移）**：模板定义的是「已提议 / 已接受 / 已弃用 / 已替代」，
> 但现有文件中 ADR-003/004 写作**「已确认」**（等同于已接受），ADR-005/006/007 写作**「提议」**
> （等同于已提议）。下表按**文件实际写法**列出，未做统一改写。

| ADR | 标题 | 文件中的状态 |
|---|---|---|
| [adr/000-template.md](adr/000-template.md) | 模板（新建 ADR 从这里复制） | — |
| [adr/001-model-gateway-architecture.md](adr/001-model-gateway-architecture.md) | 模型聚合网关架构：增强 execution 而非新建服务 | 已接受 |
| [adr/002-project-character-library.md](adr/002-project-character-library.md) | 项目级角色库作为唯一事实源 | 已接受 |
| [adr/003-model-routing-layer.md](adr/003-model-routing-layer.md) | 路由层（逻辑模型 + 多渠道失败切换） | 已确认 |
| [adr/004-relay-supply-pool.md](adr/004-relay-supply-pool.md) | 中转站接入与「供给池」设计 | 已确认 |
| [adr/005-settings-information-architecture.md](adr/005-settings-information-architecture.md) | 设置中心信息架构（IA）重设计 | **提议** |
| [adr/006-smart-creation-workbench.md](adr/006-smart-creation-workbench.md) | 智能创作（三工作台）信息架构与参数面板重设计 | **提议** |
| [adr/007-protocol-registry.md](adr/007-protocol-registry.md) | 接入方式用「代码注册表」，不用「用户可编辑的协议配置」 | **提议** |
| [adr/README.md](adr/README.md) | ADR 编写规范与生命周期说明（**其决策清单未同步，以本表为准**） | — |

---

## development/ — 开发规范

**用途**：交付前必读的门禁与流程；改 CI、发版本、加测试都先看这里。

| 文件 | 定位 |
|---|---|
| [development/frontend-quality-gate.md](development/frontend-quality-gate.md) | 前端交付质量门禁（**唯一权威**，含规则库 R-* 与反例库） |
| [development/testing.md](development/testing.md) | 测试策略与覆盖率目标 |
| [development/ci.md](development/ci.md) | CI 结构与**核心不变量**（必需检查不可被 job 级 `if:` 跳过） |
| [development/branch-protection.md](development/branch-protection.md) | 分支保护规则（与线上配置一致） |
| [development/release.md](development/release.md) | 版本、发布、回滚、热修 |
| [development/observability.md](development/observability.md) | 日志 / 指标 / 追踪 / 健康检查规范 |
| [development/parallel-development.md](development/parallel-development.md) | 联合并行开发细则（多开发线同时改同一仓库） |
| [development/backlog.md](development/backlog.md) | **待办清单**：已识别但暂缓的工作 + 启动条件 |
| [development/iteration-qa.md](development/iteration-qa.md) | 迭代教训台账（**追加式**，只记事件，不承载规则正文） |

---

## product/ — 产品与设计规范

**用途**：产品边界、信息架构、交互与 UI 设计契约。

| 文件 | 内容 |
|---|---|
| [product/design.md](product/design.md) | 产品与设计规范（含前端已落地的演示能力与已知不一致） |

---

---

## 相关文档（仓库根）

| 文件 | 定位 |
|---|---|
| [../README.md](../README.md) | 项目介绍与快速开始 |
| [../ROADMAP.md](../ROADMAP.md) | 对外路线图（已交付 / 进行中 / 规划中） |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | 参与贡献的入口 |
| [../SECURITY.md](../SECURITY.md) | 安全策略与已知缺口 |
| [../CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) | 社区行为准则 |
| [../CHANGELOG.md](../CHANGELOG.md) | 变更记录 |
| [../AGENTS.md](../AGENTS.md) | AI 协作开发规范（**最高准则**） |
