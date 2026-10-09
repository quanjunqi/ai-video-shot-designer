-- 规则模板表（拆集规则 + 环节提示词规则统一存储）
CREATE TABLE IF NOT EXISTS rule_templates (
    workspace_id text NOT NULL,
    id text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('split', 'prompt')),
    name text NOT NULL,
    description text NOT NULL DEFAULT '',
    stage text, -- 仅 prompt 规则：interpretation/character/scene/prop/directing/unit_prompt/production
    content text NOT NULL DEFAULT '', -- 仅 prompt 规则：提示词内容
    config jsonb NOT NULL DEFAULT '{}'::jsonb, -- 仅 split 规则：scenePattern/episodePattern/maxScenesPerEpisode/maxUnitSeconds/targetEpisodes
    version integer NOT NULL DEFAULT 1,
    version_history jsonb NOT NULL DEFAULT '[]'::jsonb,
    builtin boolean NOT NULL DEFAULT false,
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS rule_templates_kind_idx ON rule_templates (workspace_id, kind);
CREATE INDEX IF NOT EXISTS rule_templates_stage_idx ON rule_templates (workspace_id, kind, stage);
