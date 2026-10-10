-- 013: 升级内置 OpenAI 兼容图片协议模板（Images API 完整规格）
-- 与 010 升级 OpenAI Chat 同理：模型字段需声明 role=model 执行器才注入 providerModel；
-- 此前 params 为空导致装配请求缺 model → 上游 400 "Missing required parameter: model"。
UPDATE protocol_templates
SET params = '[
  {"key":"model","role":"model","type":"string","required":true,"desc":"图片生成模型 ID（执行器注入 providerModel）"},
  {"key":"prompt","role":"runtime","type":"string","required":true,"desc":"图片描述（执行器按业务构造）"},
  {"key":"n","role":"static","value":"1","type":"number","desc":"生成张数"},
  {"key":"size","role":"static","value":"1024x1024","type":"string","desc":"图片尺寸"},
  {"key":"quality","role":"static","value":"standard","type":"string","desc":"质量档（standard/hd）"},
  {"key":"response_format","role":"static","value":"url","type":"string","desc":"返回格式（url/b64_json）"}
]'::jsonb,
    version = version + 1,
    updated_at = now()
WHERE id = 'pt_builtin_openai_img';
