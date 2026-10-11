-- 035: 渠道模型同步记录（ADR-004 §3.2）
-- 为"同步做了什么"留痕：计数、上游端点映射、增量 diff 与错误。
CREATE TABLE IF NOT EXISTS channel_model_syncs (
    id            bigserial PRIMARY KEY,
    channel_id    text NOT NULL REFERENCES model_channels(id) ON DELETE CASCADE,
    started_at    timestamptz NOT NULL DEFAULT now(),
    finished_at   timestamptz,
    status        text NOT NULL DEFAULT 'running',   -- running | succeeded | failed
    raw_count     int,
    added         int,
    updated       int,
    missing       int,
    price_changed int,
    endpoints     jsonb,   -- 上游端点映射表（如部分中转站单独提供）
    diff          jsonb,
    error         text
);

COMMENT ON TABLE channel_model_syncs IS
    'ADR-004 §3.2 渠道模型同步记录：每次同步的计数/diff/错误，供排障与回溯。';
COMMENT ON COLUMN channel_model_syncs.status IS 'running | succeeded | failed（未加 CHECK：状态集可能随同步器演进，且此表仅供审计）';

CREATE INDEX IF NOT EXISTS channel_model_syncs_channel_time_idx
    ON channel_model_syncs (channel_id, started_at DESC);
