-- 009: 内置 OpenAI 兼容模板升级为真实协议形态（请求静态默认 + 响应完整映射）
-- 模板层只做静态映射与形态声明；messages/tools 由执行器按业务语义构造。
UPDATE protocol_templates
SET params = '[
  {"key":"temperature","value":"0.7"},
  {"key":"top_p","value":"1"},
  {"key":"max_tokens","value":"1024"},
  {"key":"n","value":"1"},
  {"key":"stream","value":"false"},
  {"key":"presence_penalty","value":"0"},
  {"key":"frequency_penalty","value":"0"},
  {"key":"seed","value":"12345"}
]'::jsonb,
    response_params = '[
  {"key":"choices.0.message.content","type":"string","value":"文本正文（无工具调用时）"},
  {"key":"choices.0.message.tool_calls","type":"array","value":"工具调用列表（函数名/参数）"},
  {"key":"choices.0.finish_reason","type":"string","value":"结束原因（stop / tool_calls / length）"},
  {"key":"usage.prompt_tokens","type":"number","value":"输入 Token 数"},
  {"key":"usage.completion_tokens","type":"number","value":"输出 Token 数"},
  {"key":"usage.total_tokens","type":"number","value":"总 Token 数"},
  {"key":"id","type":"string","value":"会话 ID"},
  {"key":"model","type":"string","value":"实际使用的模型"},
  {"key":"created","type":"number","value":"生成时间戳"}
]'::jsonb,
    version = version + 1
WHERE id = 'pt_builtin_openai';

-- 图片模型不应引用 chat 模板：新增 OpenAI 兼容图片模板（images/generations 形态），
-- 修复 nano-banana-2-lite / gpt-image-2 / nano-banana 的引用。
INSERT INTO protocol_templates (id, label, description, method, request_path, params, response_params, async, builtin, enabled, version, created_by)
VALUES ('pt_builtin_openai_img', 'OpenAI 兼容图片（Images API）', 'images/generations 形态，响应取 data[].url 提取图片地址。', 'POST', '/v1/images/generations',
        '[]'::jsonb,
        '[{"key":"data.0.url","type":"string","value":"图片地址"}]'::jsonb,
        '{}'::jsonb, true, true, 1, 'system')
ON CONFLICT (id) DO NOTHING;

UPDATE model_catalog SET protocol_template_id = 'pt_builtin_openai_img'
WHERE protocol_template_id = 'pt_builtin_openai' AND type = 'image';
