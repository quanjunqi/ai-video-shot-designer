# .agents/ — AI 协作规则体系

> 本目录存放**给 AI 编码 Agent 的规则**，与 `docs/`（人类技术文档）严格分离：
> `.agents/` = 规则与速查（AI 执行时加载）；`docs/` = 技术手册（人类阅读）。
> AGENTS.md 是唯一的快速上手指南，详细规则按需从这里加载。

## 目录结构

```
.agents/
├── README.md                  # 本文件：体系说明 + skill 编写规范
└── skills/
    ├── frontend-quality/      # 前端交付质量门禁（SKILL + rules + lessons）
    ├── acceptance-checklist/  # 需求验收清单（SKILL + 模板：需求点→判据→自检→PR勾对）
    ├── pr-workflow/           # 分支命名 / commit / PR 流程
    ├── parallel-worktree/     # 多开发线并行（worktree + 号段认领）
    ├── ci-triage/             # CI 排障
    ├── audit-ledger/          # 审计日志与网关规范（execution）
    └── database-migrations/   # 数据库迁移规范
```

## 什么时候加载 skill

| 场景 | 加载 |
|---|---|
| 承接任何开发任务（开工前/提交前必读） | `.agents/skills/acceptance-checklist/SKILL.md` |
| 改 `apps/web/` 下任何前端代码 | `.agents/skills/frontend-quality/SKILL.md` |
| 准备提交 / 推送 / 开 PR | `.agents/skills/pr-workflow/SKILL.md` |
| 并行开新开发线 / 建 worktree | `.agents/skills/parallel-worktree/SKILL.md` |
| CI 红了 / 改 workflows | `.agents/skills/ci-triage/SKILL.md` |
| 改 execution / 审计 / AI 网关 | `.agents/skills/audit-ledger/SKILL.md` |
| 新增或修改数据库迁移 | `.agents/skills/database-migrations/SKILL.md` |

> 拿不准时：**改代码前先看对应 skill 的「什么时候加载」，命中即读 SKILL.md；不命中不读**，
> 避免把规则全文塞进上下文。

## skill 编写规范（新增/维护时遵守）

每个 skill 是一个目录，含 `SKILL.md`（必须）+ 按需的 `rules.md` / `lessons.md` / 其他资产。

### 1. 三段式结构（防止"规则全文压垮上下文"）

| 层 | 文件 | 职责 | 长度 |
|---|---|---|---|
| 速查 | `SKILL.md` | frontmatter `name`/`description` + 触发条件 + 核心规则速查 + 完整文档链接 | ≤ 80 行 |
| 全量 | `rules.md`（可选） | 唯一权威的完整规则，供需要深读时查阅 | 不限 |
| 深链 | `docs/` 对应文档 | 人类可读的完整说明，SKILL.md 末尾用 `→` 指向 | 不限 |

### 2. frontmatter 格式（必填）

```yaml
---
name: <kebab-case 语义名，与目录名一致>
description: 当<触发场景>时加载。包含<一句话内容摘要>。
---
```

### 3. SKILL.md 必备小节

- `## 什么时候加载这个 skill`（触发条件清单，逐条可判定）
- `## 核心规则速查`（表格：规则 / 检测方式）
- `## 禁止事项`（有禁区必有清单）
- `## 完整文档`（`→` 指向 docs 深链）

### 4. 编号纪律

- 规则编号（`R-*`、`清单 N`、反例 `R1-RN`）**永久不变，只追加不修改**——文档、`quality-gate.mjs`、lessons.md 互相引用，改编号会静默断链。
- 教训条目：追加式，不删历史，每条登记"固化成的规则编号"。

### 5. 命名

- skill 目录与 frontmatter `name` 均为 kebab-case，无数字前缀。
- 规则文件一律 `rules.md`，教训台账一律 `lessons.md`，避免同义命名扩散。

## 边界

- `.agents/` 只放**规则与速查**，不放：产品设计、商业内容、架构决策正文、调研材料（这些在 `docs/` 或私有库）。
- `AGENTS.md` 只保留快速上手；新增的复杂规则一律拆进独立 skill，禁止把规则全文写回 AGENTS.md。
