-- 012: protocol_templates 增加类型列（text / image / video / all）
-- 协议声明适用模型类型；模型页协议下拉按模型类型过滤（type='all' 全类型通用，如聚合网关）。
ALTER TABLE protocol_templates ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'all';

-- 内置模板类型归属
UPDATE protocol_templates SET type = 'text'  WHERE id IN ('pt_builtin_openai', 'pt_builtin_minimax_text');
UPDATE protocol_templates SET type = 'image' WHERE id IN ('pt_builtin_openai_img', 'pt_builtin_jimeng_image', 'pt_builtin_comfyui');
UPDATE protocol_templates SET type = 'video' WHERE id IN ('pt_builtin_minimax_video', 'pt_builtin_jimeng_video');
-- pt_builtin_grsai 保持 'all'（聚合网关跨类型转发）
