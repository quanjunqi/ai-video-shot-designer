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

## ⚠️ 需 Owner 提供的信息（否则只能造第二份 mock）

| # | 需要什么 | 为什么 |
|---|---|---|
| 1 | **哪些上游模型真的可用**（7 个渠道里，除 PearAPI 外其余 6 个是否已具备可用凭据？） | 池原料只有 PearAPI 的 79 条；其余渠道没有同步数据 |
| 2 | **5 个逻辑模型各自要挂哪些候选**（优先顺序） | 「入池 = 管理员精选」，不是自动全量挂 |
| 3 | **单元级价格口径**（成本价从哪来：上游账单 / 人工录入） | T0 已定 synced/manual 双来源，需确认各渠道走哪种 |
| 4 | **能力档位真实取值**（如某视频模型支持的 aspect_ratios / duration_range） | 这些是**产品事实**，不能由 AI 臆测 |

> 未获上述信息前，**本卡只能做"结构与机制"部分（T5 的字段与模板骨架），
> 数据部分不得凭猜测填写**——否则等于造第二份 mock（本卡要消灭的正是它）。

## 验收标准

1. `logical_models` 为 GATE-3 的 5 个真实命名，`accept-smoke-*` 已退役（迁移只增不改）
2. `model_catalog` 入池行（`logical_model_id IS NOT NULL`）**全部 `provider_model` 非空**
3. 现存语义违反行（`gpt-image-2` 空 providerModel）被修正或移出池
4. `protocol_templates.capabilities` 覆盖 **8/8**
5. 能力档位字段存在且至少 1 个真实模型声明（`aspect_ratios` 等）
6. `Resolve` 按能力过滤候选：不支持的候选被剔除（含自动化测试断言）
7. 单元级价格字段有真实值（`cost_*`），口径与 T0 的 synced/manual 一致
8. 前端 `catalogSource` 从 `server` 加载时，创作流用**真实目录**（非 `demo` 硬编码）
9. 端到端：真实目录 → 选模型 → 提交 → 任务成功 → 拿到产物地址（无 mock 介入）
10. 迁移在全新库零错误；旧库升级不破坏既有数据
11. `go build/test -race/vet` 全绿；前端 `npm run gate` = 0/0、`npm test` 全绿
12. 台账/CHANGELOG 同步

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
