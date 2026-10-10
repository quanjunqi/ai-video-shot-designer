-- 005: auth_type 增加 'token'（Authorization 头直接放 Token、无 Bearer 前缀）
--
-- 背景：AutoDL 的 ComfyUI 工作流 API 要求
--   {"Authorization": "<Token>"}   —— 不带 "Bearer " 前缀。
-- 而 execution 网关原先硬编码 "Bearer "+key，且本表 CHECK 只允许
-- bearer/apikey/sign/none，因此该形态**既表达不了也存不进去**。
--
-- 本迁移只放宽取值集合；既有数据与行为不受影响。
-- 先 DROP IF EXISTS 再 ADD，保证可重复执行（执行器带版本跟踪，但保持习惯一致）。

ALTER TABLE channel_credentials DROP CONSTRAINT IF EXISTS channel_credentials_auth_type_check;
ALTER TABLE channel_credentials ADD CONSTRAINT channel_credentials_auth_type_check
    CHECK (auth_type IN ('bearer', 'apikey', 'sign', 'token', 'none'));

ALTER TABLE user_channels DROP CONSTRAINT IF EXISTS user_channels_auth_type_check;
ALTER TABLE user_channels ADD CONSTRAINT user_channels_auth_type_check
    CHECK (auth_type IN ('bearer', 'apikey', 'sign', 'token', 'none'));

COMMENT ON COLUMN channel_credentials.auth_type IS
    '鉴权方式：bearer=Authorization: Bearer <key>；token=Authorization: <key>（无前缀）；apikey/sign=当前按 bearer 处理；none=不带鉴权头';
