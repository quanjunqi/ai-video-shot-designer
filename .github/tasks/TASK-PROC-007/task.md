---
taskId: TASK-PROC-007
status: 待验收
priority: **P1（拆掉最大的 4 个 handler 文件）**
pr: "#<待开>"
criteria: 8
criteriaPassed: 7
depends_on: TASK-PROC-005（棘轮已就位）、TASK-PROC-006（已证明"搬移式拆分"的做法可行）
---

# TASK-PROC-007：handlers 按域拆分（BE-SIZE-001 的四个 handler 文件）

## 范围依据

`TASK-PROC-005` 基线剩余的 9 项里，**4 项是同一条修法**（规则原文：

> 「**一个文件一个域**：handler 按域拆（`handlers_catalog.go` / `handlers_episodes.go` / `handlers_rules.go`…）」

| 行数 | 文件 |
|---|---|
| **783** | `services/execution/internal/httpapi/handlers_generate.go` |
| **757** | `services/web-bff/internal/httpserver/handlers.go` |
| 525 | `services/execution/internal/httpapi/handlers.go` |
| 517 | `services/production/internal/httpapi/handlers.go` |

**不含**另外 4 个 `*_test.go` 与 1 个 `engine.go`（不同文件性质，另立卡）。

## 做法（沿用 TASK-PROC-006 已验证的模式）

**纯搬移，不改行为**：把同域函数整体移到**同包**的 `handlers_<域>.go`，不增删逻辑、
不改函数签名、不改路由注册顺序。Go 同包内跨文件可见 ⇒ **无需改动任何调用方**。

## 验收标准

1. 四个文件**均 ≤ 500 行**（脚本实测）
2. 拆分产生的每个新文件**也 ≤ 500 行**（不得"拆出一个新超标文件"）
3. `bash scripts/check-file-size.sh` **rc=0**，且对四项输出「**可收紧**」
4. **收紧基线**：四项从基线删除（棘轮"只减不增"的实际执行）
5. 各服务 `go build ./... && go test ./... -race && go vet ./...` 全绿
6. **整链回归**：`bash scripts/audit-verdicts.sh` 维持 **20 通过 / 0 失败 / EXIT=0**
   （execution/web-bff 都是链路必经服务）
7. **路由表不变**：拆分前后「注册的路由集合」逐条相同（用脚本对比，不靠目测）
8. `gofmt -l` 干净；台账 + CHANGELOG 同步

## 非范围

- ❌ 不改任何 handler 的逻辑、签名、错误码、状态码
- ❌ 不改路由路径与注册顺序
- ❌ 不碰其余 5 项（4 个测试文件 + engine.go）
- ❌ 不调阈值

## 附：立卡依据（可复现）

```bash
bash scripts/check-file-size.sh     # 剩余 9 项
wc -l services/*/internal/*/handlers*.go
```
