-- 007: 协议模板（平台预置 / 用户自定义） + 模型引用列
-- 协议模板是模型协议描述（端点/方法/请求参数/响应映射）的独立实体；
-- 模型通过 protocol_template_id 引用模板，模板修改一处生效于全部引用模型，
-- 模型级字段（request_path 等）保留为「覆盖层」：模板默认值 → 模型覆盖值 → 最终请求。

CREATE TABLE IF NOT EXISTS protocol_templates (
  id              TEXT PRIMARY KEY,               -- 内置: pt_builtin_*；用户: pt_ + 22 位
  label           TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  method          TEXT NOT NULL DEFAULT 'POST',
  request_path    TEXT NOT NULL DEFAULT '',
  params          JSONB NOT NULL DEFAULT '[]',
  response_params JSONB NOT NULL DEFAULT '[]',
  builtin         BOOLEAN NOT NULL DEFAULT FALSE, -- 内置模板：平台预置，禁止删除
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  version         INT NOT NULL DEFAULT 1,
  created_by      TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE model_catalog ADD COLUMN IF NOT EXISTS protocol_template_id TEXT;

-- 内置协议模板 seed（幂等：存在则刷新 label/desc/端点/参数，保留用户编辑的 version）
INSERT INTO protocol_templates (id, label, description, method, request_path, params, response_params, builtin, enabled) VALUES
  ('pt_builtin_openai', 'OpenAI 兼容（Chat / Images）', '标准 chat/completions 与 images/generations，响应按 choices 提取文本、data[].url 提取图片。', 'POST', '/v1/chat/completions',
   '[{"key":"stream","value":"false"}]'::jsonb,
   '[{"key":"choices.0.message.content","value":"文本正文"},{"key":"data.0.url","value":"图片地址"}]'::jsonb, TRUE, TRUE),
  ('pt_builtin_minimax_video', 'MiniMax 视频（异步任务）', '视频生成走异步任务：提交返回 task_id，轮询查询进度与成品。', 'POST', '/v1/video_generation',
   '[]'::jsonb,
   '[{"key":"task_id","value":"任务 ID（轮询查询进度）"},{"key":"file_id","value":"成品文件 ID"}]'::jsonb, TRUE, TRUE),
  ('pt_builtin_minimax_text', 'MiniMax 文本', 'MiniMax 文本对话（chatcompletion_v2），响应结构与 OpenAI 兼容。', 'POST', '/v1/text/chatcompletion_v2',
   '[{"key":"stream","value":"false"}]'::jsonb,
   '[{"key":"choices.0.message.content","value":"文本正文"}]'::jsonb, TRUE, TRUE),
  ('pt_builtin_jimeng_image', '即梦图片', '即梦图片生成（images/generations 兼容形态），响应取 data[].url。', 'POST', '/v1/images/generations',
   '[]'::jsonb,
   '[{"key":"data.0.url","value":"图片地址"}]'::jsonb, TRUE, TRUE),
  ('pt_builtin_jimeng_video', '即梦视频（异步任务）', '即梦视频生成走异步任务，提交返回任务 ID，完成后取成品地址。', 'POST', '/v1/videos/generations',
   '[]'::jsonb,
   '[{"key":"task_id","value":"任务 ID（轮询查询进度）"},{"key":"data.0.url","value":"视频地址"}]'::jsonb, TRUE, TRUE),
  ('pt_builtin_grsai', '聚合网关转发（OpenAI 兼容）', 'Grsai 等聚合渠道统一 OpenAI 兼容协议，按厂商转发；响应取 choices[0].message.content。', 'POST', '/v1/chat/completions',
   '[]'::jsonb,
   '[{"key":"choices.0.message.content","value":"文本正文"}]'::jsonb, TRUE, TRUE),
  ('pt_builtin_comfyui', 'ComfyUI 本地工作流（端口直连）', '本地端口直连（无需鉴权）：提交 /prompt 返回 prompt_id，轮询 /history 取成品。', 'POST', '/prompt',
   '[{"key":"client_id","value":"漫剧工坊"}]'::jsonb,
   '[{"key":"prompt_id","value":"工作流执行 ID（轮询 /history）"}]'::jsonb, TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

-- 内置模型关联协议模板（近似：按 family/channel 归组；模型级字段仍可覆盖模板）
UPDATE model_catalog SET protocol_template_id = CASE
  WHEN family IN ('MiniMax H3') THEN 'pt_builtin_minimax_video'
  WHEN family IN ('MiniMax-Text') THEN 'pt_builtin_minimax_text'
  WHEN family LIKE 'Seedance%' THEN 'pt_builtin_jimeng_video'
  WHEN family IN ('Seedream 5.0') OR name = 'Seedream 5.0' THEN 'pt_builtin_jimeng_image'
  WHEN channel_id = 'grsai' THEN 'pt_builtin_grsai'
  WHEN channel_id = 'comfy' THEN 'pt_builtin_comfyui'
  WHEN channel_id = 'jimeng' THEN CASE WHEN type = 'image' THEN 'pt_builtin_jimeng_image' ELSE 'pt_builtin_jimeng_video' END
  ELSE 'pt_builtin_openai'
END
WHERE protocol_template_id IS NULL;
