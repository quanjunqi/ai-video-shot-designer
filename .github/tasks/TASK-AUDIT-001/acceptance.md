# TASK-AUDIT-001 验收清单

> 对应任务卡：`task.md`（审计能力实施清单 ④）。模板 `templates/acceptance-checklist.md`。
> 实现经 AUDIT-002/T0/T1/T11 系列 PR 落地 develop，本清单按任务卡 §3 切片判据逐项验证（2026-10-15）。

## 总览

| 切片 | 名称 | 结论 | 证据 |
|---|---|---|---|
| D1 | 审计写入时机重构 | ✅ 已验收 | 新增集成测试（本次） + 代码证据 |
| D2 | worker 接上 auditStore | ✅ 已验收 | main.go:121 + worker/audit.go + 单测 |
| D3 | 接上 UpdateResult | ✅ 已验收 | query.go:34 + worker auditTerminalT + 集成测试 |
| D4 | 成本链（token/cost 写入） | ✅ 已验收 | D4a/D4c + T0 权威价（MODEL-001 已验收） |
| D5 | 脱敏分级 + 原文裁剪 | ✅ 已验收 | redact.go + redact_test.go 3 用例 |
| D6 | 保留期与清理 | ✅ 已验收 | purger.go + Purge 可配置 + 删除留痕 |
| D7 | 查询与聚合 | ✅ 已验收 | query.go Filter + COUNT(*) OVER() + stats 服务端 |
| D8 | 合规能力（不可变/导出/访问控制） | 🟡 部分 | 导出已实现；访问控制归 AUTH-001（第 8 刀）；不可变触发器留后续 |
| D9 | 质量评估字段 | ⛔ 不做 | Owner 已定先不做（任务卡 §6 ②） |

## 逐项判据与结果

| 切片 | 判据（任务卡原文） | 验证方式 | 结果 |
|---|---|---|---|
| D1-① | 造 MODEL_NOT_FOUND（404）请求 → 审计行 +1（现状 +0） | **新增集成测试** `TestGenerateUnknownModelWritesAuditRow`（真库：空目录 mock → POST /v1/generate 未知 modelId → 404 + 审计 COUNT=1 + status=failed + error 含 "model not found" + request_id 非空） | ✅ PASS |
| D1-② | 新行 channel_id 非空 | 代码证据：handlers_generate.go:266 `ChannelID: auditChannelID`（:400 渠道解析后赋值）；异步补齐由 `TestTerminalFillsSupplyUnit` 锁定 | ✅ |
| D1-③ | Insert 失败不再被丢弃 | 代码证据：handlers_generate.go:275 `if err := Insert; err != nil { slog.Error(...) }` | ✅ |
| D2 | 异步终态在审计可见（不停 queued） | main.go:121 `worker.Run(..., auditStore, ...)`；worker/audit.go `auditTerminal` 覆盖 executeJob 11 处调用点；`TestAuditHelpersAreSafeWithNilStore` + `TestAuditStatusVocabularyMatchesReaders` | ✅ |
| D3 | 终态回写：response_payload 非 NULL、status 终态 | query.go:34 `UpdateResultByJobID` + worker auditTerminalT 调用；`TestTerminalFillsSupplyUnit` 验证 channel/provider 补齐 | ✅ |
| D4-① | 真实调用 → token_* 非 0 | D4a（handlers_generate.go:248 注释，TokenInput/Output/Cached 落库）+ D4c（auditTerminalUsage 异步 token）；`TestAuditCostFor` 锁定成本提取 | ✅ |
| D4-③ | 日上限设极小 → 真的触发拒绝 | budget/quota 包测试全绿；T3 预算控制（MODEL-005）已验收（PR #181）——成本上限安全阀生效 | ✅ |
| D5 | 含 Key 形状串 → 入库/出 API 均不含原文 Key + 有单测 | redact.go L0 模式（sk-/bearer/api key/secret）+ store.go「写库入口唯一收口」；`TestRedactJSONMasksKeyShapes`/`KeepsBenignContentIntact`/`HandlesEmpty` 全 PASS | ✅ |
| D6 | 保留期可配置且三类可不同 + 清理任务存在 + 删除留痕 | purger.go `RunAuditPurger(successDays, failureDays, interval)` + query.go Purge；purger.go:45 清理动作写审计；`TestAuditPurgeStaysUnderSystemWorkspace` | ✅ |
| D7 | 可按 status/model/channel/时间筛选 + total 是总数 + 成功率服务端算 | query.go ListByWorkspace Filter + `COUNT(*) OVER()`（同查询取 total）+ stats.go 服务端聚合；aggregate/stats 集成测试全 PASS | ✅ |
| D8 | 追加后改不动 + 可导出 + 不再靠共享 token 跨租户 | 导出：`GET /internal/v1/audit/export` + audit_export_test.go ✅；访问控制：**未完成 → 归 AUTH-001（三角色强制鉴权 403）**；不可变触发器：未做，记录后续 | 🟡 |
| D9 | 质量评估（评分/返工） | Owner 已定**先不做**（新功能，D1–D7 是把已有的写对，性价比高得多） | ⛔ |

## 验证记录（可复跑）

- 新增测试：`go test ./internal/httpapi/ -run TestGenerateUnknownModelWritesAuditRow`（需 `EXECUTION_TEST_DATABASE_URL`；未设置自动 Skip）
- 全量：`EXECUTION_TEST_DATABASE_URL=... go test ./... -count=1` → **17 包全绿**（audit 6.6s 含集成测试真跑）
- 门禁：`gofmt -l .` 空、`go build ./...`、`go vet ./...` 全过

## 例外与后续

1. **D8 访问控制**：依赖 AUTH-001（T13 判据 5，排期第一批第 8 刀，P0）——持共享 token 跨租户查询在其落地后闭环
2. **D8 不可变触发器**：`gateway_audit_logs` 有 UPDATE 无触发器，留后续独立项（低优先级，审计写入已在代码层受控）
3. **D9**：不做（Owner 已定）
