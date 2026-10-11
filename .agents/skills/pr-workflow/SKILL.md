---
name: pr-workflow
description: 当需要创建 PR、写 commit message、preflight 自检、或推送分支时加载。包含分支命名、commit 规范、preflight 命令、PR 模板要求。
---

# PR 工作流

> 完整文档见根目录 `CONTRIBUTING.md` 和 `.github/PULL_REQUEST_TEMPLATE.md`。
> 本文件是 AI 执行时的快速参考。

## 什么时候加载这个 skill

- 准备提交代码
- 准备推送分支
- 准备开 PR

## 分支命名

```
feature/<简述>-<日期>     新功能
fix/<简述>-<日期>         修复
docs/<简述>-<日期>        文档
chore/<简述>-<日期>       杂项
```

## Commit Message（Conventional Commits）

```
feat: 新增渠道连通性检测
fix: 修复模型表单协议覆盖不生效
docs: 商业文档移出仓库
refactor: 提取 ParamEditor 公共组件
test: 补 catalog service 单测
chore: 升级 Go 版本到 1.22
```

## 提交前检查

```bash
# 前端改动
cd apps/web && npm run gate

# 后端改动
cd services/<svc> && go build ./... && go test ./... && go vet ./...
```

## 禁止事项

- ❌ `git add -A`（会把别人工作提交进你的 PR）
- ❌ 直推 master
- ❌ 跳过测试强制合并
- ✅ 按路径 `git add`，提交前 `git diff --cached --name-only` 核对

## PR 流程

1. push feature 分支到 origin
2. 开 PR 到 develop（不是 master）
3. 填 PR 模板（变更概述 + 详情 + 测试结果 + 风险）
4. CI 全绿
5. 等 Owner 审查合并
6. 合并后删分支

## 完整文档

→ `CONTRIBUTING.md`
→ `.github/PULL_REQUEST_TEMPLATE.md`
