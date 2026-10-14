# Local containers

This Compose stack is for development and single-machine validation, **not high availability**. Run from the repository root with Docker Engine and the Docker Compose v2 plugin. Copy `deploy/local/.env.example` to `deploy/local/.env`, replace all example secrets, and use URL-safe characters in `POSTGRES_PASSWORD` (it is interpolated into the local service DSN). The file is gitignored. Do not reuse these credentials in production.

```bash
docker compose --env-file deploy/local/.env -f deploy/local/compose.yaml up -d postgres redis
docker compose --env-file deploy/local/.env -f deploy/local/compose.yaml --profile platform up -d
docker compose --env-file deploy/local/.env -f deploy/local/compose.yaml --profile app up -d --build
docker compose --env-file deploy/local/.env -f deploy/local/compose.yaml --profile test run --rm --build production-test
```

Before Docker is available, `python3 -m unittest discover -s deploy/local -p 'test_*.py'` checks the Compose structure and local safety constraints. This static check does not validate image availability, container startup, migrations or PostgreSQL transactions.

- Default services: PostgreSQL and Redis. `platform` adds MinIO (S3 compatible), single-node Kafka + Schema Registry, Temporal + UI, and Keycloak. `app` builds the Go Workspace, Production, Asset and Web BFF services plus the React UI, creates the Asset database, runs Production/Asset SQL migrations, and starts the Web entrypoint. `test` runs Go tests against a **separate** database; each integration test creates and removes its own schema.
- Exposed host ports bind to `127.0.0.1` only. Defaults: Web 5173, PostgreSQL 5432, Redis 6379, MinIO 9000/9001, Schema Registry 8082, Temporal 7233/UI 8233, Keycloak 8083. Kafka is internal to the Compose network and advertises `kafka:9092` for containers only.
- Production, Workspace and Execution publish ports bound to `127.0.0.1` **only** (18081 / 18082 / 8085) for local debugging; **Asset and Web BFF are not published at all** and are reachable only inside the Compose network. The Web container is the browser entrypoint and proxies `/api/v1/comic-projects` and `/api/v1/assets` through the BFF. The BFF authorizes the fixed local development identity (`ws_dev` / `user_dev`) with Workspace and injects trusted context into downstream services. Project list/create and Asset upload/commit/list are real PostgreSQL-backed paths, not a production identity system: OIDC, signed downloads, media processing, durable jobs and provider workflows are still pending.
- Persistent named volumes hold database, Redis, Kafka and object data. `docker compose down` preserves them; removing volumes deletes local data. Initialization SQL runs only when PostgreSQL's volume is empty.
- **SQL migrations run via `deploy/local/migrate.sh`** (mounted into each `*-migrate` job), which records every applied file's **checksum** in a `schema_migrations` table. Consequences: each file executes **once** (so migrations no longer need to be idempotent, and repeated `compose up` is safe), and **editing an already-applied migration is rejected** — the「已执行迁移只增不改」rule (`.agents/skills/database-migrations/SKILL.md`) becomes mechanically enforced rather than a convention. Each file runs in its own transaction, so a failure rolls back only that file.
- **Existing database with tables but no `schema_migrations`**: the runner refuses to run rather than guessing, because it cannot know which version the database is at. Adopt explicitly — this records versions **without executing any SQL**:
  ```bash
  # all files already applied
  MIGRATE_ADOPT=1 docker compose --profile app up production-migrate
  # only applied up to a given file; the rest will then be applied normally
  MIGRATE_ADOPT=1 MIGRATE_ADOPT_UNTIL=021_protocol_capabilities.sql \
    docker compose --profile app up production-migrate
  ```
- `platform` processes are single-node development instances without production TLS, secret management, backup, retention or HA. Production deployment will use the same independently built OCI application images with Helm/Kubernetes and managed or separately containerized HA middleware. No production Helm release has been delivered yet.

Check status with `docker compose --env-file deploy/local/.env -f deploy/local/compose.yaml ps`. If another service uses a host port, change it in `deploy/local/.env`; do not expose this stack on a public interface.

## 集成测试库（已有数据卷时需手工补建）

`postgres/init/001-databases.sql` **只在数据卷首次初始化时执行**。如果你已经有数据卷
（`docker volume ls` 里能看到本项目的数据卷），需要手工补建这四个库 ——
它们与根目录 `.env.example` 的 `*_TEST_DATABASE_URL` 一一对应：

```bash
for db in production_test execution_test workspace_test asset_test; do
  docker exec shotdesigner-postgres-1 psql -U shotdesigner -d postgres \
    -c "SELECT 'CREATE DATABASE $db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$db')\\gexec"
done
```

各服务的集成测试会**自建随机 schema 并就地应用 migrations**、结束时清理，
因此这些库只需**存在且允许建 schema**（不需要预先应用任何迁移）。
`scripts/preflight.sh` 的集成测试门会在这些库可用时才判定「真跑过」；否则明确标注为**未验证**。
