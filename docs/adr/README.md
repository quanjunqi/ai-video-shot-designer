# 架构决策记录（ADR）索引

> 本目录记录项目的重要架构决策。每个决策一个文件，文件名为 kebab-case 语义名，
> 编号作为文档头部 `编号：NNN` 字段。

## 决策索引

| 编号 | 文件 | 标题 | 日期 | 状态 |
|---|---|---|---|---|
| 001 | [model-gateway-architecture.md](./model-gateway-architecture.md) | 模型聚合网关架构：增强 execution 而非新建服务 | 2026-10-10 | 已接受 |
| 002 | [project-character-library.md](./project-character-library.md) | 项目级角色库作为唯一事实源 | 2026-10-10 | 已接受 |
| 003 | [model-routing-layer.md](./model-routing-layer.md) | 模型聚合网关的路由层（逻辑模型 + 多渠道失败切换） | 2026-10-10 | 已确认 |
| 004 | [relay-supply-pool.md](./relay-supply-pool.md) | 中转站接入与供给池设计 | 2026-10-10 | 已确认 |
| 005 | [settings-information-architecture.md](./settings-information-architecture.md) | 设置中心 IA 重设计 | 2026-10-10 | 提议 |
| 006 | [smart-creation-workbench.md](./smart-creation-workbench.md) | 智能创作（三工作台）信息架构与参数面板重设计 | 2026-10-10 | 提议 |
| 007 | [protocol-registry.md](./protocol-registry.md) | 协议注册表 | 2026-10-10 | 提议（部分被 008 修订） |
| 008 | [protocol-docs-alignment.md](./protocol-docs-alignment.md) | 协议配置保留为上游文档镜像 + 契约核对基准 | 2026-10-10 | 已接受 |
| 009 | [workspace-scoped-supply-pool.md](./workspace-scoped-supply-pool.md) | 租户级供给池 | 2026-10-10 | 提议 |

> 状态含义：**已接受** = 决策生效且已落地；**已确认** = Owner 确认但落地中；
> **提议** = 待 Owner 确认，不作为实现依据。

## 已弃用的决策

| 编号 | 标题 | 弃用日期 | 替代方案 |
|---|---|---|---|
| — | — | — | — |

---

## ADR 编写规范

1. **何时写 ADR**：
   - 新增/删除微服务
   - 改变服务边界
   - 选择核心技术栈
   - 数据模型重大变更
   - 安全策略变更
   - 任何"如果做错了代价很大"的决策

2. **ADR 生命周期**：
   - 已提议 → 已接受 → 已弃用 / 已替代
   - 已接受的 ADR 不修改，只能新增替代 ADR

3. **命名与编号**：
   - 文件名：kebab-case 语义名（如 `model-routing-layer.md`），**不带数字前缀**
   - 编号：写在文档头部 `编号：NNN` 字段，编号全局唯一，不重复使用
   - 新增 ADR 前先在本索引表查下一个可用编号

4. **ADR 模板**：见 [template.md](./template.md)
