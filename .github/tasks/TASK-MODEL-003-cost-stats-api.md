# 任务卡：T2-1 运营报表聚合查询 API

> 按 `.github/TASK_TEMPLATE.md` 填写。本卡随 PR 附上。

## 基本信息

- **任务 ID**：TASK-MODEL-003
- **任务名称**：T2-1 成本/用量聚合查询 API（execution）——让「钱花在哪」可查询
- **创建日期**：2026-10-13
- **人类 Owner**：quanjunqi
- **AI 执行者**：Doubao MainAgent
- **优先级**：P0（A 轨 T2 第一刀）
- **预计工时**：2-3 人日
- **依赖**：T0（权威价已合并）、T1（归因列 + 供给单元已合并）

---

## 1. 目标

为成本看板与运营报表提供**多维聚合查询**：按「供给单元（渠道×模型）/ 逻辑模型 / 项目 / 成员」四维 × 「日/周/月」粒度，返回调用量、成功率、P95 延迟、成本（已校准/预估双口径）。SLO：报表查询 P95 < 2s。

## 2. 背景与相关文件

- **数据底座（T0/T1 已就位）**：`gateway_audit_logs` 现有 `cost_amount/cost_unit`（T0 权威价）、`channel_id/provider_model`（T1 供给单元终态回填）、`project_id/episode_id/shot_id/feature`（T1 归因列）、`status/token_*/latency_ms`（既有）。
- **索引**：`gateway_audit_logs_ws_created_idx`（workspace_id + created_at）已存在，支撑 workspace 隔离 + 时间范围过滤；聚合 GROUP BY 在过滤后行集上进行，当前数据规模无额外索引需求（若真库实测 P95 超 2s，再以只增迁移 015 加索引）。
- **现有能力（复用）**：`Store.Aggregate`（总览）、`TokenUsageBy`（token 维度）、`Spend`（日/月成本）、`AggregateRecentCosts`（近 7 天实际成本）。**本任务新增多维排行 + 趋势序列**，不推翻既有方法。
- **相关文件**：
  - `services/execution/internal/audit/store.go`（新增聚合方法）
  - `services/execution/internal/audit/stats_integration_test.go`（新，真库造数断言）
  - `services/execution/internal/httpapi/handler.go`（新端点注册 + 处理器）
  - `services/execution/internal/httpapi/stats_test.go`（新，契约/参数校验）
  - `.github/tasks/TASK-MODEL-003-cost-stats-api.md`（本卡）

## 3. 范围 / 非范围

**范围**：
1. `GET /internal/v1/audit/stats?dimension=channel|model|project|member&since&until&project_id&feature` —— 返回指定维度的**排行**（topN，默认 20）：每项 = 调用量（total/success/failed）+ 成功率 + P95 延迟 + 成本（`cost_calibrated` 已校准合计 / `cost_estimated` 预估标记）。维度值：
   - `channel` → 按 `channel_id` 分组（供给单元渠道层）
   - `model` → 按 `model_id` 分组（逻辑模型层）
   - `project` → 按 `project_id` 分组
   - `member` → 按 `user_id` 分组
2. `GET /internal/v1/audit/stats/trend?granularity=day|week|month&since&until&dimension&dimension_value` —— 时间序列：每桶 = 成本合计（已校准/预估双值）+ 调用量 + 成功率 + P95。支持按单一维度值下钻（如 `dimension=channel&dimension_value=minimax`）。
3. **双口径**：`cost_amount > 0 且 cost_unit 非空` → 已校准（sum 进 `cost_calibrated`）；否则 → 预估（`cost_estimated` 计数标记，不入已校准合计）——与 T0「CostAmount=nil → (0,"")」语义一致。
4. **workspace 隔离**：所有查询以 `X-Workspace-Id` 为硬边界（同既有 audit 接口）。
5. 指标口径：成功率 = `status='success'` 调用数 / 总调用数；P95 = 成功调用 `latency_ms` 的 95 分位（成功行才有意义，失败/超时行不入延迟统计——实现时在文档注释写明）。
6. SLO 断言：真库集成测试用 >5 万行造数验证 P95 < 2s（本地一次性跑，不进 CI 常驻，避免慢）。

**非范围**：
- 前端页面（T2-2 另卡）
- 预算查询/拦截（T3）
- 渠道健康面板（T11）
- ClickHouse 等列式存储（P2 触发条件见方案 §6）
- 归因明细导出改造（沿用既有 ExportAll）

## 4. 验收标准（判据四要素）

| # | 判据 | 对象 | 例外 |
|---|---|---|---|
| 1 | 四维排行各自可查且聚合正确（调用量/成功率/p95/成本与真库手写 SQL 一致） | 真库集成测试：随机 schema 造 100+ 行，逐维度断言 topN 结果 | 造数含 0 成本行时「已校准/预估」口径正确分流 |
| 2 | 日/周/月粒度趋势序列正确（桶边界与 created_at 对齐） | 同上，造数跨 3 天断言 day/week 桶 | 空桶返回 0 不报错 |
| 3 | 双口径：已校准 sum 只含 cost_amount>0 且有 unit 的行；预估行明确标记 | 集成测试断言 cost_calibrated/cost_estimated 分账 | cost_amount=0 且 unit 空的 T0 语义行属预估 |
| 4 | workspace 隔离：A 工作区查不到 B 工作区数据 | 集成测试双 workspace 造数 | — |
| 5 | 参数校验：非法 dimension/granularity/时间范围返回 400 明确错误 | handler 契约测试 | — |
| 6 | SLO：>5 万行造数 P95 < 2s | 本地一次性性能断言（不进 CI 常驻） | 数据规模小时跳过（说明） |
| 7 | `go build ./... && go vet ./... && go test ./... -race` 绿 | execution 全包 | CI 6 道关为准 |

## 5. 测试命令

```bash
cd services/execution && go build ./... && go vet ./... && go test ./... -race
EXECUTION_TEST_DATABASE_URL='postgres://shotdesigner:local-postgres-password-2026@localhost:5432/execution?sslmode=disable' \
  go test ./internal/audit/... ./internal/httpapi/... -run 'Stats|Trend' -v
```

## 6. 约束与禁止事项

- 迁移只增不改（本任务预计无新迁移；如需索引 → 号段 execution 015）
- 禁 `git add -A`；按路径 add + `git diff --cached --name-only` 核对
- 不改 T0/T1 已合并的列语义；`cost_amount` 口径不得与 T0 冲突
- 成功率/P95 口径在代码注释 + 接口文档写明，禁止含混
- 审计写入链路（submit/terminal）本任务不触碰
- 不加新服务/新表/新第三方依赖

## 7. 输出

- 分支 `feature/t2-cost-stats-<日期>` → PR → develop（merge commit）→ 删分支/worktree
- 端点文档同步 `docs/how-to/observability.md`（审计指标查询口径）
- 任务卡 `.github/tasks/TASK-MODEL-003-cost-stats-api.md`
