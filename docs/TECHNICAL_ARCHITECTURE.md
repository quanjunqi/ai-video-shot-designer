# 技术架构

> 本文档是「漫剧导演工坊」的技术架构权威文档。架构变更必须同步本文档。
> 关键架构决策记录在 `docs/adr/`，本文档引用但不重复论证。

## 1. 项目概述

**漫剧导演工坊** — 一站式 AI 漫剧/短剧/影视创作平台，包含三大产品线：

| 产品线 | 路由 | 核心能力 |
|---|---|---|
| **漫剧工坊** | `/comic/projects` | 剧本→分镜→资产→视频的全流程生产 |
| **无限画布** | `/canvas` | 节点式工作流编排，ComfyUI 天然契合 |
| **智能创造** | `/create/image|video|audio` | 单模态单任务生成 |

## 2. 技术栈

- **前端**：Vite + React 18 + TypeScript（严格模式）+ Tailwind CSS + React Router + Zustand
- **后端**：Go 1.22+ 微服务，pgx 数据库驱动
- **数据库**：PostgreSQL 15+
- **AI 网关**：execution-service 内置模型聚合网关（支持中转站 API / 官方 API / ComfyUI）

## 3. 服务架构总览

```
                 ┌─────────────────────────────┐
                 │        apps/web (Vite)       │
                 └──────────────┬──────────────┘
                                │ /api/v1/*
                                ▼
                 ┌─────────────────────────────┐
                 │  web-bff (8080)  BFF 网关    │  前端唯一入口，无领域权威库
                 └──┬────────┬─────────┬───────┘
                    │        │         │
        ┌───────────▼──┐ ┌───▼─────────▼──┐ ┌────────────▼──┐
        │  workspace   │ │  production    │ │  execution     │
        │  (18082)     │ │  (18081)      │ │  (8085)        │
        │ 租户/成员/   │ │ 项目/剧集/    │ │ Job/Attempt/   │
        │ 授权/凭据    │ │ 分镜/Catalog  │ │ 模型网关/审计  │
        └──────────────┘ └───────────────┘ └────────┬───────┘
                                                    │
                              ┌─────────────────────┼──────────────┐
                              │                     │              │
                    ┌─────────▼──────┐   ┌──────────▼─────┐ ┌─────▼──────────┐
                    │  asset         │   │  outbox-relay  │ │ 外部 AI 后端   │
                    │  (18084)       │   │  事务性消息投递 │ │ API/ComfyUI   │
                    │ 资产/媒体校验   │   └────────────────┘ └────────────────┘
                    └────────────────┘
```

## 4. 服务边界（不可违背）

> **一个服务拥有一类事实，其他服务通过契约访问，不直接跨库读写。**

| 服务 | 拥有的数据 | 禁止 |
|---|---|---|
| workspace | 成员、授权、租户策略、渠道凭据 | 不存项目/任务数据 |
| production | 项目、源版本、剧集、分镜、模型目录(Catalog) | 不执行 AI 调用 |
| execution | Job、Attempt、审计日志、用量 | 不直接修改项目数据 |
| asset | 上传文件、媒体元数据 | 不存业务逻辑 |
| web-bff | 无领域数据（纯聚合转发） | 不持有领域权威库 |

## 5. 核心架构原则

### 5.1 Catalog 管定义，Execution 锁定计划

- 模型、渠道、协议模板在 **production(Catalog)** 定义
- 运行时 **execution** 锁定快照：目录更新不改变已提交任务
- 协议模板使用 `capabilities` JSONB 声明能力，**禁止硬编码参数映射**

### 5.2 资产唯一事实源

- **项目级角色库**是角色身份的唯一事实源
- 单集只存引用关系和状态变体，不复制角色档案
- 变体立绘使用图生图（image-to-image），保证角色一致性
- 详见 `docs/adr/002-project-character-library.md`

### 5.3 可审计可治理

- 所有 AI 模型调用必须经过 execution 网关，写入 `gateway_audit_logs`
- 审计日志同步写入，不异步丢失
- 密钥集中在 workspace 服务加密存储，execution 运行时 reveal
- 详见 `docs/adr/001-model-gateway-architecture.md`

## 6. 模型聚合网关

模型聚合网关内置于 execution-service，统一三类 AI 后端：
1. 中转站 API（如 PearAPI、Grsai）
2. 官方 API（如 OpenAI、MiniMax、即梦）
3. 本地/云端 ComfyUI

网关职责：认证、限流、审计、预算、参数映射、异步任务状态机。

架构决策（为什么是增强 execution 而非新建服务）见 `docs/adr/001-model-gateway-architecture.md`。

## 7. 数据流

### 7.1 前端调用

```
前端 → BFF (/api/v1/*) → 后端服务 → PostgreSQL
```

前端**禁止**直接调用后端服务，只调用 BFF；BFF 负责转发。

### 7.2 AI 生成调用

```
production(Catalog 定义模型/协议) ──快照──▶ execution(网关锁定计划)
                                              │
                                              ├─ 审计日志写入 gateway_audit_logs
                                              ├─ 创建 Job/Attempt
                                              └─ 调用外部 AI 后端
```

## 8. 数据库

| 数据库 | 归属服务 | 内容 |
|---|---|---|
| workspace | workspace | 成员、授权、渠道凭据 |
| production | production | 项目、剧集、分镜、模型目录 |
| execution | execution | Job、Attempt、审计日志、用量 |
| asset | asset | 上传文件、媒体元数据 |

迁移文件在各服务 `migrations/` 目录，命名 `NNN_description.sql`，**只增不改**。

## 9. 架构决策记录（ADR）

| ADR | 标题 | 状态 |
|---|---|---|
| [ADR-001](adr/001-model-gateway-architecture.md) | 模型聚合网关架构 — 增强 execution 而非新建服务 | 已接受 |
| [ADR-002](adr/002-project-character-library.md) | 项目级角色库作为唯一事实源 | 已接受 |

## 10. 参考

- `AGENTS.md` — AI 协作开发规范（最高准则）
- `docs/DESIGN.md` — 设计规范
- `docs/adr/` — 架构决策记录
