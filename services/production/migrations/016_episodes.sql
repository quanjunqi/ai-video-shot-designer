-- Episodes: 单集工坊的完整数据（分镜、解读、单元、生产等全部 JSONB 存储）
CREATE TABLE IF NOT EXISTS episodes (
    workspace_id text NOT NULL,
    project_id text NOT NULL,
    id text NOT NULL,
    index integer NOT NULL,
    title text NOT NULL,
    summary text NOT NULL DEFAULT '',
    source_span_start integer NOT NULL DEFAULT 0,
    source_span_end integer NOT NULL DEFAULT 0,
    stage text NOT NULL DEFAULT 'analyze',
    status text NOT NULL DEFAULT 'draft',
    counts jsonb NOT NULL DEFAULT '{"scenes":0,"characters":0,"pendingReview":0}'::jsonb,
    blocked_by text,
    script_checked boolean NOT NULL DEFAULT false,
    script_draft text,
    interpretation jsonb,
    interpretation_confirmed boolean NOT NULL DEFAULT false,
    execution_target jsonb,
    stage_models jsonb,
    performance jsonb,
    scene_variants jsonb,
    directing jsonb,
    directing_step integer,
    executable_units jsonb,
    production jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, project_id, id),
    FOREIGN KEY (workspace_id, project_id) REFERENCES projects (workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS episodes_project_idx
    ON episodes (workspace_id, project_id, index);

CREATE INDEX IF NOT EXISTS episodes_updated_idx
    ON episodes (workspace_id, updated_at DESC);
