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
- The Production, Workspace, Asset and Web BFF APIs have **no published host port**; the Web container is the browser entrypoint and proxies `/api/v1/comic-projects` and `/api/v1/assets` through the BFF. The BFF authorizes the fixed local development identity (`ws_dev` / `user_dev`) with Workspace and injects trusted context into downstream services. Project list/create and Asset upload/commit/list are real PostgreSQL-backed paths, not a production identity system: OIDC, signed downloads, media processing, durable jobs and provider workflows are still pending.
- Persistent named volumes hold database, Redis, Kafka and object data. `docker compose down` preserves them; removing volumes deletes local data. Initialization SQL runs only when PostgreSQL's volume is empty. SQL migrations run via `production-migrate`; future migrations must be numbered, compatible and applied through this job.
- `platform` processes are single-node development instances without production TLS, secret management, backup, retention or HA. Production deployment will use the same independently built OCI application images with Helm/Kubernetes and managed or separately containerized HA middleware. No production Helm release has been delivered yet.

Check status with `docker compose --env-file deploy/local/.env -f deploy/local/compose.yaml ps`. If another service uses a host port, change it in `deploy/local/.env`; do not expose this stack on a public interface.
