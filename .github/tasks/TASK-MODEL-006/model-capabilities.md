# 供给单元能力档位 · 官方文档核实结果

> 来源：只读 web 调研（2026-10-16）。**原则：只报官方文档写了的；查不到写「未找到官方依据」，不填推测值。**
> 可达域名：volcengine / help.aliyun / minimaxi / bfl / bigmodel / ltx.io / deepmind.google / *.google.cn
> **不可达**：ai.google.dev、cloud.google.com、docs.x.ai、x.ai、platform.openai.com、openai.com、docs.ltx.video、github.com
> （Google 数据经官方 .cn 镜像取得，同源同内容。）
>
> 本文件是 TASK-MODEL-006 的**能力档位数据输入**。写入库前须逐条复核，尤其 `需 Owner 决策的别名映射`。

## 一、VIDEO（15 条中 13 条取得官方依据）

| model_id | 官方产品名 | aspect_ratios | 时长 | 分辨率档 | 生成模式 | 参考图规则 | 置信度 |
|---|---|---|---|---|---|---|---|
| `doubao-seedance-2-5-260628` | Doubao Seedance 2.5，官方 ID 精确命中 | **预设**：16:9、4:3、1:1、3:4、9:16、21:9、adaptive（默认）；**编辑/延长/首尾帧仅 adaptive** | 4~30s（或 -1） | 480p / **720p(默认)** / 1080p(10bit H.265)；24fps | t2v、首帧、首尾帧、全模态参考、视频编辑、延长、有声 | **参考图 0–30 张**；参考视频 0–10；参考音频 0–10 | **高** |
| `doubao-seedance-2-0-260128` | Doubao Seedance 2.0，精确命中 | 同上 | 4~15s | 480p / 720p / 1080p / **4k** | 同上 | 参考图 **0–9 张**；视频 0–3；音频 0–3（不可单独传音频） | **高** |
| `doubao-seedance-2-0-fast-260128` | 2.0 fast，精确命中 | 同上 | 4~15s | 480p / **720p(默认)** | 同上 | 0–9 张 | **高** |
| `doubao-seedance-2-0-mini-260615` | 2.0 mini，精确命中 | 同上 | 4~15s | 480p / **720p(默认)** | 同上 | 0–9 张 | **高** |
| `seedance-1.5-pro` | `doubao-seedance-1-5-pro-251215`（**标注即将下线**） | 预设同上，默认 adaptive | 4~12s | 480p / 720p / 1080p | t2v、首帧、首尾帧、有声；**无参考生视频** | 首帧 1 / 首尾帧 2 | **高**（能力）/ 中（版本映射） |
| `seedance-1.0-pro` | `doubao-seedance-1-0-pro-250528` | 预设同上；**文生默认 16:9，图生默认 adaptive** | **2~12s**（或 `frames` 25+4n, [29,289]） | 480p / 720p / **1080p(默认)** | t2v、首帧、首尾帧 | 首帧 1 / 首尾帧 2 | **高**（能力）/ 中（版本映射） |
| `veo-3.1` | Veo 3.1（官方 `veo-3.1-generate-001` GA） | **预设：9:16、16:9** | **4、6、8s**（参考图生视频仅 8s） | 输出 720p / 1080p / **4K**；24fps | t2v、i2v、首尾帧、参考图、延长、原生音频；≤4 条/请求 | Asset images **Supported**，但**张数上限未找到官方依据** | **中高** |
| `veo-3.1-fast` | `veo-3.1-fast-generate-001` | 9:16、16:9 | 4、6、8s | 720p / 1080p（**无 4K**） | 同上 | 同上（**张数未找到依据**） | **中高** |
| `minimax-h3` | `MiniMax-H3` | **预设**：adaptive(默认)、21:9、16:9、4:3、1:1、3:4、9:16；**t2va 时 ratio 必填且不得 adaptive** | **4~15s**（整数） | **768P / 2K** | t2v、i2v（首/尾帧）、全能参考（图+视频+音频） | 首尾帧 0/1/2；全能参考 **图 ≤9、视频 ≤3、音频 ≤3，混合总 ≤12 文件** | **高** |
| `hailuo-2.3` | `MiniMax-Hailuo-2.3` | **v1 schema 无 ratio 字段** ⇒ 未找到官方依据（比例由首帧图决定） | **768P：6 或 10s；1080P：仅 6s** | **768P(默认) / 1080P** | t2v、i2v（首帧）、首尾帧；另有主体参考 s2v | 首帧图 <20MB、短边>300px、**长宽比 2:5~5:2**；首尾帧 2 张 | **高** |
| `grok-imagine-video-1.5` | **未取得**（docs.x.ai 不可达） | 未找到官方依据 | — | — | — | — | **低（无依据）** |
| `ltx-digitalhuman` | **未取得** | 未找到官方依据 | — | — | — | — | **低（无依据）** |

### ⚠️ 本次发现的三个「relay 别名疑点」

| 现象 | 详情 |
|---|---|
| **`ltx-digitalhuman` 高度疑似 relay 自造别名** | ltx.io 官方站与 sitemap **不存在任何 "digital human" 模型**；官方在售为 `ltx-2-5-fast` / `ltx-2-5-pro`（720p/1080p/1440p/4K，6–20s） |
| **`seedance-1.0-pro` / `1.5-pro` 缺日期后缀** | 官方 ID 带快照后缀（`-250528` / `-251215`），relay 别名无后缀 ⇒ **映射到哪个快照未定**；且 1.5-pro 官方标注「**即将下线**」 |
| **`veo-3.1` 不肯定是 GA 还是 preview** | 官方有 `veo-3.1-generate-001`(GA) 与 `veo-3.1-generate-preview`；ai.google.dev 不可达，无法比对 |

## 二、IMAGE（32 条中 10 条取得官方依据）

| model_id | 官方产品名 | aspect_ratios | 分辨率档 | 参考图规则 | 置信度 |
|---|---|---|---|---|---|
| `nano-banana` | Gemini 2.5 Flash Image（`gemini-2.5-flash-image`；**官方标注已废弃**） | **预设 14 个（全 Gemini Image 共用）**：1:1(默认)、1:4、1:8、2:3、3:2、3:4、4:1、4:3、4:5、5:4、8:1、9:16、16:9、21:9 | 固定 **1K** | **≤3 张** | **高** |
| `nano-banana-2-*` | Gemini 3.1 Flash Image（`gemini-3.1-flash-image`） | 同上 14 个预设 | 默认 1K；**512 / 1K / 2K / 4K** | **物体 ≤10 张；角色一致性 ≤4 张** | **高** |
| `nano-banana-pro-*` | Gemini 3 Pro Image（`gemini-3-pro-image`） | 同上 14 个预设 | 默认 1K；**1K / 2K / 4K** | **物体 ≤6；角色 ≤5；风格 ≤3** | **高** |
| `doubao-seedream-5-0-pro-260628` | Doubao Seedream 5.0 pro，精确命中 | **非预设枚举**：方式1 档位（比例由 prompt 自判）；方式2 自定义像素，**AR ∈ [1/16, 16]** | 方式1 **1K / 1.5K / 2K（默认）** | **≤10 张** | **高** |
| `doubao-seedream-5-0-260128` | Seedream 5.0（官方并列 `-lite-260128`） | 同上，AR ∈ [1/16, 16] | 方式1 **2K / 3K / 4K** | **≤14 张** | 高（能力）/ **中（档位映射：5.0 与 5.0 lite 是否同档，官方未明说）** |
| `doubao-seedream-4-5-251128` | Seedream 4.5，精确命中 | 同上 | 方式1 **2K / 4K** | **≤14 张** | **高** |
| `doubao-seedream-4-0-250828` | Seedream 4.0，精确命中 | 同上 | 方式1 **1K / 2K / 4K** | **≤14 张** | **高** |
| `flux2-klein-9b` | FLUX.2 [klein] 9B（官方端点 `flux-2-klein-9b`） | **无枚举，任意值**（`width`/`height` 整数，min 64） | 由 w×h 决定；官方定位 "up to 4MP"，**无固定档位枚举** | **≤4 张**（`input_image`~`_4`） | **高** |
| `z-image` | **官方为 `z-image-turbo`**（唯一）；relay 的 `z-image` 无 `turbo` 后缀 ⇒ 是否等价需复核 | **非预设**：`size`="宽*高" 任意；官方推荐 1:1、2:3、3:2、3:4、4:3、7:9、9:7、9:16、9:21、16:9、21:9 | 默认 **1024*1536**；总像素 **[512², 2048²]** | **不支持参考图**（API 无 image 入参） | 中高 |
| `wan2.7-image` | 万相 wan2.7-image，精确命中 | **双模式**：方式1 档位（有图输入则输出比例=输入图）；方式2 自定义，**AR ∈ [1:8, 8:1]** | 方式1 **1K / 2K(默认)**，**不支持 4K** | **0–9 张**（单图 [240,8000]px，≤20MB） | **高** |
| `glm-image` | GLM-Image，精确命中 | **预设 + 自定义**：推荐 1280x1280(默认)、1568×1056、1056×1568、1472×1088、1088×1472、1728×960、960×1728（⇒ 1:1、≈3:2、≈2:3、≈4:3、≈3:4、=9:5、=5:9）；自定义长宽 1024–2048、**须为 32 的整数倍** | 无独立清晰度档；`quality` 仅支持 `hd` | **未找到官方依据**（文生图 API 无参考图参数） | **中** |
| `grok-imagine-image-2.0` | **未取得**（docs.x.ai 不可达） | 未找到官方依据 | — | — | **低（无依据）** |

## 三、「未取得官方依据」清单（**必须按"未验证≠通过"处理**）

| # | 模型 | 原因 | 处置建议 |
|---|---|---|---|
| 1 | `gpt-image-1.5`、`gpt-image-2`、`gpt-image-2.5` | platform.openai.com / openai.com / cookbook **全域 HTTP 403** | **留空**；供给单元池中标记 **blocked/待补官方依据**，不用占位值 |
| 2 | `grok-imagine-video-1.5`、`grok-imagine-image-2.0` | docs.x.ai / x.ai **连接失败** | 同上 |
| 3 | `ltx-digitalhuman` | ltx.io 官方**无此模型**，疑为 relay 自造别名 | **需 Owner 决策**：核实 relay 实际映射，或标记为不可用 |
| 4 | `nano-banana-2.1-*`（3 条） | 官方谱系只有 NB / 2 / 2 Lite / Pro，**无 "2.1"** | **需 Owner 决策** |
| 5 | `veo-3.1` / `veo-3.1-fast` 的**参考图张数** | Vertex 模型卡仅写 "Asset images: Supported"，无数字 | 该字段留空，其余字段可用 |
| 6 | `hailuo-2.3` 的 **ratio** | MiniMax v1 schema **无该字段**（比例由首帧图决定） | 留空，不臆造枚举 |
| 7 | `doubao-seedream-5-0-260128` 与 `-lite` 档位关系 | 官方未明说 | 需复核 |
| 8 | Ark 文档提到 **"Seedream 5.0 flash"** 但模型列表无对应 ID | — | 未取得 |

## 四、需 Owner 决策的「relay 别名映射」

官方 ID 与 relay 别名不一致，**不能直接等同**，需逐个确认要落到哪个官方快照：

| relay 别名 | 官方 ID 候选 | 风险 |
|---|---|---|
| `seedance-1.0-pro` | `doubao-seedance-1-0-pro-250528` / `-fast-251015`（仅 t2v+首帧） | 能力集不同，选错会给出错误能力声明 |
| `seedance-1.5-pro` | `doubao-seedance-1-5-pro-251215`（**官方标注即将下线**） | 选了即将下线的快照，后续会失效 |
| `z-image` | `z-image-turbo`（官方唯一） | 是否等价未确认 |
| `nano-banana-2.1-*` | 官方**无 2.1 档** | 可能是 relay 自造 |
| `doubao-seedream-5-0-260128` | `-lite-260128` 并列 | 档位未明 |
| `veo-3.1` | `veo-3.1-generate-001`(GA) vs `-preview` | 能力可能有差异 |
| `ltx-digitalhuman` | 官方**无对应模型** | 疑自造别名 |

## 五、行动建议（调研给出，我认同）

1. **可立即落库（高置信）**：4 个 Seedance（2.5/2.0/2.0-fast/2.0-mini）、Seedream 4.0/4.5/5.0-pro、
   Gemini Image 四档（nano-banana 系列）、FLUX.2 klein 9B、wan2.7-image、z-image-turbo、
   glm-image、MiniMax H3、MiniMax-Hailuo-2.3、Veo 3.1(+Fast，除参考图张数)
2. **需 Owner 决策的别名映射**：见 §四
3. **标记为「未验证≠通过」**：OpenAI 三个 gpt-image、xAI 两个 grok-imagine、`ltx-digitalhuman`
   ⇒ 在池中应为 **blocked / 待补官方依据**，**不用占位值**

---

# 补充 · 第二轮调研（非官方来源，逐值标注来源等级）

> Owner 2026-10-16 指示：「不一定是官方文档才会，有时候其他网站也会收录」。
> 本轮补齐首轮 5 个无依据模型 + 3 个字段缺口。
> **来源分级**：`官方` / `官方镜像` / `权威聚合` / `第三方` / `社区`。**放宽来源不等于放弃可追溯。**

## 0. ⚠️ 两个改变索引方式的发现

| # | 发现 | 影响 |
|---|---|---|
| 1 | **`gpt-image-2.5` 不是合法的 API model ID** | 官方 `ImageModel` 枚举里只有 **`gpt-image-2.5-sunburst`** / **`-flare`**（及快照 `-2026-09-08`）⇒ relay 的 `gpt-image-2.5` **必须映射到 sunburst 或 flare 之一**，不能当独立模型落库。**这是第 8 项别名问题**（原 7 项之外） |
| 2 | **`ltx-digitalhuman` 零来源** | GitHub 仓库搜索该 ID **total_count = 0**；Lightricks 官方模型面板只有 `ltx-2-5-fast/pro`、`ltx-2-3-fast/pro` ⇒ **确认「疑似 relay 自造别名」**。最可能对应 LTX-2.x 的 **audio-to-video / lipsync 数字人能力**，但**无任何证据** |

## 1. 新取得的来源（首轮不可达的三家）

| 对象 | 取得的来源 | 等级 |
|---|---|---|
| OpenAI 图像模型 | **`openai/openai-python` 的类型文件**（`image_edit_params.py` / `image_generate_params.py` / `image_model.py`）——**由 OpenAI 自己的 OpenAPI spec 生成 ⇒ 官方级** | **官方（间接）** |
| 同上（交叉） | Microsoft Learn / Azure Foundry 的 DALL·E 文档 | 权威聚合 |
| xAI Grok | 无官方页（docs.x.ai 全程不可达：直连/代理/.md 均失败） | —— |
| xAI Grok（替代） | zenlayer 网关 API 文档、ComfyUI **官方** embedded-docs、Scenario help、Replicate | 第三方 / 社区 |
| `ltx-digitalhuman` | **无** | —— |
| `veo-3.1` 参考图 | ai.google.dev（**仅搜索索引快照**，正文 fetch 失败）+ apidog + Glama MCP schema | 官方（快照）/ 第三方 / 社区 |
| `seedream-5-0` vs `-lite` | **BytePlus ModelArk（字节国际云）** 概览页 | **官方镜像** |

## 2. OpenAI 图像三档（首轮无依据 → 现已有官方级来源）

| 字段 | `gpt-image-1.5` | `gpt-image-2` | `gpt-image-2.5-sunburst` / `-flare` |
|---|---|---|---|
| 尺寸/比例 | **仅三档**：1024x1024 / 1536x1024 / 1024x1536 + auto | **任意 W×H**（两边被 16 整除；比例 1:3~3:1；最大 3840x2160；>2560x1440 为实验性）+ 三标准档 + auto | 同 gpt-image-2 的任意分辨率规则；推荐三标准档 |
| 分辨率 | ~1MP（1K），无 4K | 含 4K 档（实验性） | 像素 655,360–8,294,400（4K） |
| 参考图上限 | **16 张** | **16 张** | **16 张**（第三方独立复核一致） |
| quality | low/medium/high/auto | low/medium/high/auto（**不支持 xhigh/max**） | low/medium/high/**xhigh**/**max**/auto |
| `input_fidelity` | 支持 high/low | ⚠️ **必须省略该参数**（不支持） | —— |
| n | 1–10 | 1–10 | 1–10 |
| 流式 | partial_images 0–3 | 同 | 同 |
| 其他 | 有限访问预览（Limited access preview） | 快照 ID `gpt-image-2-2026-04-21`；背景透明支持但标 preview | Sunburst=编辑精度优先 / Flare=速度优先，**均 GA**；prompt ≤32000 字符 |

## 3. xAI Grok Imagine（**全部为第三方/社区，无官方源**）

| 字段 | `grok-imagine-image-2.0` | `grok-imagine-video-1.5` |
|---|---|---|
| 宽高比 | 1:1,3:4,4:3,9:16,16:9,2:3,3:2,9:19.5,19.5:9,9:20,20:9,1:2,2:1,21:9,5:2,auto（第三方 zenlayer）<br>⚠️ **冲突**：ComfyUI 官方节点文档无 `21:9` / `5:2` | 1:1,16:9,9:16,4:3,3:4,3:2,2:3（默认 16:9） |
| 分辨率 | 1k/1.5k/2k（第三方）<br>⚠️ **冲突**：ComfyUI 仅 1K/2K ⇒ **建议以 1k/2k 为稳** | 480p / 720p / 1080p（默认 720p）；reference-to-video 只到 720p |
| 时长 | — | **1~15 秒**（旧 R2V 规格只到 10s） |
| 参考图上限 | **3 张**（社区：ComfyUI embedded-docs；pro 版仅 1 张） | **7 张**（三源一致） |
| 其他 | n 1–10；text-to-image + image edit（`<IMAGE_0>` 引用） | keyframes ≤4、reference_audios ≤3、输出变体 1–4、原生音频 |
| quality | low/medium/auto（ComfyUI 无 auto） | — |

> ⚠️ **风险提示**：xAI 全部字段**无一官方源**。落库时应标注为"第三方口径，待官方文档可达后复核"。

## 4. 三个字段缺口的结论

| 缺口 | 结论 | 来源等级 |
|---|---|---|
| `veo-3.1` / `-fast` 参考图上限 | **3 张 asset images（或 1 张 style image）** —— 官方搜索快照 + 第三方 + 社区**三源互证** | 官方（快照）+ 三方互证 ⇒ **可采信** |
| `hailuo-2.3` 宽高比 | **官方 schema 根本没有 `aspect_ratio` 字段**（只有 model/prompt/prompt_optimizer/fast_pretreatment/duration/resolution/callback_url）⇒ **比例来自首帧**；权威聚合口径：图生视频跟随源图、文生视频默认 16:9 | **官方**（OpenAPI 原文坐实）<br>第三方 sousaku.ai 声称的 6 个比例枚举 ⇒ **低可信，不采信** |
| `seedream-5-0-260128` vs `-lite-260128` | **同一档（都是 Lite）**：官方镜像写 "Seedream 5.0 lite — `seedream-5-0-260128`（also accepts `seedream-5-0-lite-260128`）"；**Pro 是另一个 ID** `dola-seedream-5-0-pro-260628` | **官方镜像**（BytePlus）⇒ 两个 ID 是**别名关系**<br>（社区 skill 文件称"完整版 vs 轻量版" ⇒ 冲突，以官方镜像为准） |

## 5. 本轮仍无任何来源

| # | 对象 | 说明 |
|---|---|---|
| 1 | **`ltx-digitalhuman` 全部字段** | 零来源（GitHub 搜索 0 命中，无任何中转站/聚合站文档提及）⇒ 标 `别名/疑似 relay 自造`，**不要当实测值** |
| 2 | **`gpt-image-2.5` 作为单一 ID** | 官方枚举中不存在；只有 sunburst/flare ⇒ 表中保留该行时必须写 `别名 → sunburst \| flare` |
| 3 | `grok-imagine-image-2.0` 的**官方**比例/分辨率/参考图上限 | docs.x.ai 全程不可达 |
| 4 | `grok-imagine-video-1.5` 的**官方**时长/分辨率/参考图上限 | 同上 |
| 5 | `veo-3.1` 的**官方页正文** | 仅搜索索引快照 |
| 6 | `hailuo-2.3` 的**官方**比例清单 | 官方 schema 无该字段 |

## 6. 别名问题从 7 项增至 8 项

新增：**`gpt-image-2.5` → `gpt-image-2.5-sunburst` 或 `-flare`（需 Owner 定，二者档位分工不同）**
