# 漫剧导演工坊

一站式 AI 漫剧 / 短剧 / 影视创作平台（全栈应用仓库）。

> **仓库边界**：本仓库只承载全栈应用（`apps/web` + `services/`）。
> 原 Python 规则/校验线已独立为 [ai-video-shot-designer-skill](https://github.com/quanjunqi/ai-video-shot-designer-skill)，
> 仅作迁移对照与离线工具，不在本仓库的请求链路上。

## 产品线

| 产品线 | 路由 | 核心能力 |
|---|---|---|
| **漫剧工坊** | `/comic/projects` | 剧本 → 分镜 → 资产 → 视频的全流程生产 |
| **无限画布** | `/canvas` | 节点式工作流编排，ComfyUI 天然契合 |
| **智能创造** | `/create/image\|video\|audio` | 单模态单任务生成 |

## 技术栈

- **前端**：Vite + React 19 + TypeScript（严格模式）+ Tailwind CSS + React Router + Zustand
- **后端**：Go 1.22+ 微服务，pgx 数据库驱动
- **数据库**：PostgreSQL 15+
- **服务架构**：6 个微服务 + BFF 网关
- **AI 网关**：execution-service 内置模型聚合网关（中转站 API / 官方 API / ComfyUI）

## 目录结构

```
├── apps/web/                  # 前端应用（Vite + React 19 + TS + Tailwind + Zustand）
├── services/                  # 后端微服务
│   ├── workspace/             # 租户、成员、授权、渠道凭据
│   ├── production/            # 项目、剧集、分镜、模型目录(Catalog)
│   ├── execution/             # Job 调度、模型网关、审计日志
│   ├── asset/                 # 资产上传、媒体校验
│   ├── web-bff/               # BFF 网关（前端唯一入口）
│   └── outbox-relay/          # 事务性消息投递
├── docs/                      # 项目文档（索引见 docs/README.md）
├── deploy/local/              # 本地 Compose（PostgreSQL/Redis/Kafka/Temporal/MinIO）
├── openapi/                   # BFF API 契约
├── .agents/skills/            # AI Agent 场景化技能（按需加载）
└── AGENTS.md                  # AI 协作开发规范
```

## 快速开始

从零跑起来的完整步骤（装依赖 → 起本地栈 → 启动服务）见
**[docs/getting-started/local-setup.md](docs/getting-started/local-setup.md)**。

```bash
cd apps/web && npm ci && npm run dev    # 前端开发服务器 http://localhost:5173
```

## 质量门禁

PR 合并前必须全部通过（详见 [docs/how-to/run-tests.md](docs/how-to/run-tests.md)）：

```bash
cd apps/web
npm run gate    # typecheck + eslint + quality-gate
npm test
```

```bash
cd services/<service>
go build ./... && go vet ./... && go test ./...
```

## 开发约定

- 所有修改走 `feature/<任务>-<日期>` 分支 + PR + 审查，禁止直接 push master
- Commit 信息用 Conventional Commits 格式（见 [CONTRIBUTING.md](CONTRIBUTING.md)）
- 架构变更必须记录 ADR（见 [docs/adr/](docs/adr/)）

## 文档

从 [docs/README.md](docs/README.md) 进入文档索引（按受众导航）。

| 文档 | 内容 |
|---|---|
| [docs/getting-started/](docs/getting-started/) | 新手教程 |
| [docs/how-to/](docs/how-to/) | 操作指南（测试/CI/发布/运维） |
| [docs/architecture/](docs/architecture/) | 技术架构与图集 |
| [docs/adr/](docs/adr/) | 架构决策记录 |
| [docs/product/](docs/product/) | 产品设计 |
| [AGENTS.md](AGENTS.md) | AI 协作开发规范 |

## License

[MIT](LICENSE)
