-- 024: model_channels.auth_type 增加 'token'（与 workspace/005 对齐）
--
-- 模型中心允许为渠道选择鉴权方式；若此处不允许 'token'，
-- 用户在界面上选择「无前缀 Token」时会因 CHECK 失败而无法保存。
-- 本迁移只放宽取值集合，不触碰既有数据。

ALTER TABLE model_channels DROP CONSTRAINT IF EXISTS model_channels_auth_type_check;
ALTER TABLE model_channels ADD CONSTRAINT model_channels_auth_type_check
    CHECK (auth_type IN ('bearer', 'apikey', 'sign', 'token', 'none'));

COMMENT ON COLUMN model_channels.auth_type IS
    '鉴权方式（与 workspace.channel_credentials.auth_type 一致）：bearer / token（无前缀）/ apikey / sign / none';
