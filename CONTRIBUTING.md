# 贡献指南

> 本文档是**入口导航**，不是规则本体。开发规范、架构原则与禁区见
> [AGENTS.md](AGENTS.md)（AI 协作与开发的最高准则），这里只说明"从哪里开始"。

---

## 1. 五分钟上手

```bash
git clone https://github.com/quanjunqi/ai-video-shot-designer.git
cd ai-video-shot-designer

# 完整本地栈（PostgreSQL/Redis 等）
cd deploy/local && cp .env.example .env
docker compose --profile app up -d          # 详见 deploy/local/README.md

# 前端
cd apps/web && npm ci && npm run dev        # http://localhost:5173
```

**先读这三份**（按顺序）：

| 顺序 | 文档 | 作用 |
|---|---|---|
| 1 | [AGENTS.md](AGENTS.md) | 开发规范、架构原则、禁区、任务流程 |
| 2 | [docs/architecture/](docs/architecture/) | 系统的结构与流转（C4 / 时序 / ER / 状态机 / 部署） |
| 3 | [docs/product/](docs/product/) | 产品边界与设计规范 |

## 2. 开发流程

```
feature/<简述>-<日期>  →  PR → CI 全绿 → 审查 → 合并 → 删除分支
```

1. **开分支**：`feature/` `fix/` `refactor/` `docs/` `test/` `chore/` + 简述 + 日期（从 `develop` 拉）
2. **填任务卡**（模板见 `.github/TASK_TEMPLATE.md`）
3. **本地自检**：前端 `npm run gate`；后端对应服务 `go test ./... -race`（详见 [docs/how-to/run-tests.md](docs/how-to/run-tests.md)）
4. **开 PR**（模板见 `.github/PULL_REQUEST_TEMPLATE.md`），目标分支 `develop`
5. **等 CI 全绿**（9 项必需检查，见 [docs/how-to/branch-protection.md](docs/how-to/branch-protection.md)）
6. **审查后合并**，删除分支

任务粒度：单个任务 30–90 分钟、改动尽量 < 300 行。

## 3. 提交信息规范（Conventional Commits）

格式：**`<type>(<scope>)?: <subject>`**

| type | 用途 | type | 用途 |
|---|---|---|---|
| `feat` | 新功能 | `test` | 测试 |
| `fix` | 缺陷修复 | `build` | 构建/依赖 |
| `docs` | 文档 | `ci` | CI/CD 配置 |
| `refactor` | 重构（不改变外部行为） | `chore` | 杂项（仓库维护、格式化） |
| `perf` | 性能 | `style` | 格式（不影响语义） |

`scope` 可选，小写（如 `services`、`ci`、`execution`）。

**示例**

```
feat(execution): 统一 Executor 接口与 API Connector 适配
fix(ci): 修复后端测试与 CI 配置阻塞
docs(p1): 补齐架构图集 — C4/时序图/ER图/状态机/部署图
```

- 主题行用祈使句、不加句号、≤ 72 字符
- 正文说明**为什么**（不是重复"改了什么"）
- 破坏性变更在 type 后加 `!`，并在正文写 `BREAKING CHANGE:`

**本地强制**：`.husky/commit-msg` 校验。**CI 强制**：`.github/scripts/check-commit-messages.sh` 在 PR 中校验。

## 4. 禁区（摘要）

| 禁止 | 原因 |
|---|---|
| 直接 push `master` | 必须走 PR + CI |
| 修改 `migrations/` 下已执行的文件 | 只能新增迁移 |
| 在代码/日志/prompt/PR 中写真实密钥 | 安全 |
| 硬编码模型参数映射 | 必须走模板 `capabilities` |
| 跳过失败的门禁合并 | 质量保证 |

完整禁区与 AI 自主行动边界见本文 §4「禁区（摘要）」与 [SECURITY.md](SECURITY.md)。

## 5. 需要帮助

| 我想… | 看这里 |
|---|---|
| 理解系统结构 | [docs/architecture/](docs/architecture/) |
| 知道某个字段/接口长什么样 | [openapi/](openapi/) |
| 知道某项技术决策为什么这么定 | [docs/adr/](docs/adr/) |
| 知道测试该写到什么程度 | [docs/how-to/run-tests.md](docs/how-to/run-tests.md) |
| 加日志/指标 | [docs/how-to/observability.md](docs/how-to/observability.md) |
| 发布一个版本 | [docs/how-to/release.md](docs/how-to/release.md) |
| 报告安全问题 | [SECURITY.md](SECURITY.md) |
| 查已知未修复缺陷 | [CHANGELOG.md](CHANGELOG.md) Known Issues |
