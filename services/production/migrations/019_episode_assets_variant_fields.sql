-- 单集资产表扩展：关联项目级资产 + 状态变体 + 变体立绘
-- 重构目标：project_characters/prop/scenes是唯一权威源，episode_assets只存引用和变体

ALTER TABLE episode_assets
    ADD COLUMN IF NOT EXISTS project_character_id text,      -- 引用project_characters.id
    ADD COLUMN IF NOT EXISTS project_prop_id text,             -- 引用project_props.id（后续扩展）
    ADD COLUMN IF NOT EXISTS project_scene_id text,            -- 引用project_scenes.id（后续扩展）
    ADD COLUMN IF NOT EXISTS episode_variant jsonb DEFAULT '{}'::jsonb,  -- 状态变体：{emotionState, appearanceChange, temporaryOutfit, specialProp}
    ADD COLUMN IF NOT EXISTS variant_image_url text,           -- 单集变体立绘URL（图生图，基于标准立绘）
    ADD COLUMN IF NOT EXISTS variant_image_status text DEFAULT 'not_generated',  -- not_generated/generating/generated/failed
    ADD COLUMN IF NOT EXISTS variant_image_model text,         -- 变体立绘生成模型
    ADD COLUMN IF NOT EXISTS variant_image_generated_at timestamptz;  -- 变体立绘生成时间

-- 索引：关联查询
CREATE INDEX IF NOT EXISTS episode_assets_project_character_idx
    ON episode_assets (workspace_id, project_id, project_character_id)
    WHERE project_character_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS episode_assets_variant_status_idx
    ON episode_assets (workspace_id, project_id, episode_id, variant_image_status)
    WHERE variant_image_url IS NOT NULL;

-- 注释：标记废弃字段（保留兼容，后续版本移除）
-- prompt, negative_prompt, image_url 这些字段将逐步废弃
-- 角色描述和标准立绘统一从project_characters关联获取
