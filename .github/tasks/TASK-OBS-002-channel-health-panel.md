# 任务卡：T11 渠道健康面板 + 告警

> 按 `.github/TASK_TEMPLATE.md` 填写。dev-plan v1.3 §2/§7 T11；方案 §3.4（单元熔断）与 §4 断层 4/5 的产品面。
> 依赖：T2（报表已合并）、T4（单元熔断，TASK-ROUTE-003）。

## 基本信息

- **任务 ID**：TASK-OBS-002
- **任务名称**：T11 渠道健康面板 + 三类最小告警（错误码分布/熔断/同步状态 → webhook）
- **创建日期**：2026-10-14
- **人类 Owner**：quanjunqi
- **AI 执行者**：Doubao MainAgent
- **优先级**：P0（A 轨 M4）
- **预计工时**：4-6 人日
- **依赖**：T2-1（聚合 API）、T4（单元熔断）

---

## 1. 目标

**目标**：运营侧能"看到渠道/供给单元健不健康"——错误码分布、熔断状态、同步状态三类面板，叠加三类最小告警（错误率突增 / 熔断发生 / 同步失败 → webhook）。让 `route_priority` 从"拍脑袋"变成"有依据"。

**背景**：gateway_audit_logs 有错误码/状态原始数据但无健康视图；T4 落地后 channel_health 有熔断状态可展示。dev-plan T11 列为 M4（链路闭环后收尾），面板展示真实熔断/健康状态。

---

## 2. 范围

### 范围内（In Scope）

- **聚合查询**：按供给单元（渠道×模型）聚合错误码分布、成功率、熔断状态（复用 T2-1 stats API 扩展）
- **健康面板页面**（web）：渠道/单元健康卡片 + 错误码分布 + 熔断状态徽标（正常/冷却/半开）
- **三类最小告警**：错误率突增（阈值可配）/ 熔断发生 / 同步失败 → webhook 通知
- **测试**：聚合正确性、告警触发阈值断言

### 范围外（Out of Scope）

- ❌ 完整告警中心/通知渠道管理（P1）
- ❌ 自动降权/动态路由策略（P1，D-H）
- ❌ 定时巡检（B3b/B3c）

---

## 3. 相关文件

| 文件 | 说明 |
|---|---|
| `services/execution/internal/audit/query.go` | 聚合查询（T2-1 已有 stats/trend） |
| `services/execution/internal/httpapi/handlers_audit.go` | stats 端点扩展 |
| `apps/web/src/pages/ModelAudit.tsx` / 模型中心 | 健康面板页面位置 |
| `services/execution/migrations/015_channel_health.sql` | T4 产物（熔断状态来源） |
| `ai-video-shot-designer-private/proposals/model-compute/dev-plan.md` | T11 定义（§2） |

---

## 4. 验收标准（判据四要素）

| # | 判据（看什么算过） | 对象（看哪个 ref/环境） | 时点 | 例外 |
|---|---|---|---|---|
| 1 | 按单元聚合错误码分布/成功率/熔断状态返回正确 | 集成测试断言 | 提交时 | 无数据时返回空集非报错 |
| 2 | 健康面板展示正常/冷却/半开三种状态徽标 | 真机走查 + 截图 | 提交时 | — |
| 3 | 错误率突增告警阈值触发 → webhook 调用被断言 | 单测（mock webhook） | 提交时 | 未达阈值不触发 |
| 4 | 熔断发生 / 同步失败告警同样触发 | 单测 | 提交时 | — |
| 5 | 前端门禁：`cd apps/web && npm run gate` 0/0 | T11 worktree | PR 前 | CI 以 GitHub Actions 为准 |

---

## 5. 测试命令

```bash
cd services/execution && go build ./... && go vet ./... && go test ./... -race
cd apps/web && npm run gate && npm test
```

---

## 6. 约束与禁止事项

- ❌ 不引入独立告警服务（P1）；webhook 用简单 POST + 重试上限
- ❌ 不自动降权/动态路由（P1，D-H）
- ✅ 复用 T2-1 stats 聚合，不新写一套查询
- ✅ 按路径 `git add`；Conventional Commits

---

## 7. 输出

- 分支：`feature/t11-health-panel-1014` + PR → develop（merge commit）
- 验收清单：`.github/tasks/TASK-OBS-002-acceptance.md`（开工前产出）
- 测试结果：本地 + CI 全绿
