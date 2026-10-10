# 漫剧导演工坊

一站式 AI 漫剧 / 短剧 / 影视创作平台（全栈应用仓库）。

> **仓库边界**：本仓库只承载全栈应用（`apps/web` + `services/`）。
> 原 Python 规则/校验线（`SKILL.md`、`references/`、`scripts/`、`tests/`、`config/`）已于 2026-10-10
> 独立为 [ai-video-shot-designer-skill](https://github.com/quanjunqi/ai-video-shot-designer-skill)，
> 仅作迁移对照与离线工具，**不在本仓库的请求链路上**。

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
├── apps/web/                  # 前端应用（Vite）
├── services/                  # 后端微服务
│   ├── workspace/             # 租户、成员、授权、渠道凭据
│   ├── production/            # 项目、剧集、分镜、模型目录(Catalog)
│   ├── execution/             # Job 调度、模型网关、审计日志
│   ├── asset/                 # 资产上传、媒体校验
│   ├── web-bff/               # BFF 网关（前端唯一入口）
│   └── outbox-relay/          # 事务性消息投递
├── docs/                      # 项目文档
│   ├── TECHNICAL_ARCHITECTURE.md  # 技术架构（权威）
│   ├── DESIGN.md              # 设计规范
│   └── adr/                   # 架构决策记录
├── deploy/local/              # 本地 Compose（PostgreSQL/Redis/Kafka/Temporal/MinIO）
├── .github/                   # CI、任务卡、PR 模板
└── AGENTS.md                  # AI 协作开发规范（最高准则）
```

## 快速开始

### 前端

```bash
cd apps/web
npm ci
npm run dev        # http://localhost:5173
```

### 本地依赖（PostgreSQL/Redis 等）

```bash
cd deploy/local
cp .env.example .env    # 按需填入本地开发密钥
./dev-local.sh
```

### 后端服务

各服务独立启动，端口与环境变量见 [AGENTS.md §8.1](AGENTS.md)。编译输出统一到 `/tmp/mdp-bin/`：

```bash
cd services/<service> && go build -o /tmp/mdp-bin/<service> ./cmd/server
```

## 质量门禁

**PR 合并前必须全部通过**：

```bash
cd apps/web
npm run typecheck    # TypeScript 类型检查
npm run lint:eslint  # ESLint
npm run gate         # 完整门禁（typecheck + eslint + quality-gate）
npm test             # 单元测试
```

```bash
cd services/<service>
go build ./... && go vet ./... && go test ./...
```

提交时 `.husky/pre-commit` 会自动跑前端 gate。

## 开发约定

- 所有修改走 `feature/<任务>-<日期>` 分支 + PR + 人类审查，**禁止直接 push master**
- 每个任务先填任务卡（模板见 `.github/TASK_TEMPLATE.md`）
- 架构变更必须同步 `docs/TECHNICAL_ARCHITECTURE.md` 并记录 ADR
- 完整规范见 [AGENTS.md](AGENTS.md)

## 文档

- [AGENTS.md](AGENTS.md) — AI 协作开发规范（最高准则）
- [docs/TECHNICAL_ARCHITECTURE.md](docs/TECHNICAL_ARCHITECTURE.md) — 技术架构
- [docs/DESIGN.md](docs/DESIGN.md) — 产品与设计规范
- [docs/adr/](docs/adr/) — 架构决策记录

## License

[MIT](LICENSE)
