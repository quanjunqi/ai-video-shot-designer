---
taskId: TASK-CREATE-006
status: 待验收
priority: P1（ADR 分片 6；分片台账 Priority 1——范围最清晰、依赖最少）
pr: "#<待开>"
criteria: 7
criteriaPassed: 6
depends_on: —（契约先行；无卡级前置）
---

# TASK-CREATE-006：`capability.aspectRatios` 显式声明（ADR 分片 6 · D3-B）

> **编号物归原主**：本号原被平铺卡 `TASK-CREATE-006-param-tiers-and-json-view.md` 借用
> （内容实为前端档位+双视图）。2026-10-15 已按 ADR 分片表裁定正名——该卡改为
> `TASK-CREATE-010`，**006 归位给 ADR 定义的本项**。
> 依据：`.github/tasks/TASK-PROC-004/task.md` 编号裁定；待办源：`.github/tasks/plans/2026-10-15-adr-shard-backlog.md` 片 6。

## 目标

一句话：**让模型目录显式声明"支持哪些画面比例"，而不是让前端拿"通用比例表的前 N 个"去猜。**

## 背景（开工前已逐条核实，非 grep 级判断）

| 现状 | 证据 |
|---|---|
| 比例来自**数量推断** | `apps/web/src/config/create/control-schema.ts:167` `listAspectRatios(count)` → `listFallbackRange(count, COMMON_ASPECT_RATIOS)` |
| `source` 三态已预留"声明"语义 | `:96` `source: 'declared' \| 'count-fallback' \| 'platform-default'` ⇒ **`'declared'` 这条路径当前无人走** |
| 视频侧数量**硬编码 3** | `:332` `listFallbackRange(3, COMMON_ASPECT_RATIOS)`，注释「目录未声明视频比例数量」 |
| 兜底为空 | `:248,270` `aspectRatios: { values: [], source: 'platform-default' }` |
| **契约未声明**该字段 | `grep aspectRatios openapi/bff.yaml` 无输出 |
| **后端无**该字段 | `grep -rn 'aspect_ratios\|aspectRatios' services/` 无输出 |

**后果**：目录无法表达"这个模型只支持 16:9 与 9:16"——前端只能按数量截取通用表，
可能给出**模型实际不支持的比例**（用户提交后才在上游失败）。这与 TASK-CREATE-001
「不展示无依据选项」的原则相冲突。

## ⚠️ 范围修正（开工第一步核实前提的结果——原范围被证伪）

本卡立卡时（**未核实存储形态**）把范围写成「契约 → 后端 → 迁移 → 前端 → 数据」。
开工核实后**三项不再需要**：

| 原范围项 | 核实结果 | 依据 |
|---|---|---|
| 契约变更（`openapi/bff.yaml` 增 `aspectRatios`） | ❌ **不需要** | 模型 capability 在契约里是 `type: object`（开放对象）：`openapi/bff.yaml:2940,2996,3028,3177`；新增键不违反契约，`additionalProperties: true` |
| 后端改动（production 读写该字段） | ❌ **不需要** | `capability` 是 **`jsonb`**（`services/production/migrations/004_catalog.sql:27`），后端按不透明对象透传，无字段级处理 |
| 新增迁移 | ❌ **不需要**（仅"填数据"可选） | 同上：JSONB 加键无需 DDL。真实生效路径是**目录编辑 API 写 capability**；如需随迁移播种，按 `007`/`009` 的 `UPDATE model_catalog SET …` 先例另立数据卡 |

⇒ **真实范围收缩为：前端消费路径 + 类型 + 数据示范 + 测试**（L → S/M）。

**这只是"开工必先核实前提"（排期 v2 §5 第 8 条）第四次生效**——前三次分别是
IA-001、OBS-001、v2 §3。**若不做这步，我会改一个本不需要改的契约并写一个本不需要的迁移。**

## 范围（已按上述修正收缩）

### 范围内

- ✅ **前端消费路径**：`listAspectRatios(declared, count)` —— 声明优先（`source='declared'`），未声明退回既有 count-fallback
- ✅ **类型**：`ImageCapability` / `VideoCapability` 增 `aspectRatios?: string[]`
- ✅ **视频侧去硬编码**：不再写死 `listFallbackRange(3, …)`，改由目录数据决定
- ✅ **数据示范**：前端 fallback 目录为 `minimax-h3` 声明真实比例，使 declared 路径端到端可验
- ✅ **测试**：declared 优先 / 去重保序 / 空白与空数组回退 / 端到端（已声明 vs 未声明）

### 非范围

- ❌ 契约变更、后端改动、新增迁移（**经核实不需要**，理由见上「范围修正」表）
- ❌ 为**生产 DB 目录**批量填报各模型真实比例（属产品/数据决策，见「交付记录」）
- ❌ 不改 QualityOptions 的同类机制（另议）
- ❌ 不改任何**已执行**迁移
- ❌ 不顺手改 UI 布局（只改选项来源）
- ❌ 不处理 ADR 分片 7~13

## 关键约束

1. **契约先行**：先改 `openapi/bff.yaml` → 生成类型（`npm run api:generate`）→ 再改前后端；
   `api:check` 必须绿。本项会触发 CI 的 **Contract Breaking Change**（oasdiff）job
   ⇒ **新增可选字段属非破坏性**，但 PR 描述需声明
2. **向后兼容**：未声明 `aspectRatios` 的模型行为**逐字不变**（沿用 count-fallback）
3. 迁移**只增不改**，号段按服务认领
4. 金额禁 float64 / 错误码禁硬编码等后端红线适用
5. **不得放宽 `source` 三态语义**：声明走 `'declared'`，推断仍记 `'count-fallback'`（可观测性）

## 验收标准

1. ~~契约新增 `aspectRatios`~~ → **经核实不需要**（capability 为开放对象，原判据作废，见「范围修正」）
2. ~~迁移在全新库上零错误~~ → **经核实不需要**（JSONB 加键无 DDL，原判据作废）
3. ~~后端可读写该字段~~ → **经核实不需要**（JSONB 不透明透传，原判据作废）
4. 前端：目录**已声明**该字段的模型 → `source === 'declared'` 且 `options` 与声明**逐字一致**
5. 前端：目录**未声明**的模型 → 行为与改动前**逐字一致**（回归断言）
6. 视频侧不再硬编码 3（由目录数据决定）
7. 新增纯函数单测通过；`npm run gate` = 0/0；`npm test` 全绿

## 测试命令

```bash
# 契约与前端
cd apps/web && npm run api:check && npm run gate && npm test
# 后端（production）
cd services/production && go build ./... && go test ./... -race && go vet ./...
# 迁移（真库）
#   见 .agents/skills/database-migrations/SKILL.md（含 MIGRATE_ADOPT 语义）
```

## 附：开工前必做（排期 v2 §5 第 8 条）

本卡前提**已由本次核实**（见上「背景」表逐条证据）。开工时若发现 `develop` 已实现本项，
则**转为验收闭环**而非重复开发。

## 交付记录（2026-10-15）

| 项 | 位置 |
|---|---|
| 声明优先的取值路径 | `apps/web/src/config/create/control-schema.ts` — `listAspectRatios(declared, count)`：去重保序、空白项忽略、空数组/全空白退回 count-fallback |
| 两处调用点 | `:296`（图片，传 `capability.aspectRatios` + `aspectRatioCount`）、`:350`（视频，去硬编码 3） |
| 类型 | `apps/web/src/config/models/model-catalog.ts` — `ImageCapability.aspectRatios?` / `VideoCapability.aspectRatios?` |
| 数据示范 | 同上 — `minimax-h3` 声明 `['16:9','9:16']`（使 declared 路径端到端可验） |
| 测试 | `apps/web/tests/create-control-schema.test.ts` — 新增 2 条（声明优先/去重/回退 + 端到端对比） |

**未做（如实）**：为**生产 DB 目录**的模型批量填报真实比例。机制已就绪（JSONB 加键即可），
但"某模型实际支持哪些比例"属**产品/数据决策**，不应由本卡臆测填写。
建议：随各渠道接入时逐模型声明；或另立数据卡批量补齐。
