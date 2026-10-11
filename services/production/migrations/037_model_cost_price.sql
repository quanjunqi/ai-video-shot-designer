-- 037: 成本与售价分离（ADR-004 §3.4、D3；Owner 2026-10-10 §9 决策 1：字段保留）
--
-- 决策要点：ADR-004 D3 —— 成本（我们付出的）与售价（对外标价）**分离**，并标记价格来源。
-- §9 决策 1 明确：当前可只填 cost_*，price_* 留待对外售卖时启用；
--   **但 price_* 四列必须现在就建**（"先建好结构比事后加列安全"）。
ALTER TABLE model_catalog
    ADD COLUMN IF NOT EXISTS cost_amount     numeric(12,6),
    ADD COLUMN IF NOT EXISTS cost_unit       text,
    ADD COLUMN IF NOT EXISTS price_amount    numeric(12,6),
    ADD COLUMN IF NOT EXISTS price_unit      text,
    ADD COLUMN IF NOT EXISTS price_source    text NOT NULL DEFAULT 'manual',
    ADD COLUMN IF NOT EXISTS price_synced_at timestamptz;

-- ADR §6 明确要求这条 CHECK
ALTER TABLE model_catalog
    DROP CONSTRAINT IF EXISTS model_catalog_price_source_check;
ALTER TABLE model_catalog
    ADD CONSTRAINT model_catalog_price_source_check CHECK (price_source IN ('manual', 'synced'));

COMMENT ON COLUMN model_catalog.cost_amount IS
    '我们付出的成本（ADR-004 D3）。与 price_amount 分离：两者混用会让毛利无法计算。';
COMMENT ON COLUMN model_catalog.cost_unit IS
    'per_call | per_second | per_mtok_input | per_mtok_output（未加 CHECK：计费单位会随上游演进）';
COMMENT ON COLUMN model_catalog.price_amount IS
    '对外标价（ADR-004 D3）。当前可空 —— 留待需要对外售卖时启用（§9 决策 1）。';
COMMENT ON COLUMN model_catalog.price_source IS
    'manual | synced（ADR-004 §3.4）。标记价格来自人工还是同步，避免"同步值悄悄覆盖人工定价"。';
