# CI 流水线

> 本文件说明 CI 的**结构与设计约束**。改动 `.github/workflows/ci.yml` 前请先读 §3。

## 1. 它解决什么问题

每次提交/合并都跑全部检查的代价不只是时间：**文档类 PR 会被无关的后端失败卡住**。
因此 CI 会先判定「这次改了什么」，再决定哪些检查需要**真正执行**。

## 2. 作业结构

| Job（必需检查名） | 何时真正执行 |
|---|---|
| `Detect Changes` | 始终（只做判定，秒级） |
| `Frontend Quality Gate` | `apps/web/**` 有改动 |
| `Backend Build & Test (<service>)` × 6 | 对应 `services/<service>/**` 有改动 |
| `Security Scan` | `services/**` 或 `apps/web/**` 有改动 |
| `Documentation Check` | 始终（廉价：文件存在性 + 契约可解析 + 提交信息 + shell 检查） |
| `Merge Check` | PR 上的汇总 |

判定逻辑在 [`.github/scripts/detect-changes.sh`](../../.github/scripts/detect-changes.sh)，
规则见其头部注释。要点：

- **`.github/**` 与 `deploy/**` 的改动 → 全量执行**（它们可能影响所有检查）
- **任何异常（基线不可解析、diff 失败、无差异）→ fail-safe 到全量执行**
- 支持 `--from-stdin`，可不依赖 git 单元测试分类逻辑

## 3. ⚠️ 核心不变量：过滤「工作量」，**不要**过滤「检查」

> **必需状态检查必须每一次都上报。**

GitHub 不会为被 `if:` 跳过的 **job** 创建检查记录。如果给
`Frontend Quality Gate` / `Backend Build & Test` / `Security Scan` 这类**必需检查**
加 job 级 `if:`，它们在不需要运行时会**不上报**，于是分支保护里的必需检查永远停在
`Expected` —— **所有 PR 都无法合并**。

这与本项目反复出现的「假防线」是同一类问题：**规则看起来配好了，实际把所有人堵死**。

因此本仓库的约定是：

| 允许 | 禁止 |
|---|---|
| 各 job 内部用**步骤级** `if:` 过滤重量级步骤 | 给必需检查 job 加 **job 级** `if:` |
| 用一个**始终运行**的 job 做判定，通过 `needs` 分发结论 | 用 `paths:` / `paths-ignore:` 过滤整个 workflow |
| 跳过时输出一行说明（保留下一步可读性） | 静默跳过（无法与"没跑"区分） |

**fail-closed**：判定 job 异常时，各检查会**失败**而不是跳过 ——
宁可挡住 PR，也不要给出「假绿」。

### 为什么后端保留静态 6 服务矩阵

动态矩阵（`fromJSON(...)`）在「无服务改动」时会产生 **0 个 job**，于是
`Backend Build & Test (<svc>)` 永不上报 → 卡死 PR。因此保留静态矩阵，
无改动时仍会起 6 个 runner，但 `setup-go` 与全部重量级步骤都被跳过，实际开销仅数秒。
**这是刻意的取舍**：宁可多花几秒，也不引入会卡死所有人的门禁。

## 4. 新增一个检查时

1. 它是**必需检查**吗？如果是，job 必须**始终运行**，只对步骤加 `if:`
2. 需要判定「要不要跑」吗？在 `detect-changes.sh` 里加一个输出，并在 job 里消费
3. 如果它可能影响其它检查（如共享配置），记得让判定**退化到全量**
4. 新增必需检查后，**同步更新分支保护的必需检查列表**（见 [docs/how-to/branch-protection.md](branch-protection.md)）

## 5. 排障

| 现象 | 原因 / 处理 |
|---|---|
| PR 一直等某个必需检查 | 该 job 被 job 级 `if:` 跳过了 —— 见 §3，改为步骤级条件 |
| 明明没改后端，却跑了后端 | 改动命中了 `.github/**`、`deploy/**` 或判定退化到全量；看 `Detect Changes` 的 `reason` 输出 |
| 判定结果不对 | 用 `--from-stdin` 本地复现：`printf 'services/asset/a.go\n' \| bash .github/scripts/detect-changes.sh --from-stdin` |
| shell 步骤报 unbound variable | `$var` 紧跟了非 ASCII 字符（bash 会并入变量名）—— 改用 `${var}`；CI 已有专门检查 |
| 步骤报 `working directory ... No such file or directory` | 该 job 设了 `defaults.run.working-directory`，而某个 `run` 步骤在 **Checkout 之前**执行 —— 那时工作目录还不存在。给该步骤显式加 `working-directory: .`（本仓库已真实踩过：frontend job 的判定断言步骤） |

## 6. 生效验证

本设计已用「仅改文档」的 PR 实证（依据 Actions jobs API 的 **step conclusion**，
不是靠推断）：

| 作业 | 结果 | 实际执行的步骤 | 被跳过的步骤 |
|---|---|---|---|
| `Detect Changes` | ✅ success，约 4s | Checkout、Detect changed paths | — |
| `Documentation Check` | ✅ success，约 6s | Commit messages、AGENTS.md 存在性… | — |
| `Frontend Quality Gate` | ✅ success，约 3s | 判定断言 + 跳过说明 | **7 个**（npm ci / typecheck / eslint / gate / test …） |
| `Backend Build & Test (<svc>)` ×6 | ✅ success，各约 3–6s | Relevance 判定 | **各 9 个**（go build / vet / gofmt / golangci-lint / test / coverage …） |
| `Security Scan` | ✅ success | 判定断言 + 跳过说明 | gosec、npm audit |
| `Merge Check` | ✅ success | 汇总 | — |

对比：`Backend Build & Test` 真正干活时需数分钟，跳过后仅 **3–6 秒**。
关键点是**必需检查全部如实上报成功**，因此 PR 可正常合并 —— 这正是
§3 那条不变量的意义。

## 7. 集成测试必须真正执行（不得以 SKIP 冒充通过）

各服务的**真库集成测试**在未设置测试库 DSN 时会 `t.Skip` —— 于是
**"跑过且通过"与"根本没跑"在 CI 输出里无法区分**。

本项目因此**真实发生过**：2 条与迁移脱节的断言（终态取值 030/032、
`source_versions` 的 DELETE 语义 015）**红着很久无人知晓** —— 它们只在有测试库时才执行。

**对策（已落地）**：

1. `backend` job 起一个**一次性 Postgres service**（本地容器口令，非任何真实凭据）；
2. 通过 **job 级 `env`** 注入三个 DSN：
   `EXECUTION_TEST_DATABASE_URL` / `PRODUCTION_TEST_DATABASE_URL` / `WORKSPACE_TEST_DATABASE_URL`
   （判据：源码里 `os.Getenv` 的实际取值。三者都自建**随机 schema**并在结束时清理 ⇒ 共用一个库是安全的）；
3. `Test` 步骤用 `tee` 落盘，并 `set -o pipefail` 保证**退出码不被管道吞掉**；
4. 新增步骤 **`Integration tests must not skip`**：**已提供测试库时出现 `--- SKIP` 即失败**
   （复用上一步的日志，不重跑测试）。

**判据（本地复现，同一命令，唯一变量是 DSN）**：

| 条件 | `--- SKIP` 行数 | `--- PASS` 行数 |
|---|---|---|
| 提供 DSN | **0** | **112** |
| 未提供 | **4** | — |

被跳过的正是 `TestIntegration_CompleteWritesResultPayloadAndKeepsIntent` /
`TestIntegration_LegacyRowResultStillReadable` / `TestIntegration_FailOrRetryThenDeadLetter`
—— 即"**有测试但从不执行**"的那一层。

> **注意**：本节的守卫与 §3 的"必需检查必须上报"是两件事，互不冲突 ——
> §3 说的是 **job 不得被 job 级 `if:` 跳过**；本节说的是 **job 内部不得用 SKIP 冒充通过**。
> 新增的守卫是**步骤级** `if:`，符合 §3。

### 7.1 这个守卫对哪些服务**真的有约束**（如实标注）

守卫的判据是"提供了 DSN 就不许出现 `--- SKIP`"。因此**只有存在 DSN 门控测试的服务**
才真正被它保护；对没有这类测试的服务，它**空转通过**（这本身不是缺陷，但读者不应误以为
六个服务都受保护）。

| 服务 | DSN 门控的集成测试 | 守卫 |
|---|---|---|
| `workspace` | 4 条（`TestPostgresCredential*` / `TestPostgresUserChannel*`） | ✅ **有效** |
| `production` | 12 条（`TestPostgres*`） | ✅ **有效** |
| `execution` | 3 条（`TestIntegration_*`） | ✅ **有效** |
| `asset` | 5 条（`CreateUpload` / `List`；`Put`/`Commit` 需 MinIO，另议） | ✅ **有效** |
| `web-bff` | 0 条 | ⚠️ 空转 |
| `outbox-relay` | 0 条 | ⚠️ 空转 |

判据（`git grep -c TEST_DATABASE_URL` 与 `--- SKIP` 计数）：
`workspace` 无 DSN 时 PASS 20→16、SKIP 0→**4**；`production`/`execution` 的 DSN 由
`.env.local` 提供（本地默认即已开启），其集成测试条数分别为 12 / 3 —— 源码可数。

> **已补**：`asset` 的 `Store` 现已覆盖 `CreateUpload` / `List`（`PUT`/`Commit` 会连 MinIO，
> 需在 CI 再加一个对象存储 service，另议）。这批测试在补上之前**即使写了也不会在 CI 执行**。

## 相关文档

- 分支与必需检查：[docs/how-to/branch-protection.md](branch-protection.md)
- 本地提交前自检：[`../CONTRIBUTING.md`](../../CONTRIBUTING.md) §4
- 测试与覆盖率门禁：[docs/how-to/run-tests.md](testing.md)
