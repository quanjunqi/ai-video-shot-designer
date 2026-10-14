# AGENTS.md

> 本文件给 AI 编码 Agent 提供项目快速上手信息。详细规则在 `.agents/skills/` 下按需加载。
> 最后更新：2026-10-11

## 项目一句话

漫剧导演工坊：一站式 AI 漫剧/短剧/影视创作平台。Vite + React 前端 + 6 个 Go 微服务，PostgreSQL 分库。

## 仓库布局

```
apps/web/          前端（Vite + React 19 + TS + Tailwind + Zustand）
services/          6 个 Go 服务
  workspace/       租户、成员、授权、渠道凭据（18082）
  production/      项目、剧集、分镜、模型目录（18081）
  execution/       Job 调度、模型网关、审计日志（8085）
  asset/           资产上传、媒体校验（18084）
  web-bff/         BFF 网关，前端唯一入口（8080）
  outbox-relay/    事务性消息投递
deploy/local/      docker compose 本地栈
docs/              人类技术文档（你可以参考，但不是你的规则手册）
openapi/           BFF 契约
```

## 常用命令

### 前端

```bash
cd apps/web
npm ci
npm run dev        # http://localhost:5173
npm run gate       # typecheck + eslint + quality-gate（GATE=0 才能交付）
npm test
```

### 后端

```bash
cd services/<service>
go build ./...
go test ./... -race
go vet ./...
```

### 本地栈

```bash
cp .env.example .env.local
set -a && . ./.env.local && set +a
docker compose --env-file deploy/local/.env -f deploy/local/compose.yaml --profile app up -d
```

### 编译后端

```bash
cd services/<service> && go build -o /tmp/mdp-bin/<service> ./cmd/server
```

## 分支与提交

- 从 `origin/develop` 拉 `feature/<简述>-<日期>` 分支
- Commit message：Conventional Commits（feat/fix/docs/refactor/test/chore）
- 禁止直推 master；PR 等 CI 全绿后由 Owner 合并
- 禁止 `git add -A`；按路径 add，提交前 `git diff --cached --name-only` 核对

## 关键 gotchas

- TypeScript 严格口径是 `tsconfig.app.json`，不是默认 tsconfig
- 测试不得依赖本地时区/系统时间（CI 跑 UTC）
- 迁移文件只增不改，号段按服务认领
- 所有 AI 模型调用必须经 execution 网关，写 `gateway_audit_logs`
- 密钥只在 workspace 加密存储，禁止硬编码
- BFF 是前端唯一入口，禁止前端直连后端服务

## 场景化 Skills（按需加载，不要全读；总览与编写规范见 `.agents/README.md`）

| 场景 | 加载 |
|---|---|
| 改前端 UI | `.agents/skills/frontend-quality/SKILL.md` |
| 并行开新 worktree | `.agents/skills/parallel-worktree/SKILL.md` |
| CI 红了排查 | `.agents/skills/ci-triage/SKILL.md` |
| 开 PR 前自检 | `.agents/skills/pr-workflow/SKILL.md` |
| 改审计日志/网关 | `.agents/skills/audit-ledger/SKILL.md` |
| 新增/修改数据库迁移 | `.agents/skills/database-migrations/SKILL.md` |
| 改后端 Go 代码/分层/覆盖率 | `.agents/skills/backend-standards/SKILL.md` |

## 人类技术文档（参考，不要用来约束自己）

| 文档 | 内容 |
|---|---|
| `docs/architecture/technical-architecture.md` | 技术架构权威 |
| `docs/adr/` | 架构决策记录 |
| `docs/how-to/run-tests.md` | 测试策略 |
| `docs/how-to/release.md` | 发布流程 |
| `docs/how-to/observability.md` | 日志/指标规范 |
