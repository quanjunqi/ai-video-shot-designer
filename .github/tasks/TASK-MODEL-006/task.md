---
taskId: TASK-MODEL-006
status: 进行中
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

## ✅ Owner 拍板（2026-10-16，含一处对我理解的纠正）

### 纠正：逻辑模型的真实意图

我上一轮把「逻辑模型」理解成"**只**用于收纳免费模型"——**理解偏了**。Owner 澄清：

> "逻辑模型用于处理**特殊的模型分组**的意思，**工作层也可以使用**，但是主要的还是**模型广场**中选择。"
> "免费模型这个让我来决定，**逻辑模型你不需要帮我创建**，你只要帮我**实现这么个功能**，
> 相当于是**模型分组**一样。背景是可能不同渠道下有不同免费模型，我可以自己阅读渠道文档，
> 然后创建逻辑模型分组来统一管理——**这个只是我举的一个案例**。"

⇒ 逻辑模型 = **通用的「模型分组 / 特殊收纳」机制**；免费模型只是其中一个使用场景。
本卡**只实现/验证该功能，不创建任何分组数据**（Owner 自行创建）。

### 已核实：该功能**已经存在**（本卡范围因此再收缩）

| 层 | 现状 | 证据 |
|---|---|---|
| 契约 | 完整 CRUD + **候选绑定** | `openapi/bff.yaml:1326/1368/1385/1411/**1428**`（`/logical-models`、`/{id}`、`/{id}/candidates`） |
| 前端 | **591 行**管理页，含创建/编辑/启停 + 候选绑定面板（`routePriority` 小者优先） | `apps/web/src/pages/SettingsLogicalModels.tsx` |
| 表 | `logical_models(id,label,type,capability,status,sort,note,…)` + `model_catalog.logical_model_id` | migration `025`/`026` |

⇒ 本卡对该项的工作 = **验证其端到端可用**（当前只有 2 个冒烟行，从未被真实验证过）+ **工作层接线**（确保分组在工作层可选）。

### 三项拍板

| # | 拍板 | 落地 |
|---|---|---|
| 1 | **mock 渠道全部删除** | 删 6 条（ComfyUI/Google/Grsai/即梦/MiniMax/OpenAI），**仅保留 PearAPI**；需级联检查 `model_catalog` 中挂在这些渠道的行 |
| 2 | **加价方式 = 电商商品管理式**：`售价 = 原价 + 原价 × 比例%`；**每个模型可单独设比例**，**支持勾选多选批量设置** | ⚠️ **现有字段无"比例"**（仅 `cost_*`/`price_*`/`price_source`/`price_synced_at`）⇒ **需新增比例字段**（原价变动时售价跟随，故比例必须独立存储，不能只存算好的 `price_amount`） |
| 3 | 免费模型由 Owner 自行决定；**不替他创建分组数据** | 本卡只交付功能与验证 |

### 补充拍板（2026-10-16 第二轮）

| # | 我问的 | Owner 答复 | 落地设计 |
|---|---|---|---|
| 4 | PearAPI 是按次还是包月？ | **按用量计费**：**图片按次 · 文字按 token · 视频按秒** | 与 `cost_unit` 的设计枚举**一一对应**：图片 `per_call`、文字 `per_mtok_*`、视频 `per_second`。⇒ **不是包月**，"免费"语义 = **零成本调用**，故 Tier 1「开放权重可自建」的推断有意义 |
| 5 | 加价比例是否分档？ | **分两档**：**① 类型分第一档**（text/image/video）**② 类型下的模型再分一档** | **两级比例结构**（见下） |

### 加价比例：两级结构（本卡核心设计）

```
有效比例(model) = 模型级比例(model)  ??  类型级默认比例(type)      // 模型级覆盖类型级
售价(model)     = 原价(model) × (1 + 有效比例(model))
```

| 层级 | 存储 | 语义 |
|---|---|---|
| **第一档 · 类型级默认** | 类型 → 比例（text / image / video 共 3 条） | 未单独设置的模型**继承**本类型默认值 |
| **第二档 · 模型级覆盖** | `model_catalog` 新增可空比例列 | 为空 = 继承类型级；有值 = 覆盖 |

**批量设置** = 勾选多个模型 → 批量写入**模型级覆盖**（不是改类型默认）。
⇒ 因此"批量设置"与"改类型默认"是**两个不同操作**，UI 上须区分（前者改选中模型，后者改该类型下所有未覆盖的模型）。

### 待定（仍需 Owner 后续确认）

| # | 待定项 | 影响 |
|---|---|---|
| 1 | **三级默认比例的具体数值**（text / image / video 各设多少 %） | 属商业定价决策，Owner 自行在后台设置；本卡只保证**机制可用** |
| 2 | 是否允许**比例为 0 或负**（促销/亏损引流） | 校验规则边界 |

## 验收标准

> 已按 Owner 五项拍板重写（含两级加价比例）。**核心口径：本卡只交付"能力与数据骨架 + 验证"，
> 不替 Owner 造分组数据、不编造能力取值。**

1. **删 mock 渠道**：`model_channels` 仅剩 **PearAPI** 一条；6 条 mock 渠道已删除；
   原挂在它们下面的 `model_catalog` 行**已按明确规则处置**（迁移可追溯，不静默丢数据）
2. **两级加价比例**：类型级默认（text/image/video 各一条）+ 模型级覆盖（可空）已落地；
   **有效比例 = 模型级 ?? 类型级**，`售价 = 原价 × (1 + 有效比例)` 可计算
3. **继承与覆盖可验证**：未设模型级比例 → 取类型默认；设了 → 取模型级；
   改类型默认 → **未覆盖的模型售价跟随变**、已覆盖的**不变**
4. **批量设置**：勾选多个模型 → 批量写入**模型级覆盖**（一次性生效，非逐个点）；
   且与"改类型默认"是**两个可区分的操作**
5. **原价变动跟随**：改 `cost_amount` 后售价按有效比例自动跟随（验证比例**独立存储**，而非只存算好的 price_amount）
6. **计费单位与类型一致**：图片 `per_call`、文字 `per_mtok_*`、视频 `per_second`，
   与"图片按次 / 文字按 token / 视频按秒"一致
7. **逻辑模型分组端到端可用**：创建分组 → 挂候选模型 → 启停 → 在工作层**可选到该分组**；
   全程走真实 API（非 mock）。**不预置任何分组数据**
8. **79 个真实模型完成分类**且每条有依据；无法判定的显式标注（不猜填）
9. **入池行 `provider_model` 全部非空**；现存违规行（`gpt-image-2` 空值）被修正或移出
10. **能力档位与官方文档一致**（`aspect_ratios`/`duration_range`/`quality_options`/`reference_rule`），
   每项标注**官方文档来源**；**未取得官方依据的留空并标注**，并产出"无官方依据"清单
11. `protocol_templates.capabilities` 覆盖 **8/8**
12. **`kimi-k2.5`（上游已下线）已停用或下架**——避免用户选到必然失败的任务
13. `Resolve` 按能力过滤候选（含自动化测试断言）
14. 前端 `catalogSource` 走 `server`（真实目录），工作层**主要从模型广场选真实模型**
15. 迁移在全新库零错误；旧库升级不破坏既有数据；未改任何已执行迁移
16. `go build/test -race/vet` 全绿；前端 `gate`=0/0、`npm test` 全绿；台账 + CHANGELOG 同步

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
