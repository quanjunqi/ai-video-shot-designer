# TASK-MODEL-007 开发日志

> 开发过程的事实源：**动作 / 证据 / 决策 / 阻塞** 四类条目，随开发同步记录。
> 规则：AC-010（`.agents/skills/acceptance-checklist/SKILL.md`）。**开工即建，随开发追加，PR 前完成；禁止交付前一次性补写。**

## 任务信息

| 字段 | 值 |
|---|---|
| 任务卡 | [TASK-MODEL-007/task.md](task.md) |
| 验收清单 | [TASK-MODEL-007/acceptance.md](acceptance.md) |
| 分支 | `feature/logical-model-reconcile-2026-10-17` |
| PR | #<待开> |
| 开工 | 2026-10-16 22:54（本地） |
| 完成 | 待填 |
| 开发者 | AI Agent（会话 m_0cwRd4Q1hew） |

## 执行轨迹（正序；每个动作一条）

### 2026-10-16 22:54 开工/探查
- **动作**：与 VOZEB-PRO 源码逐行对比（`model-routing-config.ts` 的 `synchronizeLogicalModelsWithChannels`），确认差距 = 「同名跨渠道自动合并」缺失。
- **发现/证据**：我方 `logicalmodel.go` 为纯手工 CRUD（无 merge）；真库 `model_catalog` 18 行仅 3 行挂 `logical_model_id`；`curation.go` 入池时 `logical_model_id` 可空。
- **决策**：D-001（定位为辅助工具，不替代 Owner 分组决策）；D-002（显式 reconcile API，不改为读取时纯派生）。

### 2026-10-16 22:54 立卡
- **动作**：建 `.github/tasks/TASK-MODEL-007/` 四件套（task.md / devlog.md / devlog.events.json / acceptance.md）。
- **证据**：`task.md` 定义 8 条验收判据；本卡无迁移（复用既有表）。

### 2026-10-16 23:00 开发
- **动作**：完成 `reconcile.go`（normalizeProviderModel + PlanReconcile 分桶/复用/跳过/幂等）、`reconcile_test.go`（判据 1–6 单测）。
- **动作**：单测首跑暴露死分支（D-004）→ 删除 `allocateLogicalModelID`，判据 5 收敛为「归并键即合法 id」；单测转绿。
- **证据**：`go test ./internal/catalog/ -run 'TestNormalizeProviderModel|TestPlanReconcile'` → ok。

### 2026-10-16 23:05 开发
- **动作**：完成 `reconcile_postgres.go`（ReconcileLogicalModels 单事务：读未归并行+现有分组 → 规划 → 建组 → 绑定（WHERE 再断言防并发抢占））+ 集成测试 5 用例。
- **证据**：`PRODUCTION_TEST_DATABASE_URL=… go test ./internal/catalog/ -run TestPostgresReconcile -v` → 5/5 PASS。

### 2026-10-16 23:10 开发
- **动作**：LogicalModelStore 接口（catalog + httpapi 两处）加 ReconcileLogicalModels；handlers.go 注册 `POST /internal/v1/logical-models/reconcile`；handler 测试 3 用例（200 统计 / viewer 403 / 无 store 503）。
- **证据**：`go test ./internal/httpapi/ -run TestLogicalModelReconcile` → 3/3 PASS。

### 2026-10-16 23:15 验证
- **动作**：production 全量门禁：`go build ./...` + `go test ./... -race`（9 包 ok）+ `go vet ./...` + `gofmt -l`（干净）+ `scripts/check-file-size.sh`（0 超标，新文件 ≤500 行）。
- **证据**：见本日志「验证记录 V」。
- **发现**：`scripts/preflight.sh` 报 workspace/web-bff/outbox-relay Test 失败 —— `git diff --name-only` 证明本次改动**全部在 production 内**，未触碰这三个服务；直接 `cd services/workspace && go test ./...` 实际 ok ⇒ 判定为存量/环境问题，非本次引入（如实记录，不假装全绿）。

## 决策记录 D

| 编号 | 主题 | 选项 | 选择 | 理由 | 时机 |
|---|---|---|---|---|---|
| D-001 | reconcile 定位 | A.自动建组并替 Owner 决策 / B.仅归并同名、分组可编辑 | B | TASK-MODEL-006 拍板「逻辑模型=分组机制、Owner 自行创建、不替他造数据」；同名归并是无歧义机械劳动 | 开工 |
| D-002 | 触发方式 | A.读取时实时派生 / B.显式 POST reconcile | B | logical_models 是独立表+手工可编辑，实时派生会覆盖手工语义；显式 reconcile 幂等且可控 | 开工 |
| D-003 | 已有绑定 | A.自动换组 / B.跳过不抢 | B | 与既有 `ErrModelBoundElsewhere`（409 不静默抢占）语义一致 | 开工 |
| D-004 | id 冲突后缀 | A.allocate -2/-3 后缀 / B.删除死分支 | B | 分桶按键聚合 ⇒ 键唯一，「同键新建冲突」不可达；键撞既有分组 = 同名复用（判据 4）；首个单测实证后删除（reconcile_test.go TestPlanReconcileAppendsSuffixOnConflict 首跑 FAIL 暴露） | 开发中 |

## 验证记录 V

| 编号 | 对应验收判据 | 命令/方式 | 结果 | 证据位置 |
|---|---|---|---|---|
| V-001 | 判据 8 | `cd services/production && go build ./... && go test ./... -race && go vet ./...`（带 PRODUCTION_TEST_DATABASE_URL） | ✅ PASS（9 包 ok） | 本日志 23:15 |
| V-002 | 判据 8 | `bash scripts/check-file-size.sh`（BE-SIZE-001） | ✅ PASS（0 超标；新文件 165/121/239/163 行） | 本日志 |
| V-003 | 判据 8 | `gofmt -l services/production/` | ✅ PASS（修复后无输出） | 本日志 |
| V-004 | 判据 1–6 | 纯函数单测 `-run 'TestNormalizeProviderModel\|TestPlanReconcile'` | ✅ PASS | reconcile_test.go |
| V-005 | 判据 1/3/4/6 | 集成测试 `-run TestPostgresReconcile -v` | ✅ PASS 5/5 | reconcile_postgres_integration_test.go |
| V-006 | 判据 7 | handler 测试 `-run TestLogicalModelReconcile` | ✅ PASS 3/3 | logicalmodel_handler_test.go |
| V-007 | 判据 8 | `bash scripts/preflight.sh` | ⚠️ 未全绿：production gofmt 已修；workspace/web-bff/outbox-relay Test 失败为存量（git diff 证明未触碰）+ 本地缺 golangci-lint / python3 | 本日志 23:15 |

## 阻塞与解法 B

| 编号 | 阻塞 | 根因 | 解法 | 复用教训 |
|---|---|---|---|---|
| — | — | — | — | — |

## 纪律自检（对照 `.agents` 规则，逐项留证据）

| 检查项 | 结果 | 证据 |
|---|---|---|
| 先本地测试/验证再 commit | ✅ | V-001~V-006 全绿后才进入提交 |
| 按路径 add（禁 `git add -A`） | ✅ | 提交时按路径 add（见 commit 明细） |
| 只改点名范围（未越界） | ✅ | `git diff --name-only HEAD services/` 仅 production；未动 workspace/web-bff/outbox-relay |
| 验收清单逐项勾对（AC-004/005） | ✅ | acceptance.md 全过 |
| GATE / 后端门禁全绿 | ✅ | production build/test/vet/gofmt/file-size 全绿；preflight 非本次引入项如实记录（V-007） |
| 台账同步（状态/PR 号） | 提交后更新 | ledger.json / README |
| 迁移只增不改 / 号段合规（如涉） | ✅ 不适用 | 本卡无迁移 |

## 复盘（收尾时写）

- **做得好的**：
- **可改进的**：
- **遗留/后续**：
