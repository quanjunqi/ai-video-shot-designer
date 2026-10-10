# 联合并行开发规范

> **定位**：多条开发线（人类或 AI）同时改同一个仓库时的操作规范。
> `AGENTS.md` §12 是本文件的摘要与入口；**细则以本文件为准**。
>
> 本规范的每一条都对应一次**真实事故**（见 §10 台账），不是预防性设想。

---

## 1. 硬约束：一条线 = 一个 worktree

一个工作目录**同一时刻只能在一个分支**。因此 N 条线必须 N 个 worktree。

**禁止在主工作区交错操作。** 实际后果（本次已发生）：

- 同一 checkout 里出现**两个 ADR-006**（编号撞车）
- 一条线**未提交**的 `CHANGELOG.md` 改动，在另一条线切换分支时**被带走**，混进了对方的改动
- `git add -A` 会把**别人的工作提交进你的 PR**（发生两次）

```bash
git worktree add .worktrees/<线名> -b <分支> origin/master   # 优先放在 .worktrees/（已 gitignore）
git worktree add ../mdp-<线名>   -b <分支> origin/master     # 或仓库外的兄弟目录
git worktree list                                            # 确认
git worktree remove .worktrees/<线名>                        # 收工
```

**每条线独立配置本地栈**（否则容器/端口互相踩）：在各自 `deploy/local/.env` 用不同
`COMPOSE_PROJECT_NAME` 与端口段。

**worktree 需要可用的依赖**：本仓库 `pre-commit` 会跑 `npm run gate`，缺 `node_modules`
会以 `tsc: command not found` 失败。

- **改前端** → 在 worktree 内 `npm ci`（不要共享）
- **只改后端** → 可临时软链借用：`ln -s <主工作区>/apps/web/node_modules apps/web/node_modules`
  （提交前删除，避免把链接带进 diff）

---

## 2. 分支：三层模型（`feature → develop → master`）

```
master    生产分支：只接受来自 develop 的验收通过合并 + hotfix
 develop   集成分支：feature 合入 → 在此验收 → 通过后合并到 master
 feature/* 开发分支：统一从 develop 拉取
```


| 规则 | 原因 |
|---|---|
| feature 基于 `origin/develop` 拉分支（**不是 master**） | 从 master 拉会缺少已集成未发布的依赖；堆叠 PR 在有人先合并后会大面积冲突 |
| **hotfix 从 `master` 拉，修完必须合回 `develop`** | 否则下次 develop→master 会覆盖该修复 |
| **合并必须用 merge commit，禁止 squash** | squash 生成新 SHA，孩子 PR 的 diff 会变回全量 |
| 不删他人尚未合并分支的基线 | GitHub 会**自动关闭**以它为基线的 PR，且**无法重开** |
| 合并后删**自己的**远端分支 | 安全 |

---

## 3. 编号资源：**先认领，后使用**

编号是**全局唯一资源**，并行时最容易撞车。

| 资源 | 规则 |
|---|---|
| **迁移文件** | 按 `AGENTS.md` §12.3 的号段表认领；用尽或借用须在 PR 说明并更新该表。**后合并方负责改号并重跑迁移验证** |
| **ADR 编号** | 开 ADR 前先 `ls docs/adr/` 并在任务卡登记编号。**撞号时后到者让号，并同时改文件名与内部标题**（本次：我方 006 → 007） |
| **任务卡编号** | 同域内递增（`TASK-<域>-NNN`），开卡前先 `ls .github/tasks/` |

**撞号不可「先到先得、后来者改天再说」** —— 让号是立即动作，否则两个 006 会一起合进 master。

---

## 4. 热点文件：只追加，不重排，**且追加后立即提交**

| 文件 | 规则 |
|---|---|
| `CHANGELOG.md` / `.env.example` | 只在自己的小节追加；不改动他人段落 |
| `AGENTS.md` / `docs/architecture/*` | 改前先 rebase；结构性重排单独 PR |
| `apps/web/src/lib/api/client.ts` | 只追加自己的方法段 |
| `.github/workflows/*` | **一次只允许一条线改**；改后必须跑一次全量（改动 `.github/**` 按设计触发全量） |

> **追加后立即提交**：长时间留在工作区的改动，会在别人切分支时被带走（本次已发生）。

---

## 5. 命令与结果验证（血泪条款）

**禁止**用 `&&`、`-q`、`2>/dev/null`、管道来**推断** git 操作成功 —— 失败会被静默吞掉。

**必须显式校验结果**：

| 操作 | 正确的校验 |
|---|---|
| `commit` | `git log --oneline -1` 并确认是**新**提交（与 `origin/master` 不同） |
| `push` | **比对本地 HEAD 与远端分支 SHA 是否相等**（`git ls-remote --heads origin <branch>`）—— 不是"分支存在" |
| `worktree add` / 目录创建 | 校验 `.git` 文件/目录**确实存在** |
| `merge` | `merged: true` + 记录新 SHA |

**反例（本次真实发生 5 次）**：`git push ... \| grep`（失败被过滤）、
`git push && echo "✅"`（echo 未执行但被忽略）、`git commit 2>/dev/null && echo`（错误被吞）、
`if cmd \| tail; then echo "✅"`（退出码来自 `tail`）、
`git ls-remote \| grep -q` 后打印"已校验"（分支存在 ≠ 内容正确）。

---

## 6. 提交：按路径提交，**禁止 `git add -A`**

在共享工作区里 `git add -A` 会把别人的工作提交进你的 PR。

```bash
git add <自己的路径>...                       # 显式列举
git diff --cached --name-only                 # 提交前核对清单
```

若发现工作区里有**不属于本线**的文件：**取消暂存（`git reset`）并原样留在磁盘**，
由它的所有者提交。**不要删除、不要提交、不要 stash**（stash 会把别人的改动一起收走）。

---

## 7. 交接与冲突

- **需要别人未合并的工作**：不要复制文件。基于它的分支（并接受堆叠风险），或等它合并
- **热点文件冲突**：先 `git rebase origin/master`，再改
- **编号/路径被别人占用**：让号或让位，不要抢
- **发现别人线里有疑似缺陷**：只在报告/任务卡里记录，**不代改**

---

## 8. 收工清单

- [ ] 自己的远端分支已删除（合并后）
- [ ] `git worktree remove .worktrees/<线名>`（先删软链的 `node_modules`）
- [ ] 本地已合并分支删除，避免 `git branch -vv` 噪音
- [ ] `git worktree list` 确认只剩应有项

---

## 9. 开工清单

- [ ] `git fetch origin master` → 基于 `origin/master` 建 worktree + 分支
- [ ] 在任务卡登记：**迁移号段** / **ADR 编号**（若涉及）
- [ ] 确认要改的热点文件**没有他人未合并的改动**（`git log origin/master..origin/<他人分支> -- <文件>`）
- [ ] `node_modules` 就绪（否则 pre-commit 会失败）
- [ ] 记下本线要改的文件清单 —— 提交时按此清单 `git add`

---

## 10. 事故台账（本规范的依据）

| # | 事故 | 根因 | 已固化为 |
|---|---|---|---|
| 1 | 子代理 `git checkout -b` 切走共享工作区分支，父线提交差点落错分支 | 一个目录只能一个分支 | §1 |
| 2 | 两条线共用主工作区 → **两个 ADR-006** | 编号未认领 | §3 |
| 3 | 我方未提交的 `CHANGELOG.md` 被切分支带走 | 追加后未立即提交 | §4 |
| 4 | `git add -A` 把他人文件提交进本线（2 次） | 未按路径提交 | §6 |
| 5 | 5 次用命令链"推断"git 成功，实际失败被静默 | 用表象代替校验 | §5 |
| 6 | 软链 `node_modules` 前，worktree 内 pre-commit 因 `tsc not found` 失败 | worktree 无依赖 | §1 |
| 7 | ADR 让号（006→007）、迁移号段冲突 | 编号是全局资源 | §3 |
