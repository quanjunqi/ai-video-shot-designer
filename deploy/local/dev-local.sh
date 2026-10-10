#!/usr/bin/env bash
# 本地开发：中间件用 Docker（postgres/temporal/kafka/minio/redis/keycloak），
# 应用代码服务全部本地运行（不打包镜像）。
# 用法：bash deploy/local/dev-local.sh    （Ctrl+C 全部停止）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BIN=/tmp/mdp-bin
mkdir -p "$BIN"

# ---- 环境变量（与 deploy/local/.env 一致）----
export POSTGRES_DSN='postgres://shotdesigner:local-postgres-password-2026@127.0.0.1:5432'
export WORKSPACE_INTERNAL_TOKEN=local-workspace-token-2026
export PRODUCTION_INTERNAL_TOKEN=local-internal-token-2026
export ASSET_INTERNAL_TOKEN=local-asset-token-2026
export EXECUTION_INTERNAL_TOKEN=local-execution-token-2026
export WORKSPACE_CRED_KEY=f8f3f6b39e3d71dc0d3021df823feaf1f4bc84427319335ffc4e855bc0c84a60

# ---- 构建（增量）----
echo ">> 构建应用服务二进制..."
(cd "$ROOT/services/workspace"     && go build -o "$BIN/workspace"     ./cmd/server)
(cd "$ROOT/services/production"    && go build -o "$BIN/production"    ./cmd/server)
(cd "$ROOT/services/execution"     && go build -o "$BIN/execution"     ./cmd/server)
(cd "$ROOT/services/asset"         && go build -o "$BIN/asset"         ./cmd/server)
(cd "$ROOT/services/outbox-relay"  && go build -o "$BIN/outbox-relay"  .)
(cd "$ROOT/services/web-bff"       && go build -o "$BIN/bff"           ./cmd/server)

# ---- 启动（& 并行；Ctrl+C 统一清理）----
echo ">> 启动本地服务..."
WORKSPACE_DATABASE_URL="$POSTGRES_DSN/workspace?sslmode=disable" \
WORKSPACE_INTERNAL_TOKEN="$WORKSPACE_INTERNAL_TOKEN" \
WORKSPACE_CRED_KEY="$WORKSPACE_CRED_KEY" \
WORKSPACE_LISTEN_ADDR=0.0.0.0:18082 \
"$BIN/workspace" &
P1=$!

PRODUCTION_DATABASE_URL="$POSTGRES_DSN/production?sslmode=disable" \
PRODUCTION_INTERNAL_TOKEN="$PRODUCTION_INTERNAL_TOKEN" \
PRODUCTION_LISTEN_ADDR=0.0.0.0:18081 \
"$BIN/production" &
P2=$!

EXECUTION_DATABASE_URL="$POSTGRES_DSN/execution?sslmode=disable" \
EXECUTION_INTERNAL_TOKEN="$EXECUTION_INTERNAL_TOKEN" \
EXECUTION_PRODUCTION_URL=http://127.0.0.1:18081 \
PRODUCTION_INTERNAL_TOKEN="$PRODUCTION_INTERNAL_TOKEN" \
EXECUTION_WORKSPACE_URL=http://127.0.0.1:18082 \
WORKSPACE_INTERNAL_TOKEN="$WORKSPACE_INTERNAL_TOKEN" \
EXECUTION_LISTEN_ADDR=0.0.0.0:8085 \
"$BIN/execution" &
P3=$!

ASSET_DATABASE_URL="$POSTGRES_DSN/asset?sslmode=disable" \
ASSET_INTERNAL_TOKEN="$ASSET_INTERNAL_TOKEN" \
ASSET_S3_ENDPOINT=127.0.0.1:9000 \
ASSET_S3_BUCKET=assets \
ASSET_S3_ACCESS_KEY=localminio \
ASSET_S3_SECRET_KEY=local-minio-password-2026 \
ASSET_LISTEN_ADDR=0.0.0.0:18084 \
"$BIN/asset" &
P4=$!

OUTBOX_DATABASE_URL="$POSTGRES_DSN/production?sslmode=disable" \
OUTBOX_EXECUTION_URL=http://127.0.0.1:8085 \
OUTBOX_EXECUTION_TOKEN="$EXECUTION_INTERNAL_TOKEN" \
OUTBOX_BATCH_SIZE=20 OUTBOX_LEASE_SECONDS=60 OUTBOX_MAX_ATTEMPTS=20 OUTBOX_POLL_SECONDS=2 \
"$BIN/outbox-relay" &
P5=$!

BFF_WORKSPACE_URL=http://127.0.0.1:18082 \
BFF_PRODUCTION_URL=http://127.0.0.1:18081 \
BFF_EXECUTION_URL=http://127.0.0.1:8085 \
WORKSPACE_INTERNAL_TOKEN="$WORKSPACE_INTERNAL_TOKEN" \
PRODUCTION_INTERNAL_TOKEN="$PRODUCTION_INTERNAL_TOKEN" \
ASSET_INTERNAL_TOKEN="$ASSET_INTERNAL_TOKEN" \
EXECUTION_INTERNAL_TOKEN="$EXECUTION_INTERNAL_TOKEN" \
BFF_DEV_WORKSPACE_ID=ws_dev \
BFF_DEV_ACTOR_ID=user_dev \
"$BIN/bff" &
P6=$!

echo ">> 已启动: workspace(18082) production(18081) execution(8085) asset(18084) outbox-relay bff(8080)"
echo ">> Ctrl+C 停止全部"
trap 'kill $P1 $P2 $P3 $P4 $P5 $P6 2>/dev/null' INT TERM
wait
