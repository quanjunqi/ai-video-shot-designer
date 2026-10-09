-- Model routing fields: provider-side model id, per-model request endpoint,
-- HTTP method and provider-specific params template (key-value). These are
-- consumed by the execution provider layer (channel BaseURL + model path).
ALTER TABLE model_catalog
    ADD COLUMN IF NOT EXISTS provider_model text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS request_path text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS method text NOT NULL DEFAULT 'POST' CHECK (method IN ('POST','GET')),
    ADD COLUMN IF NOT EXISTS params jsonb NOT NULL DEFAULT '[]'::jsonb;
