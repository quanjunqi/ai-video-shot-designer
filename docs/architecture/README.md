# 架构图集

> 本目录存放**图形化**架构资料。文字论证以 [`00-technical-architecture.md`](00-technical-architecture.md) 为准，
> 架构决策以 [`../adr/`](../adr/) 为准；本目录只负责「一眼看清结构与流转」。

## 图集索引

| 文件 | 内容 | 回答什么问题 |
|---|---|---|
| [00-technical-architecture.md](00-technical-architecture.md) | 技术架构文字权威（非图） | 服务边界、数据归属、目标态与已知未完成项 |
| [01-c4-context-container.md](01-c4-context-container.md) | C4 Context + Container | 系统边界在哪？有哪些可部署单元？谁调用谁？ |
| [02-key-sequences.md](02-key-sequences.md) | 关键链路时序图 | 一次请求/一次生成到底经过哪些步骤？ |
| [03-data-model.md](03-data-model.md) | ER 图（4 个库、23 张表） | 数据存在哪？表之间怎么关联？ |
| [04-state-machines.md](04-state-machines.md) | 状态机 | 任务与产物如何流转？哪些状态是终态？ |
| [05-deployment.md](05-deployment.md) | 部署拓扑 | 本地怎么跑？目标生产形态是什么？ |

## 阅读约定

- **图与代码不一致时以代码为准，并把图改对** —— 图属于文档，适用 `AGENTS.md` §10「文档与实现必须同步」。
- 所有图使用 **Mermaid**（GitHub 原生渲染），不使用需要外部工具的格式，避免二进制资产与渲染环境依赖。
- C4 图使用 `flowchart` + `subgraph` 表达容器边界（而非 `C4Container` 语法），因为 GitHub 对 C4 语法的支持不稳定；C4 层级在标题与图注中标注。
- 图中出现的端口、库名、表名均与代码/迁移保持一致；改动请同步 [`../../.env.example`](../../.env.example) 与本目录。

## 事实来源（可复现校验）

| 图中内容 | 权威来源 |
|---|---|
| 服务清单、端口、依赖地址 | `.env.example`、`deploy/local/compose.yaml` |
| 路由与调用路径 | `services/*/internal/httpapi/handler.go`（`Routes()`） |
| 表与列 | `services/<svc>/migrations/*.sql` |
| 状态枚举 | migrations 的 `CHECK` 约束 + Go 常量 |
| 中间件 | `deploy/local/compose.yaml` |
