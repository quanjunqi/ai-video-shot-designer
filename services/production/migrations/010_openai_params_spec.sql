-- 010: 协议模板请求参数规格化 —— 参数来源三分类（static 静态默认 / model 模型注入 / runtime 运行时注入）
-- 请求参数从「静态 key-value」升级为「规格表」：key + type + role + required + desc。
-- 服务端 params 为 jsonb 透传，无需 schema 变更；此处升级内置 OpenAI Chat 模板为文档完整规格。
UPDATE protocol_templates
SET params = $json$[
  {"key":"model","value":"","type":"string","role":"model","required":true,"desc":"对话模型 ID（执行器注入模型标识 providerModel）"},
  {"key":"messages","value":"","type":"array","role":"runtime","required":true,"desc":"对话消息数组，按时间顺序排列（执行器按会话/剧本构造）"},
  {"key":"temperature","value":"0.7","type":"number","role":"static","desc":"采样温度，>= 0 <= 2，默认 1"},
  {"key":"top_p","value":"1","type":"number","role":"static","desc":"核采样，>= 0 <= 1，默认 1"},
  {"key":"max_tokens","value":"1024","type":"number","role":"static","desc":"最大输出 token 数，>= 1"},
  {"key":"n","value":"1","type":"number","role":"static","desc":"生成候选数，>= 1，默认 1"},
  {"key":"stream","value":"false","type":"bool","role":"static","desc":"是否 SSE 流式返回，默认 false"},
  {"key":"presence_penalty","value":"0","type":"number","role":"static","desc":"话题新鲜度惩罚，>= -2 <= 2，默认 0"},
  {"key":"frequency_penalty","value":"0","type":"number","role":"static","desc":"频率惩罚，>= -2 <= 2，默认 0"},
  {"key":"stop","value":"[\"\\n\"]","type":"array","role":"static","desc":"停止序列数组（JSON 字符串）"},
  {"key":"tools","value":"","type":"array","role":"runtime","desc":"Function Calling 工具列表（OpenAI 格式，平台按需注入）"},
  {"key":"tool_choice","value":"auto","type":"string","role":"static","desc":"工具选择策略：auto / none / 指定函数"},
  {"key":"response_format","value":"{\"type\":\"json_object\"}","type":"object","role":"static","desc":"强制输出格式（JSON 字符串）"},
  {"key":"user","value":"","type":"string","role":"runtime","desc":"终端用户标识，用于审计与风控"}
]$json$::jsonb,
    version = version + 1
WHERE id = 'pt_builtin_openai';
