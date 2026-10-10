CREATE TABLE IF NOT EXISTS generation_intents (
    workspace_id text NOT NULL,
    id text NOT NULL,
    project_id text NOT NULL,
    episode_id text NOT NULL DEFAULT '',
    asset_id text NOT NULL DEFAULT '',
    kind text NOT NULL CHECK (kind IN ('split','interpret','image','video','audio','canvas_export')),
    label text NOT NULL,
    payload jsonb NOT NULL,
    scope_epoch integer NOT NULL DEFAULT 0 CHECK (scope_epoch >= 0),
    status text NOT NULL CHECK (status IN ('pending','dispatched','completed','failed','cancelled')) DEFAULT 'pending',
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, id),
    FOREIGN KEY (workspace_id, project_id) REFERENCES projects (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS generation_intent_requests (
    workspace_id text NOT NULL,
    idempotency_key text NOT NULL,
    request_sha256 text NOT NULL CHECK (length(request_sha256) = 64),
    intent_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, idempotency_key),
    FOREIGN KEY (workspace_id, intent_id) REFERENCES generation_intents (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS outbox_events (
    id bigserial PRIMARY KEY,
    workspace_id text NOT NULL,
    actor_id text NOT NULL DEFAULT '',
    aggregate_id text NOT NULL,
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    attempts integer NOT NULL DEFAULT 0,
    available_at timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS actor_id text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS outbox_pending_idx ON outbox_events (available_at, id) WHERE published_at IS NULL;
CREATE INDEX IF NOT EXISTS generation_intents_project_idx ON generation_intents (workspace_id, project_id, created_at DESC);
