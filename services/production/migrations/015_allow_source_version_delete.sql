-- 015: 允许删除 source_versions（项目删除时级联清理需要），仍禁止 UPDATE 保证版本不可变
-- 原触发器拦截 UPDATE 与 DELETE；版本追加不可变语义保留（禁止 UPDATE），DELETE 仅用于项目删除清理
DROP TRIGGER IF EXISTS source_versions_immutable ON source_versions;
CREATE TRIGGER source_versions_immutable BEFORE UPDATE ON source_versions
    FOR EACH ROW EXECUTE FUNCTION reject_source_version_mutation();
