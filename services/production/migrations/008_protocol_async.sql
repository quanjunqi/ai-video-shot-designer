-- 008_protocol_async.sql
-- 协议模板：异步任务模式声明（提交→轮询→完成/失败） + 响应参数类型标注
-- 只做内容增强，不改已有表结构语义；幂等可重复执行

-- 1) 异步任务声明列（jsonb：{"enabled","taskIdField","statusField","doneValue","failValue"}）
ALTER TABLE protocol_templates ADD COLUMN IF NOT EXISTS async jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2) 内置模板响应参数升级：带类型标注（string 为主），执行器按类型做值转换
UPDATE protocol_templates SET response_params = '[
  {"key":"choices.0.message.content","type":"string","value":"文本正文"},
  {"key":"data.0.url","type":"string","value":"图片地址"}
]'::jsonb WHERE id = 'pt_builtin_openai';

UPDATE protocol_templates SET response_params = '[
  {"key":"task_id","type":"string","value":"任务 ID（轮询查询进度）"},
  {"key":"status","type":"string","value":"任务状态（轮询判断完成/失败）"},
  {"key":"file_id","type":"string","value":"成品文件 ID"}
]'::jsonb WHERE id = 'pt_builtin_minimax_video';

UPDATE protocol_templates SET response_params = '[
  {"key":"choices.0.message.content","type":"string","value":"文本正文"}
]'::jsonb WHERE id = 'pt_builtin_minimax_text';

UPDATE protocol_templates SET response_params = '[
  {"key":"data.0.url","type":"string","value":"图片地址"}
]'::jsonb WHERE id = 'pt_builtin_jimeng_image';

UPDATE protocol_templates SET response_params = '[
  {"key":"task_id","type":"string","value":"任务 ID（轮询查询进度）"},
  {"key":"status","type":"string","value":"任务状态（轮询判断完成/失败）"},
  {"key":"data.0.url","type":"string","value":"视频地址"}
]'::jsonb WHERE id = 'pt_builtin_jimeng_video';

UPDATE protocol_templates SET response_params = '[
  {"key":"choices.0.message.content","type":"string","value":"文本正文"}
]'::jsonb WHERE id = 'pt_builtin_grsai';

UPDATE protocol_templates SET response_params = '[
  {"key":"prompt_id","type":"string","value":"工作流执行 ID（轮询 /history）"}
]'::jsonb WHERE id = 'pt_builtin_comfyui';

-- 3) 异步任务协议声明：仅异步生成类模板启用（即梦视频 / MiniMax 视频）
UPDATE protocol_templates SET async = '{"enabled":true,"taskIdField":"task_id","statusField":"status","doneValue":"SUCCESS","failValue":"FAILED"}'::jsonb
  WHERE id = 'pt_builtin_jimeng_video';

UPDATE protocol_templates SET async = '{"enabled":true,"taskIdField":"task_id","statusField":"status","doneValue":"Success","failValue":"Failed"}'::jsonb
  WHERE id = 'pt_builtin_minimax_video';
