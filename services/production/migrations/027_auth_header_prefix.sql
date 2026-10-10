-- 027: model_channels 增加 auth_header + auth_prefix（ADR-007 D2，与 workspace/007 对齐）
--
-- 模型中心为平台渠道声明鉴权形态。此前只有 auth_type 封闭枚举，新增形态必须
-- 加迁移放宽 CHECK；改为数据驱动后，头名与前缀由这两列直接表达。
--
-- 兼容性：**不回填存量行**，两列保持 NULL 时运行时走 auth_type 兜底映射，
-- 既有渠道行为不变。auth_type 列与其 CHECK 保留。
--
-- 只加列，不改列、不删列、不改 CHECK。

ALTER TABLE model_channels ADD COLUMN IF NOT EXISTS auth_header text;
ALTER TABLE model_channels ADD COLUMN IF NOT EXISTS auth_prefix text;

COMMENT ON COLUMN model_channels.auth_header IS
    '鉴权头名（数据驱动，ADR-007 D2）。非空时按 auth_header: auth_prefix||apiKey 写入；NULL/空则回退 auth_type 映射，行为同改动前';
COMMENT ON COLUMN model_channels.auth_prefix IS
    '鉴权头前缀（数据驱动）。空字符串 = 裸 Token（无前缀）；NULL = 未配置，走 auth_type 兜底。与 workspace.channel_credentials.auth_prefix 语义一致';
