# 分支规则

本文说明分支模型、命名规范和保护规则。

## 三层分支模型

```
master    ← 生产分支，只接 develop 验收通过的合并 + hotfix
develop   ← 集成分支，所有 feature PR 合到这里
feature/* ← 开发分支，从 develop 拉
```

## 分支命名

| 类型 | 格式 | 示例 |
|---|---|---|
| 新功能 | `feature/<描述>-<日期>` | `feature/audit-log-1010` |
| Bug 修复 | `fix/<描述>-<日期>` | `fix/image-loading-1010` |
| 文档 | `docs/<描述>-<日期>` | `docs/readme-update-1010` |
| 维护 | `chore/<描述>-<日期>` | `chore/deps-upgrade-1010` |

## 保护规则

master 和 develop 都开启了保护：
- 必须走 PR，不能直接 push
- 必须 CI 全绿
- 禁止 force push
- 禁止删除分支

## 必需通过的 CI 检查（9 项）

1. Frontend Quality Gate
2. Backend Build & Test × 6（workspace / production / execution / asset / web-bff / outbox-relay）
3. Security Scan
4. Documentation Check

## hotfix

生产环境紧急 bug：
1. 从 master 拉 `hotfix/xxx` 分支
2. 修 bug，测试通过
3. 合回 master，打 patch tag
4. **同时合回 develop**——否则下次 develop → master 会覆盖修复
