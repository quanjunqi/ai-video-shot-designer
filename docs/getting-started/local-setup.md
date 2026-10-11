# 本地环境搭建

> 从零跑起来这个项目需要什么。

## 前置依赖

| 工具 | 版本 | 用途 |
|---|---|---|
| Node.js | 20+ | 前端构建 |
| Go | 1.22+ | 后端编译 |
| Docker | 最新 | 本地基础设施（PostgreSQL/Redis/MinIO） |
| git | 最新 | 版本控制 |

## 第一步：克隆仓库

```bash
git clone https://github.com/quanjunqi/ai-video-shot-designer.git
cd ai-video-shot-designer
```

## 第二步：配置环境变量

```bash
cp .env.example .env.local
# 按需修改 .env.local（一般不需要改，默认值够本地开发）
```

## 第三步：启动本地基础设施

```bash
set -a && . ./.env.local && set +a
docker compose --env-file deploy/local/.env -f deploy/local/compose.yaml --profile app up -d
```

这会启动：PostgreSQL、Redis、MinIO。

## 第四步：装前端依赖

```bash
cd apps/web
npm ci
```

## 第五步：跑迁移

```bash
docker compose --env-file deploy/local/.env -f deploy/local/compose.yaml \
  --profile app up production-migrate
```

## 第六步：启动服务

前端（开发模式，热更新）：
```bash
cd apps/web && npm run dev
# → http://localhost:5173
```

后端（各服务独立终端）：
```bash
# 编译所有服务
cd services/workspace &&   go build -o /tmp/mdp-bin/workspace   ./cmd/server
cd services/production &&  go build -o /tmp/mdp-bin/production  ./cmd/server
cd services/execution &&    go build -o /tmp/mdp-bin/execution    ./cmd/server
cd services/asset &&        go build -o /tmp/mdp-bin/asset        ./cmd/server
cd services/web-bff &&      go build -o /tmp/mdp-bin/bff          ./cmd/server

# 每个终端先注入环境变量，再启动
set -a && . ./.env.local && set +a
/tmp/mdp-bin/workspace    # 18082
/tmp/mdp-bin/production   # 18081
/tmp/mdp-bin/execution    # 8085
/tmp/mdp-bin/asset        # 18084
/tmp/mdp-bin/bff          # 8080
```

## 验证

打开 http://localhost:5173，能看到首页就成功了。

健康检查：
```bash
curl http://localhost:8080/healthz
curl http://localhost:8085/healthz
```

## 常见问题

| 问题 | 解决 |
|---|---|
| 端口被占 | 改 `.env.local` 里的 `WEB_PORT` / `POSTGRES_PORT` |
| `npm ci` 失败 | 确认 Node 版本 20+ |
| `go build` 失败 | 确认 Go 版本 1.22+ |
| 数据库连不上 | 确认 docker compose 已启动、迁移已跑 |
