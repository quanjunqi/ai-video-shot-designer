-- 019b: project_characters 去重回填 —— 前置修正 020 的重复主键缺陷
--
-- 背景（2026-10-10 审计，已用真实 PostgreSQL 对照实验确证）：
--   020_character_data_migration.sql 的步骤 1 用
--       'pc-' || md5(ea.project_id || '-' || ea.name)  作为主键 id
--   而其去重条件 `NOT EXISTS (SELECT 1 FROM project_characters …)` 只检查
--   **语句执行前**的表状态。因此当同一项目下多个剧集出现同名角色时
--   （主角出现在每一集是最常见情形），同一条 INSERT … SELECT 会插入两行相同 id：
--       ERROR: duplicate key value violates unique constraint "project_characters_pkey"
--   对照实验（同项目两个剧集各有一条「小明」角色资产）：
--       不同名 → 020 成功；同名 → 020 失败。
--
-- 为什么在本文件修复而不是改 020（遵守 AGENTS.md §7「已执行迁移只增不改」）：
--   本文件在 020 之前执行（字典序 019a < 019b < 020），先把去重后的角色行写入
--   project_characters。这样 020 步骤 1 的 NOT EXISTS 对**每一行都为真**，
--   该语句插入 0 行、不再冲突；而 020 的步骤 2（建立关联）与步骤 3（清理冗余字段）
--   仍会正常执行，最终结果是正确的：
--       一个项目内同名角色 = 一条 project_characters 记录，
--       所有剧集的同名 episode_assets 都指向它（这正是 ADR-002 的「引用而非复制」）。
--   020 的步骤 1 到此退化为冗余安全网（对全新库与已升级库均为空操作）。
--
-- 幂等性：ON CONFLICT DO NOTHING。对「020 已成功执行过」的既有库，
--   已存在的 (workspace_id, project_id, name) 不会被覆盖（保留原值，不丢历史）。
--
-- 代表性行的选择（同名多行取哪一行）：
--   优先取**有立绘**的行（image_url 非空），其次取 created_at 最早的行 ——
--   保证标准立绘不因剧集处理顺序而丢失。

INSERT INTO project_characters (
    id, workspace_id, project_id, name,
    gender, age, identity, hairstyle, eye_color,
    facial_features, special_marks, body_type, skin_texture,
    top, bottom, shoes, clothing_style, performance,
    image_url, image_status, image_model, image_prompt, image_negative_prompt,
    created_at, updated_at
)
SELECT DISTINCT ON (ea.workspace_id, ea.project_id, ea.name)
    'pc-' || md5(ea.project_id || '-' || ea.name) AS id,
    ea.workspace_id,
    ea.project_id,
    ea.name,
    -- 与 020 相同的字段解析规则（description 内「键：值」文本）
    COALESCE(substring(ea.description from '性别[：:]\s*([^\n]+)'), '') AS gender,
    COALESCE(substring(ea.description from '年龄[：:]\s*([^\n]+)'), '') AS age,
    COALESCE(substring(ea.description from '身份[：:]\s*([^\n]+)'), '') AS identity,
    COALESCE(substring(ea.description from '发型[：:]\s*([^\n]+)'), '') AS hairstyle,
    COALESCE(substring(ea.description from '瞳色[：:]\s*([^\n]+)'), '') AS eye_color,
    '' AS facial_features,
    '' AS special_marks,
    COALESCE(substring(ea.description from '体型[：:]\s*([^\n]+)'), '') AS body_type,
    '' AS skin_texture,
    COALESCE(substring(ea.description from '上装[：:]\s*([^\n]+)'), '') AS top,
    COALESCE(substring(ea.description from '下装[：:]\s*([^\n]+)'), '') AS bottom,
    COALESCE(substring(ea.description from '鞋子[：:]\s*([^\n]+)'), '') AS shoes,
    '' AS clothing_style,
    '' AS performance,
    COALESCE(ea.image_url, '') AS image_url,
    CASE WHEN COALESCE(ea.image_url, '') <> '' THEN 'generated' ELSE 'not_generated' END AS image_status,
    COALESCE(ea.model, '') AS image_model,
    COALESCE(ea.prompt, '') AS image_prompt,
    COALESCE(ea.negative_prompt, '') AS image_negative_prompt,
    ea.created_at,
    ea.updated_at
FROM episode_assets ea
WHERE ea.kind = 'character'
ORDER BY ea.workspace_id, ea.project_id, ea.name,
         (COALESCE(ea.image_url, '') <> '') DESC,   -- 优先取有立绘的行
         ea.created_at                                -- 其次取最早创建的行
ON CONFLICT DO NOTHING;

COMMENT ON TABLE project_characters IS
    '项目级角色库（角色身份唯一事实源，ADR-002）。单集只存引用与状态变体，不复制档案。'
    ' 表由 019a 补建、019b 去重回填（见两文件头部说明）。';
