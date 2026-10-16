---
taskId: TASK-PROC-006
status: 待验收
priority: **P1（关闭 BE-LAYER-002 的机器化）**
pr: "#<待开>"
criteria: 9
criteriaPassed: 8
depends_on: TASK-PROC-005（门禁已就位，本卡才能"有保障地下降"）
---

# TASK-PROC-006：cmd 装配收敛 —— 三个服务的 `cmd/server/main.go` 降到 ≤50 行

## 为什么是这三条（范围依据）

`TASK-PROC-005` 的基线里，`cmd/server/main.go` 超标三项：

| 行数 | 服务 | 超出上限（50 行） |
|---|---|---|
| **184** | `execution` | **×3.7** |
| 94 | `production` | ×1.9 |
| 73 | `asset` | ×1.5 |

**选它们的理由**（不是"顺手"）：
1. **同一条规则**（BE-LAYER-002「cmd/ 只装配」）+ 同一个修法（「装配校验收敛在构造函数」）
2. **本卡做完即可关闭该规则**（基线中 main.go 三项清零 ⇒ 该规则全面阻断）
3. `execution` 是**最严重的单点**（×3.7，14 个依赖装配）

## ⚠️ 一个必须写清的区分（避免误判与误改）

**实测 `execution/cmd/server/main.go`（184 行）逐段读完后确认**：

| 事实 | 证据 |
|---|---|
| 文件里**没有业务逻辑、没有 SQL、没有 handler 实现** | 逐行读全文：1-28 行 import，30-164 行 `main()` 是 env 读取 + 14 个依赖构造 + 启 worker/HTTP，166-184 行两个 env 读取工具 |
| ⇒ **不是**「业务堆在 cmd」（BE-LAYER-002 的实质违规） | —— |
| ⇒ **是**「单文件行数超上限」（该规则附带的行数上限） | —— |

**⇒ 修法因此是搬移装配、保持行为不变，而不是删逻辑。**
**若照"业务堆 cmd"去改，会误删必要装配 ⇒ 真回归。**

## 范围

1. 三个服务各引入一个**构造函数包**（建议 `internal/app`，或复用该服务既有装配包）
2. `main.go` 收缩为：读 env → 调构造函数 → 启动 → 错误退出（**≤50 行**）
3. **行为完全不变**：环境变量名、默认值、启动顺序、日志文案、`os.Exit` 语义逐条保持
4. 收敛进构造函数的**装配校验**（如 `execution` 的 `dsn/token 必填`、`ASSET_BASE_URL` 需配 token）

## 非范围

- ❌ 不改任何环境变量名或默认值
- ❌ 不改启动顺序与日志文案（改文案会让运维的既有告警/检索失效）
- ❌ **不碰其余 9 个超标文件**（4 个 >500 行的非测试文件 + 4 个测试文件；另立卡按域拆）
- ❌ 不调低/调高 `check-file-size.sh` 的阈值

## 验收标准

1. 三个 `cmd/server/main.go` **均 ≤ 50 行**（脚本实测，非目测）
2. `bash scripts/check-file-size.sh` **rc=0**，且对这三项输出「**可收紧**」（证明棘轮感知到下降）
3. **收紧基线**：把三项的基线从 184/94/73 改为实测值（棘轮"只减不增"的实际执行）
4. 行为不变可验证：`go build ./... && go test ./... -race && go vet ./...` 全绿
5. **端到端仍通**：`bash scripts/audit-verdicts.sh` 维持 **20 通过 / 0 失败、EXIT=0**
   （execution 是网关所在服务，装配改动必须用整链判据回归）
6. 三个服务的**启动仍可用**：`/api/v1/me`（BFF 依赖链）返回 200；execution 端口可连
7. 新增的构造函数包**有测试**（装配校验的分支：必填缺失、部分配置、默认值）
8. `gofmt -l` 干净；CI 六道关口径（build/vet/gofmt/lint/test/覆盖率棘轮）不受损
9. 台账 + 规则同步：基线更新后，`BE-LAYER-002` 的机器化描述若需调整则同步 SKILL.md

## 附：立卡依据（可复现）

```bash
bash scripts/check-file-size.sh        # 当前 rc=0，12 项在基线内
for s in workspace production execution asset web-bff outbox-relay; do
  printf '%-14s %s\n' "$s" "$(wc -l < services/$s/cmd/server/main.go 2>/dev/null)"; done
```
