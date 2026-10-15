---
taskId: TASK-MODEL-006
status: 待开工
priority: **P0（底座收尾——业务开发的前置）**
pr: "#<待开>"
criteria: 12
criteriaPassed: 0
depends_on: —（供给侧数据；部分子项依赖 Owner 提供真实模型/价格口径）
---

# TASK-MODEL-006：供给单元池真实化（底座收尾 · dev-plan T5 + T6 + T12）

> **Owner 2026-10-16 定调**："业务代码还没开发完，只是把壳子做好了，全是 mock 数据，
> 真正的业务流程一测试就会全部暴露。**当务之急是把底座能力赶紧做好**。"
>
> 本卡即该「底座能力」的收尾：把**供给单元池**从冒烟数据变成真实数据，
> 让前端不再依赖硬编码 mock（`catalogSource: 'demo'`）。
> 依据：`ai-video-shot-designer-private/proposals/model-compute/dev-plan.md`（T5/T6/T12）、
> `access-design.md` §3.3（供给单元语义，Owner 2026-10-12 拍板「按专业级基座建设」）。

## 目标

一句话：**让「供给单元池」里装的是真实可用的供给单元（渠道 × 上游模型 + 能力 + 价格），
而不是冒烟行——前端能从 `demo` 切到 `server` 并跑通真实业务流。**

## 背景：底座缺口的**实测数据**（2026-10-16 查真库 `production`）

| 缺口 | 实测 | 目标 | 对应 |
|---|---|---|---|
| 逻辑模型 | **2 个冒烟行**：`accept-smoke-text`、`accept-smoke-image` | GATE-3 的 **5 个**真实命名（lm-text-standard / lm-image-standard / lm-image-edit / lm-video-standard / lm-video-edit） | T6 |
| 供给单元入池 | `model_catalog` 18 行中**仅 3 行**挂 `logical_model_id` | 按能力精选入池（**入池 = 管理员精选，绝不自动全量挂**） | T6 |
| **providerModel 必填（基座语义）** | **6/18 非空** ⇒ 12 行为空；且入池行 `gpt-image-2` 的 `provider_model` **为空**（**语义违反**） | 供给单元六属性②：providerModel **必填** | T6 |
| 池原料渠道覆盖 | `channel_models` 79 条**全部来自 PearAPI 一个渠道** | 其余 6 渠道（ComfyUI/Google/Grsai/即梦/MiniMax/OpenAI）同步 | T12 |
| 协议模板 capabilities | **2/8** 有声明（`pt_builtin_openai`、`pt_builtin_openai_img`，形态完整可照抄） | 所缺 6 个补齐 | T5 |
| 能力档位字段 | 无 `aspect_ratios` / `duration_range` / `quality_options` / `reference_rule` | T5：单元级能力档位（请求按能力过滤候选） | T5 |

**根因链**：供给单元池没有真实数据 ⇒ 服务端目录撑不起业务流 ⇒ 前端 `useSettingsStore.catalogSource`
停在初始值 **`'demo'`**（硬编码 `apps/web/src/config/models/model-catalog.ts`）⇒ **"壳子 + mock"**。

## 范围（三个可独立 PR 的子项；建议按 T5 → T12 → T6 顺序）

### T5 · 能力声明按需补齐（production）
- ✅ 补 **`protocol_templates.capabilities`**：所缺 6 个模板（照 `pt_builtin_openai*` 的既有形态：
  `method` / `request_path` / `param_mapping` / `required_params` / `response_extract`）
- ✅ 能力**档位字段**：`aspect_ratios[]`、`duration_range`、`quality_options[]`、`reference_rule`
  （承载位置见「待定」——建议挂 `capabilities` 内，避免再加表）
- ✅ 迁移只增不改；号段按 production 认领（当前已到 `038`）

### T12 · 数据播种与回填（production + execution）
- ✅ 逻辑模型种子：**5 个** GATE-3 命名（替换 `accept-smoke-*`）
- ✅ 供给单元种子：从 `channel_models` **精选**入池（渠道 × 上游模型），`provider_model` 必填
- ✅ 单元级价格种子（`cost_*`；`price_*` 按 037 决策可留空）
- ✅ 存量 `gateway_audit_logs` 归因置空容忍（T1 已定）

### T6 · 供给单元产品化（production + execution）
- ✅ `Resolve` 候选**能力过滤**落地（按 T5 声明的档位过滤候选）
- ✅ 前端从 `demo` 切到 `server` 的端到端验证（真实目录驱动创作流，非 mock）

### 非范围
- ❌ 不改 `channel_models` 同步机制（ADR-004 D1/D2 不变量：只写供给池、绝不自动写目录）
- ❌ 不做「入池」的管理 UI（属模型中心页面，另议）
- ❌ 不接真实付费上游（是否产生真实计费由 Owner 决定）

## ✅ Owner 已答复（2026-10-16）——范围据此修订

| # | 我问的 | Owner 答复 | 对范围的影响 |
|---|---|---|---|
| 1 | 7 个渠道哪些真的可用 | **只有 PearAPI 一个中转站是真实的**；模型都从它同步；**其余 6 个渠道（ComfyUI/Google/Grsai/即梦/MiniMax/OpenAI）都是 mock 数据** | 池原料只有 PearAPI 的 79 条；**mock 渠道需处置**（见下「待定」） |
| 2 | 5 个逻辑模型各挂哪些候选 | **逻辑模型不作为普遍机制**：它是"**一种特殊的模型收纳方式**"，例如把**免费模型**收纳成一个逻辑模型。**其他不做**。用户在**工作层直接从模型广场选真实模型**使用，或使用提供的免费模型 | ⚠️ **推翻 dev-plan T6 的「5 个逻辑模型命名」**；逻辑模型的范围收缩为「免费模型收纳」 |
| 3 | 单元级价格口径 | **不去上游获取**。**手动录入模型原价**，再在原价基础上**加价**作为对外售价 | 价格来源确定为 **manual**；正好落在 `037_model_cost_price.sql` 的 `cost_*`（原价）/`price_*`（对外价）分离设计上 |
| 4 | 能力档位真实取值 | **去官网搜官方文档，能力与官方文档对齐** | 已派**只读调研**检索各模型官方文档（结果回归后落入本卡） |

### 由此暴露的额外缺口：同步只给了「裸名字」

实测 PearAPI 同步来的 79 条：`tags` 全空、`endpoint_types` 全 `[]`、`vendor` 全 `custom`、
`pricing` **0/79 有值**、`model_type` 全为占位值 `'model'`。
⇒ **不只是"缺数据"，还缺"分类与富化"**：79 个裸名字需判定 `text/image/video`、补 vendor、
补能力档位、补价格，才能入池为供给单元。

### 待定（需 Owner 后续拍板）

| # | 待定项 | 影响 |
|---|---|---|
| 1 | **mock 渠道如何处置**（删除？禁用？标注为 demo？） | 影响 `model_channels` 数据与设置页展示；不处置会让用户以为 7 个渠道都能用 |
| 2 | **加价方式**（统一加价率？按模型分别设？） | 影响 `price_*` 填报方式与是否需要一张加价规则表 |
| 3 | **免费模型清单**（79 个里哪些是免费的） | 逻辑模型「免费模型收纳」的输入 |

## 验收标准

> 已按 Owner 答复修订（原判据 1「5 个逻辑模型命名」与判据 7「价格口径」已作废重写）。

1. `model_catalog` 入池行（`logical_model_id IS NOT NULL`）**全部 `provider_model` 非空**；
   现存语义违反行（`gpt-image-2` 空 providerModel）被修正或移出池
2. **79 个真实模型完成分类**：各自 `type` ∈ {text,image,video}，vendor 已填；
   **每条分类有依据**（名称族/官方文档），无法判定的**显式标注**而非猜填
3. 入池模型的**能力档位与官方文档一致**：`aspect_ratios` / `duration_range` /
   `quality_options` / `reference_rule`，且每项标注**官方文档来源**
4. **未取得官方依据的能力项留空并标注**（不得填"合理猜测值"）；产出
   「未能取得官方依据的模型」清单
5. `protocol_templates.capabilities` 覆盖 **8/8**（T5）
6. **单元级价格落地为 manual 来源**：`cost_*` = 手动录入原价；`price_*` = 原价 + 加价；
   两者可追溯（谁在何时录入）
7. **免费模型收纳**：按 Owner 提供的免费清单，收纳为**一个逻辑模型**（其候选为免费模型集合）；
   其余模型**不建逻辑模型**（按 Owner 决策）
8. `Resolve` 按能力过滤候选：不支持的候选被剔除（**含自动化测试断言**）
9. 前端 `catalogSource` 从 `server` 加载时，工作层**直接用真实模型**（模型广场），
   **不依赖 `demo` 硬编码目录**
10. **mock 渠道已按 Owner 处置方案处理**（不处置则不闭合本判据）
11. 迁移在全新库零错误；旧库升级不破坏既有数据；**未改任何已执行迁移**
12. `go build/test -race/vet` 全绿；前端 `gate`=0/0、`npm test` 全绿；台账 + CHANGELOG 同步

## 测试命令

```bash
cd services/production && go build ./... && go test ./... -race && go vet ./...
cd services/execution && go build ./... && go test ./... -race && go vet ./...
cd apps/web && npm run gate && npm test
# 迁移：见 .agents/skills/database-migrations/SKILL.md
# 真库核对（本卡背景数据即这么来的）：
docker exec shotdesigner-postgres-1 psql -U shotdesigner -d production -c "…"
```

## 附：本卡立卡依据（可复现）

```sql
-- 逻辑模型（实测 2 个冒烟行）
SELECT id,label,type FROM logical_models;
-- 入池候选（实测 3 行，其中 1 行 provider_model 为空）
SELECT id,logical_model_id,provider_model FROM model_catalog WHERE logical_model_id IS NOT NULL;
-- 池原料覆盖（实测 79 条全来自 1 个渠道）
SELECT channel_id,count(*) FROM channel_models GROUP BY channel_id;
-- 能力声明覆盖（实测 2/8）
SELECT count(*) FILTER (WHERE capabilities<>'{}'::jsonb)||'/'||count(*) FROM protocol_templates;
```
