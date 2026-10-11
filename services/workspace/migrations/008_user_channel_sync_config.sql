-- 008: 用户渠道的同步配置（ADR-009 决定 2：同步配置跟着渠道走）
--
-- 为什么放这里而不是 production：渠道归 workspace（AGENTS §3.1），
-- 而"这个渠道怎么拉上游清单"是渠道自身的属性 ⇒ 配置与渠道同源，避免分居两个服务。
-- production 在做同步时通过既有的 workspace 内部接口读取（它本来就要调 reveal，不新增依赖方向）。
--
-- ★ 路径必须【可配】而非硬编码：不同中转站的清单/价格接口路径不同（同 production 的 036）。
ALTER TABLE user_channels
    ADD COLUMN IF NOT EXISTS sync_kind         text NOT NULL DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS sync_models_path  text,
    ADD COLUMN IF NOT EXISTS sync_pricing_path text,
    ADD COLUMN IF NOT EXISTS trust_note        text;

COMMENT ON COLUMN user_channels.sync_kind IS
    'none | openai_compatible（ADR-004 §3.3 / ADR-009）。刻意不加 CHECK：同步器类型会演进，认不出的值由同步器明确拒绝（"认不出就不猜"）。';
COMMENT ON COLUMN user_channels.sync_models_path IS
    '模型清单接口路径（如 /v1/models）。必须可配、不得硬编码。';
COMMENT ON COLUMN user_channels.sync_pricing_path IS
    '价格接口路径（如 /api/pricing）。可为空 —— 并非所有中转站都提供。';
COMMENT ON COLUMN user_channels.trust_note IS
    'ADR-004 D5 信任模型：显式记录对该渠道的信任判断。法律判断由 Owner 负责，技术侧只记录来源 + 审计实际命中渠道 + 可切换。';
