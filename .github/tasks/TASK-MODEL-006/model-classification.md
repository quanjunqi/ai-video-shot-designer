# PearAPI 79 模型分类 · 免费识别 · 变体归组

> 来源：只读调研（2026-10-16），方法 `[V]`=网络核实（附 URL）、`[I-N]`=按命名家族推断。
> **口径**：模型名里的 image/video 指**输出模态**；只输出文本的（含多模态输入）归 `text`。
> 本文件是 TASK-MODEL-006 的**数据输入**，不是最终写入值——入池时须逐条复核。

## 一、分类计数（校验 = 79）

> ⚠️ 本表为**调研自查后的更正版**。调研首版把分布写错（33/36/10）并误报"5 个工具型"，
> 经其用 python 逐条核对 79 个 ID 后自行更正为下表（**type 判定结论不变，只是分组与计数错了**）。

| type | 条数 | 生成类 | 非生成（工具型） |
|---|---|---|---|
| text | **32** | 32 | 0 |
| image | **32** | 28 | **4** |
| video | **15** | 14 | **1** |
| **合计** | **79** ✅ | **74** | **5** |

- 校验：79 个 ID 唯一、无重复、全覆盖。
- **注意**：工具型共 **4 条**（不是 5 条）——`Image-Layered`、`Real-ESRGAN`、`rmbg-2.0`（type=image）、
  `seedvr2-upscaler`（type=video）。首版误报的"第 5 条"不存在。

**4 个工具型（非生成）模型**（建议独立"图像/视频处理"分组，不进生成类）：

| model_id | type | 用途 |
|---|---|---|
| `Real-ESRGAN` | image | 图像/视频超分修复（开源） |
| `rmbg-2.0` | image | 抠图/背景移除（BRIA，**商用条款需单独核**） |
| `Image-Layered` | image | RGBA 图层分解（Qwen-Image-Layered） |
| `seedvr2-upscaler` | video | 视频修复/超分（SeedVR2，ICLR2026） |

## 二、对我原假设的**纠正**（重要）

| model_id | 我原先的假设 | 调研结论 | 依据 |
|---|---|---|---|
| `happyhorse-1.0` | image | **video**（图生视频/指令视频编辑） | 阿里官方 `happyhorse-1.0-t2v` 文档：Output=Video |
| `hailuo-2.3` | — | **video**（MiniMax Hailuo） | minimaxi.com/news/minimax-hailuo-23 |
| `minimax-h3` | — | **video**（已开源） | minimax.io/news/minimax-h3-open-source |
| `ltx-digitalhuman` | — | **video**（数字人/口播） | medium：无一手官方页 |
| `seedvr2-upscaler` | — | **video**（工具型，非生成） | GitHub IceClear/SeedVR2 |
| `gemini-omni` | — | **video**（跨模态，medium） | DeepMind 模型卡；官方 ID 为 `gemini-omni-flash`，裸 ID 是否同一接入点**需实测** |
| `muse-spark-1.3` | 不确定 | **text**（Meta，**输出 Text**） | 官方规格：输入 T/I/V/PDF，输出 Text |
| `qwen3.5-plus`/`qwen3.7-plus` | — | **text**（多模态输入但**输出 Text**） | 阿里官方文档 |

⇒ 建议：`gemini-omni` **单独打标**，别混进普通视频模型池。

## 三、全量分类（type | vendor | 置信度）

**text（32）** —— 注意：**不含 `gemini-omni`**（它是 video）
`claude-fable-5`|Anthropic|H · `claude-haiku-4-5-20251001`|Anthropic|H · `claude-opus-4-6`|Anthropic|H · `claude-opus-4-7`|Anthropic|H · `claude-opus-4-8`|Anthropic|H · `claude-opus-5`|Anthropic|H · `claude-opus-5-5`|Anthropic|M · `claude-sonnet-4-6`|Anthropic|H · `claude-sonnet-5`|Anthropic|H · `deepseek-v3.2`|DeepSeek|H · `deepseek-v4-flash-0731`|DeepSeek|H · `deepseek-v4-pro-0813`|DeepSeek|H · `gpt-5.5`|OpenAI|H · `gpt-5.6-luna`|OpenAI|H · `gpt-5.6-sol`|OpenAI|H · `gpt-5.6-terra`|OpenAI|H · `gpt-6-astra`|OpenAI|H · `gpt-6-luna`|OpenAI|H · `gpt-6-sol`|OpenAI|H · `gpt-6.1-sol`|OpenAI|M · `kimi-k2.5`|Moonshot|H ⚠️**官方已下线** · `kimi-k2.6`|Moonshot|H · `kimi-k2.7-code`|Moonshot|H · `kimi-k3`|Moonshot|H · `mimo-v2.5`|小米|H · `mimo-v2.5-pro`|小米|M · `minimax-m2.5`|MiniMax|H · `minimax-m2.7`|MiniMax|H · `minimax-m3`|MiniMax|H · `muse-spark-1.3`|Meta AI|H · `qwen3.5-plus`|阿里|H · `qwen3.7-plus`|阿里|H

**image（32）**
`Image-Layered`|阿里通义|M（工具） · `Real-ESRGAN`|开源|H（工具） · `boogu-image-0.1`|Boogu|M · `doubao-seedream-4-0-250828`|字节|H · `doubao-seedream-4-5-251128`|字节|H · `doubao-seedream-5-0-260128`|字节|H · `doubao-seedream-5-0-pro-260628`|字节|H · `firered-image-edit1.1`|小红书|H · `flux2-klein-9b`|BFL|H · `glm-image`|智谱|M · `gpt-image-1.5`|OpenAI|H · `gpt-image-2`|OpenAI|H · `gpt-image-2-2k`|OpenAI|M · `gpt-image-2-4k`|OpenAI|M · `gpt-image-2.5`|OpenAI|H · `gpt-image-2.5-2k`|OpenAI|M · `gpt-image-2.5-4k`|OpenAI|M · `grok-imagine-image-2.0`|xAI|H · `nano-banana`|Google|H · `nano-banana-2-1k`|Google|H · `nano-banana-2-2k`|Google|H · `nano-banana-2-4k`|Google|H · `nano-banana-2-lite`|Google|H · `nano-banana-2.1-1k`|Google|M · `nano-banana-2.1-2k`|Google|M · `nano-banana-2.1-4k`|Google|M · `nano-banana-pro-1k`|Google|H · `nano-banana-pro-2k`|Google|H · `nano-banana-pro-4k`|Google|H · `rmbg-2.0`|BRIA|H（工具） · `wan2.7-image`|阿里|H · `z-image`|阿里|H

**video（15）**
`doubao-seedance-2-0-260128`|字节|H · `doubao-seedance-2-0-fast-260128`|字节|H · `doubao-seedance-2-0-mini-260615`|字节|H · `doubao-seedance-2-5-260628`|字节|H · `gemini-omni`|Google|M（**跨模态，建议单独打标**） · `grok-imagine-video-1.5`|xAI|H · `hailuo-2.3`|MiniMax|H · `happyhorse-1.0`|阿里|H · `ltx-digitalhuman`|Lightricks|M · `minimax-h3`|MiniMax|H · `seedance-1.0-pro`|字节|H · `seedance-1.5-pro`|字节|H · `seedvr2-upscaler`|字节Seed|H（工具） · `veo-3.1`|Google|H · `veo-3.1-fast`|Google|H

## 四、免费模型识别（**best-effort，且必须人工确认**）

> ⚠️ **前提**：DB 内 **0/79** 有定价；PearAPI 作为中转站**不公开**免费策略。
> 以下只是"上游是否有零成本路径"的推断，**不等于 PearAPI 免费提供**。

**Tier 1 — 开放权重，可零成本自建（证据最强，10 条）**
`z-image`、`wan2.7-image`、`happyhorse-1.0`（Apache 2.0）、`boogu-image-0.1`、`flux2-klein-9b`、
`Real-ESRGAN`、`rmbg-2.0`、`Image-Layered`、`seedvr2-upscaler`、`minimax-h3`

**Tier 2 — 有免费额度但非零成本（促销/配额，不建议进免费池）**
- 阿里云百炼：新用户每模型约 100 万 token / 90 天 → `qwen3.5-plus`、`qwen3.7-plus`、`wan2.7-image`
- 火山方舟安心体验：赠 50 万 token → `doubao-seedream-*`、`doubao-seedance-*`
- ⚠️ Gemini API 免费层**图像/视频生成不可用**（429）→ `nano-banana*`、`veo-3.1*`、`gemini-omni` **不属于**免费层

**Tier 3 — 明确付费（其余约 59 条）**
全部 Claude / GPT-5.x / GPT-6.x / gpt-image-* / grok-imagine-* / kimi-* / minimax-m* / mimo-* /
muse-spark-1.3（$1.25/$4.25 per 1M）/ glm-image / firered-image-edit1.1 / ltx-digitalhuman

**⇒ 给 Owner 的建议**：`is_free` **应由人工在渠道/模型配置里打标**，不要靠模型名推断。
理由：中转站计费模式未知（若是包月订阅，"免费"语义会完全不同）。

## 五、必须处置的可用性问题

| model_id | 问题 | 建议 |
|---|---|---|
| `kimi-k2.5` | **上游官方已下线**，中转站仍挂着 ⇒ 调用**必然失败** | 下架或标「停用」 |

## 六、变体归组（决定"池成一个模型"还是"独立供给单元"）

| 组 | 成员 | 建议 |
|---|---|---|
| G1 | `gpt-image-2` / `-2k` / `-4k` | **池成一个模型 + 分辨率档参数** |
| G2 | `gpt-image-2.5` / `-2k` / `-4k` | 同上 |
| G3 | `nano-banana-2-1k` / `-2k` / `-4k` | 同上（`-lite` 是独立能力档，另算） |
| G4 | `nano-banana-2.1-1k` / `-2k` / `-4k` | 同上 |
| G5 | `nano-banana-pro-1k` / `-2k` / `-4k` | 同上 |
| G6 | `nano-banana` / `nano-banana-2` / `nano-banana-pro` | **代次不同，保持独立** |
| G7 | `doubao-seedream-4-0` / `4-5` / `5-0` / `5-0-pro` | 代次不同；5.0 与 5.0-pro 是同代质量档 |
| G8 | `seedance-1.0-pro` / `1.5-pro` / `doubao-seedance-2-0*` / `2-5` | 保持独立 |
| G9 | `veo-3.1` / `veo-3.1-fast` | **池成一个模型 + 速度档** |
| G10 | `grok-imagine-image-2.0`(image) / `grok-imagine-video-1.5`(video) | ⚠️ **type 不同，不可池化** |
| G11 | `kimi-k2.5`(已下线) / `k2.6` / `k2.7-code` / `k3` | 独立；k2.5 处置见 §五 |
| G12 | `gpt-5.6-sol` / `-terra` / `-luna` | **同代能力档 → 可池化** |
| G13~G20 | GPT-6 系 / Claude Opus 系 / DeepSeek V4 / MiniMax 文本 / MiMo / Qwen | 见调研原始结论，多数保持独立 |
| G21 | `Real-ESRGAN` / `seedvr2-upscaler` / `Image-Layered`（跨 type） | **独立"图像/视频处理"分组**，不进生成类 |
| G22 | `rmbg-2.0` | 同上 |

## 七、低置信度清单（需人工复核，共 12 条）

`gemini-omni`（最需实测）、`claude-opus-5-5`、`gpt-6.1-sol`、`mimo-v2.5-pro`、`Image-Layered`、
`boogu-image-0.1`、`glm-image`、`nano-banana-2.1-1k/2k/4k`、`ltx-digitalhuman`
