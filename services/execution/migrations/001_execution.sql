CREATE TABLE IF NOT EXISTS jobs (
    workspace_id text NOT NULL,
    id text NOT NULL,
    idempotency_key text NOT NULL,
    request_hash text NOT NULL DEFAULT '',
    intent_id text NOT NULL DEFAULT '',
    kind text NOT NULL,
    label text NOT NULL,
    project_id text NOT NULL DEFAULT '',
    episode_id text NOT NULL DEFAULT '',
    asset_id text NOT NULL DEFAULT '',
    shot_id text NOT NULL DEFAULT '',
    status text NOT NULL CHECK (status IN ('queued','running','succeeded','failed','cancelled')) DEFAULT 'queued',
    progress numeric(5,2) NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    attempt integer NOT NULL DEFAULT 1 CHECK (attempt > 0),
    steps jsonb NOT NULL DEFAULT '[]'::jsonb,
    cost_estimate text NOT NULL DEFAULT '',
    error text NOT NULL DEFAULT '',
    context_path text NOT NULL DEFAULT '',
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    finished_at timestamptz,
    PRIMARY KEY (workspace_id, id),
    UNIQUE (workspace_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS job_attempts (
    workspace_id text NOT NULL,
    job_id text NOT NULL,
    attempt integer NOT NULL CHECK (attempt > 0),
    status text NOT NULL CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
    error text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    finished_at timestamptz,
    PRIMARY KEY (workspace_id, job_id, attempt),
    FOREIGN KEY (workspace_id, job_id) REFERENCES jobs (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS jobs_workspace_updated_idx ON jobs (workspace_id, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS jobs_worker_idx ON jobs (status, updated_at) WHERE status IN ('queued','running');
