# PearAPI 79 模型 · 策展参考表（TASK-MODEL-006 生成）

> 用途：**人工策展时的一张表**（模态 / 厂牌 / 置信度 / 价格可判性 / 建议协议模板）。
> ⚠️ 本表**不是**写入值 —— 按 ADR-004，`model_catalog` 只由**人工策展**产生。
> 数据来源：`model-classification.md`（输出模态口径）+ 供给池实时 + `pearapi-pricing-2026-10-16.json`。

## ⚠️ 价格数据的三个精确口径（实测，2026-10-17）

> **为什么必须写精确**：同一件事在不同集合上会得到不同数字 ——
> 我第一版脚本只遍历**供给池**，得出"陷阱 7 个"，而文献记录是 10 个，看似矛盾。
> 实为**量的不是同一个集合**。两个数都对：

| 口径 | 数字 | 说明 |
|---|---|---|
| pricing JSON **全部**条目 | **105** 条 | 中转站按调用者分组裁剪后的视图（**不是**全域目录） |
| 其中**陷阱模型**（`quota_type=0` + `model_ratio=0` + `model_price=0`，真实价只在 `price_tiers`） | **10** 个 | 与 `relay-semantics-findings.md` §1 记录的 10 个**一致** ✓ |
| **供给池内**的陷阱模型 | **7** 个 | ⇒ **策展时实际会碰到的就是这 7 个** |

**★ 而 pricing 与供给池并不重合（这是本轮新算出的）**：
| 关系 | 数量 |
|---|---|
| pricing 条目**不在**供给池 | **43** 条（可能是其它分组/未同步的模型） |
| 供给池 79 个**在 pricing 里没有**价格 | **17** 个 ⇒ 策展这些时**无价可判**，只能走「手动录入原价」（正是 Owner 定的口径） |

无价格的 17 个（策展时需你手动定价）：
`Image-Layered`, `Real-ESRGAN`, `glm-image`, `gpt-image-1.5`, `gpt-image-2-2k`, `gpt-image-2-4k`, `gpt-image-2.5-2k`, `gpt-image-2.5-4k`, `nano-banana-2-1k`, `nano-banana-2-2k`, `nano-banana-2-4k`, `nano-banana-2.1-1k`, `nano-banana-2.1-2k`, `nano-banana-2.1-4k`, `nano-banana-pro-1k`, `nano-banana-pro-2k`, `nano-banana-pro-4k`

**⇒ 结论（对策展的影响）**：
1. **17 个无价** ⇒ 必须手动录原价（Owner 定「不去上游获取」）
2. **7 个有陷阱价** ⇒ 若将来要自动同步价，必须读 `price_tiers` 而**不能**读 `model_ratio`/`model_price`
3. 其余按量/按次可判

## 按输出模态分布（分类口径 vs relay 占位值）

| type | 条数（分类） |
|---|---|
| text | 32 |
| image | 32 |
| video | 15 |

**对照**：relay 自己的 `model_type` 全是占位 `model`（实测 `upstreamType` 分布 {'model': 79}）⇒ **必须用分类口径，不能用 relay 值**。

## 逐条明细（按 type 分组）

### text（32）

| provider_model | 厂牌 | 置信度 | 价格可判 | 建议模板 |
|---|---|---|---|---|
| `claude-fable-5` | Anthropic | H | 按量 | `pt_builtin_openai` |
| `claude-haiku-4-5-20251001` | Anthropic | H | 按量 | `pt_builtin_openai` |
| `claude-opus-4-6` | Anthropic | H | 按量 | `pt_builtin_openai` |
| `claude-opus-4-7` | Anthropic | H | 按量 | `pt_builtin_openai` |
| `claude-opus-4-8` | Anthropic | H | 按量 | `pt_builtin_openai` |
| `claude-opus-5` | Anthropic | H | 按量 | `pt_builtin_openai` |
| `claude-opus-5-5` | Anthropic | M | 按量 | `pt_builtin_openai` |
| `claude-sonnet-4-6` | Anthropic | H | 按量 | `pt_builtin_openai` |
| `claude-sonnet-5` | Anthropic | H | 按量 | `pt_builtin_openai` |
| `deepseek-v3.2` | DeepSeek | H | 按量 | `pt_builtin_openai` |
| `deepseek-v4-flash-0731` | DeepSeek | H | 按量 | `pt_builtin_openai` |
| `deepseek-v4-pro-0813` | DeepSeek | H | 按量 | `pt_builtin_openai` |
| `gpt-5.5` | OpenAI | H | ⚠️ 仅 price_tiers | `pt_builtin_openai` |
| `gpt-5.6-luna` | OpenAI | H | ⚠️ 仅 price_tiers | `pt_builtin_openai` |
| `gpt-5.6-sol` | OpenAI | H | ⚠️ 仅 price_tiers | `pt_builtin_openai` |
| `gpt-5.6-terra` | OpenAI | H | ⚠️ 仅 price_tiers | `pt_builtin_openai` |
| `gpt-6-astra` | OpenAI | H | ⚠️ 仅 price_tiers | `pt_builtin_openai` |
| `gpt-6-luna` | OpenAI | H | 按量 | `pt_builtin_openai` |
| `gpt-6-sol` | OpenAI | H | ⚠️ 仅 price_tiers | `pt_builtin_openai` |
| `gpt-6.1-sol` | OpenAI | M | ⚠️ 仅 price_tiers | `pt_builtin_openai` |
| `kimi-k2.5` | Moonshot | H ⚠️**官方已下线** | 按量 | `pt_builtin_openai` |
| `kimi-k2.6` | Moonshot | H | 按量 | `pt_builtin_openai` |
| `kimi-k2.7-code` | Moonshot | H | 按量 | `pt_builtin_openai` |
| `kimi-k3` | Moonshot | H | 按量 | `pt_builtin_openai` |
| `mimo-v2.5` | 小米 | H | 按量 | `pt_builtin_openai` |
| `mimo-v2.5-pro` | 小米 | M | 按量 | `pt_builtin_openai` |
| `minimax-m2.5` | MiniMax | H | 按量 | `pt_builtin_openai` |
| `minimax-m2.7` | MiniMax | H | 按量 | `pt_builtin_openai` |
| `minimax-m3` | MiniMax | H | 按量 | `pt_builtin_openai` |
| `muse-spark-1.3` | Meta AI | H | 按量 | `pt_builtin_openai` |
| `qwen3.5-plus` | 阿里 | H | 按量 | `pt_builtin_openai` |
| `qwen3.7-plus` | 阿里 | H | 按量 | `pt_builtin_openai` |

### image（32）

| provider_model | 厂牌 | 置信度 | 价格可判 | 建议模板 |
|---|---|---|---|---|
| `Image-Layered` | 阿里通义 | M（工具） | 池内无定价 | `pt_builtin_openai_img` |
| `Real-ESRGAN` | 开源 | H（工具） | 池内无定价 | `pt_builtin_openai_img` |
| `boogu-image-0.1` | Boogu | M | 按次 0.1 | `pt_builtin_openai_img` |
| `doubao-seedream-4-0-250828` | 字节 | H | 按次 0.09 | `pt_builtin_openai_img` |
| `doubao-seedream-4-5-251128` | 字节 | H | 按次 0.1125 | `pt_builtin_openai_img` |
| `doubao-seedream-5-0-260128` | 字节 | H | 按次 0.099 | `pt_builtin_openai_img` |
| `doubao-seedream-5-0-pro-260628` | 字节 | H | 按次 0.135 | `pt_builtin_openai_img` |
| `firered-image-edit1.1` | 小红书 | H | 按次 0.1 | `pt_builtin_openai_img` |
| `flux2-klein-9b` | BFL | H | 按次 0.007 | `pt_builtin_openai_img` |
| `glm-image` | 智谱 | M | 池内无定价 | `pt_builtin_openai_img` |
| `gpt-image-1.5` | OpenAI | H | 池内无定价 | `pt_builtin_openai_img` |
| `gpt-image-2` | OpenAI | H | 按次 0.072 | `pt_builtin_openai_img` |
| `gpt-image-2-2k` | OpenAI | M | 池内无定价 | `pt_builtin_openai_img` |
| `gpt-image-2-4k` | OpenAI | M | 池内无定价 | `pt_builtin_openai_img` |
| `gpt-image-2.5` | OpenAI | H | 按次 0.056 | `pt_builtin_openai_img` |
| `gpt-image-2.5-2k` | OpenAI | M | 池内无定价 | `pt_builtin_openai_img` |
| `gpt-image-2.5-4k` | OpenAI | M | 池内无定价 | `pt_builtin_openai_img` |
| `grok-imagine-image-2.0` | xAI | H | 按次 0.05 | `pt_builtin_openai_img` |
| `nano-banana` | Google | H | 按次 0.08 | `pt_builtin_openai_img` |
| `nano-banana-2-1k` | Google | H | 池内无定价 | `pt_builtin_openai_img` |
| `nano-banana-2-2k` | Google | H | 池内无定价 | `pt_builtin_openai_img` |
| `nano-banana-2-4k` | Google | H | 池内无定价 | `pt_builtin_openai_img` |
| `nano-banana-2-lite` | Google | H | 按次 0.06 | `pt_builtin_openai_img` |
| `nano-banana-2.1-1k` | Google | M | 池内无定价 | `pt_builtin_openai_img` |
| `nano-banana-2.1-2k` | Google | M | 池内无定价 | `pt_builtin_openai_img` |
| `nano-banana-2.1-4k` | Google | M | 池内无定价 | `pt_builtin_openai_img` |
| `nano-banana-pro-1k` | Google | H | 池内无定价 | `pt_builtin_openai_img` |
| `nano-banana-pro-2k` | Google | H | 池内无定价 | `pt_builtin_openai_img` |
| `nano-banana-pro-4k` | Google | H | 池内无定价 | `pt_builtin_openai_img` |
| `rmbg-2.0` | BRIA | H（工具） | 按次 0.02 | `pt_builtin_openai_img` |
| `wan2.7-image` | 阿里 | H | 按次 0.2 | `pt_builtin_openai_img` |
| `z-image` | 阿里 | H | 按次 0.07 | `pt_builtin_openai_img` |

### video（15）

| provider_model | 厂牌 | 置信度 | 价格可判 | 建议模板 |
|---|---|---|---|---|
| `doubao-seedance-2-0-260128` | 字节 | H | 按次 0.32 | `pt_builtin_openai_video` |
| `doubao-seedance-2-0-fast-260128` | 字节 | H | 按次 0.31 | `pt_builtin_openai_video` |
| `doubao-seedance-2-0-mini-260615` | 字节 | H | 按次 0.4 | `pt_builtin_openai_video` |
| `doubao-seedance-2-5-260628` | 字节 | H | 按次 0.6 | `pt_builtin_openai_video` |
| `gemini-omni` | Google | M（**跨模态，建议单独打标**） | 按次 1.4 | `pt_builtin_openai_video` |
| `grok-imagine-video-1.5` | xAI | H | 按次 0.9 | `pt_builtin_openai_video` |
| `hailuo-2.3` | MiniMax | H | 按次 0.06 | `pt_builtin_openai_video` |
| `happyhorse-1.0` | 阿里 | H | 按次 0.56 | `pt_builtin_openai_video` |
| `ltx-digitalhuman` | Lightricks | M | 按次 0.04 | `pt_builtin_openai_video` |
| `minimax-h3` | MiniMax | H | 按次 0.1 | `pt_builtin_openai_video` |
| `seedance-1.0-pro` | 字节 | H | 按次 1.52 | `pt_builtin_openai_video` |
| `seedance-1.5-pro` | 字节 | H | 按次 1.93 | `pt_builtin_openai_video` |
| `seedvr2-upscaler` | 字节Seed | H（工具） | 按次 0.15 | `pt_builtin_openai_video` |
| `veo-3.1` | Google | H | 按次 1.25 | `pt_builtin_openai_video` |
| `veo-3.1-fast` | Google | H | 按次 1.2 | `pt_builtin_openai_video` |

