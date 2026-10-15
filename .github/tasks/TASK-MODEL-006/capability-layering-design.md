# 能力声明分层设计（思路方案 · 待评审后再开发）

> Owner 2026-10-16：「先把思路方案整理清楚，我们再来进行代码开发」。
> 触发问题：**能力该按中转站声明，还是按上游模型声明？**给一个中转站写死能力，会不会影响接其他中转站或官方源？
> 本文件是**设计草案**，评审通过后才动代码。若获认可，建议按 `docs/adr/template.md` 提升为 ADR
> （它触及供给单元池语义，属 ADR-003/004/009 同族）。

---

## 一、问题的本质

平台要回答一个看似简单的问题：**「这个模型支持哪些能力？」**（画面比例、时长、清晰度档、参考图上限、生成模式）

这个问题的答案有**两个不同的来源**，而我们此前把它们混为一谈：

| 来源 | 回答什么 | 例子 |
|---|---|---|
| **上游模型**（厂商） | 这个模型**固有**能做什么 | 「Seedance 2.5 支持 16:9/4:3/1:1/3:4/9:16/21:9/adaptive，4~30 秒」 |
| **中转站/渠道** | 这个渠道**实际开放**了什么 | 「PearAPI 只放通了 t2v 与首帧，没放通视频编辑」 |

**混为一谈的代价**（Owner 的直觉是对的）：
- 能力写死在"渠道 × 模型"层 ⇒ 接第二个中转站时，同一上游模型**要重新声明一遍**
- 两份声明会**漂移**（改了一个忘了另一个）
- 官方文档更新时，**N 个渠道要改 N 次**
- 中转站的**转述有误**时，错误被当成事实落库，**无从分辨是"模型不支持"还是"渠道没开"**

---

## 二、实测：中转站到底提供了什么（`https://api.pearapi.ai/zh/dashboard/model-market`）

探测其 OpenAI 兼容端点 **`GET /v1/models`（无需鉴权即返回 200）**，每条记录带：

| 字段 | 样例 | 我们此前怎么拿到的 |
|---|---|---|
| `id` | `deepseek-v3.2` | ✅ 同步（= `channel_models.provider_model`） |
| **`model`** | `DeepSeek-V3.2` | ❌ 丢了 —— ⚠️ **但实测它对别名映射毫无价值**（见 2.1-③ 纠正） |
| **`model_type`** | `chat` | ❌ **丢了**（这是**类型分类的权威来源**；我们此前靠模型名猜） |
| **`supported_endpoint_types`** | `["openai","chat.completions"]` | ❌ **丢了**（这是**端点能力** ⇒ 协议模板路由的依据） |
| `channel_type` | `默认` | ❌ 丢了 |
| `created` / `owned_by` | — | 低价值 |

### 2.1 中转站给的三样东西（权威）

**① 类型分类**（95 条）：`chat` 48 / `image` 33 / `video` 14
—— 对比：我们此前**靠 agent 猜**得到 text 32 / image 32 / video 15（且基于旧的 79 条）。**猜的可以作废。**

**② 端点能力**（决定协议路由）：

| `supported_endpoint_types` 组合 | 条数 | 对应协议模板 capability |
|---|---|---|
| `openai` + `chat.completions` | 48 | `text-chat` |
| `+ images.edits` + `images.generations` | 29 | `text-to-image` + `image-to-image` |
| `openai` + `video.generations` + `videos` + `videos.generations` | 14 | 视频生成（异步轮询） |
| `+ images.generations`（无 edits） | 3 | 仅 `text-to-image` |
| `+ images.edits`（无 generations） | 1 | 仅 `image-to-image` |

**③ ~~官方显示名~~ → ⚠️ 实测纠正：`model` 字段无别名价值**

我原本以为 `model` 字段给出"官方显示名"，可作别名映射依据。**实测推翻**：

| 对比 | 条数 |
|---|---|
| `model` 与 `id` **完全相同** | 47 |
| **仅大小写/标点不同**（`deepseek-v3.2` → `DeepSeek-V3.2`） | 48 |
| **真正不同（含别名信息）** | **0** |

⇒ **`model` 字段对 95 个模型中的任何一个都没有提供新信息**。别名映射（那 8 项）
**不能从中转站接口自动获得**，仍须**人工裁定 + 官方文档比对**。

**这条纠正正是"先验证假设再依赖它"的价值**：若照原判断去实现"别名自动预填"，
会写出一段**永远填不出结果**的代码。

### 2.2 中转站**不**提供的东西（必须来自官方文档）

**细粒度生成能力**：`aspect_ratios`、`duration_range`、`quality_options`、`reference_rule`。
⇒ 这部分正是我已调研的 [model-capabilities.md](model-capabilities.md)（23 条高置信 + OpenAI 官方级来源 + 第二轮补充）。

### 2.3 🔴 顺带查出两个真实缺陷

| # | 缺陷 | 证据 |
|---|---|---|
| 1 | **同步链路未采中转站提供的元数据** | `channel_models` **有** `model_type` / `endpoint_types` / `display_name` 三列，但实测全是占位值（`'model'` / `[]` / 与 id 同名），而中转站明明提供了真值 ⇒ **同步链路漏采或解析失败（需核实 `pool.go` 的同步实现）** |
| 2 | **同步滞后** | 站点 **95** 条 / 库中 **79** 条 ⇒ 16 个新增模型未同步（`claude-fable-5-1`、`deepseek-v4.1-flash`、`gemini-3.x-flash` 等），消失 0 |

---

## 三、方案：四层结构（三层能力 + 一层别名）

```
有效能力(渠道 × 模型) = 渠道覆盖 ?? 模型能力字典(canonical_provider_model) ?? 平台默认
```

| 层 | 内容 | 权威来源 | 谁会改 / 多久改一次 | 现状 |
|---|---|---|---|---|
| **① 模型能力字典** | 上游模型的**固有事实**：比例 / 时长 / 清晰度档 / 参考图规则 / 生成模式 | **官方文档** | 官方更新时改**一处** | ❌ 待建 |
| **② 渠道声明** | 类型（`model_type`）、端点能力（`supported_endpoint_types`）、官方显示名 | **中转站 `/v1/models`** | 每次同步自动更新 | ⚠️ 列已存在但**未采** |
| **③ 渠道覆盖** | 该渠道**实际开放的差异**（如未放通 video edit、比例子集） | 渠道文档 / 实测 | 接渠道时按需补 | ⚠️ `model_catalog.capability` 已存在，语义待改 |
| **④ 平台默认** | 兜底 | 平台 | 极少改 | ✅ 已有此概念 |

### 3.1 为什么"官方显示名"要单独一层（别名映射）

```sql
channel_model_aliases(
  channel_id,                -- 哪个渠道
  relay_model_id,            -- 中转站自己的 id（如 ltx-digitalhuman）
  canonical_provider_model,  -- 映射到的规范模型（NULL = 未确定）
  display_name,              -- 中转站给的 model 字段（官方显示名）
  confidence,                -- high/medium/low
  source                     -- 官方 / 官方镜像 / 权威聚合 / 第三方 / 社区
)
```

**它是"渠道配置"，不是"能力"** ⇒ 不污染①层。
它专治当前的 **8 项别名问题**（`ltx-digitalhuman` → ?、`gpt-image-2.5` → sunburst|flare、`veo-3.1` → GA|preview 等）。

⚠️ **不能自动化**（实测纠正）：中转站的 `model` 字段对 95 条**全部只等价于 id**（47 条相同 / 48 条仅大小写不同 / 0 条含新信息）
⇒ 别名映射只能**人工裁定 + 官方文档比对**。好在**范围有限（8 项）**，且我已调研出各自的官方候选（见 [model-capabilities.md](model-capabilities.md) §四）。

### 3.2 冲突处理纪律（**最重要的一条**）

> **渠道口径不得覆盖模型事实。冲突要"记录"，不要"抹平"。**

| 场景 | 错误做法 | 正确做法 |
|---|---|---|
| 中转站说 Hailuo 2.3 支持 6 种比例，而官方 schema **根本没这个字段** | 用中转站的说法覆盖①层 | ①层记官方事实（**无该字段，比例来自首帧**）；③层记渠道声明并标来源；**冲突可见** |
| 中转站按两档给 `seedream-5-0` / `-lite` 计费，而官方说**二者是别名** | 落库当两个模型 | ④层或③层记录"渠道按两档计费"这一**渠道口径**；①层仍记同一模型 |

**为什么**：只有这样，当某次调用失败时，才能区分是**"模型不支持"**还是**"渠道没开"**——这是排障时最关键的一条信息。

---

## 四、与现有架构的对应（不是我现编的模式）

| 位置 | 形式 | 层级数 |
|---|---|---|
| `apps/web/src/config/create/control-schema.ts:87,96` | `source: 'declared' \| 'count-fallback' \| 'platform-default'` | 3 |
| 加价比例（本轮迁移 039） | 有效比例 = 模型级 ?? 类型级 ?? 0 | 2 |
| **能力声明（本方案）** | 有效能力 = 渠道覆盖 ?? 模型字典 ?? 平台默认 | **3** |

**三处同一模式 ⇒ 架构一致的信号。** 加价那套刚落地（迁移 039），本方案是它的同族扩展，实现路径可复用（尤其是"可空列 = 继承"这个惯用法）。

---

## 五、数据模型草案

```sql
-- ① 模型能力字典（键 = 规范模型名，跨渠道共享）
model_capability_dict(
  canonical_provider_model text PRIMARY KEY,   -- 规范化的上游模型名
  vendor                   text,               -- Anthropic / OpenAI / Google / 字节…
  type                     text NOT NULL,      -- text | image | video（与 model_catalog 同枚举）
  capability               jsonb NOT NULL,     -- aspect_ratios / duration_range / quality_options / reference_rule / modes
  source                   text NOT NULL,      -- 官方 / 官方镜像 / 权威聚合 / 第三方 / 社区
  source_url               text,               -- 逐值可追溯
  verified_at              timestamptz,        -- 何时核实的（官方文档会变）
  updated_by, updated_at
)

-- ② 渠道声明（同步层，来自中转站 /v1/models）
--   复用既有列：channel_models.model_type / endpoint_types / display_name
--   （当前未采 ⇒ 修同步链路即可，不必新建表）

-- ③ 渠道覆盖（可空 = 继承①层）
--   复用 model_catalog.capability（语义由"唯一声明"改为"覆盖层"）

-- ④ 别名映射
channel_model_aliases(channel_id, relay_model_id, canonical_provider_model,
                      display_name, confidence, source, updated_at,
                      PRIMARY KEY (channel_id, relay_model_id))
```

---

## 六、接入新源时的流程（**本方案的价值证明**）

| 步骤 | 接 PearAPI（第一个源） | 接第二个中转站 / 官方源 |
|---|---|---|
| 同步模型清单 | 修同步链路，采 `model_type` / `supported_endpoint_types` / `model` | **同一套同步逻辑**（若同为 OpenAI 兼容 `/v1/models`） |
| 类型与端点能力 | **自动**（中转站给） | **自动** |
| 别名映射 | 首次建立（**8 项人工裁定**） | 只填**该渠道特有**的别名（**仍需人工**，但范围随首次建立递减） |
| 细粒度能力 | 落①层字典（**一次性**，23+ 条） | ✅ **零工作**——`canonical_provider_model` 相同即自动继承 |
| 渠道差异 | —— | 仅在确有差异时填③层 |

⇒ **工作量从"每接一个源重录 N 个模型的能力"降到"填几张别名 + 少量差异"。**

---

## 七、待决策项（评审时定）

| # | 决策 | 选项 |
|---|---|---|
| 1 | ①层字典的**键**用什么 | A `canonical_provider_model` 字符串 / B 引入"上游模型"独立实体（有 id 与别名集） |
| 2 | 别名映射的 `canonical` 为空时怎么处理 | A 该模型**不可用**（fail-closed）/ B 可用但标"能力未知" |
| 3 | ②层同步采到 `model_type` 后，**是否仍允许人工改类型** | A 人工覆盖优先 / B 渠道声明优先（人工只读） |
| 4 | 官网不给的字段（如 Grok 全系无官方源）如何标注 | A 落第三方值 + 标来源 / B **不落值**，UI 显示"能力未核实" |
| 5 | 是否把本方案提升为 **ADR** | A 是（触及供给单元语义）/ B 留在任务内 |

**我的倾向**：1-B（独立实体更干净，但成本高，可先用 1-A 起步）；2-B（可用但要显式标注，避免"静默不可用"）；3-A（人工兜底总是要留）；4-A + 显式标注（Owner 已指示可用非官方来源）；5-A。

---

## 八、非范围（本方案不做）

- ❌ 不改 `channel_models` 的**同步机制本身**（ADR-004 D1/D2 不变量：只写供给池、绝不自动写目录）
- ❌ 不把中转站的转述当作①层（模型事实）的依据
- ❌ 不为"入池"做新的管理 UI（另议；既有 `CurationPanel` 可扩展）
- ❌ 不实现能力过滤路由（属后续，本方案只解决"能力从哪来、怎么分层"）

---

## 八之二、设计过程中的两次实测纠正（留痕）

| # | 我原本的判断 | 实测结果 | 影响 |
|---|---|---|---|
| 1 | 中转站 `/v1/models` 的 `model` 字段可作**别名映射依据**，能大幅自动化 | **0/95 有别名信息**（47 条相同、48 条仅大小写不同）⇒ 无任何价值 | 删除"别名自动预填"设计，改为**人工裁定 8 项** |
| 2 | 中转站的 `model_type` / `supported_endpoint_types` 需要**新同步字段** | `channel_models` **已有** `model_type` / `endpoint_types` / `display_name` 三列，只是**没采到真值** ⇒ 是**同步链路缺陷**，不是表结构缺失 | 工作量从"加字段"降为"修同步" |

**留痕理由**：这两条都是"**先验证假设再依赖它**"的直接收益。若照原判断实现，会产出
①一段永远填不出结果的别名预填代码 ②一次不必要的表结构迁移。

## 九、建议的执行顺序（评审通过后）

| 序 | 事项 | 依赖 |
|---|---|---|
| 1 | 修**同步链路**：采 `model_type` / `supported_endpoint_types` / `model` 三字段 | 无（且能同时解决类型分类与同步滞后） |
| 2 | 建 **`channel_model_aliases`**；8 项别名**人工裁定后回填**（**无自动预填**，实测纠正） | 1 |
| 3 | 建 **`model_capability_dict`** + 落已调研的 23+ 条（标注来源与 URL） | 无 |
| 4 | `model_catalog.capability` 语义改为**渠道覆盖**（可空=继承） | 2/3 |
| 5 | 那 8 项别名交由 Owner 裁定（我已备好各官方候选与风险） | 2 |
| 6 | （可选）UI 显示"能力来源与核实时间" | 3 |
