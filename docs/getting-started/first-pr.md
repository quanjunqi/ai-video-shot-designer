# 提交第一个 PR

> 第一次给这个项目提代码，按这个流程走。

## 1. 拉分支

```bash
git checkout develop
git pull origin develop
git checkout -b feature/<你的功能>-<日期>
# 例：feature/add-user-profile-1011
```

## 2. 写代码

- 前端改在 `apps/web/src/` 下
- 后端改在 `services/<服务名>/` 下
- 遵循编码规范（见 `docs/product/frontend-design-rules.md`）

## 3. 跑测试

前端：
```bash
cd apps/web
npm run gate    # typecheck + eslint + quality-gate
npm test
```

后端：
```bash
cd services/<服务名>
go build ./...
go test ./... -race
go vet ./...
```

## 4. 提交

```bash
git add <具体文件>          # 不要用 git add -A
git commit -m "feat: 一句话描述做了什么"
# Conventional Commits: feat / fix / docs / refactor / test / chore
```

## 5. 推送

```bash
git push origin feature/<你的功能>-<日期>
```

## 6. 开 PR

去 GitHub 开 PR，目标分支选 `develop`（不是 master）。

PR 模板会自动加载，填好：
- 变更概述
- 做了什么 / 为什么 / 怎么做
- 测试结果
- 风险说明

## 7. 等 CI 通过

CI 会自动跑：
- 前端 typecheck + lint + 测试
- 后端 build + test + vet
- 文档存在性检查

CI 全绿后等 Owner 审查合并。

## 注意

- ❌ 不要直推 master 或 develop
- ❌ 不要 `git add -A`
- ❌ 不要跳过测试
- ✅ 每个 PR 只做一件事
