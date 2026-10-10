# 逻辑模型播种提案（供审核）

> **性质**：提案，**未落库**。ADR-003 §3.1.1 明确「等价性是声明出来的，不是推断出来的」，
> 因此候选绑定必须人工审核。本文件是审核材料。
>
> **数据来源**：全新库执行全部 migration 后实测 —— 6 个渠道、16 行 `model_catalog`、8 个内置协议模板。

---

## A. 三个先决问题（**不解决则路由跑不通**）

### A1. 16 行的 `provider_model` **全部为空** ⛔

实测：

```
channel_id | family        | name          
comfy      | Flux          | Flux.1        → provider_model = (空)
google     | Gemini 2.5    | gemini-2.5-flash → provider_model = (空)
...（16 行全部为空）
```

`provider_model` 是"发给上游的模型标识"。**为空意味着路由到候选后无模型名可发** ——
即使表结构与逻辑模型都就绪，调用仍然跑不通。这与「底座尚未搭好」的判断一致。

**建议**：绑定候选前，先补齐各行的 `provider_model`。可参考各行 `name` 与官方文档，
但**需你确认**（同名 ≠ 同标识，见 A3 的同类风险）。

### A2. `comfy` 渠道应禁用（同时印证 SSRF 防护）

```
id: comfy | name: ComfyUI 本地/云端 | kind: local | host: 127.0.0.1:8188 | auth: none | enabled: t
关联模型：Flux.1、SDXL（2 行）
```

两个问题叠加：

1. **产品决策**：你已明确「本地 ComfyUI 不接入，只支持云端 GPU 算力」→ 该渠道属**假承诺**
   （界面看得到，点了必失败）
2. **技术事实**：`base_url = 127.0.0.1:8188` 会**被阶段 1 做的 SSRF 防护拦截**
   （环回默认拒绝，除非显式 `EXECUTION_ALLOW_PRIVATE_UPSTREAM=1`）

⇒ **建议 `enabled = false`**（不删除 —— 删除属破坏性操作，禁用可逆且保留历史）

### A3. 大量价格字段为 `0`，疑似**未填**而非「免费」 ⚠️

| 模型 | 字段 | 值 |
|---|---|---|
| 即梦 Seedance 2.0 / 2.5 | `billing.perSecondStart` | `0` |
| 即梦 Seedream 5.0 | `billing.perImage` | `0` |
| MiniMax-Text-01 | `inputPerMTok` / `outputPerMTok` | `0` |
| comfy Flux.1 / SDXL | `perImage` | `0` |

`0` 会**直接影响两件事**：① 成本上限判定（阶段 1 已实现）会认为不花钱；
② 本提案的路由顺序（按成本排序）会得出错误结论。

**请确认**：这些 `0` 是「确实免费/已含在套餐内」还是「待填」？

---

## B. 建议的逻辑模型与候选绑定

**原则**：只有**同产品、同规格档位**的跨渠道才算候选。跨档位一律不合并（见 C）。

| 逻辑模型 `id`（对外契约） | `label` | 候选（渠道 / `name`） | 等价性依据 | 置信度 |
|---|---|---|---|---|
| `video-seedance-2` | Seedance 2.0 | ① jimeng / Seedance 2.0 ② grsai / Seedance 2.0（特价版） | family 同名；`modes` 完全一致（`t2v,i2v,first_last_frame,multi_ref`）；`maxRefImages`=9 一致；时长 4–15s 一致 | **高** ✅ |
| `video-minimax-h3` | MiniMax H3 | ① minimax / MiniMax H3 ② grsai / MiniMax H3（特价版） | family 同名；时长 1–15s 一致 | **中** ⚠️ 见 C3 |
| `video-seedance-2-5` | Seedance 2.5 | 仅 jimeng / Seedance 2.5 | 单候选（为未来接入留位） | — |
| `video-kling-1-6` | Kling 1.6 | 仅 grsai / Kling 1.6 | 单候选 | — |
| `image-gpt-image-2` | GPT-Image 2 | 仅 openai / gpt-image-2 | 单候选 | — |
| `image-seedream-5` | Seedream 5.0 | 仅 jimeng / Seedream 5.0 | 单候选 | — |
| `image-nano-banana` | Nano Banana | 仅 google / nano-banana | 单候选 | — |
| `image-nano-banana-2-lite` | Nano Banana 2 Lite | 仅 google / nano-banana-2-lite | 单候选（与上者**不同档位**，故不合并） | — |
| `text-gemini-2-5-flash` | Gemini 2.5 Flash | 仅 google / gemini-2.5-flash | 单候选 | — |
| `text-gemini-3-1-flash-lite` | Gemini 3.1 Flash Lite | 仅 google / gemini-3.1-flash-lite | 单候选 | — |
| `text-deepseek-v4-pro` | DeepSeek V4 Pro | 仅 grsai / deepseek-v4-pro | 单候选 | — |
| `text-minimax-01` | MiniMax-Text-01 | 仅 minimax / MiniMax-Text-01 | 单候选 | — |

> 命名规范见 ADR-003 §3.1.2：`id` 用能力型 kebab-case（**对外契约，不得改名**）；
> `label` 承载展示名。**未**采用渠道模型名当 `id`，因为同名模型在不同渠道的标识并不相同。

**单候选的逻辑模型也有价值**：它把"对外标识"先行稳定下来，后续接入新渠道时
**只加候选行、不改契约**。

---

## C. 明确**不建议**合并的（附理由）

| # | 组 | 为什么不合并 |
|---|---|---|
| C1 | `Seedance 2.0` vs `Seedance 2.5`（均 jimeng） | **不同档位**，输出质量不同。合并后一旦降级，用户拿到的是不同产物 → 违反 D2（只换渠道不换模型）的精神 |
| C2 | `nano-banana` vs `nano-banana-2-lite`（均 google） | 同上；且价格不同（¥3 vs ¥2）、宽高比数量不同（3 vs 4） |
| C3 | **MiniMax H3 的 minimax 版 vs grsai 版** | ⚠️ **能力并不等价**：minimax 版含 `audio_ref` 且 `maxRefAudios=1`；grsai 版无音频，但多出 `t2v`/`first_last_frame`。可合并，但**必须做能力过滤**（ADR-003 §3.1.1 第 2 条）：请求用到音频参考时**跳过 grsai 候选，不得降级提交** |
| C4 | `Gemini 2.5 Flash` vs `Gemini 3.1 Flash Lite` | 不同代数与档位；且一个 non-reasoning、一个 reasoning |
| C5 | `gpt-image-2` vs `nano-banana` vs `Seedream 5.0` | 不同厂家的不同模型，只是"都是文生图" —— **只有能力相同，模型不同**，不构成等价 |
| C6 | `comfy` 的 Flux.1 / SDXL | 见 A2，建议禁用 |

---

## D. 路由顺序建议（**依赖 A3 的价格确认**）

以 `video-seedance-2` 为例（`route_priority` 小者优先，建议留 10 的间隔便于插入）：

| 候选 | `route_priority` | 依据 |
|---|---|---|
| jimeng / Seedance 2.0 | 10 | `perSecondStart = 0` → **若确认 0 为真免费**，则优先（成本最低） |
| grsai / Seedance 2.0（特价版） | 20 | `perSecondStart = 2` |

⚠️ **若 A3 确认 `0` 是未填**，则本表顺序**必须推翻重来** —— 这正是 A3 必须先确认的原因：
按错误的价格排序，会把流量全部导向一个"看起来免费"的渠道。

---

## E. 待你决策

| # | 问题 | 我的建议 |
|---|---|---|
| 1 | `provider_model` 由谁补？（16 行全空） | 我按各行 `name` + 官方文档出一版**草稿**供你审，不直接落库 |
| 2 | `comfy` 渠道与 Flux.1/SDXL | **禁用**（可逆），不删除 |
| 3 | A3 的 `0` 是免费还是未填 | **需你确认**；这决定路由顺序是否有效 |
| 4 | 跨档位是否合并（C1/C2/C4） | **不合并** —— 合并即引入静默降级 |
| 5 | MiniMax H3 是否合并（C3） | 可合并，但**必须先实现能力过滤**，否则不做 |

---

## F. 落地方式（审核通过后）

1. `production/027_seed_logical_models.sql`：播种 B 表中已确认的逻辑模型
2. `production/028_bind_candidates.sql`：把候选行的 `logical_model_id` 与 `route_priority` 绑上
3. `production/029_disable_comfy_channel.sql`：`UPDATE model_channels SET enabled=false WHERE id='comfy'`
4. 补 `provider_model`（A1）

> 均为**只增不改**的迁移；`logical_model_id` 保持可为 NULL，未绑定的行行为不变。
