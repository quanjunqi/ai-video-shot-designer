# 分支保护规则

> 本文档说明 master 分支的保护规则，所有开发者和 AI Agent 必须遵守。

## master 分支保护

### 强制规则

1. **禁止直接 push**
   - 所有人（包括 Owner）禁止直接 push 到 master
   - 所有变更必须通过 Pull Request

2. **PR 必须通过 CI**
   - 前端：typecheck + eslint + gate + 单元测试
   - 后端：build + vet + 单元测试
   - 安全扫描：gosec + npm audit
   - 文档检查：AGENTS.md + 架构文档存在

3. **至少 1 人审查**
   - PR 必须至少 1 位人类审查者批准
   - AI Agent 不能作为审查者批准 PR
   - 关键路径（架构变更、安全相关）需要 2 人审查

4. **禁止强制合并**
   - CI 失败时禁止合并
   - 审查未通过时禁止合并
   - 有未解决评论时禁止合并

### 例外情况

- **紧急热修复**：需要 Owner 明确授权，事后补充审查
- **文档更新**：仅修改文档的 PR 可简化审查流程

---

## 分支命名规范

| 类型 | 命名格式 | 示例 |
|---|---|---|
| 新功能 | `feature/<简短描述>-<日期>` | `feature/audit-log-1010` |
| Bug修复 | `fix/<简短描述>-<日期>` | `fix/image-loading-1010` |
| 重构 | `refactor/<简短描述>-<日期>` | `refactor/character-store-1010` |
| 文档 | `docs/<简短描述>-<日期>` | `docs/adr-update-1010` |
| 测试 | `test/<简短描述>-<日期>` | `test/audit-api-1010` |

---

## PR 大小限制

- **理想**：< 300 行变更
- **可接受**：300-500 行变更
- **需要拆分**：> 500 行变更（除非是自动生成代码或迁移文件）

大任务必须拆分为子任务，逐个 PR 合并。

---

## AI Agent 工作规则

1. AI Agent **只能在 feature 分支工作**
2. AI Agent **禁止直接 push master**
3. AI Agent **禁止自行合并 PR**
4. AI Agent 开 PR 后必须等待人类审查
5. AI Agent 必须在 PR 中附测试结果
6. AI Agent 遇到禁区操作必须停止并询问人类

---

## 配置 GitHub 分支保护

在 GitHub 仓库设置中配置：

1. 进入 Settings → Branches → Branch protection rules
2. 点击 "Add rule"
3. Branch name pattern: `master`
4. 勾选：
   - [ ] Require a pull request before merging
   - [ ] Require approvals: 1
   - [ ] Dismiss stale pull request approvals when new commits are pushed
   - [ ] Require status checks to pass before merging
   - [ ] Require branches to be up to date before merging
   - [ ] Status checks: `Frontend Quality Gate`, `Backend Build & Test`, `Security Scan`, `Documentation Check`
   - [ ] Do not allow bypassing the above settings
   - [ ] Include administrators
5. 保存

---

**本规则自 2026-10-10 起生效。**
