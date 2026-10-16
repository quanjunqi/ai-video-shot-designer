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
有效能力(渠道 × 模型) = 渠道覆盖 ?? 模型能力字典(upstream_model) ?? **NOASSERTION（显式「不知道」）**
```

> ⚠️ **本公式已修正**：初稿写的是 `?? 平台默认`。经调研（K8s/SPDX）发现那是**静默断言缺陷**——
> 当字典里**没有**该字段时落到 `platform_default`，等于**把一个你不知道的事实断言成真**。
> 正确做法是解析为显式 `NOASSERTION`，由上层决定拒绝还是无约束放行。
> **SPDX 的关键设计**：「字段缺席 ≡ `NOASSERTION`（不知道）」，而不是「无限制」。

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

## 七、五项决策结论（基于先例调研，Owner 2026-10-16 委托）

> 调研方式：抓取**一手规范正文 + 活体 API**（OpenRouter `/api/v1/models` **实时 462 个模型**、
> K8s `api-conventions`、SPDX 2.3.1、CycloneDX ECMA-424、SLSA v1.1、external-dns、
> LiteLLM、one-api/new-api、AWS Bedrock 生命周期）。
> ⚠️ **其中 D1 推翻了我的初步判断**（我原倾向"字符串起步"），调研证据表明应按 B 做。

### D1 · 字典键 = **一等 `upstream_models` 实体**（B，非字符串）

**先例（活体实测）**：OpenRouter 462 个模型中 **317 个（69%）可路由名 ≠ 权威快照名**；
**88 个 canonical 实体被多个 id 共享**。它用**三个独立字段**处理命名：
`id`（可路由）/ `canonical_slug`（权威快照，含日期）/ `alias_target`（`~…-latest` 追踪型别名，显式隔离）。
LiteLLM 同样分四字段：`model_id`（代理 id）/ `model_name`（对外契约名）/ `model`（上游真名）/ **`base_model`（能力与计价锚点）**。
HF Hub 用带类型的 `base_model` 关系 + `new_version` 显式换代指针。SPDX 7.2 明言需要唯一 id 才能表达元素间关系。

**决定性理由（针对本项目）**：**我们其实已经选了 B** ——
`channel_model_aliases(channel_id, relay_model_id, canonical_provider_model, confidence, source)`
就是一张 B 形状的表（多对一 + 置信度 + 来源）。若能力字典用**裸字符串**做键，
该列就退化为**无外键的软引用** ⇒ 改名/合并/拆分时**静默孤儿化**，
且无法阻止 `claude-sonnet-4-5` / `claude-sonnet-4.5` / `anthropic/claude-sonnet-4-5` 被当成三个东西。
**而且**：当同一模型经两个 relay 暴露**互相矛盾**的声明时，必须能说"这两条谈的是同一个东西"——这需要实体身份。

```sql
upstream_models(id, canonical_slug UNIQUE,  -- 含快照号，不可变，如 doubao-seedance-2-5-260628
                provider, family, status)   -- status: active|legacy|eol（见 D2）
model_capability_dict(upstream_model_id PK REFERENCES upstream_models(id), ...)
upstream_model_aliases(alias UNIQUE PRIMARY KEY,      -- 唯一 ⇒ O(1) 反查
                       upstream_model_id REFERENCES upstream_models(id),
                       alias_kind,  -- vendor_snapshot|vendor_marketing|variant|latest_tracking|relay_id
                       source)      -- auto_sync|manual|inferred_from_probe（见 D3-4）
```

**两条硬约束**：
- **实体创建必须是人工/审核动作，同步只能创建别名**（否则表会被爬虫灌出重复实体——OpenRouter 的 374 个 canonical 是人工治理的结果）
- **合并用软合并**：`merge_into(upstream_model_id)` 保留被合并实体、重指别名，**不物理删除**

**若坚持字符串**：那它必须是**不可变带版本**形式（强制 `provider/model-YYYYMMDD`），并在别名表加指向"已知 canonical 名单"的 FK/CHECK。**做对了其实就是 B——只是少了实体表。**

### D2 · canonical 未知时 = **可见可用但标 `unverified`**，fail-closed 只施加在"选择"上

**先例**：
- **K8s**：「Controllers should apply their conditions … **even if the `status` is Unknown**」——对象**永远可列出**，"是否可被调度选中"是**另一个**显式状态；`observedGeneration` 另表"观测是否过期"
- **AWS Bedrock**：`Active`/`Legacy`/`EOL` 三态，**Legacy 仍可用**，只是"新客户不能采纳"
- **OpenRouter**：462 个里有 **3 个 `supported_parameters` 为空数组，仍在上架且可路由**；未知用显式 token（`"quantization":"unknown"`）
- **SPDX**：字段缺席 ≡ `NOASSERTION`，**不是"无限制"**
- **HF Hub 的反面教训**：曾自动把一切 `config.json` 判为 transformers，2024-08 后**改为不推断** ⇒「宁可不给值，也不要给错值」

**三段式规则**：

| 环节 | 行为 |
|---|---|
| 上架/可见 | **fail-open**——未识别 canonical 也进目录，`capability_status='unverified'`，UI 带徽标 |
| **能力驱动选择/推荐/规划** | **fail-closed**——不能被"9:16、10 秒、3 张参考图"这类约束查询自动选中 |
| 显式执行（用户点名） | **fail-open** 放行，但能力按「未约束」处理，**绝不填 `platform_default`** |

**理由（成本不对称，方向与直觉相反）**：这是**付费视频生成**。错误的能力断言（假阳性）会
**烧掉上游额度 + 产生失败 Job + 让用户白等**，且 `gateway_audit_logs` 会记下一次
"我们明知不确定却声称支持"的调用——在本仓审计纪律下这是**最难解释**的记录。
反之假阴性只损失一个可能能用的模型，且用户可显式绕开。
⇒ **发现阶段 fail-open（别藏），断言阶段 fail-closed（别声称你不知道的事）。**

**必须配的升级路径**（否则 `unverified` 会成永久垃圾场）：
同一 `(channel, relay_model_id)` 连续 N 次成功生成且回传参数一致 ⇒ 自动生成一条
`relay_probe` 断言（confidence 0.8），甚至反推 canonical。**这条"观测反哺声明"闭环是自愈关键。**

### D3 · **人工覆盖赢**，且必须**分表 + 分权限**（构造上冲不掉，不是约定上）

**先例（Q3 的权威答案就在 K8s）**：
- K8s `api-conventions`：`spec`（期望态，人工）与 `status`（观测态，控制器）**分字段、分授权**：
  「controllers are granted **read-only access to `spec`** but full write access to `status`」；
  且「**PUT/POST MUST ignore the `status` values**, to avoid accidentally overwriting」
- K8s 默认化铁律：「**we never want to change or override a value that was provided by the user.
  If they requested something invalid, they should get an error.**」
  ⇒ 渠道声明 = "控制器赋的默认值"，人工覆盖 = "用户显式 spec" ⇒ **后者必须赢**
- **external-dns**：手工记录要被纳管靠**补写所有权标记**（TXT `heritage=external-dns,owner=…`），
  而非被覆写；`--policy=upsert-only` ⇒「**will not delete existing records**」
- **LiteLLM**：按行打归属标记（`db_model`）+「config 模型不能被 UI 编辑」+
  「**Choose one source of truth**」+「同键冲突时 DB 值绝对赢，改 YAML 无效」
- **one-api README 自认**：渠道 `model_mapping` 是**有损**重写（「如无必要请不要设置…会导致请求体被重新构造而非直接透传」）
  ⇒ **渠道声明本来就不该被当作能力真相来源**
- **SPDX**：`Declared`（上游自述）与 `Concluded`（我们的结论）**是两个字段**，
  且标准**强制要求"二者不一致时给出解释"**
- **Wikidata**：「**弃用而不删除**」——保留错误陈述可防止他人重新加入

**方案**：

```sql
-- 同步 Job 的唯一写目标（发现态，可随意覆写）
channel_model_discovered(channel_id, relay_model_id, raw_declared JSONB,
                         fetched_at, fetch_status,  -- ok|http_404|timeout|stale
                         PRIMARY KEY (channel_id, relay_model_id))

-- 人工写入；**同步 Job 的 DB 角色无任何写权限**（连 SQL 权限都不授予）
channel_model_overrides(id, channel_id, upstream_model_id REFERENCES upstream_models(id),
                        field, value JSONB, author_user_id, reason,
                        created_at, superseded_by, status)
```

**解析顺序：人工覆盖 > 渠道声明 > 模型字典 > `NOASSERTION`**

**四条约束**（否则人工覆盖会变成不可审计的暗改）：
1. **字段白名单**：只允许覆盖 `aspect_ratios` / `duration_*` / `reference_image_max` /
   `generation_modes` / `quality_tiers`；**禁止**覆盖认证、`base_url`、上游模型 id、渠道归属
   （改了那些就是**换了一个供给单元**，应新建行而非覆盖）
2. **强制 `author` + `reason`**（SPDX 的 "should be explained"）
3. **`value` 必须过与模型字典同一套 JSON Schema 校验** ⇒ 非法值**报错**，不静默纠正（K8s 铁律）
4. **UI 必须显式展示三层来源**（override / channel-declared / inherited）并对冲突打警告徽标

**同步绝不冲刷人工值的三道保险**：
- **权限层**：同步角色的 DB 权限里**没有** overrides 的 INSERT/UPDATE/DELETE ⇒ **构造上不可能**
- **只增不删**：relay_model_id 从渠道列表消失 ⇒ 置 `fetch_status='stale'`，**保留行**（external-dns `upsert-only`）
- **追平不自动删**：渠道声明追平了人工覆盖 ⇒ 标 `status='redundant'` 并在 UI 提示，**绝不自动删除**
  ——**人类显式写下的东西只有人类能删**

**crux 的另一种选择的代价**：若把人工覆盖放进**同步会写的同一行**，就必须自己实现三方合并。
K8s 花了**两代机制**（`last-applied-configuration` 注解 → SSA 的 `managedFields` 字段所有权）
才解决"如何区分用户删掉的字段与控制器加的字段"这**一个**问题；LiteLLM 干脆放弃。
⇒ **(a) 分表+分权限** 用一次 join 买到 **(b) 单行+merge** 需要一整套机制才能买到的保证。

### D4 · 无权威来源时 **存值 + 结构化 provenance + 强制衰减**

**先例**：
- **CycloneDX（ECMA-424）`evidence.identity[]`** —— 现成四件套：
  `Identity(field, confidence, concluded_value, methods, tools)`；
  `Method(technique, confidence, value)`；且「**Confidence is specific to the technique used**」
  ⇒ **置信度是方法内部概念，不跨方法可比**
- **SLSA v1.1**：信任挂在 **`builder.id`**（来源）上，**不挂在值上**；
  外部参数「**are untrusted; they MUST be included … and MUST be verified downstream**」
- **SPDX**：`NOASSERTION` 是**一等 token**；且「preferable to include an explanation when Concluded is NOASSERTION」
- **Wikidata**：「**Ranks should not be confused with references**… References merely state **where** a value comes from;
  ranks indicate **what value is considered most correct**」⇒ **两轴不可合并**
- **Bedrock**：「Model lifecycle dates are specific to Amazon Bedrock and may differ from dates published by
  model providers」⇒ 必须能同时存"厂商说 6 月 EOL"与"渠道说能用到 9 月"

**`source_tier` 枚举（含等级）**：
`vendor_official`(70) > `vendor_api_probe`(65) > `relay_probe`(60) > `relay_declared`(50)
> `aggregator_third_party`(35) > `community`(20) > `platform_default`(10)

**断言表**（`capability_assertions`）：`upstream_model_id` + `channel_id`(NULL=模型级) + `field` + `value`
+ `source_tier` + `source_uri` + `source_actor` + `method` + `confidence` + **`preference`（与 source 正交）**
+ `asserted_at` / `verified_at` / **`expires_at`** + `status`

**五条规则**：
1. **永不删除冲突断言**，只改 `status`（Wikidata：弃用而不删除，"allows other users to know not to re-add the value"）
2. **`expires_at` 到期即降级为未验证**，不是删除 ⇒ 这是**防止第三方数据静默固化**的唯一可靠机制
   （relay 声明会静默漂移；new-api 有大量"上游模型同步误判废弃"的 issue）
   TTL 建议：`aggregator_third_party` 30 天 / `relay_declared` 7 天 / `community` 90 天
3. **第三方值永远不能把字段提升为 `verified`**（只有 ≥ `relay_probe` 且未过期才算）
4. **UI 必须显示来源等级**——否则第三方值会被当成官方事实（**Grok 全系正是此风险**：无一官方源）
5. **加 `external_refs JSONB`**（照抄 OpenRouter 的 `hugging_face_id`），如
   `{"openrouter":"…","litellm":"…","hf":"…"}` ⇒ 让"我们为什么认为它支持 21:9"事后可追溯

**⚠️ 关于 `confidence`（0–1）**：`0.8` 与 `0.7` 的差别**没有客观依据**，容易变成伪精确。
诚实做法：**只把 `source_tier` 当排序键，`confidence` 仅用于同 tier 内打破平局**。
**不要写跨 tier 的置信度比较逻辑。**

**为什么不能选 B（什么都不存）**：不是因为它少信息，而是**它把不确定性推给每个读者**。
production（目录）/ execution（网关）/ web-bff（展示）**三个服务都会读能力**；
若"未知"意味着"库里没有"，三者会各自兜底 ⇒ **产出三种不同行为**，且**没有任何一处能回答"我们为什么这么做"**。
SPDX 坚持 `NOASSERTION` 是**一个值**而非字段缺席，正是为了让这个判断**集中在一处**。

### D5 · **提升为 ADR**

**建议**：`docs/adr/` 新增 **《供给单元能力来源与解析优先级》**；过程材料（含被否掉的备选方案）
留 `.github/tasks/TASK-MODEL-006/`；任务卡反向链接 ADR 单号。

**三条判据全中**：(a) **难逆转**（迁移只增不改，落地即近乎不可撤销）；
(b) **横切三服务**（解析优先级事实上成为 workspace/production/execution 之间的隐式契约）；
(c) **未来必被重争**。

**最有说服力的一条理由**：**「同步永不冲刷人工覆盖」这条规则，如果不落在 ADR 里，
会被下一个同步 Job 在"顺手清理一下"时删掉。**

**若成为长期强制规则**（如"新增能力字段必须走 assertions 表"），按本仓
「机制落地 = 同步 AGENTS.md」回写 AGENTS.md —— **ADR 解释为什么，AGENTS.md 保证换会话不遗忘**，两者不重复。

## 七之二、定稿方案（右尺寸）—— 取代 §七 的表结构，保留其全部不变量

> Owner 2026-10-16 反馈：「我需要的是**专业的设计，不是简化导致后面反复维护**」。
> 该反馈正确。**区分标准是：每个表/列都必须有「现在就在发生」的理由**，而不是"将来可能要"。
> 本节给出定稿：**3 张表 + 1 个可空列**，逐项标注其**现在时**理由。

### 0. 我上一版"简化到 1 张表"错在哪（诚实记录）

我一度提议压成一张 `model_capability`（JSONB + 3 列来源）。**该方案会破坏已获得的信息**：

| 被丢掉的信息 | 为什么它是**现在**的问题 |
|---|---|
| 逐字段来源 | 我的调研**本身就是逐字段分来源**的：Seedance 比例=火山引擎官方、Grok=第三方、Veo 参考图=搜索快照快照。**一个 JSONB + 一个 `source` 列无法表达** ⇒ 等于主动毁掉已到手的数据 |
| 稳定身份 | 8 项别名映射是**现在**的问题（`ltx-digitalhuman` 零来源、`gpt-image-2.5` 非合法 ID、`seedream-5-0` 与 `-lite` 互为别名） |
| 未知≠默认 | Grok 全系无官方源是**现在**的事实，必须能表达"这个值可信度低" |

⇒ **降级为简化版不是省事，是把返工推迟。** 正确做法是**右尺寸**：保留全部不变量，砍掉推测性字段。

### 1. 定稿结构（3 张表 + 1 个可空列）

```sql
-- 表 1：上游模型实体（身份的稳定锚点）
upstream_models(
  id             BIGSERIAL PRIMARY KEY,
  canonical_slug TEXT NOT NULL UNIQUE,   -- 含快照号，不可变：doubao-seedance-2-5-260628
  provider       TEXT NOT NULL,          -- volcengine | anthropic | xai | google | ...
  family         TEXT NOT NULL,          -- doubao-seedance（营销族，可改名而不影响 id）
  status         TEXT NOT NULL DEFAULT 'active'  -- active | legacy | eol（对齐 Bedrock 三态）
);
-- 现在时理由：别名映射需要 join 目标。用裸字符串做键 ⇒ channel_model_aliases.canonical_provider_model
-- 退化为无外键软引用 ⇒ 改名/合并时静默孤儿化。OpenRouter 实测 317/462（69%）可路由名≠权威名。

-- 表 2：别名（多对一；承载各渠道各自的 id）
upstream_model_aliases(
  alias            TEXT PRIMARY KEY,     -- 唯一 ⇒ O(1) 反查
  upstream_model_id BIGINT NOT NULL REFERENCES upstream_models(id) ON DELETE RESTRICT,
  alias_kind       TEXT NOT NULL,        -- vendor_snapshot|vendor_marketing|variant|latest_tracking|relay_id
  channel_id       TEXT                  -- 非空 = 该渠道特有 id；空 = 通用别名
);
-- 现在时理由：8 项别名问题就是这张表的内容；且中转站 95 条 id 有 16 条是库里没有的
-- ⇒ 接第二个渠道时只**新增别名行**，不新增能力行。ON DELETE RESTRICT：宁可删除失败，不静默丢人工值。

-- 表 3：能力断言（逐字段 + 逐字段来源）
model_capability_assertions(
  id                BIGSERIAL PRIMARY KEY,
  upstream_model_id BIGINT NOT NULL REFERENCES upstream_models(id) ON DELETE RESTRICT,
  channel_id        TEXT,                -- ★ 可空：NULL=模型固有事实；非空=该渠道特有差异
  field             TEXT NOT NULL,       -- aspect_ratios|duration_min_s|duration_max_s|
                                         -- reference_image_max|reference_video_max|reference_audio_max|
                                         -- generation_modes|quality_tiers|resolution_tiers
  value             JSONB,               -- NULL = 显式「不知道」(NOASSERTION)
  source_tier       TEXT NOT NULL,       -- 见 §2 枚举
  source_uri        TEXT,                -- 依据 URL（逐值可追溯）
  asserted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at       TIMESTAMPTZ,         -- 何时核实（官方文档会变）
  status            TEXT NOT NULL DEFAULT 'active'  -- active|superseded|deprecated
);
CREATE UNIQUE INDEX ON model_capability_assertions (upstream_model_id, COALESCE(channel_id,''), field)
  WHERE status = 'active';               -- 每字段仅一条 active
-- 现在时理由：调研数据逐字段分来源（见 §0）。历史以 superseded 行保留 ⇒ 改值不丢旧值。
```

**★ 那个 `channel_id` 可空列，是"右尺寸"的关键**：
它让**渠道级差异一次性可表达**，而**现在全部为 NULL**（能力都是模型级事实）。
将来某中转站确实只放通子集时，**加一行 channel-scoped 断言即可，不需要第二张表、不需要迁移**。

解析顺序（与 §七一致，仅落点更清晰）：
```
有效能力 = channel 级断言(channel_id=本渠道) ?? 模型级断言(channel_id IS NULL) ?? NOASSERTION
```

### 2. `source_tier` 枚举（定稿）

| 值 | 含义 | 你现在就有实例 |
|---|---|---|
| `manual_curated` | **你人工确认**（最高） | 8 项别名裁定后 |
| `vendor_official` | 厂商官方文档 / 模型卡 | Seedance、Veo、MiniMax、Seedream、FLUX、GLM、wan2.7 |
| `vendor_api_probe` | 调厂商自己的 `/models` 观测 | —— |
| `relay_probe` | **我们实测调用成功**并回传参数 | 将来自愈闭环 |
| `relay_declared` | 中转站广告/配置 | `model_type` / `supported_endpoint_types` |
| `aggregator_third_party` | 聚合站 / 网关文档 | **Grok 全系**、OpenAI 经 SDK 类型文件 |
| `community` | 博客 / issue | `ltx-digitalhuman` 的旁证 |

**★ 我把"人工确认"做成最高 tier，而不是另加 `preference` 列** —— 这样"人的判断"与"值从哪来"**共用一个轴**，少一列且无歧义。

### 3. 从 §七 砍掉的字段（逐项说明为何是推测性的）

| 砍掉 | 原依据 | 为何砍 |
|---|---|---|
| `method`（CycloneDX technique） | 表达"怎么确定的" | **已被 `source_tier` 覆盖**（`relay_probe` = dynamic、`vendor_official` = manifest）⇒ 冗余 |
| `confidence` 0–1 | CycloneDX | 调研自己结论：**"置信度是方法内部概念，不跨方法可比"**，0.8 与 0.7 **无客观依据** ⇒ 伪精确。`source_tier` 才是真信号 |
| `expires_at` | 防第三方数据固化 | **`verified_at` + 查询侧的陈旧度策略等价**，且少一列要维护。陈旧规则：`relay_declared` 7 天 / `aggregator` 30 天 / `community` 90 天 |
| `preference`（Wikidata rank） | 与 source 正交 | **`manual_curated` tier 已表达人的判断**（见 §2）⇒ 不需要第二轴 |
| 独立的 `channel_model_discovered` 表 | 分离发现态与人工态 | **`channel_models` 已有 `model_type`/`endpoint_types` 列**，只是没采到值 ⇒ **修同步即可，不必新建表** |
| 独立的 `channel_model_overrides` 表 | 防同步冲刷人工值 | **能力根本不经同步**（见 §4 不变量）⇒ 冲刷问题**结构上不存在**，不需要该表 |
| `upstream_model_aliases.source`（auto/manual） | external-dns 所有权标记 | 并入 `alias_kind` + `manual_curated` tier；**同步只允许写 `alias_kind='relay_id'` 的行**（约束写在同步侧，不占列） |

⇒ **砍掉 7 项，全部有"现在不需要"的理由，且都不是"以后再补"**（前 4 项是冗余/伪精确，后 3 项是结构上不需要）。

### 4. 四条不变量（**这四条才是本设计的价值，不是表的数量**）

| # | 不变量 | 违反的后果 | 依据 |
|---|---|---|---|
| **I1** | **能力不经同步** —— 同步只写路由事实（`model_type`/`endpoints`） | 一旦同步写能力，"人工值被冲刷"问题立刻出现，且必须自己实现三方合并（K8s 花了两代机制才解决） | K8s spec/status 分字段分授权 |
| **I2** | **未知 = NOASSERTION，绝不落平台默认** | 把不知道的事实断言成真 ⇒ 付费生成下烧额度 + 失败 Job + 审计留下"明知不确定却声称支持"的记录 | SPDX：字段缺席 ≡ `NOASSERTION`；HF 曾自动推断造成静默错误后**改为不推断** |
| **I3** | **来源可追溯**（每值知来源与核实时间） | Grok 全系的第三方值会被当成官方事实；无法回答"我们为什么认为它支持 21:9" | CycloneDX / SLSA（信任挂在来源上） |
| **I4** | **稳定身份**（别名多对一，ON DELETE RESTRICT） | 改名/合并静默孤儿化；同模型经两渠道的矛盾声明无法判定"谈的是同一个东西" | SPDX 7.2；OpenRouter 69% 名字≠权威名 |

### 5. 前端契约（避免"设计完了还得再改前端"）

能力字段名**一次定死**，前端只读不猜：

```jsonc
{
  "aspect_ratios":        ["16:9","4:3","1:1","3:4","9:16","21:9","adaptive"],
  "duration":             { "min_s": 4, "max_s": 30, "enum_s": null },   // enum 优先于区间
  "resolution_tiers":     ["480p","720p","1080p"],
  "quality_tiers":        null,
  "generation_modes":     ["t2v","first_frame","first_last_frame","omni_reference","video_edit","video_extend","with_audio"],
  "reference_rules": {
    "image_max": 30, "video_max": 10, "audio_max": 10, "mixed_max": null,
    "constraints": "三场景互斥；不支持含真人人脸素材"
  }
}
```

**`generation_modes` 里显式含 `omni_reference`（全能参考）** —— 这正是你问的那个能力：
`doubao-seedance-2-5` 为 `image_max:30 / video_max:10 / audio_max:10`；
`minimax-h3` 为 `image_max:9 / video_max:3 / audio_max:3 / mixed_max:12`。

### 6. 落地顺序（不变，但更短）

| 序 | 事项 | 现在时理由 |
|---|---|---|
| 1 | 迁移：建 3 张表 | 见 §1 |
| 2 | **修同步**：采 `model_type` / `supported_endpoint_types` / `display_name` | 中转站**已提供**而库里是占位值；顺手解决 79→95 滞后 |
| 3 | **回填能力断言**：我调研的 23+ 条（逐字段标 `source_tier` + `source_uri`） | 数据现成 |
| 4 | 回填别名：95 条 id → 实体（大部分自动，8 项人工裁定） | 见 §四 |
| 5 | 前端按 §5 契约渲染表单 | —— |

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
