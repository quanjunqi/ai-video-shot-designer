# 分支保护规则

> 本文档说明 `master` 分支的保护规则，所有开发者和 AI Agent 必须遵守。
> **本文件描述的是已实际生效的配置**（2026-10-10 通过 GitHub API 核实）。修改规则后必须同步本文档。

## 一、master 强制规则（实际生效）

| # | 规则 | 状态 | 说明 |
|---|---|---|---|
| 1 | Require a pull request before merging | ✅ 启用 | 所有人（含 Owner、管理员）禁止直接 push master |
| 2 | Require status checks to pass | ✅ 启用 | 必须通过下列 9 项检查 |
| 3 | Do not allow bypassing the above settings | ✅ 启用 | `enforce_admins = true`，管理员也不能绕过 |
| 4 | Allow force pushes | ❌ 禁止 | 禁止改写 master 历史 |
| 5 | Allow deletions | ❌ 禁止 | 禁止删除 master |
| 6 | Requires approving review count | ⚠️ **0** | 见「四、审批数为何是 0」 |

### 必需通过的检查（9 项）

| 检查 | 覆盖内容 |
|---|---|
| `Frontend Quality Gate` | typecheck + eslint + quality-gate 静态扫描 + 单元测试 |
| `Backend Build & Test (workspace)` | go build + go vet + go test |
| `Backend Build & Test (production)` | 同上 |
| `Backend Build & Test (execution)` | 同上 |
| `Backend Build & Test (asset)` | 同上 |
| `Backend Build & Test (web-bff)` | 同上 |
| `Backend Build & Test (outbox-relay)` | 同上 |
| `Security Scan` | gosec + npm audit |
| `Documentation Check` | AGENTS.md / 架构文档 / ADR 目录存在 |

> 任一必需检查未通过或未运行，GitHub 会拒绝合并。这是**真实生效**的硬门禁，不是文档承诺。

### 不启用「Require branches to be up to date」

`strict = false`。CI 已校验 PR 自身与目标分支的合并结果，强求分支实时领先会显著增加无意义的 rebase 成本。

---

## 二、分支命名规范

| 类型 | 命名格式 | 示例 |
|---|---|---|
| 新功能 | `feature/<简短描述>-<日期>` | `feature/audit-log-1010` |
| Bug 修复 | `fix/<简短描述>-<日期>` | `fix/image-loading-1010` |
| 重构 | `refactor/<简短描述>-<日期>` | `refactor/character-store-1010` |
| 文档 | `docs/<简短描述>-<日期>` | `docs/adr-update-1010` |
| 测试 | `test/<简短描述>-<日期>` | `test/audit-api-1010` |
| 仓库维护 | `chore/<简短描述>-<日期>` | `chore/repo-tidy-1010` |

---

## 三、PR 大小限制

- **理想**：< 300 行变更
- **可接受**：300–500 行变更
- **需要拆分**：> 500 行变更（自动生成代码、迁移文件、首次导入除外）

大任务必须拆分为子任务，逐个 PR 合并。

---

## 四、审批数为何是 0（重要）

**原始配置**为 `required_approving_review_count = 1` + `enforce_admins = true`。该组合在**单账号仓库**下构成死锁：

1. GitHub **禁止审批自己的 PR**
2. 仓库只有 1 个协作者（Owner），没有第二个账号能审批
3. `enforce_admins = true` 使管理员也无法绕过

结果：**任何人都无法合并任何 PR**（2026-10-10 实测，PR #1 CI 10/10 全绿仍为 `blocked`）。

### 现行方案（2026-10-10 起）

审批数调整为 **0**，其余规则全部保留。得到的门禁是：

> **必须走 PR + 必须 9 项 CI 全绿 + 管理员不可绕过**

这保留了「不可绕过」的原始意图，只去掉了在单账号仓库下永远无法满足的人工审批要求。

### 如需恢复「必须有人审批」

任选其一，然后通过 GitHub API/UI 把审批数改回 1：

1. **推荐**：新增第二个协作者账号（协作者或机器人账号），由它审批
2. 关闭 `enforce_admins`（不推荐：会使管理员可绕过全部规则，弱于现方案）

---

## 五、AI Agent 工作规则

1. AI Agent **只能在 feature/fix/chore 等分支工作**
2. AI Agent **禁止直接 push master**
3. AI Agent 开 PR 后，**默认等待人类 Owner 审查并合并**（`AGENTS.md` §5.4 / §9.3）
4. 如需 AI Agent 执行合并动作，必须由 Owner 在会话中**明确授权**，并在 PR 中留有记录
5. AI Agent 必须在 PR 中附测试结果与风险说明
6. AI Agent 遇到禁区操作必须停止并询问人类

---

## 六、如何修改本规则

**GitHub UI**：Settings → Branches → Branch protection rules → `master`

**GitHub API 注意**：REST 端点
`PATCH /repos/{owner}/{repo}/branches/master/protection`
在部分令牌类型下会返回 **404 Not Found**（GitHub 用 404 掩盖权限不足）。
若遇到该情况，改用 **GraphQL `updateBranchProtectionRule`**，同一令牌可正常写入。

---

**本规则自 2026-10-10 起生效；最近一次核实与更新：2026-10-10。**
