-- 038: 工作区级供给池与策展（ADR-009）—— Phase A：只加列与约束，不改任何行为
--
-- 背景：平台本质是多工作区，每个工作区可能接**自己的中转站**。今天的供给池/目录/逻辑模型
-- 都是平台级（三张表都没有 workspace_id），于是出现两个真问题：
--   1. 各工作区的上游会灌进同一张供给池表（互相污染）
--   2. 渠道凭据按 (workspace_id, channel_id) reveal ⇒ 而供给池是平台级 ⇒ 出现
--      "凭据 id 必须等于平台渠道 id 才取得到密钥"的耦合（记为 F3）
--
-- ★ 编码约定：`workspace_id = ''`（空串）表示【平台共享】，非空表示【某个工作区私有】。
--   为什么不用 NULL：`channel_models` 的主键是 (channel_id, provider_model)，要让它按工作区隔离
--   就必须把 workspace_id 纳入主键，而 Postgres 的主键列不允许 NULL。
--   为保持四张表口径一致，统一用 `NOT NULL DEFAULT ''`（读侧一律 COALESCE(workspace_id,'')）。
--   这与仓库既有惯用法同构：如 `logical_model_id IS NULL = 未纳入路由`。
--
-- ★ 本迁移【只做 DDL】：
--   - 不加任何业务写入（现有行由 DEFAULT 回填为 ''，即"仍归平台共享"）
--   - 不改任何读路径 ⇒ 行为与迁移前完全一致（Phase B/C 才动读写与运行时解析）
--   - 无 DROP TABLE / DELETE / 删列 ⇒ 可回滚（停读该列即回到现状）

-- ── 1) channel_models：供给池 ────────────────────────────────────────────────
ALTER TABLE channel_models ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT '';
COMMENT ON COLUMN channel_models.workspace_id IS
    '归属工作区；''''=平台共享（所有工作区可见）。ADR-009。用空串而非 NULL：它已纳入主键，主键列不允许 NULL。';

-- 主键由 (channel_id, provider_model) 改为 (workspace_id, channel_id, provider_model)：
-- 这样"同一渠道的同一上游模型"可以在平台层与各工作区层【各自存在一行】而互不冲突。
ALTER TABLE channel_models DROP CONSTRAINT IF EXISTS channel_models_pkey;
ALTER TABLE channel_models ADD CONSTRAINT channel_models_pkey
    PRIMARY KEY (workspace_id, channel_id, provider_model);

-- 按工作区取池的常用路径（(workspace_id, channel_id, …) 已被主键前缀覆盖，此处补 missing 过滤）
CREATE INDEX IF NOT EXISTS channel_models_ws_missing_idx
    ON channel_models (workspace_id, channel_id) WHERE missing_since IS NOT NULL;

-- ── 2) model_catalog：模型目录（"基座"） ──────────────────────────────────────
-- 注意：model_catalog.id 被 model_catalog_versions.id 外键引用 ⇒ 主键【保持 (id) 不变】，
-- 因此行 id 仍然全局唯一（策展新行时生成 mod_xxx，不要复用他工作区的 id）。
ALTER TABLE model_catalog ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT '';
COMMENT ON COLUMN model_catalog.workspace_id IS
    '归属工作区；''''=平台共享。ADR-009。行 id 仍全局唯一（被 model_catalog_versions 外键引用，主键不改）。';

-- 唯一键由 (family, channel_id) 放宽为 (workspace_id, family, channel_id)：
-- 同一 family 的同一渠道可以在平台层与各工作区层各自成行。
ALTER TABLE model_catalog DROP CONSTRAINT IF EXISTS model_catalog_family_channel_id_key;
ALTER TABLE model_catalog ADD CONSTRAINT model_catalog_ws_family_channel_key
    UNIQUE (workspace_id, family, channel_id);

-- ── 3) channel_model_syncs：同步留痕 ─────────────────────────────────────────
ALTER TABLE channel_model_syncs ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT '';
COMMENT ON COLUMN channel_model_syncs.workspace_id IS
    '该次同步归属的工作区；''''=平台共享渠道的同步。ADR-009（审计/排障按工作区过滤）。';

CREATE INDEX IF NOT EXISTS channel_model_syncs_ws_channel_time_idx
    ON channel_model_syncs (workspace_id, channel_id, started_at DESC);

-- ── 4) logical_models：逻辑模型（对外能力标识） ───────────────────────────────
-- 按 ADR-009 的决定 3：逻辑模型 id **保持全局唯一**（025 的原文「一旦对外使用即为契约，
-- 不得改名」⇒ 全局唯一反而保护契约）。workspace_id 仅用于【归属与筛选】。
ALTER TABLE logical_models ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT '';
COMMENT ON COLUMN logical_models.workspace_id IS
    '归属工作区；''''=平台共享（对外能力标识默认由平台维护）。id 仍全局唯一（对外契约）。ADR-009。';

CREATE INDEX IF NOT EXISTS logical_models_ws_status_idx
    ON logical_models (workspace_id, status, sort);
