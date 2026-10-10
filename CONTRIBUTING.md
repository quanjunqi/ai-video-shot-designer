# 贡献指南

> **本文档是入口，不是规则本体。** 规则本体见 [`AGENTS.md`](AGENTS.md)（AI 协作与开发的最高准则）。
> 本文件只做「新人从哪里开始」的导航，避免与 AGENTS.md 形成双份事实。

---

## 1. 五分钟上手

```bash
git clone https://github.com/quanjunqi/ai-video-shot-designer.git
cd ai-video-shot-designer

# 前端
cd apps/web && npm ci && npm run dev        # http://localhost:5173

# 本地完整栈（PostgreSQL/Redis，可选 platform/app profile）
cd deploy/local && cp .env.example .env
docker compose --profile app up -d          # 详见 deploy/local/README.md
```

**先读这三份**（按顺序）：

| 顺序 | 文档 | 作用 |
|---|---|---|
| 1 | [`AGENTS.md`](AGENTS.md) | 开发规范、架构原则、**禁区**、任务流程 |
| 2 | [`docs/architecture/README.md`](docs/architecture/README.md) | 系统的结构与流转（C4 / 时序 / ER / 状态机 / 部署） |
| 3 | [`docs/DESIGN.md`](docs/DESIGN.md) | 产品边界与设计规范 |

---

## 2. 开发流程（摘要）

完整流程见 `AGENTS.md` §5。

```
master（保护分支，禁止直接 push）
  └── <type>/<简述>-<日期>          如 feature/audit-log-1010
       └── PR → CI 全绿 → 审查 → 合并 → 删除分支
```

1. **开分支**：`feature/` `fix/` `refactor/` `docs/` `test/` `chore/` + 简述 + 日期
2. **填任务卡**（模板：[`.github/TASK_TEMPLATE.md`](.github/TASK_TEMPLATE.md)）—— 明确目标、范围、验收标准
3. **本地自检**（见 §4）
4. **开 PR**（模板：[`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md)）
5. **等 CI 全绿**（9 项必需检查，见 [`docs/branch-protection.md`](docs/branch-protection.md)）
6. **审查后合并**，删除分支

### 任务粒度

单个任务 **30–90 分钟**、改动尽量 **< 300 行**；只做一件事，不混改无关模块（`AGENTS.md` §5.2）。

---

## 3. 提交信息规范（Conventional Commits）

格式：**`<type>(<scope>)?: <subject>`**

| type | 用途 |
|---|---|
| `feat` | 新功能 |
| `fix` | 缺陷修复 |
| `docs` | 文档 |
| `refactor` | 重构（不改变外部行为） |
| `perf` | 性能 |
| `test` | 测试 |
| `build` | 构建/依赖 |
| `ci` | CI/CD 配置 |
| `chore` | 杂项（仓库维护、格式化） |
| `style` | 格式（不影响语义） |
| `revert` | 回退 |

`scope` 可选，小写（如 `services`、`ci`、`execution`、`p1`）。

**示例**

```
feat(execution): 统一 Executor 接口与 API Connector 适配
fix(ci): 修复后端测试与 CI 配置阻塞
docs(p1): 补齐架构图集 — C4/时序图/ER图/状态机/部署图
chore(services): 统一 outbox-relay 结构 + 补齐 6 个服务的 .dockerignore
```

- 主题行用**祈使句**、不加句号、≤ 72 字符
- 正文说明**为什么**（不是重复「改了什么」），可多段
- 破坏性变更在 type/scope 后加 `!`，并在正文写 `BREAKING CHANGE:`

**本地强制**：`.husky/commit-msg` 会在提交时校验。
**CI 强制**：`.github/scripts/check-commit-messages.sh` 在 PR 中校验全部提交（合并提交与 `Revert` 自动跳过）。

---

## 4. 提交前自检

```bash
# 前端（pre-commit 钩子会自动跑 gate）
cd apps/web
npm run typecheck && npm run lint:eslint && npm run gate && npm test

# 后端（改动哪个服务就跑哪个）
cd services/<service>
gofmt -l .            # 必须无输出
go build ./... && go vet ./... && go test ./... -race
```

**覆盖率不得低于基线**（`.github/coverage-baseline.txt`）：

```bash
bash .github/scripts/check-coverage.sh --all
```

---

## 5. 禁区（AI 与人类共同遵守）

见 `AGENTS.md` §7。高频几条：

| 禁止 | 原因 |
|---|---|
| 直接 push `master` | 必须走 PR + CI |
| 修改 `migrations/` 下**已执行**的文件 | 环境分叉；只能新增迁移 |
| 在代码/日志/prompt/PR 中写真实密钥 | 安全 |
| 硬编码模型参数映射 | 必须走模板 `capabilities` |
| 跳过失败的门禁合并 | 质量保证 |

---

## 6. 需要帮助

| 我想… | 看这里 |
|---|---|
| 理解系统结构 | [`docs/architecture/`](docs/architecture/) |
| 知道某个字段/接口长什么样 | [`openapi/`](openapi/) |
| 知道某项技术决策为什么这么定 | [`docs/adr/`](docs/adr/) |
| 知道测试该写到什么程度 | [`docs/TESTING.md`](docs/TESTING.md) |
| 加日志/指标 | [`docs/OBSERVABILITY.md`](docs/OBSERVABILITY.md) |
| 发布一个版本 | [`docs/RELEASE.md`](docs/RELEASE.md) |
| 报告安全问题 | [`SECURITY.md`](SECURITY.md) |
| 查已知未修复缺陷 | [`CHANGELOG.md`](CHANGELOG.md) Known Issues |
| 前端交付品质标准 | [`docs/FRONTEND_QUALITY_GATE.md`](docs/FRONTEND_QUALITY_GATE.md) |
