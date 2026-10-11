# 怎么发布新版本

本文教你发布一个正式版本。

## 版本号规则

用语义化版本 `MAJOR.MINOR.PATCH`：

| 位 | 什么时候加 |
|---|---|
| MAJOR | 不兼容的 API 变更 |
| MINOR | 向后兼容的新功能 |
| PATCH | bug 修复 |

例：`v1.2.3`

## 发布前检查清单

发布前逐项确认：

- [ ] develop 分支 CI 全绿
- [ ] `CHANGELOG.md` 已更新，列出所有用户可见变更
- [ ] 数据库迁移已在预发环境跑通
- [ ] 没有新增明文密钥
- [ ] 文档已同步

## 发布步骤

### 1. 合并 develop 到 master

```bash
git checkout master
git pull origin master
git merge --no-ff develop
git push origin master
```

### 2. 打 tag

```bash
git tag -a v1.2.3 -m "Release v1.2.3"
git push origin v1.2.3
```

### 3. 部署

部署流程见 `docs/architecture/05-deployment.md`。

## 回滚

如果发布后发现问题：

```bash
git checkout master
git revert <bad-commit-sha>
git push origin master
```

不要用 `git reset --hard` 回滚已发布的 commit——历史是共享的，revert 更安全。

## 热修

生产环境紧急 bug：

1. 从 `master` 拉 `hotfix/xxx` 分支
2. 修 bug，测试通过
3. 合回 `master`，打新的 patch tag
4. **同时合回 `develop`**——否则下次 develop → master 会把修复覆盖掉
