# 任务卡：T3 成本预算落地

> 按 `.github/TASK_TEMPLATE.md` 填写。dev-plan v1.3 §2/§7 T3；方案 §3.6（预算预扣/结算状态机）。
> 依赖：T0（权威价已合并）、T2（报表已合并）。前置已全部就绪，可开工。

## 基本信息

- **任务 ID**：TASK-MODEL-005
- **任务名称**：T3 成本预算落地（budget_rules + 请求前校验 + 预扣/结算状态机 + 配置 UI）
- **创建日期**：2026-10-14
- **人类 Owner**：quanjunqi
- **AI 执行者**：Doubao MainAgent
- **优先级**：P0（A 轨 M2 治理能力）
- **预计工时**：4-6 人日
- **依赖**：T0（权威价）、T2-1（聚合 API）

---

## 1. 目标

**目标**：防超支从"想法"变"机制"——按租户/项目两级配置日/月预算，请求前校验、超限拦截（返回明确配额错误码）、80%/95% 阈值告警；异步任务走**预算预扣/结算状态机**（提交时预扣估算上限 → 成功按实结算退差额 → 失败/取消退扣 → 预扣即封顶）。预算系统故障 **fail-open**（放行 + 审计标记"预算未校验" + 告警）。

**背景**：ADR-004 实测成本差 33 倍；治理层"日/月成本上限字段存在但=0（未配置）"——成本治理是"假的"。T0 完成后权威价已可作拦截依据；T2 报表已提供用量视图。T3 把"看得见"推进到"拦得住"。

---

## 2. 范围

### 范围内（In Scope）

- **迁移**：`budget_rules`（workspace 009 段认领）——维度=tenant/workspace、周期=day/month、上限金额、动作=告警/拦截；`budget_holds`（execution 016 段认领，T4 已占 015）——预扣/结算状态机
- **请求前校验**（execution）：读取生效预算规则 → 累计已用 vs 上限 → 超限拦截（明确配额错误码）/ 阈值告警（80%/95%）
- **预算预扣/结算状态机**：异步提交预扣估算上限 → 成功按实结算退差额 → 失败/取消退扣 → 预扣即封顶（防并发超支）
- **原子更新**：预扣/结算用原子 UPDATE（不读改写），防并发
- **配置 UI**（web）：预算规则增删改 + 生效状态
- **故障语义**：预算系统故障 fail-open（放行 + 审计标记"预算未校验" + 告警）
- **测试**：状态机三态断言（预扣/结算/退扣）、超限拦截、阈值告警、SLO 单次校验 <50ms

### 范围外（Out of Scope）

- ❌ 逻辑模型级预算（默认只开租户+项目两级，逻辑模型级留 P1）
- ❌ 预算历史报表（T2 报表已覆盖用量，预算执行明细另议）
- ❌ 计费账单生成（ADR-004 分离语义不变）

---

## 3. 相关文件

| 文件 | 说明 |
|---|---|
| `docs/adr/relay-supply-pool.md` | ADR-004：cost/price 分离、成本语义 |
| `services/workspace/migrations/` | 008 已用，009 认领（budget_rules） |
| `services/execution/migrations/` | 014 已用，016 认领（budget_holds，T4 已占 015） |
| `services/execution/internal/quota/quota.go` | 现有配额/限流（租户级 qps/成本上限） |
| `services/execution/internal/httpapi/handlers.go` | 请求入口（校验注入点） |
| `apps/web/src/pages/SettingsPreferences.tsx` 等 | 配置 UI 位置 |
| `ai-video-shot-designer-private/proposals/model-compute/dev-plan.md` | T3 定义（§2/§7） |

---

## 4. 验收标准（判据四要素）

| # | 判据（看什么算过） | 对象（看哪个 ref/环境） | 时点 | 例外 |
|---|---|---|---|---|
| 1 | 迁移 009/016 可应用、可回滚；表结构含维度/周期/上限/动作/状态 | `deploy/local` 迁移执行器 | 提交时 | — |
| 2 | 配置生效：设日预算 X → 累计超 X 的请求被拦截，返回明确配额错误码 | 集成测试 + 真机 | 提交时 | 未配置规则时不拦截（默认放行） |
| 3 | 异步预扣/结算状态机三态断言：提交预扣 → 成功结算退差额 / 失败退扣 / 取消退扣 | execution 单测 | 提交时 | 无 budget_holds 行的历史任务不报错 |
| 4 | 80%/95% 阈值触发告警（写审计标记或日志） | 单测断言 | 提交时 | 未达阈值不告警 |
| 5 | 预算系统故障 fail-open：放行 + 审计标记"预算未校验" | 注入故障测试 | 提交时 | 故障恢复后恢复正常校验 |
| 6 | SLO：单次校验 <50ms；原子更新无并发覆盖 | 基准 + 并发测试 | 提交时 | 量大时以 P95 口径评估 |
| 7 | 后端全绿：`go build ./... && go vet ./... && go test ./... -race`（execution + workspace + web） | T3 worktree | PR 前 | CI 以 GitHub Actions 为准 |

---

## 5. 测试命令

```bash
# 在 worktree 内
cd services/execution && go build ./... && go vet ./... && go test ./... -race
cd services/workspace && go build ./... && go vet ./... && go test ./... -race
# 迁移验证（本地 compose）
docker compose --env-file deploy/local/.env -f deploy/local/compose.yaml --profile app up workspace-migrate execution-migrate
```

---

## 6. 约束与禁止事项

- ❌ 预算维度过细误伤风险 → 默认只开租户+项目两级，逻辑模型级留 P1
- ❌ 预扣/结算禁止"读改写"（必须原子 UPDATE，防并发超支）
- ❌ 预算系统故障禁止 fail-closed（会误伤全部请求；fail-open + 审计标记 + 告警）
- ✅ 迁移只增不改；号段 009（workspace）/ 016（execution）认领（T4 已占 015）
- ✅ 按路径 `git add`，Conventional Commits

---

## 7. 输出

- 分支：`feature/t3-budget-1014` + PR → develop（merge commit）
- 验收清单：`.github/tasks/TASK-MODEL-005-acceptance.md`（开工前产出）
- 测试结果：本地 + CI 全绿
