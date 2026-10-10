-- 剧集描述性资产（角色/道具/场景的 prompt 与版本历史）
-- 区别于 asset 服务的文件上传表（assets），本表存储生产流程中的描述性资产
CREATE TABLE IF NOT EXISTS episode_assets (
    workspace_id text NOT NULL,
    project_id text NOT NULL,
    episode_id text NOT NULL,
    id text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('character', 'prop', 'scene', 'other')),
    name text NOT NULL,
    description text NOT NULL DEFAULT '',
    scope text NOT NULL DEFAULT 'episode' CHECK (scope IN ('episode', 'global')),
    source_scene text,
    holder text,
    current_version integer NOT NULL DEFAULT 1,
    versions jsonb NOT NULL DEFAULT '[]'::jsonb,
    prompt text NOT NULL DEFAULT '',
    negative_prompt text NOT NULL DEFAULT '',
    image_url text,
    status text NOT NULL DEFAULT 'DRAFT',
    model text NOT NULL DEFAULT '',
    stale boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, project_id, episode_id, id)
);

CREATE INDEX IF NOT EXISTS episode_assets_project_idx ON episode_assets (workspace_id, project_id);
CREATE INDEX IF NOT EXISTS episode_assets_episode_idx ON episode_assets (workspace_id, project_id, episode_id);
CREATE INDEX IF NOT EXISTS episode_assets_kind_idx ON episode_assets (workspace_id, project_id, episode_id, kind);
