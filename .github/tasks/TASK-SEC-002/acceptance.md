# TASK-SEC-002 验收清单

> 对应任务卡：`task.md`（配额与限流：QPS 令牌桶 + 日/月成本上限）。模板 `templates/acceptance-checklist.md`。
> 实现已在 develop（quota 包 + audit.Spend + 009 迁移 + 网关接线），本清单按任务卡 10 条验收标准逐项验证（2026-10-15）。

## 总览

| # | 验收标准（任务卡原文） | 对应测试 / 证据 | 结果 |
|---|---|---|---|
| 1 | 令牌桶：容量内放行、耗尽拒绝；按时间补充且不超过容量 | `TestAllowQPS_TokenBucketRefillAndBurst` | ✅ |
| 2 | 按 workspace 隔离：一个租户被限流不影响另一个 | `TestAllowQPS_PerWorkspaceIsolation` | ✅ |
| 3 | QPS<=0 显式关闭限流 | `TestQPS_DisabledWhenZeroOrNegative` | ✅ |
| 4 | 达日/月上限 → 拒绝（quota_exceeded） | `TestCheckCost_DailyLimit` + `TestCheckCost_MonthlyLimit` | ✅ |
| 5 | 未配置成本上限时不查询花费（零开销） | `TestCheckCost_NoLimitConfiguredSkipsProvider` | ✅ |
| 6 | 花费聚合失败 fail-open（放行 + 可观测） | `TestCheckCost_FailsOpenOnProviderError` | ✅ |
| 7 | 花费查询有 TTL 缓存（TTL 内只查一次） | `TestCheckCost_SpendCacheAvoidsRepeatedQueries` + quota.go `SpendCacheTTL` 默认 30s | ✅ |
| 8 | 限流先于成本判定（被限流时不再查花费） | `TestCheck_QPSBeforeCost` | ✅ |
| 9 | HTTP 层：超限 429 + 响应带 RATE_LIMITED 标记 | `TestGenerateRejectsWhenRateLimited` | ✅ |
| 10 | 对照：未启用配额时不被 429 拦截 | `TestGenerateUnaffectedWhenQuotaDisabled` | ✅ |

**结论：10/10 全过。**

## 实现与接线证据

- **quota 包**：`internal/quota/quota.go`——令牌桶（容量/补充/隔离）+ `SpendProvider` 接口 + `Check`（QPS 先于成本）+ `Config`（QPS/Burst/DailyCostLimit/MonthlyCostLimit/SpendCacheTTL 默认 30s）+ `FromEnv`
- **花费聚合**：`audit/store.go:188 Spend(ctx, workspace) (day, month)`（按租户聚合当日/当月 cost_amount）
- **迁移 009**：`migrations/009_quota.sql`（(workspace_id, created_at) 覆盖索引，审计表增长最快）
- **网关接线**：`cmd/server/main.go:89-90` `quota.FromEnv` + `quota.New(quotaCfg, auditStore)`；`main.go:157` Handler `Quota: quotaLimiter`；handlers_generate.go 配额检查在 **Catalog/Creds/Engine 任何下游调用之前**（先限流/成本判定，再查目录）
- **文档**：任务卡已含 `.env.example`/`SECURITY.md`/`CHANGELOG.md` 说明（卡内"阶段 1 完成情况"已标 ✅）

## 验证记录（可复跑）

- `cd services/execution && go test ./internal/quota/ -v` → **10 项 PASS**
- `go test ./internal/httpapi/ -run "RateLimited|QuotaDisabled" -v` → **2 项 PASS**（429 + RATE_LIMITED / 未启用不拦截）
- execution 全量（带 DB）17 包全绿（AUDIT-001 验收时实测，SEC-002 无新代码）
- gofmt/build/vet 全过

## 例外与后续

1. **多实例限流为每实例计数**（任务卡非范围已声明：单实例或按实例数放大 QPS；分布式需 Redis，属阶段 2）
2. **不按模型/渠道差异化限额**（非范围：先用租户级）
3. **成本上限默认不限制**（额度属业务决策，`<=0` 即关闭——标准 5 验证零开销路径）
