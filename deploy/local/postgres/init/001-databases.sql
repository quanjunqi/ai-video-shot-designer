-- Development-only shared PostgreSQL instance. Services do not share tables.
SELECT 'CREATE DATABASE temporal' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'temporal') \gexec
SELECT 'CREATE DATABASE temporal_visibility' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'temporal_visibility') \gexec
SELECT 'CREATE DATABASE keycloak' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'keycloak') \gexec
SELECT 'CREATE DATABASE production_test' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'production_test') \gexec
SELECT 'CREATE DATABASE workspace' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'workspace') \gexec
SELECT 'CREATE DATABASE asset' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'asset') \gexec
