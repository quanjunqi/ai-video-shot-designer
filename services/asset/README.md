# Asset Service

首版资产服务负责上传会话、对象写入、哈希校验、提交和按项目查询。元数据存储在 PostgreSQL，对象存储使用 S3 兼容接口（本地 Compose 默认 MinIO）。服务只接受来自 BFF 或受信任内部调用方的请求，不直接暴露给浏览器。

## API

所有请求需要 `Authorization: Bearer $ASSET_INTERNAL_TOKEN` 和 `X-Workspace-Id`；创建上传还需要 `X-Actor-Id`。

```text
POST /internal/v1/assets/uploads
PUT  /internal/v1/assets/uploads/{upload_id}/content
POST /internal/v1/assets/uploads/{upload_id}/commit
GET  /internal/v1/assets?project_id={project_id}
```

创建上传会话的 JSON 至少包含 `project_id`、`name`，可选 `episode_id`、`kind`、`scope`、`prompt`、`sha256`。提交时服务端重新从对象存储计算 SHA-256，并在不匹配时返回 `422 HASH_MISMATCH`。重复提交返回 `409 CONFLICT`。

## 本地运行

推荐从仓库根目录执行：

```bash
docker compose --env-file deploy/local/.env -f deploy/local/compose.yaml --profile platform --profile app up -d --build
```

单元测试：

```bash
go test ./...
```

## 当前边界

首版没有签名下载 URL、媒体扫描、病毒检测、转码/缩略图、派生资源、生命周期清理或审核状态机。`GET` 返回的 `status` 是服务端对象初始状态（通常为 `DRAFT`）；前端的用户批准、拒绝、版本和失效日志属于独立领域状态，不能直接互相覆盖。后续应增加签名访问接口和媒体处理任务，再接入 Execution/Task Service。

## 数据库集成测试

不设置 `ASSET_TEST_DATABASE_URL` 时**跳过**。设置后指向一个**专用测试库**（需要建 schema 的权限）：
每个用例自建随机 schema、就地应用 `migrations/`、结束时清理 —— 因此**不依赖**测试库已被预先应用迁移。

```bash
ASSET_TEST_DATABASE_URL=postgres://... go test ./internal/asset -run Integration -count=1
```

覆盖范围：`CreateUpload`（TrimSpace / 默认值 / 空串转 NULL / sha256 CHECK）与 `List`
（按 workspace 与 project 过滤、按 created_at 倒序、空结果是 `[]` 而非 `null`）。
`Put` / `Commit` 会连 MinIO，需要对象存储 ⇒ 另议。
