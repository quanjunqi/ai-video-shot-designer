-- Channel credentials per workspace (tenant-scoped, encrypted at rest).
-- base_url is non-sensitive and stored in plain text; API keys are stored as
-- AES-256-GCM ciphertext (key derived from WORKSPACE_CRED_KEY env; production
-- must inject a real key via secret management, never a checked-in default).
-- No handler ever returns the plaintext key; clients only see has_key status.

CREATE TABLE IF NOT EXISTS channel_credentials (
    workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    channel_id text NOT NULL,
    base_url text NOT NULL DEFAULT '',
    auth_type text NOT NULL DEFAULT 'none' CHECK (auth_type IN ('bearer','apikey','sign','none')),
    key_ciphertext bytea NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    updated_by text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, channel_id)
);

CREATE INDEX IF NOT EXISTS channel_credentials_workspace_idx
    ON channel_credentials (workspace_id, updated_at DESC);
