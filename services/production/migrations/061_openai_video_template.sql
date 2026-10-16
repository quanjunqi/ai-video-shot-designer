-- 061: PearAPI 视频协议模板（pt_builtin_openai_video）—— Owner 2026-10-16 拍板「capabilities 必须与官方文档对齐」
--
-- 号段：production 模型中心 060-069（Owner 2026-10-16 新认领；060 已被 mock 渠道清理占用）
--
-- ============================================================================
-- 为什么需要它（实测缺口，不是推测）
-- ============================================================================
-- 查真库 production（2026-10-16）：
--   · 唯一真实渠道 = PearAPI(.ai) 中转站（chan-muo4b9zo），79 个上游模型；
--     另 6 个渠道（comfy/google/grsai/jimeng/minimax/openai）channel_models **全为 0**。
--   · 协议模板 8 个中**只有 2 个**（pt_builtin_openai / pt_builtin_openai_img）有 capabilities，
--     而**恰好只有这 2 个被真实使用**（目录行 3 与 4，入池 1 与 2）。
--   · `model-classification.md` 判定 PearAPI 的 79 个模型里 **15 个是视频**
--     （seedance-2-5 / veo-3.1 / hailuo-2.3 / minimax-h3 / happyhorse-1.0 …）
--     ⇒ **但它们没有任何可用的视频协议模板** ⇒ 视频模态在真实链路上**根本走不通**。
--   · 已有的两个视频模板（pt_builtin_jimeng_video / pt_builtin_minimax_video）挂在
--     **mock 渠道**（jimeng / grsai / minimax）上，且**无 capabilities**。
--
-- ⇒ 本迁移新增一个**命名与能力都对应 PearAPI** 的视频模板。命名沿用仓内 `<厂商>_<模态>` 约定
--   （openai / openai_img ⇒ openai_video）：PearAPI 是 OpenAI 兼容中转站，
--   其自身 `supported_endpoint` 广告的即是 `openai-video`。
--
-- ============================================================================
-- ★ 证据分级（本仓铁律：不许瞎猜。逐项标注实测 / 推断 / 未验证）
-- ============================================================================
-- 【实测已注册】以下路由由只读探测确认（见 evidence/relay-semantics-findings.md §3）：
--     POST /v1/videos/generations         ✅（也是其 supported_endpoint 广告的 openai-video 路径）
--     GET  /v1/videos/{id}                ✅
--     GET  /v1/videos/{id}/content        ✅（GET/HEAD）
--     GET  /v1/video/generations/{task_id} ✅（**仅 GET**；POST 会返回 SPA HTML ⇒ 该 POST 路由不存在）
--   ⚠️ 注意：**POST /v1/video/generations（单数）无路由** —— 这是一个已知的坑，
--      仓内旧模板 pt_builtin_jimeng_video 的 request_path 用的是复数形式（正确），
--      但其 async.pollPath 用的是单数形式（该 GET 已注册，故未必错，只是与本模板取形不同）。
--
-- 【实测形状】提交响应（上游 new-api 形状）：{task_id, status:"queued"}
--   无 webhook：客户端轮询；中转站后台轮询器每 15 秒刷新自己的 DB 状态；
--   TASK_TIMEOUT_MINUTES=1440 ⇒ 24h 清扫。上游 RetryTimes 默认 0 ⇒ **无跨渠道重试**。
--
-- 【实测约束】豆包/Seedance 视频插件 `Object.assign({model, content:[]}, metadata)`
--   ⇒ **只有 metadata 存活**：参考图/视频/音频必须放进
--      metadata.content=[{type:"image_url"|"video_url"|"audio_url"}, …]，
--      以及 metadata.duration / metadata.resolution / metadata.generate_audio；
--      images[] / prompt / seconds 被显式映射；**其余顶层字段静默丢弃**。
--   ⇒ 本模板的 param_mapping 因此把参数映射到 `metadata.*`（而不是顶层）。
--   ⚠️ 但豆包的**图像**路径反而透传未知字段 ⇒ 各插件策略不同，不可一概而论。
--
-- 【未验证 —— 诚实标注】以下三项**没有**端到端实测证据，故 observed_evidence 里
--   以 unverified 明确列出，且 doc_ref.verifiedAt 保持 NULL（与仓内全部 8 个模板的既有约定一致）：
--     1. 轮询返回体里任务状态字段的**终态取值**（doneValue/failValue 取 completed/failed，
--        依据是仓内 pt_builtin_openai_img 的既有 async 约定 + OpenAI 兼容形状；
--        **不是**对本中转站的实测）
--     2. 任务 id 在轮询返回体里的字段名（取 `id`；提交响应里实测是 `task_id`）
--     3. 轮询路径二选一：本模板取 OpenAI 形状 `/v1/videos/{id}`（与广告的 openai-video 一致），
--        备选是 `/v1/video/generations/{task_id}`（亦已注册）
--   ⇒ **闭合方式**：用真实 key 跑一次最小视频任务（5s、最低分辨率）观察提交/轮询/终态，
--     把实测值回填并把 verifiedAt 置为实测时间。这一步需要 Owner 授权一次付费调用。
--
-- ============================================================================
-- 兼容性：本迁移**只 INSERT 一个新模板**，不触碰任何既有行、不改任何既有行为。
-- 幂等：ON CONFLICT (id) DO NOTHING ⇒ 重复执行安全。
-- ============================================================================

INSERT INTO protocol_templates (
    id, label, description, method, request_path,
    params, response_params, builtin, enabled, version,
    async, type, capabilities, doc_ref, observed_evidence, created_by
) VALUES (
    'pt_builtin_openai_video',
    'OpenAI 兼容 · 视频生成（PearAPI/openai-video）',
    'OpenAI 兼容中转站的视频生成：POST /v1/videos/generations 提交，轮询取任务状态。'
    || '参考图/视频/音频须放入 metadata.content[]（豆包/Seedance 插件只保留 metadata）。'
    || '★ 终态取值与任务 id 字段尚未端到端验证，见 observed_evidence.unverified。',
    'POST',
    '/v1/videos/generations',
    '{}'::jsonb,
    '{}'::jsonb,
    true,
    true,
    1,
    -- async：轮询取状态（无 webhook）
    '{
       "enabled": true,
       "pollPath": "/v1/videos/{id}",
       "doneValue": "completed",
       "failValue": "failed",
       "statusField": "status",
       "taskIdField": "id",
       "pollIntervalSeconds": 15,
       "timeoutMinutes": 1440
     }'::jsonb,
    'video',
    -- capabilities：按能力分键，与 pt_builtin_openai_img 同构
    '{
       "text-to-video": {
         "method": "POST",
         "request_path": "/v1/videos/generations",
         "param_mapping": {
           "prompt": "prompt",
           "model": "model",
           "metadata.duration": "metadata.duration",
           "metadata.resolution": "metadata.resolution",
           "metadata.generate_audio": "metadata.generate_audio"
         },
         "required_params": ["prompt"],
         "response_extract": {
           "task_id": "task_id",
           "status": "status"
         }
       },
       "image-to-video": {
         "method": "POST",
         "request_path": "/v1/videos/generations",
         "param_mapping": {
           "prompt": "prompt",
           "model": "model",
           "reference_images[0].url": "metadata.content[0].image_url",
           "metadata.duration": "metadata.duration",
           "metadata.resolution": "metadata.resolution",
           "metadata.generate_audio": "metadata.generate_audio"
         },
         "required_params": ["prompt"],
         "response_extract": {
           "task_id": "task_id",
           "status": "status"
         }
       }
     }'::jsonb,
    -- doc_ref：入口 + 证据来源分级；verifiedAt 为 NULL（未逐字核对，同仓内既有约定）
    '{
       "url": "https://api.pearapi.ai/v1/models",
       "source": "measured",
       "endpoint": "/v1/videos/generations",
       "supportedEndpointAdvertised": "openai-video",
       "verifiedAt": null,
       "referenceRuleDoc": null,
       "verificationNote": "路由由只读探测确认已注册（见 observed_evidence.measuredRoutes）；终态取值与任务 id 字段未端到端验证 ⇒ verifiedAt 为 NULL"
     }'::jsonb,
    -- observed_evidence：本仓**首次使用**该字段，把实测与未验证分级写清
    '{
       "probedAt": "2026-10-16",
       "method": "对 api.pearapi.ai 只读探测（无副作用；未发起任何生成调用）",
       "measuredRoutes": [
         {"path": "/v1/videos/generations", "method": "POST", "status": "registered"},
         {"path": "/v1/videos/{id}", "method": "GET", "status": "registered"},
         {"path": "/v1/videos/{id}/content", "method": "GET|HEAD", "status": "registered"},
         {"path": "/v1/video/generations/{task_id}", "method": "GET", "status": "registered"},
         {"path": "/v1/video/generations", "method": "POST", "status": "NOT_registered_returns_spa_html"}
       ],
       "measuredShapes": {
         "submitResponse": "{task_id, status:\"queued\"}（上游 new-api 形状）",
         "noWebhook": "客户端轮询；中转站后台轮询器每 15 秒刷新；TASK_TIMEOUT_MINUTES=1440 ⇒ 24h 清扫",
         "noCrossChannelRetry": "上游 RetryTimes 默认 0"
       },
       "measuredConstraints": {
         "passThrough": "常规路径解码进有类型 DTO 再序列化 ⇒ 未知顶层字段被静默丢弃",
         "doubaoSeedancePlugin": "Object.assign({model, content:[]}, metadata) ⇒ 只有 metadata 存活；参考素材须 metadata.content=[{type:\"image_url\"|\"video_url\"|\"audio_url\"}]",
         "pluginVariance": "豆包图像路径反而透传未知字段 ⇒ 各插件策略不同，不可一概而论"
       },
       "unverified": [
         "轮询返回体的终态取值（本模板取 completed/failed，依据是仓内 pt_builtin_openai_img 的既有 async 约定 + OpenAI 兼容形状，非本站实测）",
         "任务 id 在轮询返回体的字段名（本模板取 id；提交响应实测为 task_id）",
         "轮询路径二选一（本模板取 OpenAI 形状 /v1/videos/{id}；备选 /v1/video/generations/{task_id} 亦已注册）"
       ],
       "howToVerify": "用真实 key 跑一次最小视频任务（5s、最低分辨率），观察 提交→轮询→终态 三段，把实测值回填并把 doc_ref.verifiedAt 置为实测时间。需 Owner 授权一次付费调用。",
       "affectedModels": 15
     }'::jsonb,
    'system:061'
)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE protocol_templates IS
'协议模板：描述"如何调用某协议"（method/request_path/参数映射/响应提取/异步轮询）。模板是【协议】维度、可被多个渠道复用（实例：pt_builtin_openai 同时被 PearAPI 与 mock 的 google 渠道引用）。capabilities 按能力名分键；observed_evidence 记录实测证据与未验证项（061 起使用）。';
