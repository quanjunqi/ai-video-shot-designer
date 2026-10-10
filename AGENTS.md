# AGENTS.md — AI 协作开发规范

> 本文档是 AI Agent 参与本项目开发的**唯一权威规范**。所有 Agent 任务必须遵循本文档。
> 最后更新：2026-10-10

---

## 1. 项目概述

**漫剧导演工坊** — 一站式 AI 漫剧/短剧/影视创作平台，包含三大产品线：

| 产品线 | 路由 | 核心能力 |
|---|---|---|
| **漫剧工坊** | `/comic/projects` | 剧本→分镜→资产→视频的全流程生产 |
| **无限画布** | `/canvas` | 节点式工作流编排，ComfyUI 天然契合 |
| **智能创造** | `/create/image|video|audio` | 单模态单任务生成 |

### 技术栈

- **前端**：Vite 8 + React 19 + TypeScript 5.9 + Tailwind CSS 4 + React Router + Zustand
- **后端**：Go 1.22+ 微服务，pgx 数据库驱动
- **数据库**：PostgreSQL 15+（本地 Compose 用 16.8）
- **服务架构**：6 个微服务 + BFF 网关
- **AI 网关**：execution-service 内置模型聚合网关（支持中转站API/官方API/ComfyUI）

---

## 2. 目录结构

```
ai-video-shot-designer/
├── apps/web/                  # 前端应用（Vite）
│   ├── src/
│   │   ├── pages/             # 页面级组件（路由入口）
│   │   ├── features/          # 业务功能模块
│   │   │   ├── comic/         # 漫剧工坊
│   │   │   ├── canvas/        # 无限画布
│   │   │   ├── genworkbench/  # 智能创造
│   │   │   ├── settings/      # 设置中心
│   │   │   ├── rules/         # 规则中心
│   │   │   └── home/          # 首页
│   │   ├── components/        # 通用 UI 组件（components/ui/ 为 Radix 封装）
│   │   ├── config/            # 前端配置（提取规则、模型目录、镜头语言等）
│   │   ├── stores/            # Zustand store（按领域拆分）
│   │   ├── hooks/             # 自定义 hooks
│   │   ├── layouts/           # 布局组件
│   │   ├── lib/               # 通用库（api client、utils）
│   │   ├── mocks/             # 演示数据（**非生产事实源**）
│   │   └── types/             # 领域类型定义
│   ├── tests/                 # 前端单元测试
│   └── package.json
├── services/                  # 后端微服务
│   ├── workspace/             # 租户、成员、授权、渠道凭据
│   ├── production/            # 项目、剧集、分镜、模型目录(Catalog)
│   ├── execution/             # Job调度、模型网关、审计日志
│   ├── asset/                 # 资产上传、媒体校验
│   ├── web-bff/               # BFF网关（前端唯一入口）
│   └── outbox-relay/          # 事务性消息投递
├── docs/                      # 项目文档（索引见 docs/README.md）
│   ├── README.md              # 文档索引：按受众导航（唯一入口）
│   ├── architecture/          # 技术架构权威（00-technical-architecture.md）+ 架构图集
│   ├── adr/                   # 架构决策记录
│   ├── development/           # 开发规范：门禁/测试/CI/发布/可观测/并行/待办/教训台账
│   ├── product/               # 产品与设计规范
│   ├── commercial/            # 商业规划
│   ├── research/              # 竞品与 UX 调研（**非决策依据**）
│   └── archive/               # 历史与一次性产物（**非当前事实**）
├── deploy/local/              # 本地 Compose（PostgreSQL/Redis/Kafka/Temporal/MinIO）
├── deploy/site/               # 站点运维材料（备案页等）
├── .github/                   # CI、任务卡、PR 模板
└── AGENTS.md                  # 本文档
```

> **仓库边界（2026-10-10 拆分）**：本仓库只承载全栈应用（`apps/web` + `services/`）。
> 原 Python 规则/校验线（`SKILL.md`、`references/`、`scripts/`、`tests/`、`config/`）已独立为
> [ai-video-shot-designer-skill](https://github.com/quanjunqi/ai-video-shot-designer-skill)，
> 仅作迁移对照与离线工具，**不在本仓库的请求链路上**。跨仓库改动需在两个仓库分别开 PR。

---

## 3. 架构原则（不可违背）

### 3.1 服务边界

> **一个服务拥有一类事实，其他服务通过契约访问，不直接跨库读写。**

| 服务 | 拥有的数据 | 禁止 |
|---|---|---|
| workspace | 成员、授权、租户策略、渠道凭据 | 不存项目/任务数据 |
| production | 项目、源版本、剧集、分镜、模型目录 | 不执行AI调用 |
| execution | Job、Attempt、审计日志、用量 | 不直接修改项目数据 |
| asset | 上传文件、媒体元数据 | 不存业务逻辑 |

### 3.2 Catalog 管定义，Execution 锁定计划

- 模型、渠道、协议模板在 **production(Catalog)** 定义
- 运行时 **execution** 锁定快照：目录更新不改变已提交任务
- 协议模板使用 `capabilities` JSONB 声明能力，**禁止硬编码参数映射**

### 3.3 资产唯一事实源

- **项目级角色库**是角色身份的唯一事实源
- 单集只存引用关系和状态变体，不复制角色档案
- 变体立绘使用图生图（image-to-image），保证角色一致性

### 3.4 可审计可治理

- 所有 AI 模型调用必须经过 execution 网关，写入 `gateway_audit_logs`
- 审计日志同步写入，不异步丢失
- 密钥集中在 workspace 服务加密存储，execution 运行时 reveal

---

## 4. 编码规范

### 4.1 前端

- **TypeScript 严格模式**，禁止 `any`（必要时用 `unknown` + 类型守卫）
- **组件命名**：PascalCase，文件与组件同名
- **状态管理**：Zustand store，避免 prop drilling
- **样式**：Tailwind CSS，禁止内联样式（动态值除外）
- **API 调用**：统一通过 `src/lib/api/client.ts`，禁止直接 fetch
- **UI 品质**：Awwwards 级别，注重排版、留白、视觉层级、动效、微交互

### 4.2 后端

- **Go 规范**：标准库优先，错误显式处理，禁止忽略错误
- **HTTP 处理**：`httpapi.Handler` 模式，路由注册在 `Routes()`
- **数据库**：pgxpool，迁移文件在 `migrations/`，命名 `NNN_description.sql`
- **配置**：环境变量，`os.Getenv`，禁止硬编码
- **日志**：`log/slog` 结构化日志（Go 1.21+ 标准库），键值对字段规范见 `docs/development/observability.md`；
  存量 `log.*` 随改动逐步替换，**新代码一律用 `slog`**

### 4.3 数据库迁移

- 所有 schema 变更必须通过迁移文件
- 迁移文件**只增不改**，已执行的迁移禁止修改
  （**已由机制强制**：`deploy/local/migrate.sh` 记录每个已应用文件的校验和，
  改动已应用文件会被拒绝执行 —— 见 `deploy/local/README.md`）
- 迁移包含：CREATE TABLE、CREATE INDEX、COMMENT、初始数据

---

## 5. 开发流程

### 5.1 分支策略

```
master    (生产分支，受保护、禁止直推)  ← 只接受 develop 的验收通过合并 + hotfix
  ↑
develop   (集成分支，受保护)            ← feature 合入 → 在此验收 → 通过后合并到 master
  ↑
feature/* (开发分支)                    ← 统一从 develop 拉取
       └── PR → CI → 人类Review → 合并
```
> 三层模型的完整规则见 §12.2；集成分支的存在意义是承载「测试验收」环节。

- **AI 只能在 feature 分支工作**，禁止直接 push master
- 分支命名：`feature/<任务缩写>-<日期>`，如 `feature/audit-log-1010`
- 每个任务一个分支，完成后开 PR

### 5.2 任务粒度

- 单个任务 **30-90 分钟**，改动尽量 **<300 行**
- 只做一件事，不混改无关模块
- 大任务拆分为子任务，逐个完成

### 5.3 任务卡模板

每个任务开始前必须填写任务卡（见 `.github/TASK_TEMPLATE.md`）：

```
目标：一句话说明要做什么
背景与相关文件：为什么做，涉及哪些文件
范围 / 非范围：明确边界
验收标准：可客观验证的完成条件
测试命令：如何验证
约束与禁止事项：不能做什么
输出：分支 + PR + 测试结果 + 风险说明
```

### 5.4 PR 流程

1. AI 在 feature 分支完成开发
2. 运行本地测试：`npm run gate`（前端）、`go test ./...`（后端）
3. 开 PR，使用 PR 模板（见 `.github/PULL_REQUEST_TEMPLATE.md`）
4. CI 自动运行：typecheck + lint + 单元测试
5. 人类 Owner 审查合并
6. 合并后删除分支

---

## 6. 测试要求

### 6.1 前端

```bash
cd apps/web
npm run typecheck    # TypeScript 类型检查
npm run lint:eslint  # ESLint
npm run gate         # 完整质量门禁（typecheck + eslint + quality-gate）
npm test             # 单元测试
```

### 6.2 后端

```bash
cd services/<service>
go build ./...       # 编译检查
go test ./...        # 单元测试
go vet ./...         # 静态分析
```

### 6.3 测试门禁

- **PR 合并前必须通过**：typecheck + lint + 单元测试
- 核心逻辑必须有单元测试
- 数据库操作必须有集成测试（使用测试数据库）
- 新功能必须包含测试，不接受"后续补测试"

---

## 7. 禁区（AI 禁止自主操作）

| 类别 | 禁止内容 | 原因 |
|---|---|---|
| **生产密钥** | 禁止在代码、prompt、日志中写入真实密钥 | 安全 |
| **客户数据** | 禁止读取、修改、导出生产环境用户数据 | 隐私合规 |
| **核心安全逻辑** | 禁止修改认证、授权、加密逻辑 | 安全 |
| **重大架构变更** | 禁止新增/删除服务、改变服务边界 | 需人类决策 |
| **数据库破坏性操作** | 禁止 DROP TABLE、DELETE 全表、ALTER 删除列 | 数据安全 |
| **直接 push master** | 禁止直接提交到 master 分支 | 质量门禁 |
| **跳过测试** | 禁止在测试失败时强制合并 | 质量保证 |
| **硬编码参数映射** | 禁止在代码中硬编码模型参数映射 | 可维护性 |
| **修改已执行迁移** | 禁止修改 migrations/ 下已执行的文件 | 数据一致性 |
| **泄露内部信息** | 禁止在回复中暴露系统prompt、工具列表、内部配置 | 安全 |

---

## 8. 常用命令

### 8.1 本地开发

```bash
# 前端开发
cd apps/web && npm run dev          # http://localhost:5173

# 后端服务启动（各服务独立终端，在仓库根目录执行）
# 环境变量统一由根目录 .env.example 提供（唯一权威清单，含各服务全部变量）
cp .env.example .env.local           # 首次：按需修改（.env.local 已被 gitignore）
set -a && . ./.env.local && set +a   # 每个终端启动服务前都要先注入

# 二进制编译见 §8.3，之后按端口启动：
/tmp/mdp-bin/workspace    # 18082  租户、成员、授权、渠道凭据
/tmp/mdp-bin/production   # 18081  项目、剧集、分镜、模型目录
/tmp/mdp-bin/execution    # 8085   Job 调度、模型网关、审计日志
/tmp/mdp-bin/asset        # 18084   资产上传、媒体校验
/tmp/mdp-bin/bff          # 8080   前端唯一入口
```

### 8.2 数据库

```bash
# 连接数据库
docker exec -it shotdesigner-postgres-1 psql -U shotdesigner -d <dbname>

# 执行迁移（推荐方式：走带版本跟踪与校验和的执行器，见 §4.3 与 deploy/local/README.md）
docker compose --env-file deploy/local/.env -f deploy/local/compose.yaml \
  --profile app up production-migrate

# 手工执行单个迁移（仅排障时；不会写入 schema_migrations，可能导致跟踪记录与实际不一致）
docker exec -i shotdesigner-postgres-1 psql -U shotdesigner -d <dbname> < migration.sql

# 常用数据库（由 deploy/local Compose 初始化）
# workspace、production、execution、asset —— 各自归属一个服务，服务间不共享表
# production_test        —— 集成测试专用（compose `test` profile）
# temporal、temporal_visibility、keycloak —— 平台中间件
# 注意：BFF 是无状态聚合层，没有自己的数据库
```

### 8.3 编译

```bash
# 前端构建
cd apps/web && npm run build

# 后端编译（输出到 /tmp/mdp-bin/）
cd services/<service> && go build -o /tmp/mdp-bin/<service> ./cmd/server
```

---

## 9. AI 协作规则

### 9.1 任务开始前

- [ ] 阅读任务卡，明确目标和验收标准
- [ ] 阅读相关文档：`docs/architecture/00-technical-architecture.md`、`docs/product/design.md`
- [ ] 检查是否有相关 ADR
- [ ] 创建 feature 分支

### 9.2 开发过程中

- [ ] 遵循编码规范和架构原则
- [ ] 不越界修改其他服务的数据
- [ ] 遇到架构决策点，记录为 ADR 草稿，等待人类确认
- [ ] 遇到禁区操作，停止并询问人类

### 9.3 任务完成后

- [ ] 运行本地测试，确保全部通过
- [ ] 自查：是否只改了必要文件？有无密钥泄露？
- [ ] 开 PR，填写 PR 模板
- [ ] 附测试结果和风险说明
- [ ] 等待人类审查，不自行合并

### 9.4 迭代自检

每个任务完成后必须执行迭代自检：

1. **功能验证**：按验收标准逐项验证
2. **代码质量**：typecheck + lint + 测试通过
3. **UI 检查**（如涉及）：排版、留白、视觉层级、响应式
4. **架构合规**：是否违反服务边界、是否硬编码
5. **安全检查**：有无密钥泄露、有无注入风险
6. **文档更新**：相关文档是否需要同步

---

## 10. 文档维护

| 文档 | 定位 | 何时必须同步 |
|---|---|---|
| `docs/architecture/00-technical-architecture.md` | 技术架构权威 | 架构变更 |
| `docs/product/design.md` | 产品与设计规范 | UI/组件变更 |
| `docs/architecture/` | 架构图集（C4/时序/ER/状态机/部署） | 服务边界、表结构、状态、端口、部署形态变更 |
| `docs/adr/NNN-title.md` | 架构决策记录 | 重要决策必须记录 |
| `docs/development/frontend-quality-gate.md` | 前端交付质量门禁（唯一权威） | 规则/反例库变更 |
| `docs/development/iteration-qa.md` | 迭代教训台账（追加式） | 每个迭代发现教训时追加 |
| `docs/development/testing.md` | 测试策略与覆盖率目标 | 测试分层/门禁变更 |
| `docs/development/ci.md` | CI 结构与**核心不变量**（必需检查不可被 job 级 `if:` 跳过） | 改动 CI 前必读；新增检查时同步 |
| `docs/development/observability.md` | 日志/指标/追踪/健康检查规范 | 可观测性约定变更 |
| `docs/development/release.md` | 版本、发布、回滚、热修 | 发布流程变更 |
| `SECURITY.md` | 安全策略与已知缺口 | 安全基线或信任模型变更 |
| `docs/development/backlog.md` | **待办清单（暂缓项 + 启动条件）** | 决定暂缓/启动某项工作时 |
| `CHANGELOG.md` | 变更记录 | 每个用户可见变更 |
| `AGENTS.md` | 本文档 | 规则变更必须更新并通知所有 Agent |

---

## 11. 常见问题

### Q: 可以直接修改 master 吗？
A: **绝对禁止**。所有修改必须通过 feature 分支 + PR + 人类审查。

### Q: 测试失败可以先合并吗？
A: **不可以**。测试失败必须修复，或有人类明确的豁免记录。

### Q: 可以新增一个微服务吗？
A: **不可以自主决定**。新增服务属于重大架构变更，必须人类 Owner 批准并记录 ADR。

### Q: 可以修改已执行的迁移文件吗？
A: **不可以**。已执行的迁移只能新增反向迁移，不能修改原文件。

### Q: 可以在代码中硬编码 API 地址吗？
A: **不可以**。所有配置通过环境变量注入。

### Q: 前端可以直接调用后端服务吗？
A: **不可以**。前端只能调用 BFF（`/api/v1/*`），BFF 负责转发到后端服务。

---

## 12. 并行开发规范

> 本节为**多条开发线同时推进**时的强制约定。单线开发同样适用 §5 的既有规则。

### 12.1 硬约束：一个工作目录同一时刻只能在一个分支

**因此禁止让多个开发线共用同一个 checkout。** 后果不是"不方便"，而是真实的破坏：
分支被彼此切走、暂存区互相污染、提交落到错误分支（本项目已实际发生过）。

**正确做法：`git worktree`（每线一个目录，共享同一个 `.git`）**

```bash
git worktree add ../mdp-canvas    -b feat/canvas-2026-10-10
git worktree add ../mdp-libraries -b feat/project-libraries-2026-10-10
git worktree list                  # 查看
git worktree remove ../mdp-canvas  # 收工清理
```

**每个 worktree 必须独立配置本地栈**（否则端口/容器互相踩）：

```bash
# 各 worktree 的 deploy/local/.env 中使用不同项目名与端口段
COMPOSE_PROJECT_NAME=mdp-canvas
WEB_PORT=5273
POSTGRES_PORT=5532
```

### 12.2 分支基线：**`develop`（集成分支）**，禁止互相堆叠

本仓库采用三层分支模型（企业级 GitFlow 子集）：

```
master    ← 生产分支：只接受来自 develop 的验收通过合并 + hotfix。受保护，禁止直推
develop   ← 集成分支：feature 合入此处 → 在此验收 → 通过后合并到 master。同样受保护
feature/* ← 开发分支：**统一从 develop 拉取**，完成后 PR 回 develop
```

| 规则 | 原因 |
|---|---|
| feature **从 `develop` 拉**（不是 master） | 从 master 拉会缺少已集成但未发布的依赖，导致重复冲突 |
| 所有并行线基于 `develop` | 堆叠 PR 在有人先合并后会大面积冲突 |
| **合并方式必须用 merge commit，禁止 squash** | squash 生成新 SHA，会让孩子 PR 的 diff 重新变回全量 |
| 不要删除他人尚未合并分支的基线分支 | GitHub 会**自动关闭**以它为基线的 PR，且**无法重开** |
| 合并后删除自己的分支 | 安全；但不影响他人 |
| **hotfix 例外** | 从 `master` 拉，修完**必须同时合回 `develop`** —— 否则下次 `develop → master` 会覆盖该修复（最常见的生产事故） |


### 12.3 迁移文件号段分配（必须提前约定）

两条线同时新增 `010_*.sql` 会撞号。**开工前先认领号段，并登记在任务卡里**：

| 线 | 服务 | 号段 |
|---|---|---|
| 基础设施/可靠性 | execution | 010–019 |
| 模型中心/网关 | production | 024–039 |
| 项目知识库 | production | 040–049 |
| 无限画布 | production | 050–059 |

**规则**：号段用尽或跨线借用时，先在 PR 中说明并更新本表；**后合并的一方负责改号并重跑迁移验证**
（本项目迁移执行器带校验和，改号＝新增文件，不会破坏已应用的记录）。

### 12.4 热点文件：只追加，不重排

以下文件几乎每个 PR 都要动，是并行的主要冲突源：

| 文件 | 规则 |
|---|---|
| `CHANGELOG.md` | 只在自己的小节追加；不重排他人条目 |
| `.env.example` | 按服务分节追加变量；不改动他人段落 |
| `AGENTS.md` / `docs/architecture/*` | 改前先 rebase；结构性重排需单独 PR |
| `apps/web/src/lib/api/client.ts` | 每人只追加自己的方法段 |
| `.github/workflows/*` | 一次只允许一条线改；改后必须先跑一次全量（改动 `.github/**` 会按设计触发全量） |

### 12.5 CI 与并行（现有机制已支持）

- CI **按改动范围执行**：各线只跑自己动过的服务/前端，互不触发重活
- **必需检查始终上报**（不因跳过而缺失），因此并行 PR 不会出现"检查永远等待"的死锁
- 后端矩阵 `fail-fast: false`：其他服务的失败**不会**取消你的服务

### 12.6 开工前检查清单

- [ ] 用 `git worktree` 建独立目录，并独立配置 `COMPOSE_PROJECT_NAME` 与端口
- [ ] 分支基于 **`develop`**（hotfix 例外：基于 `master` 并合回 develop），命名符合 §5.1（`feat|fix|docs|chore/<简述>-<日期>`）
- [ ] 在任务卡中**登记迁移号段**（若本线会加迁移）
- [ ] 确认要改的"热点文件"当前没有他人未合并的改动
- [ ] 收工后 `git worktree remove`，并删除已合并分支

### 12.7 联合并行开发规范（细则见 `docs/development/parallel-development.md`）

本节为摘要，**细则以后者为准**。三条最容易被违反、且都有真实事故的硬规则：

1. **一条线 = 一个 worktree**。禁止在多条线之间共用一个 checkout
   （已导致：两个 ADR-006 撞号、未提交的 CHANGELOG 被切分支带走）。
2. **编号资源先认领后使用**：迁移号段（§12.3）、**ADR 编号**、任务卡编号。
   撞号时**后到者立即让号**，并同时改文件名与内部标题。
3. **禁止用 `&&` / `-q` / `2>/dev/null` / 管道推断 git 成功**。必须显式校验：
   commit 后看 `git log -1`；**push 后比对本地 HEAD 与远端 SHA 是否相等**；
   目录/ worktree 创建后校验 `.git` 存在。
4. **禁止 `git add -A`**（会把他人工作提交进本线）：按路径 `git add`，
   提交前用 `git diff --cached --name-only` 核对；发现他人文件则 `git reset` 后原样留在磁盘。

---

**本文档是 AI 协作的最高准则。如有冲突，以本文档为准。**
