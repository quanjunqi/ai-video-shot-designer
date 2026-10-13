-- 012: T0 权威价格校准（ADR-004 D3 落地 + dev-plan T0）
--
-- 1) gateway_audit_logs 增加 cost_unit：审计成本必须带计费单位，否则 cost_amount
--    「已校准/预估」口径无法区分（T0 验收：审计成本写权威价，T2 报表双口径可辨）。
-- 2) price_calibration_logs：校准/对账事件台账 —— 对账任务把"审计实际成本 vs
--    目录权威价"的差异记在这里，差异 >20% 记为 alert（防目录价被覆盖/同步涨价未同步）。
-- 均只增不改；既有审计行 cost_unit 为空 = 历史"预估"口径，合法。

ALTER TABLE gateway_audit_logs
    ADD COLUMN IF NOT EXISTS cost_unit TEXT;

COMMENT ON COLUMN gateway_audit_logs.cost_unit IS
    '本次调用成本的计费单位（per_call/per_second/per_mtok_input/per_mtok_output，跟随 model_catalog.cost_unit）。空 = 无校准价（预估口径）。';

CREATE TABLE IF NOT EXISTS price_calibration_logs (
    id            bigserial PRIMARY KEY,
    model_id      text NOT NULL,
    channel_id    text,
    provider_model text,
    actual_cost   numeric(12,6),
    ledger_cost   numeric(12,6),
    diff_pct      numeric(8,2),
    status        text NOT NULL DEFAULT 'ok',   -- ok | alert（diff_pct > 20% 时 alert）
    note          text,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_calibration_logs_model
    ON price_calibration_logs (model_id, created_at DESC);

COMMENT ON TABLE price_calibration_logs IS
    'T0 价格校准台账：审计实际成本 vs model_catalog 权威价（cost_amount）的对账记录；diff_pct 差异 >20% 记为 alert。';
