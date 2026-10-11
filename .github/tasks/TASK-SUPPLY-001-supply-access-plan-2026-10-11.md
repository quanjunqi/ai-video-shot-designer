# TASK-SUPPLY-001：① 算力接入（设置中心）实施计划

> 依据：ADR-004 §4「策展流程（供给 → 产品）」的四步；ADR-003（逻辑模型路由）。
> 状态：**执行中**（P0-1 已完成）。Owner 已确认优先级：**先做 ①，设置中心的算力接入**。

## 0. 四步现状（判据：提交内容 + SQL，2026-10-11）

```
① 同步（自动）  channel_models ← /v1/models + /api/pricing      ❌ 未实现（production 无任何对外 HTTP 能力）
② 列表（人工）  "在产品面列出未策展的供给"                        🟡 后端 ListSupply 有；无 BFF 路由、无界面
③ 绑定（人工）  → logical_model_id + 协议 + priority + price      🟡 后端 Curate 有；无 BFF 路由、无界面
④ 路由（自动）  ADR-003 候选解析 + 失败切换                       ❌ 未实现（execution 里 logical_model_id 命中 = 0）
```

## 1. 阶段与验收判据

| 阶段 | 做什么 | 实现的需求 | 改造的功能 | 验收判据 |
|---|---|---|---|---|
| **P0-1** ✅ | netguard 抽成共享模块 `shotdesigner/shared/netguard` | 同步器必须走 SSRF 防护（ADR-004 §5） | 无行为变化（纯搬迁，`FromEnv` 语义不变）；新增 `FromEnvWithPrefix` 供 production 用 `PRODUCTION_*` | shared 模块 build/vet/test=0；execution 全量测试 ok |
| **P1-1** | production 上游抓取器（`openai_compatible`） | ADR-004 §4 第①步 | **production 首次具备对外 HTTP 能力**（走 netguard） | 对 `httptest` 假上游：正常/超时/私网被拒 三类各有断言 |
| **P1-2** | 解析 → `ApplySync`（已有）；`StartSync`/`FinishSync` 留痕 | §3.2 同步留痕 | 无新表（复用 034/035） | `channel_models` 有行 · `channel_model_syncs` = succeeded · 上游消失 ⇒ `missing_since` 非空且**不删行** |
| **P1-3** | 内部接口 `POST /internal/v1/channels/{id}/sync` | 让②③有数据来源 | 新增内部路由 | 返回计数；**同数据重跑 ⇒ added=0/updated=0**（幂等） |
| **P2-1** | BFF 路由 + 渠道页「同步上游模型」入口 | 运营可用 | 设置中心/渠道页 | 界面显示上次同步时间与计数；失败显示原因 |
| **P2-2** | 策展界面「加入我的模型目录」 | ADR-004 §4 第③步 | 设置中心 | 策展后 `model_catalog` 出现该行、`price_source` 正确 |
| **P3-1** | execution 按 `logical_model_id`+`route_priority` 解析候选 | ADR-003 路由 | 运行时解析（`NULL` 行回退旧行为） | 绑 2 候选 ⇒ 命中 priority 小者 |
| **P3-2** | 失败切换 + 审计记录**实际命中渠道** | ADR-004 §5 | worker/sync 调用路径 | 主候选失败 ⇒ 自动走备用；审计 `channel_id` 为**实际命中**者 |
| **P4-1** | 渠道探测与协议级证据「差异可见」（B3b-O1） | ① 的验证 | 界面 + 承载 | 差异显式标出，不合并成一个值 |

## 2. 需要 Owner 决定（不阻塞 P1）

- **§9 措辞与落点**：前端护栏禁止设置中心出现 `供给池`/`channel_models`/`/api/v1/pool` 等词（ADR-004 §9）。
  P2 要展示上游模型与价格 ⇒ **A**：挂在「渠道」页，叫「同步上游模型目录」/「加入我的模型目录」（推荐）；
  **B**：另开独立管理界面。

## 3. 明确不做（本卡边界）

- 计费/价格策略（Owner 已排除）· 多角色管理（Owner 已排除）
- ④ 的 D9 质量评估（建议先不做）· ④ D4b 成本归因（代码已完成，按 Owner 优先级暂存）
