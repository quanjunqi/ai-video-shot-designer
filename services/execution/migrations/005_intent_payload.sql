ALTER TABLE jobs ADD COLUMN IF NOT EXISTS intent_payload jsonb NOT NULL DEFAULT 'null'::jsonb;

-- Jobs created before the Intent/Job contract split stored the intent object in steps.
-- Preserve that data in its own field and normalize steps before enforcing the API shape.
UPDATE jobs
SET intent_payload = steps
WHERE jsonb_typeof(steps) <> 'array'
  AND intent_id <> ''
  AND intent_payload = 'null'::jsonb;

UPDATE jobs
SET steps = '[]'::jsonb
WHERE jsonb_typeof(steps) <> 'array';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'jobs_steps_array_check'
          AND conrelid = 'jobs'::regclass
    ) THEN
        ALTER TABLE jobs ADD CONSTRAINT jobs_steps_array_check CHECK (jsonb_typeof(steps) = 'array');
    END IF;
END $$;
