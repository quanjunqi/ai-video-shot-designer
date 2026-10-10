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

判定逻辑在 [`.github/scripts/detect-changes.sh`](../.github/scripts/detect-changes.sh)，
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
4. 新增必需检查后，**同步更新分支保护的必需检查列表**（见 [branch-protection.md](branch-protection.md)）

## 5. 排障

| 现象 | 原因 / 处理 |
|---|---|
| PR 一直等某个必需检查 | 该 job 被 job 级 `if:` 跳过了 —— 见 §3，改为步骤级条件 |
| 明明没改后端，却跑了后端 | 改动命中了 `.github/**`、`deploy/**` 或判定退化到全量；看 `Detect Changes` 的 `reason` 输出 |
| 判定结果不对 | 用 `--from-stdin` 本地复现：`printf 'services/asset/a.go\n' \| bash .github/scripts/detect-changes.sh --from-stdin` |
| shell 步骤报 unbound variable | `$var` 紧跟了非 ASCII 字符（bash 会并入变量名）—— 改用 `${var}`；CI 已有专门检查 |
| 步骤报 `working directory ... No such file or directory` | 该 job 设了 `defaults.run.working-directory`，而某个 `run` 步骤在 **Checkout 之前**执行 —— 那时工作目录还不存在。给该步骤显式加 `working-directory: .`（本仓库已真实踩过：frontend job 的判定断言步骤） |

## 相关文档

- 分支与必需检查：[branch-protection.md](branch-protection.md)
- 本地提交前自检：[`../CONTRIBUTING.md`](../CONTRIBUTING.md) §4
- 测试与覆盖率门禁：[TESTING.md](TESTING.md)
