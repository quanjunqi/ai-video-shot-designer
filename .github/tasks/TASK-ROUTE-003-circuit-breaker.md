# 任务卡：T4 单元熔断三件套

> 按 `.github/TASK_TEMPLATE.md` 填写。dev-plan v1.3 §2/§7 T4；方案 §3.4（单元级熔断，v2.2 供给单元语义）。
> **无外部依赖，可独立开工。** 参照 LiteLLM：allowed_fails 3 → cooldown 60s → health_check 30s。

## 基本信息

- **任务 ID**：TASK-ROUTE-003
- **任务名称**：T4 单元熔断三件套（channel_health 表 + 错误码分类 + 多副本状态共享 + 4xx 不重试）
- **创建日期**：2026-10-14
- **人类 Owner**：quanjunqi
- **AI 执行者**：Doubao MainAgent
- **优先级**：P0（A 轨 M2 治理能力；供给单元基座增强）
- **预计工时**：8-12 人日
- **依赖**：无（独立高价值项）

---

## 1. 目标

**目标**：坏供给单元（渠道×模型）不再反复被撞——失败计数 → 冷却 → 半开探活 → 恢复；熔断中的单元不消耗尝试次数；**同渠道不同模型互不影响**（单元级而非渠道级）。4xx 硬错误不重试不切换。

**背景**：路由层已实现失败切换（最多 3 候选、审计尝试序列），但无熔断/健康检查——坏渠道每次请求都被先撞一次，重试风暴风险（ADR-003 §6）无缓解手段。v2.2 将熔断粒度从渠道级下探到**供给单元级**（channel_health 唯一键 = channel_id + provider_model）。

---

## 2. 范围

### 范围内（In Scope）

- **迁移**：`channel_health`（execution 015 段认领）——唯一键 `channel_id + provider_model`；字段：成功率、错误码分桶、熔断计数、冷却截止、最近探活
- **错误码分类落地（表 3-1）**：硬 4xx 直返（不重试不切换）/ 软 4xx 可重试可切换 / 5xx + 超时切换 / 内容安全拒绝不切换
- **熔断逻辑**（路由层 AttemptEach 集成）：失败计数（原子 UPDATE）→ 达到阈值（默认 3）→ 冷却（默认 60s）→ 冷却到期探活（半开单飞，DB 原子占位，probe 不计失败）
- **多副本状态共享**：fail_count 原子 UPDATE（跨实例共享计数，禁本地内存）
- **候选剔除**：熔断中的单元从候选池剔除，不消耗尝试次数；`route_priority` 语义不变
- **探活合流**：与 ADR-008 probe 合流，不得各写一套
- **运营开关**：熔断参数误伤可一键关闭（配置项）
- **测试**：模拟坏单元完整链路（失败 3 次→冷却→剔除→探活恢复）；表 3-1 每类错误码行为断言；同渠道不同模型互不影响断言；多实例共享计数原子性断言

### 范围外（Out of Scope）

- ❌ 成本/延迟感知路由（P1，D-H 成本/质量/平衡三档）
- ❌ 定时巡检（B3b/B3c，另片）
- ❌ 修改 ADR-003 候选上限 3 与审计不变量

---

## 3. 相关文件

| 文件 | 说明 |
|---|---|
| `services/execution/migrations/` | 014 已用，015 认领（channel_health） |
| `services/execution/internal/catalog/resolve.go` | 候选解析（Resolve） |
| `services/execution/internal/catalog/attempt.go` | AttemptEach（失败切换实现点） |
| `services/execution/internal/netguard/` | SSRF client（探活 HTTP 复用） |
| `services/execution/internal/probe/` | 探测实现（ADR-008 合流目标，TASK-INFRA-004） |
| `ai-video-shot-designer-private/proposals/model-compute/access-design.md` | 表 3-1 错误码分类（§3.4） |
| `ai-video-shot-designer-private/proposals/model-compute/dev-plan.md` | T4 定义（§2/§7） |

---

## 4. 验收标准（判据四要素）

| # | 判据（看什么算过） | 对象（看哪个 ref/环境） | 时点 | 例外 |
|---|---|---|---|---|
| 1 | 迁移 015 可应用、可回滚；channel_health 唯一键约束生效 | `deploy/local` 迁移执行器 | 提交时 | — |
| 2 | 模拟坏单元完整链路：失败 3 次 → 冷却 → 候选剔除 → 探活恢复 | 集成测试（mock 上游） | 提交时 | 冷却期内的请求不消耗尝试次数 |
| 3 | 表 3-1 每类错误码行为断言：硬 4xx 直返 / 软 4xx 可重试可切换 / 5xx+超时切换 / 内容安全拒绝不切换 | 单测 + 集成 | 提交时 | — |
| 4 | **同渠道不同模型互不影响**：A 模型熔断，B 模型（同渠道）仍可用 | 集成测试断言 | 提交时 | 熔断粒度为单元级 |
| 5 | 多副本状态共享原子性：fail_count 原子 UPDATE 无并发覆盖 | 并发测试 | 提交时 | 单实例部署下等效断言 |
| 6 | 熔断参数误伤可一键关闭（运营开关生效） | 配置切换测试 | 提交时 | 关闭后恢复盲试行为 |
| 7 | 后端全绿：`go build ./... && go vet ./... && go test ./... -race`（execution + production） | T4 worktree | PR 前 | CI 以 GitHub Actions 为准 |

---

## 5. 测试命令

```bash
# 在 worktree 内
cd services/execution && go build ./... && go vet ./... && go test ./... -race
# 迁移验证（本地 compose）
docker compose --env-file deploy/local/.env -f deploy/local/compose.yaml --profile app up execution-migrate
```

---

## 6. 约束与禁止事项

- ❌ 禁止本地内存做跨实例计数/熔断（BE-CONC-002）——必须 DB 原子共享
- ❌ 探活不得各写一套（与 ADR-008 probe 合流）
- ❌ 禁止修改已执行迁移；候选上限 3 与审计不变量不动（ADR-003）
- ❌ 硬 4xx 不得重试/切换（表 3-1）
- ✅ 半开探测防正常渠道被误冷却；熔断参数误伤可一键关闭
- ✅ 迁移号 015 认领；按路径 `git add`；Conventional Commits

---

## 7. 输出

- 分支：`feature/t4-circuit-breaker-1014` + PR → develop（merge commit）
- 验收清单：`.github/tasks/TASK-ROUTE-003-acceptance.md`（开工前产出）
- 测试结果：本地 + CI 全绿
