-- 033: 为 8 条内置协议写入 doc_ref（ADR-008 B2）
--
-- ADR-008 §3 的硬约束：**文档是线索，实测才是事实**。因此本迁移的 doc_ref 里
--   * 一律写明 **url** 与 **它对应哪个端点**（`endpoint`）—— 只写"官方文档"不足以成为判据；
--   * `verifiedAt` **只在真的逐字核对过该文档页时才填日期**，否则为 NULL。
--
-- ⚠️ 诚实声明：**8 条中只有 1 条（minimax_video）的 verifiedAt 有值。**
--   其余 7 条只记录了"文档入口 URL"，**未逐字核对端点/请求体/响应字段** ⇒ verifiedAt = NULL。
--   本迁移**刻意不编造**：这正是不把「有 URL」当成「已核对」的原因。
--
-- 待办（不在本迁移范围）：7 条的中等深度核对（B3 巡检 / 人工），以及
--   `pt_builtin_grsai` —— **未找到官方文档**（检索到的只有第三方页面：npm grsai-cli、
--   个人 GitHub Pages），故 url 记为 NULL 并标注 source=relay、officialDocFound=false。
--
-- 只写 doc_ref 一列（及 updated_at），不动 async / params / 其它任何列。

-- 1) pt_builtin_minimax_video —— 唯一已核对者
UPDATE protocol_templates SET doc_ref = jsonb_build_object(
    'source','official',
    'url','https://platform.minimax.io/docs/api-reference/video-generation-query',
    'endpoint','/v1/query/video_generation',
    'verifiedAt','2026-10-11',
    'statusEnumDoc','Preparing|Queueing|Processing|Success|Fail',
    'verificationNote',
      '已逐字核对官方 OpenAPI 原文：本模板 pollPath 指向 legacy 端点 /v1/query/video_generation，'
      '其 VideoProcessStatus 枚举为 Preparing|Queueing|Processing|Success|Fail。'
      '注意：国际站另一页给出 completed|failed（迁移 030 曾据此取值），'
      '两页枚举对本端点互相冲突 ⇒ 迁移 032 已把 done/fail 取值为候选并集。',
    'conflictingPages', jsonb_build_array(
        'https://platform.minimax.io/docs/api-reference/video-generation-v2-query'),
    'referenceRuleDoc', NULL
), updated_at = now() WHERE id='pt_builtin_minimax_video';

-- 2) pt_builtin_openai —— chat completions
UPDATE protocol_templates SET doc_ref = jsonb_build_object(
    'source','official',
    'url','https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create',
    'endpoint','/v1/chat/completions',
    'verifiedAt',NULL,
    'verificationNote','仅记录文档入口；未逐字核对请求/响应字段 ⇒ verifiedAt 为 NULL',
    'referenceRuleDoc',NULL
), updated_at=now() WHERE id='pt_builtin_openai';

-- 3) pt_builtin_openai_img —— images generations
UPDATE protocol_templates SET doc_ref = jsonb_build_object(
    'source','official',
    'url','https://developers.openai.com/api/reference/resources/images/methods/generate',
    'endpoint','/v1/images/generations',
    'verifiedAt',NULL,
    'verificationNote','仅记录文档入口；未逐字核对 ⇒ verifiedAt 为 NULL',
    'referenceRuleDoc',NULL
), updated_at=now() WHERE id='pt_builtin_openai_img';

-- 4) pt_builtin_comfyui —— 本地服务，官方服务器路由文档
UPDATE protocol_templates SET doc_ref = jsonb_build_object(
    'source','official',
    'url','https://docs.comfy.org/zh/development/comfyui-server/comms_routes',
    'endpoint','/prompt · /history/{prompt_id}',
    'verifiedAt',NULL,
    'verificationNote','仅记录文档入口；未逐字核对 ⇒ verifiedAt 为 NULL。本渠道为本地服务(protocol=local)，无云端文档契约',
    'referenceRuleDoc',NULL
), updated_at=now() WHERE id='pt_builtin_comfyui';

-- 5)+6) 即梦（图/视频）—— 火山方舟
UPDATE protocol_templates SET doc_ref = jsonb_build_object(
    'source','cloud',
    'url','https://ai.volcengine.com/docs/ark-aihub/2647418',
    'endpoint', (CASE WHEN id='pt_builtin_jimeng_video' THEN '/v1/video/generations/{task_id}（查询任务）' ELSE NULL END),
    'verifiedAt',NULL,
    'verificationNote','仅记录文档入口；未逐字核对 ⇒ verifiedAt 为 NULL。相关页：https://docs.volcengine.com/docs/ark/list-video-generation-tasks-api',
    'referenceRuleDoc',NULL
), updated_at=now() WHERE id IN ('pt_builtin_jimeng_image','pt_builtin_jimeng_video');

-- 7) minimax 文本
UPDATE protocol_templates SET doc_ref = jsonb_build_object(
    'source','official',
    'url','https://platform.minimax.io/docs/api-reference/text-openai-api',
    'endpoint',NULL,
    'verifiedAt',NULL,
    'verificationNote','仅记录文档入口；未逐字核对 ⇒ verifiedAt 为 NULL',
    'referenceRuleDoc',NULL
), updated_at=now() WHERE id='pt_builtin_minimax_text';

-- 8) grsai（中转站）—— 未找到官方文档
UPDATE protocol_templates SET doc_ref = jsonb_build_object(
    'source','relay',
    'url',NULL,
    'endpoint',NULL,
    'verifiedAt',NULL,
    'officialDocFound',false,
    'verificationNote','未找到官方文档：检索到的只有第三方页面（npm grsai-cli、个人 GitHub Pages 文档），不足以作为契约依据 ⇒ url 记为 NULL',
    'referenceRuleDoc',NULL
), updated_at=now() WHERE id='pt_builtin_grsai';
