# 环境参考

本机运行所需的全部环境变量与端口。权威变量清单见根目录 `.env.example`。

## 端口

### 应用服务

| 服务 | 端口 |
|---|---|
| web-bff | 8080 |
| production | 18081 |
| workspace | 18082 |
| asset | 18084 |
| execution | 8085 |
| 前端 dev server | 5173 |

### 基础设施（Docker）

| 服务 | 端口 |
|---|---|
| PostgreSQL | 5432 |
| Redis | 6379 |
| MinIO API | 9000 |
| MinIO Console | 9001 |
| Temporal | 7233 |
| Temporal UI | 8233 |
| Keycloak | 8083 |

## 前端构建开关

| 变量 | 取值 | 作用 |
|---|---|---|
| `VITE_ENABLE_UI_KIT` | 空（默认）/ `1` | 非开发环境是否注册组件库展示页 `/dev/ui-kit`。开发环境（`npm run dev`）恒可用；开启后该页与 55 个组件 demo 会进入构建产物，建议只在预览/内网环境开启 |

> 组件与设计 token 清单的权威文档：`docs/reference/ui-components.md`（生成物，人看）与
> `.agents/skills/frontend-coding/ui-components.md`（生成物，agent 看）；改组件后跑 `npm run ui:generate`。

## 环境变量（按服务分组）

### 基础设施

| 变量 | 默认值 | 说明 |
|---|---|---|
| `POSTGRES_PORT` | 5432 | PostgreSQL |
| `REDIS_PORT` | 6379 | Redis |

### workspace（18082）

| 变量 | 说明 |
|---|---|
| `WORKSPACE_DATABASE_URL` | 数据库连接串 |
| `WORKSPACE_LISTEN_ADDR` | 监听地址 |
| `WORKSPACE_CRED_KEY` | 渠道凭据加密密钥（32 字节） |

### production（18081）

| 变量 | 说明 |
|---|---|
| `PRODUCTION_DATABASE_URL` | 数据库连接串 |
| `PRODUCTION_LISTEN_ADDR` | 监听地址 |
| `PRODUCTION_WORKSPACE_URL` | workspace 服务地址 |

### execution（8085）

| 变量 | 默认值 | 说明 |
|---|---|---|
| `EXECUTION_DATABASE_URL` | — | 数据库连接串 |
| `EXECUTION_LISTEN_ADDR` | — | 监听地址 |
| `EXECUTION_MAX_CONCURRENT_JOBS` | 8 | Worker 并发上限 |
| `EXECUTION_ALLOW_PRIVATE_UPSTREAM` | 0 | 允许访问本地 ComfyUI 时设 1 |
| `ASSET_BASE_URL` | — | 产物落盘（TASK-ASSET-001）：asset 服务地址；留空 = 不落盘 |
| `ASSET_INTERNAL_TOKEN` | — | 产物落盘：asset 内部认证 token（与 `ASSET_BASE_URL` 同时配置） |

### asset（18084）

| 变量 | 默认值 | 说明 |
|---|---|---|
| `ASSET_DATABASE_URL` | — | 数据库连接串 |
| `ASSET_MAX_BYTES` | 100MB | 上传体积上限 |
| `ASSET_S3_ENDPOINT` | 127.0.0.1:9000 | MinIO 地址 |

### web-bff（8080）

| 变量 | 说明 |
|---|---|
| `BFF_LISTEN_ADDR` | 监听地址 |
| `BFF_WORKSPACE_URL` | → workspace |
| `BFF_PRODUCTION_URL` | → production |
| `BFF_EXECUTION_URL` | → execution |
| `BFF_ASSET_URL` | → asset |

> 生产环境所有密钥必须用 KMS 注入，不要用默认值。
