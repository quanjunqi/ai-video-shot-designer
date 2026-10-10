-- 036: 渠道同步配置（ADR-004 §3.3）
-- ★ 路径必须【可配】而非硬编码（AGENTS.md §3.2）：不同中转站的清单/价格接口路径不同。
ALTER TABLE model_channels
    ADD COLUMN IF NOT EXISTS sync_kind         text NOT NULL DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS sync_models_path  text,
    ADD COLUMN IF NOT EXISTS sync_pricing_path text,
    ADD COLUMN IF NOT EXISTS last_sync_at      timestamptz,
    ADD COLUMN IF NOT EXISTS trust_note        text;

COMMENT ON COLUMN model_channels.sync_kind IS
    'none | openai_compatible（ADR-004 §3.3）。刻意不加 CHECK：同步器类型会演进。';
COMMENT ON COLUMN model_channels.sync_models_path IS
    '模型清单接口路径（如 /v1/models）。必须可配、不得硬编码。';
COMMENT ON COLUMN model_channels.sync_pricing_path IS
    '价格接口路径（如 /api/pricing）。可为空 —— 并非所有中转站都提供。';
COMMENT ON COLUMN model_channels.trust_note IS
    'ADR-004 D5 信任模型：显式记录对该渠道的信任判断。法律判断由 Owner 负责，技术侧只负责【记录来源 + 审计实际命中渠道 + 可切换】。';
