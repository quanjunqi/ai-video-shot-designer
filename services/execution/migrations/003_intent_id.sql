ALTER TABLE jobs ADD COLUMN IF NOT EXISTS intent_id text NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS jobs_workspace_intent_idx ON jobs (workspace_id, intent_id) WHERE intent_id <> '';
