# Production service (first development slice)

Go internal API for creating and fetching comic projects. It persists project metadata, source text v1 and a SHA-256 digest in one PostgreSQL transaction. The idempotency key is scoped to a workspace; replay with different input returns 409. It does not create episodes or submit generation jobs yet.

This is **not a public API**. Until the BFF and Workspace authorization exist, only run it on loopback or a private network. `PRODUCTION_INTERNAL_TOKEN` authenticates a trusted caller; `X-Workspace-Id` and `X-Actor-Id` are trusted assertions by that caller, not browser-supplied authorization. Never expose this service directly to the browser or the Internet.

Prerequisites: Go 1.23+, PostgreSQL, and `psql`. From this directory:

```bash
psql "$PRODUCTION_DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/001_projects.sql
PRODUCTION_INTERNAL_TOKEN=your-local-token go run ./cmd/server
go test ./...
```

For a container-only local setup (including a dedicated integration test database), see [local Compose](../../deploy/local/README.md). The service image listens only inside the Compose network; it is not exposed to browsers.

Database integration tests are skipped unless `PRODUCTION_TEST_DATABASE_URL` points to a **dedicated test database** with permission to create schemas. They create and remove their own randomly named schema, apply the migration, and test concurrent idempotency, workspace isolation and immutable source versions:

```bash
PRODUCTION_TEST_DATABASE_URL=postgres://... go test ./internal/project -run TestPostgres -count=1
```

`PRODUCTION_DATABASE_URL` must be set before running the server. It listens on `127.0.0.1:8081` by default; override with `PRODUCTION_LISTEN_ADDR` only on a protected network. `GET /live` checks the process, and `GET /ready` checks the database. Create with `POST /internal/v1/comic-projects` and read with `GET /internal/v1/comic-projects/{id}`; both require `Authorization: Bearer ...`, `X-Workspace-Id`, and `X-Actor-Id`. Creation also requires `Idempotency-Key` and a JSON body with `title`, `style_id`, `style_version`, `aspect_ratio`, `default_image_model`, `default_video_model`, and `source_text`.

The original uploaded file, real identity verification, style/model catalog validation, source revisions, split jobs and frontend integration are subsequent slices. The existing frontend remains in clearly labelled demo mode and does not read this internal API.
