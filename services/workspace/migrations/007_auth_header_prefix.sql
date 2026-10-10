-- 007: 鉴权头数据驱动 —— auth_header + auth_prefix（ADR-007 D2）
--
-- 背景：此前「鉴权头形态」是封闭枚举 auth_type ∈ (bearer, apikey, sign, token, none)，
-- 每对接一种新形态（例：AutoDL 的裸 Token，Authorization: <key> 无前缀）都要改
-- engine 代码 + 放宽 CHECK + 加迁移。参考实现（VOZEB-PRO）用两个字段通吃：
--   auth_header = 头名（如 Authorization / X-Api-Key）
--   auth_prefix = 前缀（如 "Bearer " / "Token " / 空=裸值）
-- 之后新 header 形态只需填这两个字段，无需改代码或加迁移。
--
-- 兼容性底线：**不回填存量行**。两列保持 NULL 时 execution 侧走 auth_type 兜底映射，
-- 既有渠道行为与本次改动前逐字一致。
-- auth_type 列与其 CHECK 保留（兜底映射仍需要它）。
--
-- 只加列，不改列、不删列、不改 CHECK。

ALTER TABLE channel_credentials ADD COLUMN IF NOT EXISTS auth_header text;
ALTER TABLE channel_credentials ADD COLUMN IF NOT EXISTS auth_prefix text;

ALTER TABLE user_channels ADD COLUMN IF NOT EXISTS auth_header text;
ALTER TABLE user_channels ADD COLUMN IF NOT EXISTS auth_prefix text;

COMMENT ON COLUMN channel_credentials.auth_header IS
    '鉴权头名（数据驱动，ADR-007 D2）。非空时 execution 直接写 auth_header: auth_prefix||apiKey；NULL/空则回退 auth_type 映射，行为同改动前';
COMMENT ON COLUMN channel_credentials.auth_prefix IS
    '鉴权头前缀（数据驱动）。可为空字符串——即「裸 Token」（Authorization: <key>，无前缀）；NULL 表示未配置，走 auth_type 兜底';

COMMENT ON COLUMN user_channels.auth_header IS
    '鉴权头名（数据驱动，ADR-007 D2），租户自带渠道同名字段，语义与 channel_credentials.auth_header 一致';
COMMENT ON COLUMN user_channels.auth_prefix IS
    '鉴权头前缀（数据驱动）。空字符串 = 裸 Token；NULL = 未配置，走 auth_type 兜底';
