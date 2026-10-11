# 端口参考

## 应用服务（本机直接跑二进制）

| 服务 | 端口 | 说明 |
|---|---|---|
| web-bff | 8080 | 前端唯一入口 |
| production | 18081 | 项目/剧集/分镜/模型目录 |
| workspace | 18082 | 租户/成员/授权/凭据 |
| asset | 18084 | 资产上传 |
| execution | 8085 | Job 调度/模型网关 |
| 前端 dev server | 5173 | Vite 开发模式 |

## 基础设施（Docker Compose）

| 服务 | 端口 | 说明 |
|---|---|---|
| PostgreSQL | 5432 | 分库：workspace/production/execution/asset |
| Redis | 6379 | 缓存 |
| MinIO API | 9000 | S3 兼容存储 |
| MinIO Console | 9001 | MinIO 管理界面 |
| Temporal | 7233 | 工作流引擎 |
| Temporal UI | 8233 | Temporal 管理界面 |
| Keycloak | 8083 | 身份认证（生产用） |

> 📝 Docker Compose 模式下服务在容器内监听 8081/8082 等端口，
> 通过 compose 映射到宿主机。本机直接跑二进制时用上表端口。
> 详见 `docs/architecture/05-deployment.md`。
