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

## 覆盖率棘轮口径（fail-closed · TASK-PROC-009 修订）

- 实现：**`.github/scripts/check-coverage.sh`**（CI 的 Coverage floor 步骤与本地同一个脚本）
- 退出码 **0 通过 / 1 失败 / 2 无法判定**：
  - **1**：某服务**测全了**却低于下限（真回退）；或**新增服务未登记下限**；或基线里有**陈旧条目**
  - **2**：**测试未通过**（含编译失败）；或**有测试被 `t.Skip`**（缺库/对象存储凭据 ⇒ 与 CI 不同口径）；
    或测试通过但无覆盖数据；或本地 CI 等价库不可达
  - ★ **2 ≠ 通过**。且 **"测不出来"与"测出来但太低"必须分开**——否则一次环境问题会被报成一片"覆盖率回退"（假红）
- **扫描范围是实际服务目录**（`services/*/` 含 Go 文件者），**不是基线条目**
  ⇒ 新增服务**不可能**无门禁上线（此前会因 `done < $BASELINE` 被静默跳过）
- 本地跑法：未预设 `*_TEST_DATABASE_URL` 时，脚本自动指向本机 **CI 等价库**
  `ci-repro-pg`（`postgres:16-alpine`，凭据同 ci.yml:151-184，端口 15432，可用 `CI_REPRO_PG_PORT` 覆盖）；
  **不可达 ⇒ 判 2**，不静默改用错误的库
- 测试命令与 CI **完全一致**：`go test ./... -v -coverprofile=…`（**`-v` 不可省**：
  否则 Go 不打印 `--- SKIP`，跳过数恒为 0，"能否判定"的判据就失效）
- ★ 本地另需注意**工具链**：本仓 6/7 个 `go.mod` 要求 `go 1.26.0`（`shared` 是 1.23），
  而 `GOTOOLCHAIN=auto` 会在缓存变动时出现混用
  （实测 `compile: version "go1.26.0" does not match go tool version "go1.25.7"`）。
  建议显式 `GOTOOLCHAIN=go1.26.0`；门禁的信息行会打印实际工具链。
- `cmd/` 一律排除出覆盖率统计（装配层无业务可测，计入会无谓拉低）
- **排除是无条件的**：凡服务没有 internal/（业务堆在 cmd/），覆盖率无法测量 → 门禁失败
- 结构规范靠门禁强制，而不是靠"因为薄所以例外"

## 文件行数棘轮口径（fail-closed · TASK-PROC-005）

- 上限：`services/**/*.go` ≤ **500 行**（BE-SIZE-001）；`services/*/cmd/server/main.go` ≤ **50 行**（BE-LAYER-002）
- 实现：**`scripts/check-file-size.sh`**（**单一实现**：CI 的 Documentation Check 步骤与 `scripts/preflight.sh` 门 0c 都调它）
- 基线：`.github/file-size-baseline.txt`（**存量豁免，只减不增**；实测 > 基线登记值即失败，不在基线却超上限也失败）
  - ★ **2026-10-16 已清零（0 条登记）** ⇒ 存量豁免清完，**此后任何超限文件都直接阻断**。
    修好一个文件就从基线删一行；清空即代表该规则**全面阻断**（本文件保留以承载语义说明）。
- 退出码：`0` 通过 / `1` 违规 / **`2` 无法检查（缺 python3／基线缺失或格式错／**扫描目录下无任何 .go 文件**）—— 2 ≠ 通过**
  - ★ fail-closed 的口径是「**扫到了几个文件**」，不是「有几个违规」：
    **没扫到文件 = 未验证（2）**；**扫到文件但零违规 = 通过（0）**。
    （曾经写成"零违规且空基线 ⇒ 2"，那会让**达标即自锁**——清零基线后门禁不可用。）
- 自检：`bash scripts/check-file-size.sh --self-test`（**9 例：6 反例 + 3 正例**，证明门禁真的会红，
  且**目标成功态必须判绿**、**空扫描区间必须判红**）
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
