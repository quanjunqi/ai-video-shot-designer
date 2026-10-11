---
name: parallel-worktree
description: 当需要并行开多条开发线、创建新 worktree、或在已有 worktree 里工作时加载。包含三层分支模型、worktree 操作、热点文件规则。
---

# 并行开发 Worktree 规范

> 完整文档见 `docs/development/parallel-development.md`。
> 本文件是 AI 执行时的快速参考。

## 什么时候加载这个 skill

- 需要新开一条开发线（新功能、新 PR）
- 需要创建或删除 worktree
- 不确定当前该在哪个分支上工作

## 铁律：一条线 = 一个 worktree

**禁止在同一个 checkout 里切来切去。** 已发生过：
- 两个 ADR-006 撞号
- 未提交的 CHANGELOG 被切分支带走
- `git add -A` 把别人工作提交进你的 PR

## 创建 worktree

```bash
# 优先放在 .worktrees/（已 gitignore）
git worktree add .worktrees/<线名> -b feature/<简述>-<日期> origin/develop

# 或仓库外兄弟目录
git worktree add ../mdp-<线名> -b feature/<简述>-<日期> origin/develop
```

## 删除 worktree

```bash
cd <仓库根>                          # ★ 必须先离开被删目录！
git worktree remove .worktrees/<线名>
```

> **踩过的坑**：cwd 还在 worktree 里就 remove，之后所有命令报 `Unable to read current working directory`，空输出极易误读成"成功"。

## 分支三层模型

```
master    生产：只接 develop 的验收通过合并 + hotfix
develop   集成：feature 合入 → 验收 → 通过后合 master
feature/* 开发：统一从 develop 拉
```

- 合并用 **merge commit**，禁止 squash
- hotfix 从 master 拉，修完必须合回 develop
- 不要删别人还没合并的基线分支

## 迁移文件号段（先认领后使用）

| 服务 | 号段 |
|---|---|
| workspace | 001-009 |
| execution | 010-019 |
| production 模型中心 | 024-039 |
| production 项目知识库 | 040-049 |
| production 无限画布 | 050-059 |

## 热点文件（只追加不重排）

`CHANGELOG.md`、`.env.example`、`AGENTS.md`、`apps/web/src/lib/api/client.ts`、`.github/workflows/*`

## 完整规则

→ `docs/development/parallel-development.md`（§5 血泪条款 + §10 事故台账）
