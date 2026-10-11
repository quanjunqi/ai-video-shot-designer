# 多人并行开发

多条开发线同时改同一个仓库时，用 worktree 避免互相干扰。

## 为什么要 worktree

一个工作目录同一时间只能在一个分支。同时开多条线会互相切分支、带走未提交的改动。

## 怎么用 worktree

```bash
# 创建新工作线
git worktree add .worktrees/<线名> -b feature/<分支名> origin/develop

# 查看所有 worktree
git worktree list

# 收工删除
cd <仓库根>    # ★ 先离开要删的目录！
git worktree remove .worktrees/<线名>
```

## 每条线独立配置

不同 worktree 要配不同的端口和项目名，否则 Docker 容器会互相踩：

```bash
# 在各自的 deploy/local/.env 里
COMPOSE_PROJECT_NAME=mdp-<线名>
WEB_PORT=5174    # 不要都用 5173
POSTGRES_PORT=5533
```

## worktree 里的依赖

- 改前端：在 worktree 里 `npm ci`（不要共享）
- 只改后端：可以软链主工作区的 node_modules

## 注意事项

- 按路径 `git add`，不要用 `git add -A`（会把别人的工作提交进来）
- 编号资源（迁移文件号、ADR 号）先认领再用，撞号时后到的让号
- 热点文件（CHANGELOG.md、.env.example）只追加，不重排别人的段落
