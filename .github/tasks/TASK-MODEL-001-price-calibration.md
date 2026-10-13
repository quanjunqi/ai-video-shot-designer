# 任务卡：T0 权威价格校准

> 按 `.github/TASK_TEMPLATE.md` 填写。本卡随 PR 附上。

## 基本信息

- **任务 ID**：TASK-MODEL-001
- **任务名称**：T0 权威价格校准（价格来源策略落地 + 审计成本取权威价 + 校准记录 + 对账告警）
- **创建日期**：2026-10-13
- **人类 Owner**：quanjunqi
- **AI 执行者**：Doubao MainAgent
- **优先级**：P0
- **预计工时**：2-4 人日

---

## 1. 目标

**目标**：让审计成本不再「精确地算错账」——审计 `cost_amount` 不再恒为 0，而是来自 `model_catalog` 的权威价（`cost_amount` + `price_source` 口径），并提供校准记录与对账告警机制。

**背景**：ADR-004 实测手写 billing 与中转站实价差 33 倍；execution 审计 `cost_amount` 目前恒为 0（`audit/store.go` 注释明示）。dev-plan v1.3 将 T0 列为 P0-A 第一前置（M1 数据就绪），T2 成本看板、T3 预算拦截都依赖权威价。

---

## 2. 范围

### 范围内（In Scope）

- **契约扩展**：production catalog 的 Model 响应增加 `costAmount / costUnit / priceSource / priceSyncedAt`；execution `catalog/client.go` 的 `Model` 结构同步加字段（跨服务契约，execution 不直连 production 库）
- **审计成本写入**：executor 调用成功回写审计时，用命中模型的权威 `cost_amount` 写入 `gateway_audit_logs.cost_amount`（不再恒 0）；无校准价时写 0 并保留「预估」标记（响应摘要可辨）
- **校准记录表迁移**：`price_calibration_logs`（execution 012 号段）—— 记录校准事件（模型 / 来源 / 对账差异 / 状态）
- **对账任务**：可触发的一次性对账（抽样最近 N 条真实调用按渠道×模型聚合实际成本 vs `model_catalog.cost_amount`，差异 >20% 告警写校准日志）
- **测试**：单元（价格字段解析 / 对账差异判定 / 审计写入非 0）+ 集成（契约含价）

### 范围外（Out of Scope）

- ❌ 报表「已校准/预估」双口径 UI（T2 范围，T0 只提供数据口径）
- ❌ 预算拦截（T3 范围）
- ❌ 引入第三方定价服务
- ❌ 修改 ADR-004 成本/售价分离字段语义
- ❌ 自动周期对账调度（本任务只做可触发一次 + 可被调度复用的纯函数）

---

## 3. 相关文件

| 文件 | 说明 |
|---|---|
| `docs/adr/relay-supply-pool.md` | ADR-004：cost/price 分离、price_source 语义、同步规则 |
| `services/production/migrations/037_model_cost_price.sql` | model_catalog 六列已建（无需新迁移） |
| `services/production/internal/catalog/` | 策展（curation.go 已实现价格来源策略雏形：manual 优先、留空取 synced） |
| `services/execution/internal/catalog/client.go` | execution ← production 契约客户端（Model 缺 cost 字段） |
| `services/execution/internal/audit/store.go` | 审计写库（`cost_amount` 恒 0 问题点） |
| `services/execution/internal/engine/executor.go` | 调用执行器（成本回写位置） |
| `services/execution/migrations/` | 011 已用，012 认领 |
| `ai-video-shot-designer-private/proposals/model-compute/dev-plan.md` | T0 任务卡定义（§7） |

---

## 4. 验收标准（判据四要素）

| # | 判据（看什么算过） | 对象（看哪个 ref/环境） | 时点 | 例外 |
|---|---|---|---|---|
| 1 | `catalog.Model` 响应与结构均含 cost 四字段，契约测试断言字段非空可解析 | production + execution 代码 / `go test ./...` | 提交时 | 空值合法（无校准价），断言「可解析」而非「必有值」 |
| 2 | 调用成功后审计 `cost_amount` 写入权威价（非 0），单元测试断言 | execution 单测（mock 命中模型带 costAmount） | 提交时 | 无校准价时写 0 合法，属「预估」口径 |
| 3 | 迁移 012 可应用、可回滚；表结构含模型/来源/差异/状态 | `deploy/local` 迁移执行器 | 提交时 | — |
| 4 | 对账纯函数：差异 >20% 判定正确（构造差异 15%/21% 两组断言） | execution 单测 | 提交时 | 数据不足时不告警属合法（抽样下限） |
| 5 | `npm run gate` 不涉及；后端 `go build ./... && go vet ./... && go test ./...` 全绿 | T0 worktree | PR 前 | CI 以 GitHub Actions 为准（本地绿 ≠ CI 绿） |
| 6 | PR 到 develop，CI 全绿（backend execution ×1 + production ×1 等），merge commit 合并 | GitHub Actions | CI 完成时 | 未合并不算完成 |

---

## 5. 测试命令

```bash
# 在 worktree 内
cd services/execution && go build ./... && go vet ./... && go test ./... -race
cd services/production && go build ./... && go vet ./... && go test ./... -race
# 迁移验证（本地 compose）
docker compose --env-file deploy/local/.env -f deploy/local/compose.yaml --profile app up production-migrate execution-migrate
```

---

## 6. 约束与禁止事项

- ❌ execution 不得直连 production 库——价格只能走 `catalog.Client` 契约
- ❌ 不修改 037 已执行迁移（只增不改）
- ❌ 不改 ADR-004 字段语义；`price_source` 枚举 manual/synced 不动
- ✅ 迁移号 012 认领（execution 010-019 段，011 已用）
- ✅ 按路径 `git add`，提交前 `git diff --cached --name-only` 核对
- ✅ Conventional Commits（feat: T0 权威价格校准…）

---

## 7. 输出

- 分支：`feature/t0-price-calibration-1013`
- PR：→ develop（merge commit，禁 squash）
- 测试结果：本地 + CI 全绿
- 风险说明：跨服务契约改动（production 响应加字段）向后兼容（新增字段不破坏旧客户端）
