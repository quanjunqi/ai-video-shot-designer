-- 015: 单元熔断健康表（channel_id + provider_model 唯一键）
--
-- 背景（access-design v2.2 §3.4 / dev-plan T4）：坏供给单元（渠道×模型）不再被反复撞——
-- 失败计数 → 冷却 → 半开探活 → 恢复。粒度是【单元级】：同渠道不同模型互不影响。
-- 多副本状态共享：本表是唯一事实源，禁止实例本地内存计数（BE-CONC-002）。
--
-- 语义：
--   · fail_count      : 连续失败计数（软 4xx/5xx/超时计入；硬 4xx 与内容安全拒绝不计）
--   · cooldown_until  : 冷却截止（NULL = 不在冷却；now 之前 = 冷却到期可探活）
--   · probe_owner     : 半开探活占位（单飞：同一冷却单元同时只允许一个实例探活；
--                       冷却到期且 probe_owner IS NULL 的单元才可被占位）
--   · probe_at        : 最近一次半开探活时间（探活频率控制，默认 30s 档）
--   · last_failure_at / last_success_at : 供 T11 健康面板展示

CREATE TABLE IF NOT EXISTS channel_health (
    channel_id      text NOT NULL,
    provider_model  text NOT NULL,
    fail_count      integer NOT NULL DEFAULT 0,
    cooldown_until  timestamptz,
    probe_owner     text,
    probe_at        timestamptz,
    last_failure_at timestamptz,
    last_success_at timestamptz,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (channel_id, provider_model)
);

COMMENT ON TABLE channel_health IS
    '供给单元（渠道×模型）熔断健康状态。唯一键 channel_id+provider_model（单元级，'
    '同渠道不同模型互不影响）。多副本共享事实源：失败计数/冷却/半开探活占位一律原子 UPDATE，'
    '禁止实例本地内存（access-design §3.4）。';

COMMENT ON COLUMN channel_health.fail_count IS
    '连续失败计数。软 4xx/5xx/超时计入；硬 4xx（400/401/403/404/422）与内容安全拒绝不计'
    '（表 3-1：换渠道无意义，直返即可）。';

COMMENT ON COLUMN channel_health.cooldown_until IS
    '冷却截止（timestamptz）。NULL=不在冷却；> now=熔断中（候选剔除）；<= now=冷却到期'
    '（允许单飞探活）。冷却时长默认 60s（LiteLLM cooldown 档）。';

COMMENT ON COLUMN channel_health.probe_owner IS
    '半开探活占位（实例标识）。占位条件：cooldown_until <= now AND (probe_owner IS NULL '
    'OR probe_owner = 自己)，保证同一冷却单元同时只允许一个实例探活（单飞）。';
