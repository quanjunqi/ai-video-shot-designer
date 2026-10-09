-- User-scoped channels per workspace (tenant-scoped, non-sensitive).
-- Builtin channels live in the platform catalog (production service) and are
-- read-only to tenants; this table holds channels the user creates/clones
-- (e.g. custom aggregator gateways). base_url/auth_type are plain text (not
-- secrets); API keys live separately in channel_credentials (encrypted).

CREATE TABLE IF NOT EXISTS user_channels (
    workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    id text NOT NULL,
    name text NOT NULL,
    kind text NOT NULL DEFAULT 'aggregator' CHECK (kind IN ('official','aggregator','local')),
    base_url text NOT NULL DEFAULT '',
    auth_type text NOT NULL DEFAULT 'bearer' CHECK (auth_type IN ('bearer','none')),
    enabled boolean NOT NULL DEFAULT true,
    note text NOT NULL DEFAULT '',
    sort integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS user_channels_workspace_idx
    ON user_channels (workspace_id, updated_at DESC);
