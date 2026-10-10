-- 019a: project_characters（项目级角色库）—— 补建缺失的建表迁移
--
-- 背景（2026-10-10 审计发现）：
--   project_characters 被 Go 代码读写（internal/projectcharacter/postgres.go）、
--   被 020_character_data_migration.sql 写入，但**全仓库没有任何迁移创建这张表**。
--   迁移执行器为 `psql -v ON_ERROR_STOP=1` + `sh -e`（首个错误即整体中止），
--   因此全新数据库上 020 必然失败 → deploy/local 的 app profile 无法启动，且 021 永不执行。
--
-- 为什么用 019a 而不是修改 020（遵守 AGENTS.md §7「已执行迁移只增不改」）：
--   POSIX 字典序下 019_… < 019a_… < 020_…，故本文件在 020 之前执行，
--   既能让全新库跑通，又不触碰任何已存在的迁移文件。
--   本文件与全仓库 22 个 CREATE TABLE 一样使用 IF NOT EXISTS，
--   因此在「表已被手工创建」的既有库上为无害空操作（迁移会在每次 compose up 重跑）。
--
-- 字段与类型依据（不是猜测）：
--   services/production/internal/projectcharacter/postgres.go 的 SELECT/INSERT/UPDATE 列清单
--   与 scanCharacter() 的扫描目标类型：
--     · 所有文本字段扫描进 Go 的 string（**不是** sql.NullString）
--       → 必须 NOT NULL DEFAULT ''，否则 NULL 会导致扫描失败
--     · image_generated_at 扫描进 int64 → 必须是 bigint（Unix 时间戳），不能是 timestamptz
--     · image_status 默认 'not_generated'、image_aspect_ratio 默认 '9:16'
--       （与 Create() 中 defaultString 的兜底值一致）
--   主键与 016_episodes.sql 的约定保持一致；
--   外键与 episodes/episode_assets 一致，随项目删除级联。

CREATE TABLE IF NOT EXISTS project_characters (
    workspace_id          text        NOT NULL,
    project_id            text        NOT NULL,
    id                    text        NOT NULL,
    name                  text        NOT NULL,
    gender                text        NOT NULL DEFAULT '',
    age                   text        NOT NULL DEFAULT '',
    identity              text        NOT NULL DEFAULT '',
    hairstyle             text        NOT NULL DEFAULT '',
    eye_color             text        NOT NULL DEFAULT '',
    facial_features       text        NOT NULL DEFAULT '',
    special_marks         text        NOT NULL DEFAULT '',
    body_type             text        NOT NULL DEFAULT '',
    skin_texture          text        NOT NULL DEFAULT '',
    top                   text        NOT NULL DEFAULT '',
    bottom                text        NOT NULL DEFAULT '',
    shoes                 text        NOT NULL DEFAULT '',
    clothing_style        text        NOT NULL DEFAULT '',
    performance           text        NOT NULL DEFAULT '',
    image_url             text        NOT NULL DEFAULT '',
    image_status          text        NOT NULL DEFAULT 'not_generated',
    image_model           text        NOT NULL DEFAULT '',
    image_prompt          text        NOT NULL DEFAULT '',
    image_negative_prompt text        NOT NULL DEFAULT '',
    image_generated_at    bigint      NOT NULL DEFAULT 0,
    image_job_id          text        NOT NULL DEFAULT '',
    image_error           text        NOT NULL DEFAULT '',
    image_aspect_ratio    text        NOT NULL DEFAULT '9:16',
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, project_id, id),
    -- 项目内角色名唯一：020 的关联逻辑按 (project_id, name) 匹配
    -- （NOT EXISTS + UPDATE … FROM），若不唯一则该迁移的关联结果不确定。
    UNIQUE (workspace_id, project_id, name),
    FOREIGN KEY (workspace_id, project_id) REFERENCES projects (workspace_id, id) ON DELETE CASCADE
);

-- 列表查询走 (workspace_id, project_id) 前缀（已被主键覆盖）；
-- 本索引服务于 ListByProject 的 ORDER BY created_at。
CREATE INDEX IF NOT EXISTS project_characters_project_idx
    ON project_characters (workspace_id, project_id, created_at);

COMMENT ON TABLE project_characters IS
    '项目级角色库（角色身份唯一事实源，ADR-002）。单集只存引用与状态变体，不复制档案。';
COMMENT ON COLUMN project_characters.image_generated_at IS
    '标准立绘生成时间，Unix 秒级时间戳（bigint，非 timestamptz）—— Go 侧按 int64 扫描。';
COMMENT ON COLUMN project_characters.image_status IS
    '立绘状态：not_generated / generated / failed 等（由应用写入）。';
