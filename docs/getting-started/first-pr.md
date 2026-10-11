# 提交第一个 PR

第一次给这个项目提代码，按这个流程走。

## 1. 拉分支

```bash
git checkout develop
git pull origin develop
git checkout -b feature/<你的功能>-<日期>
```

## 2. 写代码

前端改在 `apps/web/src/`，后端改在 `services/<服务名>/`。

## 3. 本地验证

前端：
```bash
cd apps/web && npm run gate
```

后端：
```bash
cd services/<服务名> && go build ./... && go test ./...
```

## 4. 提交

```bash
git add <具体文件>    # 不要用 git add -A
git commit -m "feat: 一句话描述"
```

Commit 格式：`feat:` / `fix:` / `docs:` / `refactor:` / `test:` / `chore:`

## 5. 推送

```bash
git push origin feature/<你的功能>-<日期>
```

## 6. 开 PR

去 GitHub 开 PR，目标分支选 `develop`。填好 PR 模板：
- 做了什么
- 为什么这么做
- 测试结果
- 风险说明

## 7. 等 CI 通过

CI 会自动跑 9 项检查。全绿后等 Owner 合并。
