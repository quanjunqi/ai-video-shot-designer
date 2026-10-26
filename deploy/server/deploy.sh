#!/usr/bin/env bash
# =============================================================================
# Shotdesigner 服务器端部署脚本
#
# 用法（在服务器上）：
#   sudo bash /root/ai-video-shot-designer/deploy/server/deploy.sh
#   sudo ... deploy.sh origin/master      # 指定 ref（branch 或 tag）
#   sudo ... deploy.sh --force            # 同一 commit 也强制重建
#   sudo ... deploy.sh --skip-web         # 只重建 6 个 Go 服务
#   sudo ... deploy.sh --dry-run          # 只拉取并打印将部署的 commit
#
# 它做什么：
#   1. git fetch --depth 1 <ref>  → 拿到目标 commit（浅克隆，19MB，几秒）
#   2. reset --hard + clean       → 源码与目标 commit 完全一致
#   3. 构建 6 个 Go 服务 + 前端    → 落到 releases/<UTC>-<短SHA>/
#   4. 原子切换 current 软链       → 新版本整体生效
#   5. systemctl 重启 → 逐项健康检查
#   6. 健康检查失败自动回滚到上一个 release
#
# 设计约束：
#   * 每个 release 目录不可变；回滚 = 把 current 指回去 + 重启，无需重新构建
#   * 前端未变更时复用上一个 release 的产物（硬链接），省内存与时间（本机仅 1.8G）
#   * 部署脚本自身会先快照到 /tmp 再执行，避免 reset --hard 改到正在运行的脚本
# =============================================================================
set -Eeuo pipefail

# --- 自快照 ---------------------------------------------------------------
# 本脚本位于 git 工作副本内，部署过程中会被 git reset --hard 覆盖。
# bash 是边读边执行的，文件被改会读到半截内容，所以先复制到 /tmp 再 exec。
if [ "${SHOTDESIGNER_DEPLOY_SNAPSHOT:-0}" != "1" ]; then
  _snapshot="$(mktemp /tmp/shotdesigner-deploy.XXXXXX.sh)"
  cp "$0" "$_snapshot"
  SHOTDESIGNER_DEPLOY_SNAPSHOT=1 exec bash "$_snapshot" "$@"
fi
trap 'rm -f "$0"' EXIT

# --- 路径与参数 -----------------------------------------------------------
APP_HOME="${APP_HOME:-/opt/shotdesigner}"
SRC_DIR="${SRC_DIR:-/root/ai-video-shot-designer}"
ENV_FILE="${ENV_FILE:-/etc/shotdesigner/env}"
RELEASES="$APP_HOME/releases"
CURRENT="$APP_HOME/current"
UNIT_SRC="$SRC_DIR/deploy/server/systemd"
[ -d "$UNIT_SRC" ] || UNIT_SRC="$APP_HOME/systemd"
UNIT_DIR="${UNIT_DIR:-/etc/systemd/system}"
LOCK_FILE="${LOCK_FILE:-/var/lock/shotdesigner-deploy.lock}"
LOG_FILE="${LOG_FILE:-/var/log/shotdesigner-deploy.log}"
DEPLOY_BIN="${DEPLOY_BIN:-/usr/local/bin/shotdesigner-deploy}"
COMPOSE_FILE="$SRC_DIR/deploy/local/compose.yaml"
COMPOSE_ENV="$SRC_DIR/deploy/local/.env"

SERVICES="workspace production asset execution outbox-relay web-bff"
REF="origin/develop"
FORCE=0
SKIP_WEB=0
DRY_RUN=0
KEEP_RELEASES="${KEEP_RELEASES:-5}"

while [ $# -gt 0 ]; do
  case "$1" in
    --force)    FORCE=1 ;;
    --skip-web) SKIP_WEB=1 ;;
    --dry-run)  DRY_RUN=1 ;;
    -h|--help)
      sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    -*) echo "未知参数: $1" >&2; exit 2 ;;
    *)  REF="$1" ;;
  esac
  shift
done

# --- 输出 ----------------------------------------------------------------
if [ -t 1 ]; then
  C_OK=$'\033[32m'; C_ERR=$'\033[31m'; C_DIM=$'\033[2m'; C_END=$'\033[0m'
else
  C_OK=''; C_ERR=''; C_DIM=''; C_END=''
fi
log()  { printf '%s\n' "$*"; }
ok()   { printf '%s✅ %s%s\n' "$C_OK" "$*" "$C_END"; }
die()  { printf '%s❌ %s%s\n' "$C_ERR" "$*" "$C_END" >&2; exit 1; }
step() { printf '\n%s▶ %s%s\n' "$C_DIM" "$*" "$C_END"; }

exec > >(tee -a "$LOG_FILE") 2>&1

# --- 前置检查 -------------------------------------------------------------
[ "$(id -u)" -eq 0 ] || die "请用 root 运行（systemd 重启需要）"
[ -d "$SRC_DIR/.git" ] || die "源码目录不是 git 仓库: $SRC_DIR"
[ -f "$ENV_FILE" ] || die "缺少环境变量文件 ${ENV_FILE}（由 deploy/server/install.sh 生成）"
for c in git go curl flock systemctl; do
  command -v "$c" >/dev/null || die "缺少命令: $c"
done

mkdir -p "$RELEASES" "$APP_HOME/logs"

# --- 串行化 ---------------------------------------------------------------
exec 9>"$LOCK_FILE"
flock -n 9 || die "已有部署在进行（锁: ${LOCK_FILE}）"

# --- 1. 拉取目标 commit ---------------------------------------------------
branch="${REF#origin/}"
step "拉取 ${branch}"
# 这台机器直连 GitHub 不稳定（间歇性 reset/超时），单次失败不代表代码有问题；
# 重试 3 次，仍然失败就直接退出，绝不带着旧代码往下构建。
fetch_ok=0
for attempt in 1 2 3; do
  if git -C "$SRC_DIR" fetch --depth 1 --no-tags origin "$branch" --quiet 2>/dev/null; then
    fetch_ok=1
    break
  fi
  log "  第 ${attempt} 次拉取失败，$((attempt * 3))s 后重试…"
  sleep $((attempt * 3))
done
[ "$fetch_ok" -eq 1 ] || die "git fetch 连续 3 次失败：${branch}（检查服务器到 github.com 的网络）"
TARGET="$(git -C "$SRC_DIR" rev-parse FETCH_HEAD)"
SHORT="${TARGET:0:7}"

PREV_RELEASE="$(readlink -f "$CURRENT" 2>/dev/null || true)"
PREV_SHA="$(cat "$PREV_RELEASE/SHA" 2>/dev/null || true)"
PREV_WEB_TREE="$(cat "$PREV_RELEASE/WEB_TREE" 2>/dev/null || true)"

log "  目标 commit : $SHORT  ($REF)"
log "  当前 commit : ${PREV_SHA:0:7}${PREV_SHA:+ (${PREV_RELEASE##*/})}"

if [ "$TARGET" = "$PREV_SHA" ] && [ "$FORCE" -eq 0 ]; then
  ok "已经是 ${SHORT}，无需部署（如需重建：--force）"
  printf 'DEPLOYED_SHA=%s\n' "$TARGET"
  exit 0
fi
[ "$DRY_RUN" -eq 1 ] && { ok "dry-run：将部署 ${SHORT}"; printf 'DEPLOYED_SHA=%s\n' "$TARGET"; exit 0; }

# --- 2. 源码对齐目标 commit ----------------------------------------------
step "同步源码到 $SHORT"
# 用本地分支 deployed 承接，避免工作副本显示成 master/develop 造成误解
git -C "$SRC_DIR" checkout -q -f -B deployed "$TARGET"
git -C "$SRC_DIR" clean -fdq          # 只清未跟踪文件，.gitignore（node_modules/logs）保留
ok "工作副本已对齐（本地分支 deployed）"

# --- 3. systemd 单元随仓库同步 -------------------------------------------
if [ -d "$UNIT_SRC" ]; then
  changed=0
  for unit in "$UNIT_SRC"/*.service; do
    [ -e "$unit" ] || continue
    dest="$UNIT_DIR/$(basename "$unit")"
    if ! cmp -s "$unit" "$dest"; then
      install -m 0644 "$unit" "$dest"
      changed=1
    fi
  done
  if [ "$changed" -eq 1 ]; then
    systemctl daemon-reload
    ok "systemd 单元已更新并 daemon-reload"
  fi
fi

# --- 4. 构建 --------------------------------------------------------------
RID="$(date -u +%Y%m%d-%H%M%S)-$SHORT"
NEW="$RELEASES/$RID"
mkdir -p "$NEW/bin"
WEB_TREE="$(git -C "$SRC_DIR" rev-parse "$TARGET:apps/web" 2>/dev/null || echo "")"
LOCK_TREE="$(git -C "$SRC_DIR" rev-parse "$TARGET:apps/web/package-lock.json" 2>/dev/null || echo "")"
printf '%s\n' "$TARGET"   > "$NEW/SHA"
printf '%s\n' "$WEB_TREE" > "$NEW/WEB_TREE"
printf '%s\n' "$LOCK_TREE" > "$NEW/LOCK_TREE"

export PATH="$PATH:/usr/local/go/bin"
export GOFLAGS="${GOFLAGS:-} -mod=mod"

step "构建后端（6 个服务）"
build_start=$(date +%s)
for svc in $SERVICES; do
  printf '  %-14s ... ' "$svc"
  if ( cd "$SRC_DIR/services/$svc" && CGO_ENABLED=0 go build -trimpath -buildvcs=false \
         -ldflags '-s -w' -o "$NEW/bin/$svc" ./cmd/server ) 2>"$NEW/build-$svc.log"; then
    echo "ok"
  else
    echo "FAILED"; tail -20 "$NEW/build-$svc.log" >&2
    die "构建失败：${svc}（日志 $NEW/build-$svc.log）"
  fi
done
ok "后端构建完成（$(( $(date +%s) - build_start ))s）"

# --- 5. 前端 --------------------------------------------------------------
step "前端构建"
if [ "$SKIP_WEB" -eq 1 ]; then
  log "  --skip-web：跳过前端，沿用上一个 release"
  [ -n "$PREV_RELEASE" ] && [ -d "$PREV_RELEASE/web" ] \
    && cp -al "$PREV_RELEASE/web" "$NEW/web" \
    || die "--skip-web 需要存在上一个 release 的前端产物"
elif [ -n "$PREV_RELEASE" ] && [ -d "$PREV_RELEASE/web" ] \
     && [ -n "$WEB_TREE" ] && [ "$WEB_TREE" = "$PREV_WEB_TREE" ]; then
  log "  apps/web 未变更（tree ${WEB_TREE:0:7}），复用上一个构建"
  cp -al "$PREV_RELEASE/web" "$NEW/web"
else
  web_start=$(date +%s)
  cd "$SRC_DIR/apps/web"
  if [ ! -d node_modules ] || { [ -n "$LOCK_TREE" ] && [ "$LOCK_TREE" != "$(cat "$PREV_RELEASE/LOCK_TREE" 2>/dev/null)" ]; }; then
    log "  安装依赖（npm ci）…"
    npm ci --no-audit --no-fund --loglevel=error || die "npm ci 失败"
  fi
  log "  构建中（vite）…"
  NODE_OPTIONS="--max-old-space-size=${WEB_MAX_OLD_SPACE:-1536}" \
    npm run build --silent > "$NEW/build-web.log" 2>&1 \
    || { tail -30 "$NEW/build-web.log" >&2; die "前端构建失败（日志 $NEW/build-web.log）"; }
  # 妙搭产物协议（apps/web/vite.config.ts 的 miaodaOutputPlugin）：
  #   dist/output/          index.html + public 资源 + routes.json → 同源根
  #   dist/output_resource/ assets/ JS+CSS                          → 同源 /assets
  # nginx 只有一个静态根，所以两者合成到 release 的 web/ 下
  dist="$SRC_DIR/apps/web/dist"
  [ -d "$dist/output" ] || die "前端产物缺失: $dist/output"
  [ -d "$dist/output_resource/assets" ] || die "前端产物缺失: $dist/output_resource/assets"
  mkdir -p "$NEW/web/assets"
  cp -a "$dist/output/." "$NEW/web/"
  cp -a "$dist/output_resource/assets/." "$NEW/web/assets/"
  ok "前端构建完成（$(( $(date +%s) - web_start ))s）"
fi

# --- 6. 确保中间件在跑 ----------------------------------------------------
step "检查中间件"
if ! curl -sf -o /dev/null --max-time 2 http://127.0.0.1:9000/minio/health/live; then
  log "  minio 未就绪，尝试启动…"
  docker compose --env-file "$COMPOSE_ENV" -f "$COMPOSE_FILE" --profile platform up -d minio >/dev/null 2>&1 || true
  for _ in $(seq 1 15); do
    curl -sf -o /dev/null --max-time 2 http://127.0.0.1:9000/minio/health/live && break
    sleep 1
  done
fi
curl -sf -o /dev/null --max-time 2 http://127.0.0.1:9000/minio/health/live \
  && ok "minio 就绪" || log "  ⚠️  minio 仍未就绪，asset 健康检查可能失败"

# --- 7. 切换 + 重启 -------------------------------------------------------
step "切换到 $RID"
# 兼容历史 nohup 部署：systemd 首次接管时裸进程还占着端口，必须最后时刻再停
if pgrep -f "$SRC_DIR/bin/" >/dev/null 2>&1; then
  log "  停止历史 nohup 进程（释放端口）…"
  pkill -f "$SRC_DIR/bin/" || true
  sleep 2
fi
ln -sfn "$NEW" "$CURRENT.tmp" && mv -T "$CURRENT.tmp" "$CURRENT"
ok "current -> $RID"

restart_all() {
  systemctl restart shotdesigner@workspace shotdesigner@production shotdesigner@asset \
                    shotdesigner@execution shotdesigner@outbox-relay
  systemctl restart shotdesigner@web-bff
}
restart_all

# --- 8. 健康检查 ----------------------------------------------------------
wait_http() {
  local name="$1" url="$2" code="000"
  for _ in $(seq 1 30); do
    code="$(curl -s -o /dev/null --max-time 2 -w '%{http_code}' "$url" 2>/dev/null || echo 000)"
    case "$code" in 200|204) printf '  %-14s %s\n' "$name" "$code"; return 0 ;; esac
    sleep 1
  done
  printf '  %-14s %s\n' "$name" "$code"
  return 1
}

step "健康检查"
health_ok=1
wait_http workspace  http://127.0.0.1:8082/ready || health_ok=0
wait_http production http://127.0.0.1:8081/ready || health_ok=0
wait_http execution  http://127.0.0.1:8085/ready || health_ok=0
wait_http asset      http://127.0.0.1:8084/ready || health_ok=0
wait_http web-bff    http://127.0.0.1:8080/ready || health_ok=0

sleep 2
for svc in outbox-relay; do
  if systemctl is-active --quiet "shotdesigner@$svc"; then
    printf '  %-14s running\n' "$svc"
  else
    printf '  %-14s DEAD\n' "$svc"; health_ok=0
  fi
done

if [ "$health_ok" -ne 1 ]; then
  printf '%s健康检查失败，开始回滚…%s\n' "$C_ERR" "$C_END"
  for svc in $SERVICES; do
    journalctl -u "shotdesigner@$svc" -n 8 --no-pager 2>/dev/null | sed 's/^/    /' || true
  done
  if [ -n "$PREV_RELEASE" ] && [ -d "$PREV_RELEASE" ]; then
    ln -sfn "$PREV_RELEASE" "$CURRENT.tmp" && mv -T "$CURRENT.tmp" "$CURRENT"
    restart_all
    ok "已回滚到 ${PREV_RELEASE##*/}（${PREV_RELEASE}）"
  else
    printf '%s无上一个 release 可回滚；新版本 $RID 保留待排查%s\n' "$C_ERR" "$C_END"
  fi
  exit 1
fi

# --- 9. 收尾 --------------------------------------------------------------
sleep 1
printf '%s\n' "$RID" > "$APP_HOME/CURRENT_RELEASE"

# 清理旧 release（保留最近 N 个；绝不动 current）
cur_real="$(readlink -f "$CURRENT")"
ls -1dt "$RELEASES"/*/ 2>/dev/null | tail -n "+$((KEEP_RELEASES + 1))" | while read -r old; do
  [ "$(readlink -f "$old")" = "$cur_real" ] && continue
  rm -rf "$old"
done

ok "部署完成：$SHORT   release=$RID   耗时=$(( $(date +%s) - build_start ))s"
printf 'DEPLOYED_SHA=%s\n' "$TARGET"

# 部署脚本自更新：仓库里有新版本就装到稳定路径，下一次部署生效
if [ -f "$SRC_DIR/deploy/server/deploy.sh" ] && ! cmp -s "$SRC_DIR/deploy/server/deploy.sh" "$DEPLOY_BIN"; then
  install -m 0755 "$SRC_DIR/deploy/server/deploy.sh" "$DEPLOY_BIN"
  log "  ℹ️  部署脚本已更新到 ${DEPLOY_BIN}（下次部署生效）"
fi

log "  前端入口: https://qjqhs.fun  （静态根 -> $CURRENT/web）"
log "  日志:     journalctl -u shotdesigner@workspace -f"
