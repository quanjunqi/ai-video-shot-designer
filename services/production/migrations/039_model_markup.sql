-- 039: 加价比例（两级：类型默认 + 模型覆盖）—— Owner 2026-10-16 拍板
--
-- 背景（Owner 定的定价方式，"像电商商品管理"）：
--   售价 = 原价 + 原价 × 比例%   ⇒   price_amount = cost_amount × (1 + ratio)
--   比例**分两档**：① 类型分第一档（text / image / video 各有默认比例）
--                   ② 类型下的模型再分一档（模型级覆盖，可单独设，也支持勾选多选批量设置）
--
-- 为什么比例必须**独立存储**（而不是只存算好的 price_amount）：
--   原价（cost_amount）会变（上游调价、手动修订）。若只存售价，原价一变就失真；
--   存比例则售价可随时按 ratio 重算 ⇒ 原价变动自动跟随。
--
-- 为什么类型默认单独建表而不是放进 model_catalog：
--   类型默认是"每类型一条"的配置（共 3 行/工作区），不是模型属性；
--   放进 model_catalog 会让每个模型都冗余一份默认值，改默认要 UPDATE 全表。
--
-- ★ 兼容性（本迁移只加列/加表/放宽 CHECK，不改任何既有行为）：
--   - `markup_ratio` 可空：NULL = 继承类型默认（既有 18 行全部为 NULL ⇒ 行为不变）
--   - `price_source` 的 CHECK **放宽**（新增 'markup'），既有取值 'manual'/'synced' 不受影响
--   - 新表 `markup_type_defaults` **不播种任何值**：具体比例是商业定价决策，由 Owner 在后台设置。
--     未设置时该类型下无默认 ⇒ 有效比例按 0 计算（售价 = 原价），不会凭空加价。
--   - workspace_id 口径与 038 一致：`''` = 平台共享，非空 = 工作区私有；PK 含 workspace_id
--     （Postgres 主键列不允许 NULL，故用 NOT NULL DEFAULT ''，与 038 同构）
--
-- 号段：production 模型中心 024-039（本文件为 039，该号段最后一号）

-- ① 模型级覆盖比例（NULL = 继承类型默认）
ALTER TABLE model_catalog ADD COLUMN IF NOT EXISTS markup_ratio numeric;

COMMENT ON COLUMN model_catalog.markup_ratio IS
  '加价比例（模型级覆盖）。售价 = cost_amount × (1 + 有效比例)；'
  '有效比例 = markup_ratio ?? markup_type_defaults.ratio ?? 0。NULL = 继承类型默认。';

-- 比例非负（允许 0 = 不加价；是否允许"负比例"做促销引流由 Owner 后续决定，本迁移先不放行负数）
ALTER TABLE model_catalog DROP CONSTRAINT IF EXISTS model_catalog_markup_ratio_check;
ALTER TABLE model_catalog ADD CONSTRAINT model_catalog_markup_ratio_check
    CHECK (markup_ratio IS NULL OR markup_ratio >= 0);

-- ② 放宽 price_source：新增 'markup'（由比例派生的售价，区别于 'manual' 手填）
ALTER TABLE model_catalog DROP CONSTRAINT IF EXISTS model_catalog_price_source_check;
ALTER TABLE model_catalog ADD CONSTRAINT model_catalog_price_source_check
    CHECK (price_source IN ('manual', 'synced', 'markup'));

-- ③ 类型级默认比例（第一档）
CREATE TABLE IF NOT EXISTS markup_type_defaults (
    workspace_id text    NOT NULL DEFAULT '',
    type         text    NOT NULL CHECK (type IN ('text', 'image', 'video')),
    ratio        numeric NOT NULL CHECK (ratio >= 0),
    updated_by   text    NOT NULL DEFAULT '',
    updated_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, type)
);

COMMENT ON TABLE markup_type_defaults IS
  '加价比例的【类型级默认】（第一档）。共 3 行/工作区（text/image/video）。'
  '模型未设 model_catalog.markup_ratio 时继承此处的值。'
  '刻意不播种默认值：具体比例属商业定价决策，由 Owner 在后台设置；'
  '未设置时该类型无默认 ⇒ 有效比例按 0 计（售价=原价），不会凭空加价。';
COMMENT ON COLUMN markup_type_defaults.workspace_id IS
  '与 038 同口径：'''' = 平台共享，非空 = 工作区私有。';
