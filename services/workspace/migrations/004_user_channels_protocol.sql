-- Connection protocol for user channels: HTTP API (cloud/aggregator with
-- base URL + auth) vs local port service (self-hosted like ComfyUI/Ollama,
-- reachable via host:port, usually no auth).
ALTER TABLE user_channels
    ADD COLUMN protocol text NOT NULL DEFAULT 'api'
    CHECK (protocol IN ('api','local'));
