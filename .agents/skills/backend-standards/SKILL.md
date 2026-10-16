---
name: backend-standards
description: 当修改 services/ 下任何 Go 代码时加载。包含后端分层纪律（cmd 只装配）、文件粒度上限、覆盖率棘轮口径、错误/数据/并发规范。
---

# 后端代码设计规范

> 完整规则见 `rules.md`（本目录，唯一权威）。
> 本文件是 AI 执行时的快速参考。

## 什么时候加载这个 skill

- 改了 `services/<svc>/` 下任何 `.go` 文件
- 新增后端包、handler、store、迁移
- 涉及覆盖率、分层、文件组织

## 交付前必须跑

```bash
cd services/<svc>
go build ./... && go vet ./... && go test ./... -race
```

**CI 有六道关**：build / vet / gofmt / golangci-lint / test `-race` / 覆盖率棘轮。本地全绿 ≠ CI 绿。

## 硬规则（违反 = CI 阻断）

| 编号 | 规则 | 检测方式 |
|---|---|---|
| BE-LAYER-001 | 依赖单向：`cmd → httpapi → usecase → domain ← store`；禁止 domain import httpapi/pgx/store | golangci-lint depguard |
| BE-LAYER-002 | **cmd/ 只装配**：只读环境变量、依赖注入、启动 server。禁止业务逻辑、SQL、handler 实现堆在 cmd/ | 覆盖率棘轮（fail-closed）+ **`cmd/server/main.go ≤ 50 行`**：`scripts/check-file-size.sh` |
| BE-LAYER-003 | 业务代码必须收敛在 `internal/<pkg>`。**无 internal/ 的服务 = 结构违规**，覆盖率门禁直接告警，不做"薄服务例外" | check-coverage.sh |
| BE-SIZE-001 | 单个文件 ≤ 500 行；超限按域拆分为同包多文件（handlers_<域>.go / <域>.go） | **`scripts/check-file-size.sh`**（CI 的 Documentation Check 步骤 + `scripts/preflight.sh` 门 0c **同一实现**） |
| BE-ERR-001 | 错误码从共享源生成，禁止硬编码字符串/HTTP 状态码判断 | CI 生成同步检查 |
| BE-SEC-001 | 审计日志同步写，禁止异步写审计、禁止日志输出密钥/PII | 代码审查 + gosec |

## 覆盖率棘轮口径（fail-closed）

- `cmd/` 一律排除出覆盖率统计（装配层无业务可测，计入会无谓拉低）
- **排除是无条件的**：凡服务没有 internal/（业务堆在 cmd/），覆盖率无法测量 → 门禁失败
- 结构规范靠门禁强制，而不是靠"因为薄所以例外"

## 文件行数棘轮口径（fail-closed · TASK-PROC-005）

- 上限：`services/**/*.go` ≤ **500 行**（BE-SIZE-001）；`services/*/cmd/server/main.go` ≤ **50 行**（BE-LAYER-002）
- 实现：**`scripts/check-file-size.sh`**（**单一实现**：CI 的 Documentation Check 步骤与 `scripts/preflight.sh` 门 0c 都调它）
- 基线：`.github/file-size-baseline.txt`（**存量豁免，只减不增**；实测 > 基线登记值即失败，不在基线却超上限也失败）
- 退出码：`0` 通过 / `1` 违规 / **`2` 无法检查（缺 python3／基线缺失或格式错／扫不到 Go 文件）—— 2 ≠ 通过**
- 自检：`bash scripts/check-file-size.sh --self-test`（7 例：5 反例 + 2 正例，证明门禁真的会红）
- **为什么含 `*_test.go`**：规则原文无例外；棘轮只约束**单文件增长**，**新增测试文件不受限**，不会抑制补测试
- **为什么需要它**：这两条规则此前的检测方式是「人工 + PR 审查」⇒ 实测已漂移 12 处
  （5 个 >500 行的 Go 文件 + 3 个 >50 行的 main.go）。**修好一个文件就从基线删一行；清空即代表全面阻断。**

## 文件组织（高内聚低耦合）

- **一个文件一个域**：handler 按域拆（handlers_catalog.go / handlers_episodes.go / handlers_rules.go…），engine/store 按职责拆（request.go / params.go / query.go / stats.go…）
- **cmd/server/main.go ≤ 50 行**：只留 main()（读 env → New → ListenAndServe），装配校验收敛在构造函数
- 测试随业务迁移到同包（git mv），不留在 cmd/

## 完整规则

→ `rules.md`（BE-* 全量规则 + 正反例）
→ 覆盖率棘轮口径见本文「覆盖率棘轮口径」；必需检查不变量见 `.github/scripts/check-workflow-structure.sh` 头部
