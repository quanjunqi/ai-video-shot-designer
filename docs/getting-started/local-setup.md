# 本地环境搭建

从零把项目跑起来需要 10 分钟。

## 前置要求

| 工具 | 版本 |
|---|---|
| Node.js | 22.6+ |
| Go | 1.22+ |
| Docker | 最新版 |
| git | 最新版 |

## 第一步：克隆

```bash
git clone https://github.com/quanjunqi/ai-video-shot-designer.git
cd ai-video-shot-designer
```

## 第二步：配置环境变量

```bash
cp .env.example .env.local
```

默认值够本地开发用，一般不需要改。

## 第三步：启动数据库和中间件

```bash
set -a && . ./.env.local && set +a

docker compose --env-file deploy/local/.env \
  -f deploy/local/compose.yaml \
  --profile app up -d
```

这会启动 PostgreSQL、Redis、MinIO。

## 第四步：跑数据库迁移

```bash
docker compose --env-file deploy/local/.env \
  -f deploy/local/compose.yaml \
  --profile app up production-migrate
```

## 第五步：装前端依赖

```bash
cd apps/web
npm ci
```

## 第六步：启动前端开发服务器

```bash
npm run dev
```

打开 http://localhost:5173，看到首页就成功了。

## （可选）启动后端服务

后端服务需要单独编译启动。每个服务开一个终端：

```bash
# 编译所有服务
cd services/workspace   && go build -o /tmp/mdp-bin/workspace   ./cmd/server
cd services/production  && go build -o /tmp/mdp-bin/production  ./cmd/server
cd services/execution   && go build -o /tmp/mdp-bin/execution    ./cmd/server
cd services/asset       && go build -o /tmp/mdp-bin/asset       ./cmd/server
cd services/web-bff     && go build -o /tmp/mdp-bin/bff          ./cmd/server

# 每个终端先注入环境变量，再启动
set -a && . ./.env.local && set +a
/tmp/mdp-bin/workspace    # 端口 18082
/tmp/mdp-bin/production   # 端口 18081
/tmp/mdp-bin/execution    # 端口 8085
/tmp/mdp-bin/asset        # 端口 18084
/tmp/mdp-bin/bff          # 端口 8080
```

## 验证

前端：http://localhost:5173

后端健康检查：
```bash
curl http://localhost:8080/healthz
```

## 常见问题

| 问题 | 解决 |
|---|---|
| 端口被占 | 改 `.env.local` 里的 `WEB_PORT` 或 `POSTGRES_PORT` |
| `npm ci` 失败 | 确认 Node 版本是 22.6+ |
| `go build` 失败 | 确认 Go 版本是 1.22+ |
| 数据库连不上 | 确认 Docker 容器已启动、迁移已跑 |
