-- Development-only shared PostgreSQL instance. Services do not share tables.
SELECT 'CREATE DATABASE temporal' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'temporal') \gexec
SELECT 'CREATE DATABASE temporal_visibility' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'temporal_visibility') \gexec
SELECT 'CREATE DATABASE keycloak' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'keycloak') \gexec
SELECT 'CREATE DATABASE production_test' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'production_test') \gexec
-- 集成测试库：名字与根目录 .env.example 的 *_TEST_DATABASE_URL 一一对应。
-- 各服务的集成测试会自建【随机 schema】并在结束时清理，因此这些库只需存在且可建 schema。
-- ★ 本文件只在【数据卷首次初始化】时执行；已有数据卷需按 README 的说明手工补建。
SELECT 'CREATE DATABASE execution_test' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'execution_test') \gexec
SELECT 'CREATE DATABASE workspace_test' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'workspace_test') \gexec
SELECT 'CREATE DATABASE asset_test' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'asset_test') \gexec
SELECT 'CREATE DATABASE workspace' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'workspace') \gexec
SELECT 'CREATE DATABASE asset' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'asset') \gexec
