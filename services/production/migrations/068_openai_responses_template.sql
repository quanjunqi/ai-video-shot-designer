-- 068: OpenAI Responses API 协议模板（pt_builtin_openai_responses）—— protocol-gen 全流程首战（TASK-PROTOCOL-006）
--
-- 号段：production 模型中心 060-069（060-067 已用，068 = 段内下一号）
--
-- ============================================================================
-- 背景
-- ============================================================================
-- 本仓 9 个 builtin 协议模板历史全部手写。TASK-PROTOCOL-006 是 protocol-gen
-- （TASK-PROTOCOL-003）SOP 的**首个完整实战**：用 OpenAI 官方 OpenAPI 3.1
-- （GitHub openai/openai-openapi@main，openapi.json v2.3.0，2026-10-17 拉取，
-- sha256=… 留档见 devlog）走通「获取规范 → 生成 → 审查 → 落库 → 回归」五步，
-- 新增 Responses API 模板（OpenAI 2025+ 主力契约，chat 模态）。
--
-- ============================================================================
-- 生成与审查（SOP 第 2/3 步留痕）
-- ============================================================================
-- 生成：protocol-gen -spec openapi.json -id pt_builtin_openai_responses
--       -base-path /v1 -path /v1/responses -method POST
--   · params：官方 CreateResponse 全部 31 属性（metadata/prompt/model/tools/…）
--   · response_extract：顶层键映射（output_text/status/usage/…）
--   · required：官方规范**未声明**（CreateResponse 为 allOf 三分支，均无 required）
--     ⇒ 不臆测（061/064 教训）；required_params 按官方文档语义只标 model。
-- 审查（人审）：
--   · type = text（Responses 输出文本模态）
--   · capabilities = text-chat（061 能力键枚举）
--   · param_mapping = 官方语义 identity 映射（model/prompt/instructions/…）
--     —— 未真实渠道实测（无 API key），observed_evidence 显式标注待验证
--   · async = 同步返回（可 stream，非任务轮询）⇒ enabled=false
--
-- ============================================================================
-- 兼容性 / 幂等
-- ============================================================================
-- 只 INSERT 一个新模板，不触碰任何既有行；ON CONFLICT (id) DO NOTHING ⇒ 重复执行安全。
INSERT INTO protocol_templates (
    id, label, description, method, request_path,
    params, response_params, builtin, enabled, version,
    async, type, capabilities, doc_ref, observed_evidence, created_by
) VALUES (
    'pt_builtin_openai_responses',
    'OpenAI Responses API（text-chat）',
    'OpenAI 新一代 Responses API：POST /v1/responses 同步返回（可 stream）。'
    || '协议定义由 protocol-gen 从 OpenAI 官方 openapi.json（v2.3.0）确定性生成，见 doc_ref。',
    'POST',
    '/v1/responses',
    '{}'::jsonb,
    '{}'::jsonb,
    true,
    true,
    1,
    '{"enabled": false}'::jsonb,
    'text',
    '{
       "text-chat": {
         "request_path": "/v1/responses",
         "method": "POST",
         "required_params": ["model"],
         "param_mapping": {
           "model": "model",
           "prompt": "prompt",
           "instructions": "instructions",
           "max_output_tokens": "max_output_tokens",
           "temperature": "temperature",
           "top_p": "top_p",
           "stream": "stream",
           "tools": "tools",
           "tool_choice": "tool_choice",
           "store": "store",
           "metadata": "metadata",
           "user": "user"
         },
         "response_extract": {
           "text": "output_text",
           "usage": "usage"
         }
       }
     }'::jsonb,
    '{
       "url": "https://github.com/openai/openai-openapi/blob/main/openapi.json",
       "source": "official_openapi",
       "version": "2.3.0",
       "endpoint": "/v1/responses",
       "fetchedAt": "2026-10-17",
       "verifiedAt": null,
       "verificationNote": "协议定义由 protocol-gen 从官方 openapi.json 确定性生成（2026-10-17 拉取）；param_mapping 为官方语义 identity 映射，未真实渠道实测（无 API key）⇒ verifiedAt 为 NULL"
     }'::jsonb,
    '{
       "source": "protocol-gen（TASK-PROTOCOL-003）确定性生成 + 人工审查（TASK-PROTOCOL-006）",
       "generated_params": 31,
       "required_note": "官方规范未声明 required（CreateResponse allOf 三分支均无 required）；required_params 按官方文档语义仅标 model",
       "param_mapping_note": "基于官方文档语义 identity 映射；未真实渠道实测（无 API key），待验证",
       "verifiedAt": null
     }'::jsonb,
    'mdp-auto'
);
