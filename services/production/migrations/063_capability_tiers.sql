-- 063: 能力档位数据 —— 给真实模型填官方核实过的取值（TASK-MODEL-006 判据 5）
--
-- 号段：production 模型中心 060-069（060=渠道清理 / 061=视频模板 / 062=params 形状 / 本文件 063）
--
-- ============================================================================
-- 为什么需要它（实测缺口，不是推测）
-- ============================================================================
-- 查真库 production（2026-10-17）—— 三个已策展模型的 `capability` 现状：
--   · text  `deepseek-v4-pro-0813`  有 maxTokens/streaming/temperature…（形态完整）
--   · image `gpt-image-2`           只有 **计数** `{refImage:false, qualityTiers:2, aspectRatioCount:3}`
--                                   ⇒ **没有实际档位取值**，前端只能走兜底
--   · video `doubao-seedance-2-5-260628`（061/策展新增）  **`{}` 空**
--
-- ★ 而前端 **已经在消费这些键**（`apps/web/src/config/create/control-schema.ts`）：
--     capability.aspectRatios / aspectRatioCount / qualityTiers
--     capability.minDurationSeconds / maxDurationSeconds
--     capability.maxRefImages / maxRefAudios / maxRefVideos
--     capability.modes / refImage / billing
--   ⇒ 所以缺口**不是"字段不存在"**，而是「**键集合没写进契约**」+「**真实模型没填值**」。
--   ⚠️ 若按"新建 aspect_ratios 等列"去做，会与前端已消费的 `capability` **分裂成两套** —— 那是错的。
--
-- 数据来源：`.github/tasks/TASK-MODEL-006/model-capabilities.md`（只读 web 调研，原则：
--   「**只报官方文档写了的；查不到写「未找到官方依据」，不填推测值**」）。
--   VIDEO 15 条中 13 条、IMAGE 中找到官方级来源的若干条 —— 本迁移只填**已策展的 3 行**中
--   有依据的两个。
--
-- ============================================================================
-- 设计：每个档位都带**来源**（tiersSource），可追溯、可复核
-- ============================================================================
-- 沿用 061 `observed_evidence` 的做法：**数据与它的证据放在一起**。
-- `tiersSource` 记：来源类型（official/third_party/community）、置信度、核实日期、依据页。
-- 无依据的字段**不写**（缺失即"未知"），**绝不用占位值**。
--
-- 兼容性：只 UPDATE 这两行、只改 `capability` 一个字段；用 `||` 合并而非整体覆盖
--   ⇒ 既有的 `billing` 等键**不被破坏**。幂等：重复执行结果相同。
-- ============================================================================

-- ── ① 视频：doubao-seedance-2-5-260628（官方文档精确命中，置信度高）──
-- 依据：model-capabilities.md §一 第 1 行
--   比例：16:9、4:3、1:1、3:4、9:16、21:9、adaptive（默认）；编辑/延长/首尾帧仅 adaptive
--   时长：4~30s（或 -1）；分辨率：480p / 720p(默认) / 1080p(10bit H.265)；24fps
--   参考：图 0–30 张；视频 0–10；音频 0–10
UPDATE model_catalog
   SET capability = capability || '{
     "aspectRatios": ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "adaptive"],
     "minDurationSeconds": 4,
     "maxDurationSeconds": 30,
     "resolutionOptions": ["480p", "720p", "1080p"],
     "modes": ["text-to-video", "first-frame", "first-last-frame", "omni-reference", "video-edit", "extend", "with-audio"],
     "maxRefImages": 30,
     "maxRefVideos": 10,
     "maxRefAudios": 10,
     "tiersSource": {
       "source": "official",
       "confidence": "high",
       "productName": "Doubao Seedance 2.5（官方 ID 精确命中）",
       "verifiedAt": "2026-10-16",
       "evidenceFile": ".github/tasks/TASK-MODEL-006/model-capabilities.md#一VIDEO",
       "note": "编辑/延长/首尾帧仅支持 adaptive 比例；audio 可生成"
     }
   }'::jsonb,
       updated_at = now()
 WHERE id = 'mod_pearapi_seedance25';

-- ── ② 图像：gpt-image-2（官方级来源；注意首轮曾"无依据"，二轮已补）──
-- 依据：model-capabilities.md §2「OpenAI 图像三档（首轮无依据 → 现已有官方级来源）」
--   尺寸：三标准档 1024x1024 / 1536x1024 / 1024x1536 + auto；
--         亦支持任意 W×H（两边被 16 整除、比例 1:3~3:1、最大 3840x2160；>2560x1440 为实验性）
--   参考图上限：16 张；quality：low/medium/high/auto（**不支持 xhigh/max**）；n：1–10
UPDATE model_catalog
   SET capability = capability || '{
     "aspectRatios": ["1024x1024", "1536x1024", "1024x1536", "auto"],
     "qualityOptions": ["low", "medium", "high", "auto"],
     "qualityTiers": 4,
     "aspectRatioCount": 3,
     "maxRefImages": 16,
     "maxN": 10,
     "refImage": true,
     "arbitrarySize": {"divisibleBy": 16, "ratioMin": "1:3", "ratioMax": "3:1", "maxPixels": "3840x2160", "experimentalAbove": "2560x1440"},
     "tiersSource": {
       "source": "official",
       "confidence": "high",
       "snapshotId": "gpt-image-2-2026-04-21",
       "verifiedAt": "2026-10-16",
       "evidenceFile": ".github/tasks/TASK-MODEL-006/model-capabilities.md#2-openai-图像三档",
       "note": "首轮 platform.openai.com/openai.com/cookbook 全域 403 ⇒ 曾判无依据；二轮补到官方级来源。input_fidelity 必须省略（不支持）"
     }
   }'::jsonb,
       updated_at = now()
 WHERE id = 'mod_aaaaaaaaaaaaaaaaaaab';

-- ── 说明：为什么不给 gpt-image-1.5 等同批模型也填 ──
-- 它们**尚未被策展**（`model_catalog` 里没有行）。档位数据挂在**产品面**行上，
-- 而按 ADR-004 产品面**只由人工策展产生** ⇒ 等它们被策展时再填（数据已在 evidence 文件里备好）。

COMMENT ON COLUMN model_catalog.capability IS
'能力声明（JSONB）。键集合见 openapi/bff.yaml（063 起固化）。'
'档位类键：aspectRatios / aspectRatioCount / qualityOptions / qualityTiers / '
'minDurationSeconds / maxDurationSeconds / resolutionOptions / modes / maxRefImages / maxRefVideos / maxRefAudios。'
'★ 每个档位应带 tiersSource 记录来源与置信度；**无依据的字段留空（缺失=未知），不得填占位值**。';
