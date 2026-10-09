-- 021: 协议模板能力声明（企业级网关P1）
-- 为 protocol_templates 增加 capabilities JSONB 字段，用于声明模型支持的能力
-- （text-to-image / image-to-image / text-to-video 等）及每种能力的参数映射规则。
-- 引擎根据 mode 自动选择对应的 request_path 和 param_mapping，移除硬编码。

ALTER TABLE protocol_templates
  ADD COLUMN IF NOT EXISTS capabilities JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 为内置 OpenAI 图片模板初始化 capabilities（PearAPI GPT-Image 兼容）
UPDATE protocol_templates
SET capabilities = jsonb_build_object(
  'text-to-image', jsonb_build_object(
    'request_path', '/v1/images/generations',
    'method', 'POST',
    'required_params', jsonb_build_array('prompt'),
    'param_mapping', jsonb_build_object(
      'prompt', 'prompt',
      'negative_prompt', 'negative_prompt',
      'aspect_ratio', 'aspect_ratio',
      'n', 'n',
      'seed', 'seed',
      'response_format', 'response_format'
    ),
    'response_extract', jsonb_build_object(
      'image_url', 'data.0.url',
      'image_b64', 'data.0.b64_json'
    )
  ),
  'image-to-image', jsonb_build_object(
    'request_path', '/v1/images/edits',
    'method', 'POST',
    'required_params', jsonb_build_array('prompt', 'image'),
    'param_mapping', jsonb_build_object(
      'prompt', 'prompt',
      'reference_images[0].url', 'image',
      'strength', 'strength',
      'aspect_ratio', 'aspect_ratio',
      'n', 'n',
      'response_format', 'response_format'
    ),
    'response_extract', jsonb_build_object(
      'image_url', 'data.0.url',
      'image_b64', 'data.0.b64_json'
    )
  )
)
WHERE id = 'pt_builtin_openai_img';

-- 为内置 OpenAI 对话模板初始化 capabilities
UPDATE protocol_templates
SET capabilities = jsonb_build_object(
  'text-chat', jsonb_build_object(
    'request_path', '/v1/chat/completions',
    'method', 'POST',
    'required_params', jsonb_build_array('messages'),
    'param_mapping', jsonb_build_object(
      'messages', 'messages',
      'temperature', 'temperature',
      'top_p', 'top_p',
      'max_tokens', 'max_tokens',
      'stream', 'stream',
      'presence_penalty', 'presence_penalty',
      'frequency_penalty', 'frequency_penalty'
    ),
    'response_extract', jsonb_build_object(
      'text', 'choices.0.message.content',
      'usage', 'usage'
    )
  )
)
WHERE id = 'pt_builtin_openai';
