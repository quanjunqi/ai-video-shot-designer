-- 064: 修正 063 的 modes 词表 —— 与调用方（前端 GenerationMode）对齐
--
-- 号段：production 模型中心 060-069（060=渠道清理 / 061=视频模板 / 062=params 形状 / 063=档位 / 本文件 064）
--
-- ============================================================================
-- 缺陷（我在 063 里造成的，由 TASK-MODEL-006 判据 6 的施工暴露）
-- ============================================================================
-- 063 给 mod_pearapi_seedance25 写的 modes 是：
--     ["text-to-video","first-frame","first-last-frame","omni-reference","video-edit","extend","with-audio"]
--
-- 而**调用方实际使用的词表**是前端 `GenerationMode`
-- （apps/web/src/config/create/control-schema.ts:25）：
--     'text-to-image' | 'image-to-image' | 'text-to-video' | 'image-to-video'
--   | 'first-last-frame' | 'multi-reference' | 'audio-reference' | 'text-to-speech'
--
-- **7 项里 5 项对不上**：
--     我写的            前端词表
--     text-to-video     ✅ 一致
--     first-last-frame  ✅ 一致
--     first-frame       ❌ 应为 image-to-video（首帧生视频）
--     omni-reference    ❌ 应为 multi-reference（全模态参考）
--     video-edit        ❌ 无对应（前端表达不了）
--     extend            ❌ 无对应
--     with-audio        ❌ 无对应（注意 audio-reference 是"音频参考输入"，不是"生成音频"）
--
-- ★ 后果（判据 6 的能力过滤上线后即可触发）：
--   请求 mode='image-to-video' 时，该模型的声明里**没有**这一项
--   ⇒ 被 `catalog.ResolveFor` 判为"声明了 modes 但不含请求项" ⇒ **剔除候选** ⇒ 合法调用被 422 拒掉。
--
-- ★ 而契约对 mode 的要求是（openapi/bff.yaml:2653-2657）：
--     「业务模式名（如文生图/图生图等），取值**必须命中协议模板 capabilities 声明的 mode**；
--       具体取值以服务端为准，**契约待补**。」
--   ⇒ **词表必须同源**：调用方发什么，模型就声明什么。本迁移把声明端对齐到调用端。
--
-- ============================================================================
-- 修法：按**官方能力**映射到**调用方词表**（不是照抄，也不是丢弃能力）
-- ============================================================================
-- 依据：model-capabilities.md §一 第 1 行（官方：t2v、首帧、首尾帧、全模态参考、视频编辑、延长、有声）
--   官方能力 → 调用方词表
--     文生视频 t2v        → text-to-video   ✅（原已一致）
--     首帧生视频          → image-to-video  ← 修正（原 first-frame）
--     首尾帧              → first-last-frame ✅（原已一致）
--     全模态参考          → multi-reference ← 修正（原 omni-reference）
--     视频编辑 / 延长 / 有声 → **调用方词表里没有对应项** ⇒ **不写入**
--       理由：写进去**毫无作用**（没有任何调用方能发这个 mode ⇒ 永远不会被命中），
--             而留着会给人"这个能力可被请求"的错觉。**能力仍在 model-capabilities.md 里记录**，
--             待前端词表扩展（另立卡）后再补。
--
-- ★ 为什么"不写入"是安全的：过滤判据是「**声明了 modes 却不含请求项 ⇒ 剔除**」，
--   所以**少写**只会让某些请求被拒（而它们本来也发不出来）；**多写**才是无害的。
--   这里选择"少而准"，是为了让声明**如实反映可被请求的能力**。
--
-- 兼容性：只 UPDATE 这一行、只改 capability.modes 一个键；幂等（重复执行结果相同）。
-- ============================================================================

UPDATE model_catalog
   SET capability = capability || jsonb_build_object(
         'modes', '["text-to-video", "image-to-video", "first-last-frame", "multi-reference"]'::jsonb,
         'modesSource', jsonb_build_object(
           'source', 'official',
           'confidence', 'high',
           'verifiedAt', '2026-10-17',
           'evidenceFile', '.github/tasks/TASK-MODEL-006/model-capabilities.md#一VIDEO',
           'vocabulary', 'apps/web/src/config/create/control-schema.ts GenerationMode（契约 openapi/bff.yaml:2653 要求"取值必须命中声明的 mode"⇒ 声明端须与调用端同源）',
           'note', '063 原用 first-frame/omni-reference 等自造词，与调用方词表不同源，会让合法请求被能力过滤拒绝；本迁移按官方能力映射到调用方词表。"视频编辑/延长/有声"在调用方词表里无对应项故不写入（写进去永远不可能被命中），能力仍记录在 evidence 文件里。'
         )
       ),
       updated_at = now()
 WHERE id = 'mod_pearapi_seedance25';

COMMENT ON COLUMN model_catalog.capability IS
'能力声明（JSONB）。键集合见 openapi/bff.yaml（063 起固化）。'
'档位类键：aspectRatios / aspectRatioCount / qualityOptions / qualityTiers / '
'minDurationSeconds / maxDurationSeconds / resolutionOptions / modes / maxRefImages / maxRefVideos / maxRefAudios。'
'★ modes 的取值**必须与调用方词表同源**（前端 GenerationMode），否则能力过滤会拒掉合法请求（064 的教训）。'
'★ 每个档位应带 tiersSource / modesSource 记录来源与置信度；**无依据的字段留空（缺失=未知），不得填占位值**。';

-- ============================================================================
-- 附：为什么**没有**为这条纪律加自动化守卫（试过三种，都不成立）
-- ============================================================================
-- 我尝试过三种守卫，**全部失败**，如实记录以免后人重走：
--
--   ① **查活库**（断言 model_catalog.capability.modes ⊆ 调用方词表）
--      ⇒ **空转**：带 modes 的行来自**人工策展**（运行时数据），**不是迁移播种的**；
--        CI 的集成测试跑在「全新 schema + 只应用迁移」的库上 ⇒ 一行都没有 ⇒
--        日志显示「检查了 0 个 mode 值」却 **PASS** = **假防线**。
--
--   ② **扫全部迁移文件**里 modes 字面量
--      ⇒ 报 004（mock 渠道种子，词表是 t2v/i2v/multi_ref…）与本文件所修正的 063。
--        而**已应用的迁移改不了**（仓规「迁移只增不改」）⇒ **无法修复的永久红**。
--
--   ③ **只扫 >= 060**（真实渠道时代）
--      ⇒ 063 自己就在范围内（063 是 064 所要修正的对象）⇒ **同样不可修**。
--
-- ★ 根本矛盾：**数据在运行时由人工策展产生，而迁移是只增不改的** ⇒
--    CI（无运行时数据、且不能改历史迁移）里**没有**能同时满足"非空转"与"可修复"的断言点。
--
-- ⇒ **正确的位置是策展路径的运行时校验**（`POST /internal/v1/catalog/curate` 在写入前
--   校验 `modes` ⊆ 服务端词表，不合法即 422）—— 那是**功能**改动，属另一张卡。
--   服务端词表可与前端 GenerationMode 同源（如由契约 enum 或共享常量生成）。
--
-- 本迁移只做数据修正；纪律的自动化留待上述运行时校验。
