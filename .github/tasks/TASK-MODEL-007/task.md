---
taskId: TASK-MODEL-007
status: 进行中
priority: P1（底座收尾的自动化补刀——对齐 VOZEB synchronizeLogicalModelsWithChannels 的机械劳动自动化）
pr: "#<待开>"
criteria: 8
criteriaPassed: 0
depends_on: 不依赖 TASK-MODEL-006 的 Owner 决策（功能独立，测试用自建数据；策展数据就绪后工具立即可用）
---

# TASK-MODEL-007：逻辑模型自动归并（同名跨渠道 → 同一分组）

> **来源**：2026-10-16 与 VOZEB-PRO 源码逐行对比后识别出的差距（`channel-protocol-registry.ts` /
> `model-routing-config.ts`：`synchronizeLogicalModelsWithChannels` 自动把同名模型跨渠道合并）。
> **定位**：这是**辅助工具**，不是替代 Owner 决策 ——
> TASK-MODEL-006 已拍板「逻辑模型 = 模型分组机制，**Owner 自行创建分组，不替他造数据**」，
> 本卡只把「同名模型归并成组 + 绑定候选」这一**无歧义的机械劳动**自动化：
> 生成的逻辑模型可被 Owner 编辑/删除/改名；入池决策仍走策展（`Curate`），本卡**不自动入池**。

## 目标

一句话：**管理员把模型策展入池后，一次 `POST /internal/v1/logical-models/reconcile`，
未归并的入池模型按「去除 models/ 前缀且忽略大小写的上游模型名」自动归并为逻辑模型分组并绑定候选；
同名跨渠道合入同一分组，不同名自动独立；已有手工绑定一律不动。**

## 背景：痛点（真库实测 2026-10-16）

- `model_catalog` 18 行中**仅 3 行**挂 `logical_model_id`；逻辑模型只有 2 个冒烟行
- 当前流程：入池（Curate）→ **手工**建逻辑模型 → **手工**绑定候选（`POST /{id}/candidates`）
  —— 手工录入是供给池数据真空的根因之一（与 VOZEB 自动同步对比的差距点）
- 修复后：入池 → 一次 reconcile → 分组与绑定自动生成（机械部分），Owner 只做**决策性**调整

## 设计（对齐 VOZEB 语义，最小可验证）

### 核心规则
1. **归并键**：`normalizeProviderModel(providerModel)` = 去 `models/` 前缀 + 小写（与 VOZEB `normalizeModelId` 同构）
2. **同名跨渠道** → 同一逻辑模型，多渠道 = 多个候选（`route_priority` 小者优先，沿用现有契约）
3. **不同名** → 独立逻辑模型
4. **已有绑定不动**：候选行已挂 `logical_model_id` → 跳过（不抢，`ErrModelBoundElsewhere` 语义）
5. **已有同名逻辑模型复用**：已存在同名分组 → 只绑定新候选，不重复建
6. **id 生成**：归并键即 kebab-case id（`normalizeProviderModel` 保证合法）；**分桶按键聚合 ⇒ 键唯一，不存在「同键新建冲突」**；键撞既有分组 = **同名复用**（判据 4），不抢不新建 —— 后缀机制经探查为死分支，**已删除**（D-004）
7. **幂等**：重复调用 created=0（第二次只跳过）
8. **只增不删**：reconcile 不删除、不改名、不改启停 —— 删除/调整仍走既有手工 CRUD

### 层与文件（BE-LAYER 单向依赖：cmd → httpapi → catalog）
| 层 | 文件 | 内容 |
|---|---|---|
| 领域纯函数 | `services/production/internal/catalog/reconcile.go`（新） | `PlanReconcile`（输入：待归并模型+现有分组+现有绑定；输出：建组列表+绑定列表）+ `normalizeProviderModel` + id 后缀分配 |
| 存储 | `services/production/internal/catalog/reconcile_postgres.go`（新） | `PostgresStore.ReconcileLogicalModels(ctx, workspaceID, actor)`：事务内读未归并行 → Plan → INSERT 逻辑模型 → UPDATE 候选 |
| HTTP | `internal/httpapi/handlers.go` + `logicalmodel_handler.go` | `POST /internal/v1/logical-models/reconcile`（admin 权限）→ `{created, bound, skipped}` |
| 测试 | `reconcile_test.go`（纯函数）+ `reconcile_postgres_integration_test.go`（真库）+ handler 测试 | 合并/保留/幂等/后缀/HTTP 语义 |

### 非范围
- ❌ 不自动入池（策展仍是唯一入口，ADR-004「同步只写供给池、绝不自动写目录」不变量不变）
- ❌ 不自动删除/改名/改启停（既有手工 CRUD 语义不变）
- ❌ 不做前端 UI（模型中心页面另议；本期交付 API + 测试）
- ❌ 不引入「读取时实时派生」（逻辑模型是独立表 + 手工可编辑，用显式 reconcile，不改为纯派生视图）

## 验收标准

1. **同名跨渠道合并**：同归并键、不同渠道的未归并模型 → 同一逻辑模型 + 各自候选（单测断言）
2. **不同名独立**：不同归并键 → 不同逻辑模型（单测）
3. **已有绑定不动**：已挂 logical_model_id 的候选不被动、不换组（单测 + 集成）
4. **已有同名分组复用**：已存在同名逻辑模型 → 只补绑定、不重复建（单测）
5. **归并键即合法 id**：任意非空 providerModel 的归一结果通过 `ValidLogicalModelID`；空/不可归并键的行跳过不建组（单测）
6. **幂等**：同一状态连调两次 → 第二次 `created=0`、无重复分组/绑定（单测 + 集成）
7. **HTTP 语义**：`POST /internal/v1/logical-models/reconcile` admin 200 返回统计；viewer 403；无 store 503（handler 测试）
8. **门禁**：`go build ./... && go test ./... -race && go vet ./...` 全绿；文件 ≤500 行；`scripts/preflight.sh` 通过；台账/开发日志/验收清单齐全（AC-008/010/011）

## 测试命令

```bash
cd services/production && go build ./... && go test ./... -race && go vet ./...
cd /Users/quanjunqi/student/ai-video/ai-video-shot-designer && bash scripts/preflight.sh
```

## 号段

本期**无迁移**（复用既有 `logical_models` / `model_catalog` 表，只增行为不改表）。
