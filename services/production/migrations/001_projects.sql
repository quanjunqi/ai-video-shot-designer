-- Production owns project metadata and the extracted, immutable source text.
-- Original uploaded files will be owned by Asset when that service is available.
CREATE TABLE IF NOT EXISTS projects (
    workspace_id text NOT NULL,
    id text NOT NULL,
    title text NOT NULL,
    style_id text NOT NULL,
    style_version text NOT NULL,
    aspect_ratio text NOT NULL CHECK (aspect_ratio IN ('16:9', '9:16', '1:1')),
    default_image_model text NOT NULL,
    default_video_model text NOT NULL,
    status text NOT NULL CHECK (status = 'pending_parse'),
    current_source_version integer NOT NULL DEFAULT 1,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS source_versions (
    workspace_id text NOT NULL,
    project_id text NOT NULL,
    version integer NOT NULL CHECK (version > 0),
    content text NOT NULL,
    sha256 text NOT NULL CHECK (length(sha256) = 64),
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, project_id, version),
    FOREIGN KEY (workspace_id, project_id) REFERENCES projects (workspace_id, id)
);

CREATE OR REPLACE FUNCTION reject_source_version_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'source versions are append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS source_versions_immutable ON source_versions;
CREATE TRIGGER source_versions_immutable BEFORE UPDATE OR DELETE ON source_versions
    FOR EACH ROW EXECUTE FUNCTION reject_source_version_mutation();

CREATE TABLE IF NOT EXISTS project_creation_requests (
    workspace_id text NOT NULL,
    idempotency_key text NOT NULL,
    request_sha256 text NOT NULL CHECK (length(request_sha256) = 64),
    project_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, idempotency_key),
    FOREIGN KEY (workspace_id, project_id) REFERENCES projects (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS projects_workspace_updated_idx
    ON projects (workspace_id, updated_at DESC, id DESC);
