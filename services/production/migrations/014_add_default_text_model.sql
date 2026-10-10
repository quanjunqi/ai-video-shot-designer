-- 014: 项目默认文本模型（导演解读/单元 Prompt 的项目级默认；阶段覆盖优先于项目默认）
ALTER TABLE projects ADD COLUMN IF NOT EXISTS default_text_model text NOT NULL DEFAULT '';
