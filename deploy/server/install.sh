#!/usr/bin/env bash
# =============================================================================
# Shotdesigner 服务器初始化（一次性）
#
# 做四件事：
#   1. 建 /opt/shotdesigner 目录骨架（releases / logs）并校验 /etc/shotdesigner/env
#   2. 安装 systemd 模板单元 shotdesigner@.service 并 enable（重启/开机自启）
#   3. 停掉历史的 nohup 裸进程（start-bin.sh 拉起的那些）
#   4. 首次部署，并把 nginx 静态根指到 current/web（失败自动还原）
#
# 用法：
#   sudo bash deploy/server/install.sh              # 完整初始化
#   sudo bash deploy/server/install.sh --no-deploy  # 只装 systemd，不部署
#   sudo bash deploy/server/install.sh --no-nginx   # 不改 nginx 静态根
#
# 重复执行安全（幂等）。
# =============================================================================
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_HOME="${APP_HOME:-/opt/shotdesigner}"
SRC_DIR="${SRC_DIR:-/root/ai-video-shot-designer}"
ENV_DIR="${ENV_DIR:-/etc/shotdesigner}"
ENV_FILE="$ENV_DIR/env"
UNIT_DIR="${UNIT_DIR:-/etc/systemd/system}"
HTML_ROOT="${HTML_ROOT:-/usr/share/nginx/html}"
WEB_LINK_TARGET="$APP_HOME/current/web"
DEPLOY_BIN="${DEPLOY_BIN:-/usr/local/bin/shotdesigner-deploy}"
SERVICES="workspace production asset execution outbox-relay web-bff"

DO_DEPLOY=1
DO_NGINX=1
for arg in "$@"; do
  case "$arg" in
    --no-deploy) DO_DEPLOY=0 ;;
    --no-nginx)  DO_NGINX=0 ;;
    -h|--help)   sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "未知参数: $arg" >&2; exit 2 ;;
  esac
done

C_OK=$'\033[32m'; C_ERR=$'\033[31m'; C_DIM=$'\033[2m'; C_END=$'\033[0m'
if [ ! -t 1 ]; then C_OK=''; C_ERR=''; C_DIM=''; C_END=''; fi
ok()   { printf '%s✅ %s%s\n' "$C_OK" "$*" "$C_END"; }
step() { printf '\n%s▶ %s%s\n' "$C_DIM" "$*" "$C_END"; }
die()  { printf '%s❌ %s%s\n' "$C_ERR" "$*" "$C_END" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "请用 root 运行"
[ -d "$SRC_DIR/.git" ] || die "源码目录不是 git 仓库: $SRC_DIR"

# --- 1. 目录骨架 ----------------------------------------------------------
step "目录与权限"
install -d -m 0755 "$APP_HOME" "$APP_HOME/releases" "$APP_HOME/logs"
install -d -m 0700 "$ENV_DIR"
ok "$APP_HOME 就绪"

if [ ! -f "$ENV_FILE" ]; then
  cat <<EOF
${C_ERR}缺少 ${ENV_FILE}（生产环境变量 / 密钥）${C_END}

先生成它（参考 deploy/server/env.example，至少填 4 个数据库 URL、
4 个内部令牌、WORKSPACE_CRED_KEY、MinIO 访问密钥）：

  install -d -m 0700 $ENV_DIR
  install -m 0600 $SRC_DIR/deploy/server/env.example $ENV_FILE
  vi $ENV_FILE && chmod 600 $ENV_FILE

然后重新运行本脚本。
EOF
  exit 1
fi
chmod 600 "$ENV_FILE"
ok "环境变量文件存在且权限 0600"

# --- 2. systemd ------------------------------------------------------------
step "安装 systemd 单元"
install -m 0644 "$SCRIPT_DIR/systemd/shotdesigner@.service" "$UNIT_DIR/shotdesigner@.service"
# 单元留一份在 ${APP_HOME}，供后续 deploy.sh 在任何工作副本状态下同步
install -d -m 0755 "$APP_HOME/systemd"
install -m 0644 "$SCRIPT_DIR/systemd/shotdesigner@.service" "$APP_HOME/systemd/shotdesigner@.service"
# 部署入口装到稳定路径：git 工作副本被 reset/clean 也不影响下次部署
install -m 0755 "$SCRIPT_DIR/deploy.sh" "$DEPLOY_BIN"
systemctl daemon-reload
for svc in $SERVICES; do
  systemctl enable "shotdesigner@$svc.service" >/dev/null 2>&1
done
ok "shotdesigner@{${SERVICES// /,}} 已 enable（开机自启）"
ok "部署入口: $DEPLOY_BIN"

# --- 3. 历史前端 dev server ----------------------------------------------
# 历史 nohup 后端进程不在这里停：deploy.sh 会在切换到 systemd 前最后时刻停掉，
# 这样构建期间旧版本还能继续对外服务，停机窗口只有几秒。
step "清理历史 vite dev server"
if pgrep -f "node_modules/vite/bin/vite.js" >/dev/null 2>&1; then
  pkill -f "node_modules/vite/bin/vite.js" || true
  ok "已停止历史 vite dev server"
else
  ok "无历史 vite dev server"
fi

# --- 4. 首次部署 ----------------------------------------------------------
if [ "$DO_DEPLOY" -eq 1 ]; then
  step "首次部署"
  bash "$DEPLOY_BIN" origin/develop
else
  ok "--no-deploy：跳过部署"
fi

# --- 5. nginx 静态根指向 release 产物 ------------------------------------
if [ "$DO_NGINX" -eq 1 ]; then
  step "切换 nginx 静态根"
  if [ ! -d "$APP_HOME/current/web" ]; then
    die "缺少 $APP_HOME/current/web（前端未构建？先完成一次部署）"
  fi

  if [ -L "$HTML_ROOT" ] && [ "$(readlink "$HTML_ROOT")" = "$WEB_LINK_TARGET" ]; then
    ok "静态根已指向 $WEB_LINK_TARGET"
  else
    bak="$HTML_ROOT.bak-$(date +%Y%m%d-%H%M%S)"
    was_link=0
    if [ -L "$HTML_ROOT" ]; then
      old_link="$(readlink "$HTML_ROOT")"
      was_link=1
      rm -f "$HTML_ROOT"
    else
      mv "$HTML_ROOT" "$bak"
    fi
    ln -s "$WEB_LINK_TARGET" "$HTML_ROOT"

    if nginx -t >/dev/null 2>&1 && systemctl reload nginx; then
      sleep 1
      code="$(curl -sk -o /dev/null --max-time 5 -w '%{http_code}' https://127.0.0.1/ -H 'Host: qjqhs.fun' || echo 000)"
      if [ "$code" = "200" ]; then
        ok "静态根 -> ${WEB_LINK_TARGET}（https 200）"
      else
        printf '%s静态根切换后 https 返回 %s，回滚%s\n' "$C_ERR" "$code" "$C_END"
        rm -f "$HTML_ROOT"
        if [ "$was_link" -eq 1 ]; then ln -s "$old_link" "$HTML_ROOT"; else mv "$bak" "$HTML_ROOT"; fi
        systemctl reload nginx || true
        die "nginx 静态根回滚完成，请检查 $HTML_ROOT"
      fi
    else
      rm -f "$HTML_ROOT"
      if [ "$was_link" -eq 1 ]; then ln -s "$old_link" "$HTML_ROOT"; else mv "$bak" "$HTML_ROOT"; fi
      die "nginx -t 失败，已还原静态根"
    fi
  fi
fi

step "完成"
ok "systemctl status shotdesigner@web-bff"
ok "journalctl -u shotdesigner@workspace -f"
ok "部署新版本: $DEPLOY_BIN origin/develop"
