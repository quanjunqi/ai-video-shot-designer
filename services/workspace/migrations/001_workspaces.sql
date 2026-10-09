CREATE TABLE IF NOT EXISTS workspaces (
    id text PRIMARY KEY,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_members (
    workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    actor_id text NOT NULL,
    role text NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, actor_id)
);

INSERT INTO workspaces (id, name) VALUES ('ws_dev', '开发工作区') ON CONFLICT (id) DO NOTHING;
INSERT INTO workspace_members (workspace_id, actor_id, role)
VALUES ('ws_dev', 'user_dev', 'owner') ON CONFLICT (workspace_id, actor_id) DO NOTHING;
