#!/usr/bin/env bash
# 一次性验证栈（scratch stack）——把"临时库 + 第二个实例"的验证方法固定下来。
#
# 为什么需要它（依据：本项目的真实验证历史）
#   ④ 审计能力的机器级判据（worker 终态写回、重试终态、异步 token、保留期清理、
#   身份不可变触发器…）都必须在【与仓库迁移一致的库】上跑 —— 而开发库缺少迁移
#   （`execution worker list running: ERROR: column "result_payload" does not exist`），
#   于是这些判据一度只能靠"临时手工搭一次"得到，**不可复现**。
#   本脚本把那套动作固定下来：**结论可以被重新跑出来，而不是只被人说过**。
#
# 用法：
#   scripts/scratch-stack.sh up [service] [port]   建库（跑该服务的全部迁移）+ 起实例
#   scripts/scratch-stack.sh sql "<SQL>" [dbname]  在临时库上执行 SQL
#   scripts/scratch-stack.sh status                打印实例与库的状态
#   scripts/scratch-stack.sh down                  停实例 + 删临时库（幂等）
#
# 环境变量（一般不用改）：
#   SCRATCH_DB     临时库名，默认 execution_verify
#   SCRATCH_PORT   实例端口，默认 8095
#   PG_CONTAINER   PostgreSQL 容器名（默认 shotdesigner-postgres-1）
#                  ★ 设为【空字符串】即切到"直连模式"：用 psql 客户端连
#                    EXECUTION_DATABASE_URL 所指的服务器（CI 用的是 Postgres service，
#                    没有 docker 容器）。两种模式共用同一个 SCRATCH_DB 命名与安全断言。
#   PG_USER        直连/docker 两模式下的数据库用户，默认 shotdesigner
#   PG_USER        PostgreSQL 用户，默认 shotdesigner
#   SCRATCH_SKIP_ENV_LOCAL  设为 1 则【不读 .env.local】—— 用于复现 CI 的条件：
#                           CI 里没有 .env.local，很多配置不会被隐式补齐
#                           （本项目真实教训：本地因 .env.local 把执行引擎配齐，
#                            于是"引擎两侧配置缺失"这类问题在本地永远看不出来）
#   SCRATCH_ENV_FILE  额外环境变量文件（KEY=VALUE 每行一条），启动实例前 source
#                     例：把 EXECUTION_PRODUCTION_URL 指向死地址以迫使 failOrRetry；
#                         或开启 EXECUTION_AUDIT_RETENTION_DAYS 以验证清理器
#
# ★★ 安全约束（硬断言，不是注释里的提醒）★★
#   本脚本只允许操作 SCRATCH_DB。若它与真实库同名（execution/workspace/production/asset），
#   或 down 要删的库不是 SCRATCH_DB，脚本**直接拒绝执行**。
#   理由：验证不该有"顺手把开发库删了"的可能。
set -uo pipefail

# ★ 构建必须用【本脚本所在的树】。原来取 `git worktree list` 的【第一项】（主 checkout），
#   于是在某个 worktree 里跑它，编译出来的却是【别人树里的代码】—— 而且**静默**：
#   本项目真实踩到：在 worktree 里核对新接口的 wire 格式，返回的却是 develop 的旧结构，
#   差点据此得出"改动没生效"的错误结论。
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# 主 checkout 单独保留：worktree 常常没有 .env.local，需要回退到它。
MAIN_ROOT="$(git worktree list --porcelain | awk '/^worktree /{print $2; exit}')"
cd "$ROOT" || exit 2

# .env.local 解析：显式指定 → 本树 → 主 checkout（与 preflight.sh 同一套回退规则）
ENV_FILE="${SCRATCH_ENV_FILE:-}"
if [ -z "$ENV_FILE" ]; then
  if [ -f "$ROOT/.env.local" ]; then ENV_FILE="$ROOT/.env.local"
  elif [ -n "$MAIN_ROOT" ] && [ -f "$MAIN_ROOT/.env.local" ]; then ENV_FILE="$MAIN_ROOT/.env.local"; fi
fi

SCRATCH_DB="${SCRATCH_DB:-execution_verify}"
SCRATCH_PORT="${SCRATCH_PORT:-8095}"
# ★ 用 ${VAR-默认} 而不是 ${VAR:-默认}：后者会把"已显式设为空字符串"也当成未设置，
#   于是 CI 里的 `PG_CONTAINER: ''` 会静默退回 docker 模式（本片真实踩到，
#   而且它伪装成了一次"直连模式 11/11 通过"的假绿）。
PG_CONTAINER="${PG_CONTAINER-shotdesigner-postgres-1}"
PG_USER="${PG_USER:-shotdesigner}"
REAL_DBS="execution workspace production asset"
BIN_DIR="${BIN_DIR:-/tmp/mdp-scratch-bin}"
LOG="${LOG:-/tmp/scratch-stack.log}"

die() { echo "❌ $*" >&2; exit 1; }
# psql_：两种模式（判据：PG_CONTAINER 是否为空）
#   docker：本地默认，连 compose 起的容器
#   直连  ：CI 用（Postgres service），连接参数从 EXECUTION_DATABASE_URL 推导
psql_() {
  if [ -n "$PG_CONTAINER" ]; then
    docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" "$@"
  else
    local dsn="${EXECUTION_DATABASE_URL:-}"
    [ -n "$dsn" ] || die "直连模式（PG_CONTAINER 为空）需要 EXECUTION_DATABASE_URL"
    # ★ 必须用 export（单行）：此前写成多行 `VAR=... \` 的行续接，
    #   实际执行时四个变量成了【独立赋值】、没有传给 psql ⇒ psql 去连本地 unix socket、
    #   以 OS 用户身份认证 ⇒ `FATAL: role "root" does not exist`。
    #   Bash 的行续接对"末尾空格"极敏感，这类写法在这里不值得冒险。
    export PGUSER="${PGUSER:-$(printf '%s' "$dsn" | sed -E 's#^postgres://([^:]+):.*#\1#')}"
    export PGPASSWORD="${PGPASSWORD:-$(printf '%s' "$dsn" | sed -E 's#^postgres://[^:]+:([^@]+)@.*#\1#')}"
    export PGHOST="${PGHOST:-$(printf '%s' "$dsn" | sed -E 's#^postgres://[^@]+@([^:/]+).*#\1#')}"
    export PGPORT="${PGPORT:-$(printf '%s' "$dsn" | sed -E 's#^postgres://[^@]+@[^:]+:([0-9]+).*#\1#')}"
    psql "$@"
  fi
}

assert_scratch_name() {
  for real in $REAL_DBS; do
    [ "$SCRATCH_DB" = "$real" ] && die "SCRATCH_DB=$SCRATCH_DB 与真实库同名 —— 拒绝操作（本脚本只碰一次性库）"
  done
  case "$SCRATCH_DB" in
    *_verify) : ;;
    *) die "SCRATCH_DB=$SCRATCH_DB 不以 _verify 结尾 —— 拒绝操作（命名约定即安全边界）" ;;
  esac
}

dsn_for_scratch() {
  # 环境变量优先，其次 .env.local（本地约定）—— CI 里没有 .env.local。
  local saved="${EXECUTION_DATABASE_URL:-}"
  if [ "${SCRATCH_SKIP_ENV_LOCAL:-0}" != "1" ]; then
    set -a; . "$ENV_FILE" 2>/dev/null; set +a
  fi
  if [ -n "$saved" ]; then EXECUTION_DATABASE_URL="$saved"; fi
  [ -n "${EXECUTION_DATABASE_URL:-}" ] || die "EXECUTION_DATABASE_URL 未设置（导出它，或准备 .env.local）"
  # 只替换【库名】，其余（用户/口令/主机/参数）沿用真实配置
  # —— 手拼 DSN 会错（本项目已发生过 SASL 认证失败）。
  # 用"按最后一个 / 切分"而不是正则匹配 /execution：CI 的 service 库名是 postgres，
  # 将来也可能换名；正则匹配一旦不中，就会静默连到错误的库（比报错更危险）。
  local base="$EXECUTION_DATABASE_URL" qs=""
  case "$base" in *\?*) qs="?${base#*\?}"; base="${base%%\?*}" ;; esac
  printf '%s/%s%s' "${base%/*}" "$SCRATCH_DB" "$qs"
}

cmd_up() {
  assert_scratch_name
  local service="${1:-execution}" port="${2:-$SCRATCH_PORT}"
  [ -d "services/$service/migrations" ] || die "services/$service/migrations 不存在"

  if [ -n "$PG_CONTAINER" ]; then
    echo "── 模式：docker（容器 ${PG_CONTAINER}）· 建库 $SCRATCH_DB ──"
  else
    echo "── 模式：直连 psql（PG_CONTAINER 为空）· 建库 $SCRATCH_DB ──"
  fi
  psql_ -d postgres -q -c "DROP DATABASE IF EXISTS $SCRATCH_DB;" || die "drop 失败"
  psql_ -d postgres -q -c "CREATE DATABASE $SCRATCH_DB;" || die "create 失败"

  echo "── 按仓库迁移建 schema ──"
  local ok=0 fail=0 f
  for f in $(ls "services/$service/migrations"/*.sql | sort); do
    if psql_ -d "$SCRATCH_DB" -v ON_ERROR_STOP=1 -q < "$f" >/dev/null 2>&1; then
      ok=$((ok+1)); printf "   ✅ %s\n" "$(basename "$f")"
    else
      fail=$((fail+1)); printf "   ❌ %s\n" "$(basename "$f")"
    fi
  done
  printf "   迁移成功 %s / 失败 %s\n" "$ok" "$fail"
  [ "$fail" -eq 0 ] || die "有迁移失败 ⇒ 停止（不要在 schema 不完整时起实例，那会得出错误结论）"

  echo "── 编译并启动实例（端口 ${port}）──"
  export GOCACHE="${GOCACHE:-/tmp/mdp-gocache}"
  mkdir -p "$BIN_DIR"
  # 打印"从哪棵树构建" —— 这类"构建了别的树"的错误，只有把它说出来才不会再发生
  say "   构建来源：${ROOT}/services/${service}（env: ${ENV_FILE:-无}）"
  ( cd "services/$service" && go build -o "$BIN_DIR/$service" ./cmd/server ) || die "编译失败"

  local old; old="$(lsof -ti ":$port" 2>/dev/null | head -1)"
  [ -n "$old" ] && { kill "$old"; sleep 2; echo "   已停旧实例 PID=$old"; }

  local saved_dsn="${EXECUTION_DATABASE_URL:-}" saved_tok="${EXECUTION_INTERNAL_TOKEN:-}"
  if [ "${SCRATCH_SKIP_ENV_LOCAL:-0}" = "1" ]; then
    echo "   （SCRATCH_SKIP_ENV_LOCAL=1：跳过 .env.local ⇒ 复现 CI 的条件）"
  else
    set -a; . "$ENV_FILE" 2>/dev/null; set +a
  fi
  [ -n "$saved_dsn" ] && EXECUTION_DATABASE_URL="$saved_dsn"
  [ -n "$saved_tok" ] && EXECUTION_INTERNAL_TOKEN="$saved_tok"
  if [ -n "${SCRATCH_ENV_FILE:-}" ]; then
    [ -f "$SCRATCH_ENV_FILE" ] || die "SCRATCH_ENV_FILE=$SCRATCH_ENV_FILE 不存在"
    set -a; . "$SCRATCH_ENV_FILE"; set +a
    echo "   已加载额外环境：$SCRATCH_ENV_FILE"
  fi
  local dsn; dsn="$(dsn_for_scratch)"
  env EXECUTION_DATABASE_URL="$dsn" EXECUTION_LISTEN_ADDR="127.0.0.1:$port" \
    nohup "$BIN_DIR/$service" > "$LOG" 2>&1 < /dev/null &
  disown 2>/dev/null || true
  sleep 6

  local code; code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$port/live")"
  printf "   /live = HTTP %s（期望 204）\n" "$code"
  [ "$code" = "204" ] || { echo "   --- 日志尾部 ---"; tail -12 "$LOG" | sed 's/^/      /'; die "实例未就绪"; }

  echo "   ✅ 就绪：库=$SCRATCH_DB 端口=$port 日志=$LOG"
  echo "   下一步示例：scripts/scratch-stack.sh sql \"SELECT count(*) FROM gateway_audit_logs\""
}

cmd_sql() {
  assert_scratch_name
  local q="${1:-}"; shift 2>/dev/null || true
  [ -n "$q" ] || die "用法：scratch-stack.sh sql \"<SQL>\""
  psql_ -d "$SCRATCH_DB" -tA -F' | ' -c "$q"
}

cmd_status() {
  printf "   库 %-20s 存在=%s\n" "$SCRATCH_DB" "$(psql_ -d postgres -tA -c "SELECT count(*) FROM pg_database WHERE datname='$SCRATCH_DB';" 2>/dev/null | tr -d ' ')"
  printf "   端口 %-18s /live=%s PID=%s\n" "$SCRATCH_PORT" \
    "$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:$SCRATCH_PORT/live")" \
    "$(lsof -ti ":$SCRATCH_PORT" 2>/dev/null | head -1)"
}

cmd_down() {
  assert_scratch_name
  local pid; pid="$(lsof -ti ":$SCRATCH_PORT" 2>/dev/null | head -1)"
  if [ -n "$pid" ]; then kill "$pid" 2>/dev/null; sleep 2; echo "   已停实例 PID=$pid"; fi

  # 二次确认：要删的库名必须恰为 SCRATCH_DB（assert 已保证它不是真实库）
  local exists; exists="$(psql_ -d postgres -tA -c "SELECT count(*) FROM pg_database WHERE datname='$SCRATCH_DB';" | tr -d ' ')"
  if [ "$exists" = "1" ]; then
    psql_ -d postgres -q -c "DROP DATABASE IF EXISTS $SCRATCH_DB;" && echo "   已删除临时库 $SCRATCH_DB"
  else
    echo "   临时库不存在（幂等）"
  fi
  printf "   复核：库残留=%s 端口占用=%s\n" \
    "$(psql_ -d postgres -tA -c "SELECT count(*) FROM pg_database WHERE datname='$SCRATCH_DB';" | tr -d ' ')" \
    "$([ -z "$(lsof -ti ":$SCRATCH_PORT" 2>/dev/null)" ] && echo 无 || echo 有)"
}

case "${1:-}" in
  up)     shift; cmd_up "${1:-execution}" "${2:-$SCRATCH_PORT}" ;;
  sql)    shift; cmd_sql "${1:-}" ;;
  psql)   shift; psql_ -d "$SCRATCH_DB" "$@" ;;
  status) cmd_status ;;
  down)   cmd_down ;;
  *) cat <<EOF
用法：
  $0 up [service] [port]      建一次性库（跑该服务全部迁移）并起实例
  $0 sql "<SQL>"              在一次性库上执行 SQL
  $0 psql [psql 参数]         在当前模式下对一次性库执行 psql（默认库 ${SCRATCH_DB}）
  $0 status                   打印库与实例状态
  $0 down                     停实例并删库（幂等）
环境：SCRATCH_DB=$SCRATCH_DB SCRATCH_PORT=$SCRATCH_PORT PG_CONTAINER=$PG_CONTAINER
EOF
     exit 2 ;;
esac
