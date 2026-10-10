-- 011_drop_model_channel_fk.sql
-- channel_id 从强外键改为逻辑引用：用户渠道（workspace user_channels，带凭据）
-- 与内置渠道（model_channels）都能挂载模型。渠道归属在运行期由 execution
-- 解析（先用户渠道后内置），不再由 production 库约束存储归属。
ALTER TABLE model_catalog DROP CONSTRAINT model_catalog_channel_id_fkey;
