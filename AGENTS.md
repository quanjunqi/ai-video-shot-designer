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

- 从 `origin/develop` 拉分支：`feature/`｜`fix/`｜`docs/`｜`chore/` + `<简述>-<日期>`；一条线一个 worktree（见 `.agents/skills/parallel-worktree/SKILL.md`）
- Commit message：Conventional Commits（feat/fix/docs/refactor/test/chore）
- 禁止直推 master；PR 等 CI 全绿后由 Owner 合并
- 禁止 `git add -A`；按路径 add，提交前 `git diff --cached --name-only` 核对

## 关键 gotchas

- TypeScript 口径以 `apps/web/tsconfig.app.json` 为准（不是默认 tsconfig）。注意该文件目前 `strict: false`：类型安全靠 eslint（`no-explicit-any` 为 error）与审查兜底，别指望类型系统拦截
- 测试不得依赖本地时区/系统时间（CI 跑 UTC）
- 迁移文件只增不改，号段按服务认领
- 所有 AI 模型调用必须经 execution 网关，写 `gateway_audit_logs`
- 密钥只在 workspace 加密存储，禁止硬编码
- BFF 是前端唯一入口，禁止前端直连后端服务

## 场景化 Skills（按需加载，不要全读；总览与编写规范见 `.agents/README.md`）

| 场景 | 加载 |
|---|---|
| 承接任何开发任务（开工前必读） | `.agents/skills/acceptance-checklist/SKILL.md` |
| 改前端代码 | **怎么写**：`.agents/skills/frontend-coding/SKILL.md`　**交付门禁**：`.agents/skills/frontend-quality/SKILL.md` |
| 改后端 Go 代码 | **怎么写**：`.agents/skills/backend-coding/SKILL.md`　**分层/覆盖率棘轮**：`.agents/skills/backend-standards/SKILL.md` |
| 并行开新 worktree | `.agents/skills/parallel-worktree/SKILL.md` |
| CI 红了排查 | `.agents/skills/ci-triage/SKILL.md` |
| 开 PR 前自检 | `.agents/skills/pr-workflow/SKILL.md` |
| 改审计日志/网关 | `.agents/skills/audit-ledger/SKILL.md` |
| 新增/修改数据库迁移 | `.agents/skills/database-migrations/SKILL.md` |

> 引用规则时请指向 **`.agents/skills/**` 的规则文件**（或本文件的章节名），**不要引用 `AGENTS.md §编号`**：
> 本文件已不再编号，历史章号引用会变成悬空指针（本次集中清理约 60 处）。
> 边界：**规则只写在 `.agents/` 与 `AGENTS.md`**；`docs/` 是人类技术文档，不承载规则（可被规则以「完整文档」深链指向）。

## 人类技术文档（参考，不要用来约束自己）

| 文档 | 内容 |
|---|---|
| `docs/architecture/technical-architecture.md` | 技术架构权威 |
| `docs/adr/` | 架构决策记录 |
| `docs/how-to/run-tests.md` | 测试策略 |
| `docs/how-to/release.md` | 发布流程 |
| `docs/how-to/observability.md` | 日志/指标规范 |
