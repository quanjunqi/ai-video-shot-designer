---
taskId: TASK-CREATE-006
status: 待开工
priority: P1（ADR 分片 6；分片台账 Priority 1——范围最清晰、依赖最少）
pr: "#<待开>"
criteria: 7
criteriaPassed: 0
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

## 范围

- ✅ **契约先行**（CT-001）：`openapi/bff.yaml` 的 capability 增加 `aspectRatios`（字符串数组，可空）
- ✅ **后端**（production 服务）：模型目录 capability 读写该字段并可对外暴露
- ✅ **迁移**：按 `.agents/skills/database-migrations/SKILL.md` 号段认领（production 号段下一个可用号）
- ✅ **前端**：`control-schema.ts` 优先消费 `capability.aspectRatios`（`source: 'declared'`）；
  **未声明时保持现有 count-fallback 行为不变**（向后兼容，不破坏既有模型）
- ✅ **数据**：为目录中已有模型补齐真实比例（至少视频侧，消除硬编码 3）
- ✅ 测试：新增纯函数单测（declared 优先 / 缺失回退）+ 契约生成类型同步（`npm run api:check`）

### 非范围

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

1. 契约新增 `aspectRatios`（可空数组），`npm run api:check` 绿，oasdiff 无 ERR 级破坏
2. 迁移在**全新库**上零错误；号段合规；旧库升级不破坏既有数据
3. 后端可读写该字段；目录 API 返回它
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
