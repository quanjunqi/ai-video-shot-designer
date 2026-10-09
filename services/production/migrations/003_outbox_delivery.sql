ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS locked_by text NOT NULL DEFAULT '';
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS dead_lettered_at timestamptz;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS last_error text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS outbox_claim_idx
    ON outbox_events (available_at, id)
    WHERE published_at IS NULL AND dead_lettered_at IS NULL;
