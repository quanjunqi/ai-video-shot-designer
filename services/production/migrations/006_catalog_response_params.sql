-- Response mapping template: optional field mapping used by the executor to
-- extract provider output (text/content, taskId, image/video URLs). Empty =
-- adapter built-in parsing for known providers.
ALTER TABLE model_catalog
    ADD COLUMN response_params jsonb NOT NULL DEFAULT '[]'::jsonb;
