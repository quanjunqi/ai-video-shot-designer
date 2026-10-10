ALTER TABLE jobs ADD COLUMN IF NOT EXISTS scope_epoch integer NOT NULL DEFAULT 0;
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_scope_epoch_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_scope_epoch_check CHECK (scope_epoch >= 0);
