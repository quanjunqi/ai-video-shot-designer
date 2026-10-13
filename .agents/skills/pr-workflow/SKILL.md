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

## Dependabot PR 规则（2026-10-13 事故沉淀）

- **Dependabot PR 必须开向 develop**：dependabot.yml 的 `target-branch: develop` 在 master 分支上也必须配置（GitHub 读默认分支的配置；默认分支仍是 master 时，master 上的 dependabot.yml 缺 target-branch → PR 全打 master）
- Dependabot 基于旧基座（旧 master）开出的 PR，改 base 到 develop 后 CI 仍可能假阴性（陈旧文件/旧 workflow 上下文）——**关闭旧 PR，从最新 origin/develop 重建分支 + 新 PR**，不要修旧 PR
- 合并前本地实证：`go build ./... && go test ./...` 全绿才算依赖升级本身没问题
- golangci-lint 与 go 指令要配套：pgx v5.9.2+ 要求 go 1.25；CI 的 setup-go 与 golangci-lint-action 版本要匹配（当前：Go 1.25.0 + golangci-lint-action@v7 + version v2.13.2）

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
