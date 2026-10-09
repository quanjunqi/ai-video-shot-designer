CREATE TABLE IF NOT EXISTS asset_uploads (
    workspace_id text NOT NULL,
    id text NOT NULL,
    project_id text NOT NULL,
    episode_id text,
    kind text NOT NULL CHECK (kind IN ('character', 'prop', 'scene', 'script', 'other')),
    scope text NOT NULL CHECK (scope IN ('project', 'global')),
    name text NOT NULL,
    prompt text NOT NULL DEFAULT '',
    object_key text NOT NULL UNIQUE,
    expected_sha256 text CHECK (expected_sha256 IS NULL OR length(expected_sha256) = 64),
    status text NOT NULL CHECK (status IN ('uploading', 'committed', 'aborted')) DEFAULT 'uploading',
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS assets (
    workspace_id text NOT NULL,
    id text NOT NULL,
    upload_id text NOT NULL,
    project_id text NOT NULL,
    episode_id text,
    kind text NOT NULL,
    scope text NOT NULL,
    name text NOT NULL,
    prompt text NOT NULL DEFAULT '',
    object_key text NOT NULL UNIQUE,
    sha256 text NOT NULL CHECK (length(sha256) = 64),
    byte_size bigint NOT NULL CHECK (byte_size >= 0),
    content_type text NOT NULL,
    status text NOT NULL DEFAULT 'DRAFT',
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, id),
    FOREIGN KEY (workspace_id, upload_id) REFERENCES asset_uploads (workspace_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS assets_upload_once_idx ON assets (workspace_id, upload_id);
CREATE INDEX IF NOT EXISTS assets_project_idx ON assets (workspace_id, project_id, created_at DESC);
