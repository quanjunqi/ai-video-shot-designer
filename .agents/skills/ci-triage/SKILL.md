---
name: ci-triage
description: 当 CI 失败、需要排查 GitHub Actions、或修改 .github/workflows/ 时加载。包含必需检查上报、fail-safe 机制、常见失败原因。
---

# CI 排障指南

> 完整文档见 `docs/how-to/ci.md`。
> 本文件是 AI 执行时的快速参考。

## 什么时候加载这个 skill

- CI 红了需要排查
- 要改 `.github/workflows/` 下任何文件
- 不确定某个 job 为什么没跑

## 核心不变量（不可违背）

**必需检查必须每一次都上报。**

- ❌ 禁止给必需检查 job 加 job 级 `if:`（会导致 PR 永远无法合并）
- ✅ 允许在 job 内部用步骤级 `if:` 过滤重量级步骤
- ✅ 用一个始终运行的 job 做判定，通过 `needs` 分发

## CI 作业结构

| Job | 何时真正执行 |
|---|---|
| Detect Changes | 始终（秒级） |
| Frontend Quality Gate | `apps/web/**` 有改动 |
| Backend Build & Test × 7（矩阵含 `shared`） | 对应 `services/<svc>/**` 有改动 |
| Security Scan | `services/**` 或 `apps/web/**` 有改动 |
| Documentation Check | 始终 |
| Merge Check | PR 汇总 |

## fail-closed 原则

判定异常时，检查会**失败**而不是跳过——宁可挡住 PR，也不给"假绿"。

## 常见失败排查

| 症状 | 先看哪里 |
|---|---|
| 所有 job 都没跑 | Detect Changes 异常 → 看它的日志 |
| Frontend 红 | `npm run gate` 本地跑一遍 |
| Backend 红 | 对应服务 `go test ./... -race` |
| 覆盖率棘轮 | `.github/coverage-baseline.txt` 下限 |
| Documentation Check 红 | 缺文件存在性检查 |

## 禁止事项

- ❌ 给必需检查 job 加 **job 级** `if:`（该 job 不上报检查记录 → 必需检查永远停在 Expected → 卡死所有 PR）
- ❌ 用 `continue-on-error: true`、`|| true`、`set +e` 让本该阻断的步骤变绿；存量豁免必须写清「修复后改回阻断」
- ❌ 把「未验证」当「通过」（缺工具、区间为空、依赖缺失时静默 exit 0 —— 未验证 ≠ 通过，应当红）
- ❌ 只跑本地「记得住」的那几道门就推送（CI 有六道关；用 `scripts/preflight.sh` 跑同口径全量）

## 完整文档

→ `docs/how-to/ci.md`（CI 跑什么 / CI 红了怎么排查）；SKIP 守卫与结构不变量见 `.github/workflows/ci.yml`
