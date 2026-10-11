# 环境变量参考

> 完整权威清单见根目录 `.env.example`。这里按服务分组索引。

## 本地基础设施

| 变量 | 默认值 | 说明 |
|---|---|---|
| `POSTGRES_PORT` | 5432 | PostgreSQL 端口 |
| `REDIS_PORT` | 6379 | Redis 端口 |

## workspace (18082)

| 变量 | 说明 |
|---|---|
| `WORKSPACE_DATABASE_URL` | PostgreSQL 连接串 |
| `WORKSPACE_LISTEN_ADDR` | 监听地址 |
| `WORKSPACE_INTERNAL_TOKEN` | 服务间调用令牌 |
| `WORKSPACE_CRED_KEY` | 渠道凭据加密密钥（32 字节） |

## production (18081)

| 变量 | 说明 |
|---|---|
| `PRODUCTION_DATABASE_URL` | PostgreSQL 连接串 |
| `PRODUCTION_LISTEN_ADDR` | 监听地址 |
| `PRODUCTION_INTERNAL_TOKEN` | 服务间调用令牌 |
| `PRODUCTION_WORKSPACE_URL` | workspace 服务地址 |

## execution (8085)

| 变量 | 说明 |
|---|---|
| `EXECUTION_DATABASE_URL` | PostgreSQL 连接串 |
| `EXECUTION_LISTEN_ADDR` | 监听地址 |
| `EXECUTION_MAX_CONCURRENT_JOBS` | Worker 并发上限（默认 8） |
| `EXECUTION_ALLOW_PRIVATE_UPSTREAM` | 允许访问私网上游（本地调试 ComfyUI 时设 1） |

## asset (18084)

| 变量 | 说明 |
|---|---|
| `ASSET_DATABASE_URL` | PostgreSQL 连接串 |
| `ASSET_LISTEN_ADDR` | 监听地址 |
| `ASSET_MAX_BYTES` | 单次上传上限（默认 100MB） |
| `ASSET_S3_ENDPOINT` | S3/MinIO endpoint |
| `ASSET_S3_BUCKET` | 存储桶名 |

## web-bff (8080)

| 变量 | 说明 |
|---|---|
| `BFF_LISTEN_ADDR` | 监听地址 |
| `BFF_WORKSPACE_URL` | → workspace |
| `BFF_PRODUCTION_URL` | → production |
| `BFF_EXECUTION_URL` | → execution |
| `BFF_ASSET_URL` | → asset |
| `BFF_DEV_WORKSPACE_ID` | 本地开发用固定 workspace ID |
| `BFF_DEV_ACTOR_ID` | 本地开发用固定用户 ID |

> ⚠️ 生产环境所有密钥必须由 KMS/Secret Manager 注入，禁止用 `.env.local` 的默认值。
