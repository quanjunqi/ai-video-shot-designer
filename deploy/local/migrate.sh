#!/bin/sh
# =============================================================================
# 迁移执行器 —— 带版本跟踪与校验和
# =============================================================================
# 为什么需要它（替换原先的 `for m in /migrations/*.sql; do psql -f "$m"; done`）：
#
#   1. 原执行器**每次 up 都重跑全部迁移**，而迁移并非全部幂等
#      （006 / workspace-004 的 ADD COLUMN 缺 IF NOT EXISTS、production-011 的
#       DROP CONSTRAINT 无守卫）→ 第二次执行必然失败。实测在 006 报
#       `column "response_params" of relation "model_catalog" already exists`。
#   2. 没有已应用记录，就无法知道「这个库到哪一版了」。
#   3. 无法发现「已应用的迁移被改过」—— 而 AGENTS.md §7 明令禁止修改已执行迁移。
#
# 本脚本用 schema_migrations 表记录每个已应用文件的**校验和**，因此：
#   · 每个文件只执行一次 → 不再要求迁移幂等，重复 up 安全
#   · 已应用文件被改动 → 校验和不匹配 → 拒绝执行（把 §7 从"约定"变成"机制"）
#   · 每个文件在自己独立事务中执行：失败则**该文件**整体回滚，先前文件保持已应用
#
# 环境变量：
#   MIGRATIONS_DIR        迁移目录，默认 /migrations
#   MIGRATE_ADOPT=1       对「已有表但没有跟踪记录」的库：把现有文件登记为已应用
#                         （**不执行**）。默认不采纳，而是拒绝并给出指引。
#   MIGRATE_ADOPT_UNTIL   只采纳 <version> 及之前的文件（字典序），用于部分迁移过的库
#
# 连接参数沿用 libpq 环境变量（PGHOST/PGUSER/PGPASSWORD/PGDATABASE）。
# =============================================================================
set -eu

MIGRATIONS_DIR="${MIGRATIONS_DIR:-/migrations}"
ADOPT="${MIGRATE_ADOPT:-0}"
ADOPT_UNTIL="${MIGRATE_ADOPT_UNTIL:-}"
LOCK_KEY=778899123

psql_q() { psql -v ON_ERROR_STOP=1 -q -tA "$@"; }
info() { printf '   %s\n' "$*"; }
fail() { printf '\n   ❌ %s\n\n' "$*" >&2; exit 1; }

# --- 1) 跟踪表（并记录它此前是否存在）---------------------------------------
psql -v ON_ERROR_STOP=1 -q -c "CREATE TABLE IF NOT EXISTS schema_migrations (
    version    text PRIMARY KEY,
    checksum   text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
)" >/dev/null 2>&1

# --- 2) 收集迁移文件（字典序 == 应用顺序）-----------------------------------
files=$(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | LC_ALL=C sort || true)
if [ -z "$files" ]; then
    info "没有找到迁移文件（$MIGRATIONS_DIR/*.sql）"
    exit 0
fi

applied_count=$(psql_q -c "SELECT count(*) FROM schema_migrations")
user_tables=$(psql_q -c "SELECT count(*) FROM information_schema.tables
                          WHERE table_schema='public' AND table_type='BASE TABLE'
                            AND table_name <> 'schema_migrations'")

# --- 3) 既有库且无跟踪记录：默认拒绝，需显式采纳 -----------------------------
if [ "$applied_count" = "0" ] && [ "$user_tables" != "0" ]; then
    if [ "$ADOPT" != "1" ]; then
        fail "该数据库已有 $user_tables 张表，但没有迁移跟踪记录（schema_migrations 为空）。
       无法判断已应用到哪一版，因此**不做任何假设**。

       请先确认该库的实际迁移进度，然后二选一：
         · 全部文件都已应用 →  MIGRATE_ADOPT=1 <本脚本>
         · 只应用到某版本  →  MIGRATE_ADOPT=1 MIGRATE_ADOPT_UNTIL=<该文件名> <本脚本>
           （之后本脚本会继续应用其后的文件）

       采纳**不会执行**任何 SQL，只登记版本与校验和。"
    fi
    info "⚠️  采纳模式：以下文件将被登记为「已应用」，但**不会执行**其 SQL"
fi

# --- 4) 逐个核对：校验和 / 待应用 / 采纳 -------------------------------------
pending_script="$(mktemp)"
trap 'rm -f "$pending_script"' EXIT
printf 'DO $$ BEGIN PERFORM pg_advisory_lock(%s); END $$;\n' "$LOCK_KEY" > "$pending_script"

fresh=0
skipped=0
pending=0
adopted=0

for file in $files; do
    version=$(basename "$file")
    checksum=$(sha256sum "$file" | cut -d' ' -f1)
    recorded=$(psql_q -c "SELECT checksum FROM schema_migrations WHERE version = '$version'")

    if [ -n "$recorded" ]; then
        if [ "$recorded" != "$checksum" ]; then
            fail "已应用的迁移文件被修改过：$version
       数据库记录校验和: $recorded
       当前文件校验和:   $checksum

       禁止修改已执行的迁移（AGENTS.md §7）—— 否则各环境的 schema 会静默分叉。
       正确做法是新增一个迁移文件来做变更。"
        fi
        skipped=$((skipped + 1))
        continue
    fi

    if [ "$ADOPT" = "1" ]; then
        take=1
        if [ -n "$ADOPT_UNTIL" ]; then
            # 只采纳 <= ADOPT_UNTIL（字典序）
            if [ "$(printf '%s\n%s\n' "$version" "$ADOPT_UNTIL" | LC_ALL=C sort | head -1)" != "$version" ]; then
                take=0
            fi
        fi
        if [ "$take" = "1" ]; then
            printf "INSERT INTO schema_migrations(version,checksum) VALUES ('%s','%s');\n" "$version" "$checksum" >> "$pending_script"
            info "   采纳（未执行）: $version"
            adopted=$((adopted + 1))
            continue
        fi
    fi

    printf '\\echo '"'"'   -> %s'"'"'\n' "$version" >> "$pending_script"
    printf 'BEGIN;\n' >> "$pending_script"
    printf '\\i %s\n' "$file" >> "$pending_script"
    printf "INSERT INTO schema_migrations(version,checksum) VALUES ('%s','%s');\n" "$version" "$checksum" >> "$pending_script"
    printf 'COMMIT;\n' >> "$pending_script"
    pending=$((pending + 1))
done

printf 'DO $$ BEGIN PERFORM pg_advisory_unlock(%s); END $$;\n' "$LOCK_KEY" >> "$pending_script"

# --- 5) 执行（单会话持有 advisory lock，逐文件独立事务）----------------------
echo "   迁移计划：待应用 $pending · 已应用(跳过) $skipped · 采纳 $adopted"
if [ "$pending" != "0" ] || [ "$adopted" != "0" ]; then
    psql -v ON_ERROR_STOP=1 -q -f "$pending_script"
fi

if [ "$pending" = "0" ] && [ "$adopted" = "0" ]; then
    info "数据库已是最新，无需执行"
else
    info "完成：应用 $pending 个，采纳 $adopted 个"
fi
info "当前版本：$(psql_q -c "SELECT coalesce(max(version),'(空)') FROM schema_migrations")"
