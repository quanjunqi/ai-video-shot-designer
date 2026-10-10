-- Phase 4: 数据迁移 - 将episode_assets中的角色数据迁移到project_characters
-- 建立project_character_id关联，清理重复数据

-- 1. 为每个episode_assets中的角色创建对应的project_characters记录（如果不存在）
INSERT INTO project_characters (
  id, workspace_id, project_id, name,
  gender, age, identity, hairstyle, eye_color,
  facial_features, special_marks, body_type, skin_texture,
  top, bottom, shoes, clothing_style, performance,
  image_url, image_status, image_model, image_prompt, image_negative_prompt,
  created_at, updated_at
)
SELECT
  'pc-' || md5(ea.project_id || '-' || ea.name) as id,
  ea.workspace_id,
  ea.project_id,
  ea.name,
  -- 从description中解析基本字段（简单解析，后续可在前端完善）
  COALESCE(substring(ea.description from '性别[：:]\s*([^\n]+)'), '') as gender,
  COALESCE(substring(ea.description from '年龄[：:]\s*([^\n]+)'), '') as age,
  COALESCE(substring(ea.description from '身份[：:]\s*([^\n]+)'), '') as identity,
  COALESCE(substring(ea.description from '发型[：:]\s*([^\n]+)'), '') as hairstyle,
  COALESCE(substring(ea.description from '瞳色[：:]\s*([^\n]+)'), '') as eye_color,
  '' as facial_features,
  '' as special_marks,
  COALESCE(substring(ea.description from '体型[：:]\s*([^\n]+)'), '') as body_type,
  '' as skin_texture,
  COALESCE(substring(ea.description from '上装[：:]\s*([^\n]+)'), '') as top,
  COALESCE(substring(ea.description from '下装[：:]\s*([^\n]+)'), '') as bottom,
  COALESCE(substring(ea.description from '鞋子[：:]\s*([^\n]+)'), '') as shoes,
  '' as clothing_style,
  '' as performance,
  -- 迁移image_url（如果非空）
  CASE WHEN ea.image_url != '' THEN ea.image_url ELSE '' END as image_url,
  CASE WHEN ea.image_url != '' THEN 'generated' ELSE 'not_generated' END as image_status,
  ea.model as image_model,
  ea.prompt as image_prompt,
  ea.negative_prompt as image_negative_prompt,
  ea.created_at,
  ea.updated_at
FROM episode_assets ea
WHERE ea.kind = 'character'
  AND NOT EXISTS (
    SELECT 1 FROM project_characters pc
    WHERE pc.project_id = ea.project_id AND pc.name = ea.name
  );

-- 2. 建立project_character_id关联
UPDATE episode_assets ea
SET project_character_id = pc.id
FROM project_characters pc
WHERE ea.kind = 'character'
  AND ea.project_id = pc.project_id
  AND ea.name = pc.name
  AND (ea.project_character_id IS NULL OR ea.project_character_id = '');

-- 3. 清理episode_assets中的image_url和prompt（标准立绘现在以project_characters为准）
-- 注意：不删除versions历史，只清空当前版本快捷字段
UPDATE episode_assets
SET image_url = '',
    prompt = '',
    negative_prompt = ''
WHERE kind = 'character'
  AND project_character_id IS NOT NULL
  AND project_character_id != '';

-- 4. 验证迁移结果
SELECT '迁移完成' as status;
SELECT 'project_characters角色数' as metric, count(*) as value FROM project_characters;
SELECT 'episode_assets已关联角色数' as metric, count(*) as value FROM episode_assets WHERE kind = 'character' AND project_character_id IS NOT NULL AND project_character_id != '';
SELECT '--- 迁移后数据 ---';
SELECT pc.id, pc.name, pc.image_url != '' as has_standard_image, pc.image_status
FROM project_characters pc ORDER BY pc.name;
SELECT ea.id, ea.name, ea.project_character_id, ea.variant_image_url
FROM episode_assets ea WHERE ea.kind = 'character' ORDER BY ea.name;
