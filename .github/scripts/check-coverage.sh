#!/usr/bin/env bash
# 覆盖率下限门禁（棘轮策略）——见 `.agents/skills/backend-standards/SKILL.md`（覆盖率棘轮口径）
#
# 用法：
#   check-coverage.sh <service> [profile]     检查单个服务（CI 用这种形态，传预生成的 profile）
#   check-coverage.sh --all                   检查全部服务目录（自行跑测试）
#
# 退出码：0 = 全部达标；1 = 有服务低于下限 / 基线与服务目录不一致；2 = **无法判定**
#
# ★ TASK-PROC-009 修的三处可信度缺陷：
#   1. **盲区**：原主循环 `done < "$BASELINE"` 只遍历基线条目，且 `floor_of` 找不到下限时
#      「跳过; return 0」⇒ **不在基线的服务根本不会被看到**（新增服务可带 0% 覆盖率上线）。
#      现改为**扫实际服务目录**：目录在而基线无下限 ⇒ 失败并指名；基线有而目录不在 ⇒ 失败并指名。
#   2. **shell bug**：原第 100 行 `echo "…（见 `.agents/skills/…` …）"` 的**反引号在双引号内
#      是命令替换** ⇒ 去执行了那个 Markdown 路径（实测 `Permission denied`）。现全部去掉反引号。
#   3. **本地复现不了 CI 的判定**：CI 的 *_TEST_DATABASE_URL 指向 postgres:16 容器（ci.yml:151-184），
#      本机 5432 是 dev-local 的另一个库、凭据不同 ⇒ 集成测试 **FAIL** ⇒ 覆盖率被人为压低
#      ⇒ 原实现报出 5 个「覆盖率回退」**假红**。
#      **修法有两层**：
#        (a) 未预设 *_TEST_DATABASE_URL 时，脚本自行指向本机的 **CI 等价库**（见 CI_REPRO_PORT），
#            并先做可达性探测；不可达 ⇒ **判 2**（不得静默用错误的库）。
#        (b) 更重要：**测试未通过 ⇒ 判 2（无法判定覆盖率）**，而不是判 1（覆盖率回退）——
#            「测不出来」与「测出来了但太低」是两件事，不能混为一谈。
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT" || exit 2
BASELINE="$ROOT/.github/coverage-baseline.txt"
SERVICES_DIR="$ROOT/services"
TMPDIR_COV="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_COV"' EXIT

# CI 等价数据库：本机由 ci-repro-pg 提供（postgres:16-alpine，凭据与 ci.yml:151-184 完全一致）。
# 端口可用环境变量覆盖；CI 上 *_TEST_DATABASE_URL 已由 workflow 设好，本段不会生效。
CI_REPRO_PORT="${CI_REPRO_PG_PORT:-15432}"
CI_DB_URL="postgres://shotdesigner:shotdesigner@127.0.0.1:${CI_REPRO_PORT}/postgres?sslmode=disable"

tcp_open() {  # $1=host $2=port —— 纯 bash 探测，不依赖 nc/psql
  (exec 3<>"/dev/tcp/$1/$2") 2>/dev/null && exec 3<&- && return 0
  return 1
}

# 若调用方（CI）已设 *_TEST_DATABASE_URL，则**原样尊重**；否则指向本机 CI 等价库并探测可达性。
setup_test_db() {
  if [ -n "${EXECUTION_TEST_DATABASE_URL:-}" ]; then
    echo "   ℹ️  使用调用方预设的 *_TEST_DATABASE_URL（CI 形态）"
    return 0
  fi
  if ! tcp_open 127.0.0.1 "$CI_REPRO_PORT"; then
    echo "   ⚠️  无法判定：未设 *_TEST_DATABASE_URL，且本机 CI 等价库（127.0.0.1:${CI_REPRO_PORT}）不可达。"
    echo "       这是【未验证】，不是【覆盖率回退】—— 2 ≠ 通过。"
    echo "       起库：docker run -d --name ci-repro-pg -p ${CI_REPRO_PORT}:5432 \\"
    echo "               -e POSTGRES_USER=shotdesigner -e POSTGRES_PASSWORD=shotdesigner \\"
    echo "               -e POSTGRES_DB=postgres postgres:16-alpine"
    return 2
  fi
  export EXECUTION_TEST_DATABASE_URL="$CI_DB_URL"
  export PRODUCTION_TEST_DATABASE_URL="$CI_DB_URL"
  export WORKSPACE_TEST_DATABASE_URL="$CI_DB_URL"
  export ASSET_TEST_DATABASE_URL="$CI_DB_URL"
  export OUTBOX_TEST_DATABASE_URL="$CI_DB_URL"
  echo "   ℹ️  测试库：本机 CI 等价库 127.0.0.1:${CI_REPRO_PORT}（与 ci.yml:151-184 同镜像同凭据）"
  return 0
}

floor_of() {  # $1=service -> 打印下限，找不到则打印空
  awk -v s="$1" '/^[[:space:]]*#/ {next} NF>=2 && $1==s {print $2; exit}' "$BASELINE"
}

# 计算某服务的总覆盖率（%）并回报测试是否通过。
# 退出码：0=测量成功（结果打到 stdout）；2=**无法判定**（测试失败 / 无覆盖数据）
measure() {  # $1=service, $2=profile(可选)
  local svc="$1" prof="${2:-}"
  # ★ 用**文件**而非变量传递原因：measure 是在 $(...) 子 shell 里被调用的，
  #   子 shell 里赋的变量传不回父 shell（我第一版用变量 ⇒ 真实原因永远显示成"无覆盖数据"）。
  local reason_file="$TMPDIR_COV/$svc.reason"
  : > "$reason_file"
  if [ -n "$prof" ] && [ -f "$prof" ]; then
    prof="$(cd "$(dirname "$prof")" && pwd)/$(basename "$prof")"
  else
    prof="$TMPDIR_COV/$svc.out"
    local log="$TMPDIR_COV/$svc.log"
    local skip_file="$TMPDIR_COV/$svc.skips"
    if ! (cd "services/$svc" && go test ./... -v -coverprofile="$prof" >"$log" 2>&1); then
      # ★ 关键区分：测试没通过 ⇒ 覆盖率不可判定（2），而不是"覆盖率回退"（1）。
      #   否则一次环境问题（如库凭据不对）就会被报成 5 个服务的覆盖率回退 —— 假红。
      printf '测试未通过' > "$reason_file"
      grep -m2 -E 'FAIL|panic|compile:|cannot' "$log" 2>/dev/null | sed 's/^/        /'
      return 2
    fi
    # ★ 统计被跳过的测试：集成测试在缺前置条件（库/对象存储凭据）时会 t.Skip，
    #   ⇒ 覆盖率天然低于 CI，**不可比**。这个数用于下面的"能否判定"判据。
    #   注意：命令必须带 -v，否则 go test 不打印 `--- SKIP`，这里会恒为 0
    #   （我第一版就没带 -v，于是 asset 的 12 个跳过被漏掉、差点被误判成"覆盖率回退"）。
    #   CI 用的命令本身就带 -v（见 ci.yml:273「go test ./... -v -race -coverprofile=…」）。
    grep -c -- '--- SKIP' "$log" 2>/dev/null > "$skip_file" || echo 0 > "$skip_file"
  fi
  if [ ! -s "$prof" ]; then
    printf '测试通过但未产生覆盖数据（无 internal/ 或无可测包？）' > "$reason_file"
    return 2
  fi
  # ★ main 装配层（cmd/）一律不纳入覆盖率统计，且对每个服务强制生效：
  #   cmd/ 只允许依赖注入与启动（BE-LAYER-002），无业务可测；计入会令"新增
  #   启动装配代码"的 PR 无谓拉低覆盖率（实测 cmd/server 恒为 0%，曾把 asset
  #   整服务 82% 拉到 69%）。行业标准做法排除。
  #   ⚠ fail-closed：凡无 internal/ 的服务（业务堆在 cmd/）直接暴露为"覆盖率
  #   无法测量"而告警 —— 结构违规被门禁拦住，而非"因薄服务例外而放行"。
  #   直接解析 coverprofile 重算 total，不依赖 go tool cover -func。
  python3 -c '
import sys
prof = sys.argv[1]
total = covered = 0
for line in open(prof):
    if line.startswith("mode:"):
        continue
    parts = line.rstrip("\n").split(" ")
    if len(parts) < 3:
        continue
    f = parts[0]
    if "/cmd/" in f:
        continue
    total += int(parts[1])
    if int(parts[2]) > 0:
        covered += int(parts[1])
print(f"{covered / total * 100:.1f}" if total else "")
' "$prof"
}

# check_one 设置全局 ONE_RC（0/1/2）与 ONE_MSG
check_one() {  # $1=service, $2=profile(可选)
  local svc="$1" prof="${2:-}"
  local floor actual
  ONE_RC=1; ONE_MSG=""
  floor="$(floor_of "$svc")"
  if [ -z "$floor" ]; then
    # ★ 缺陷 1 的修法：缺下限**不再静默跳过**（那等于"未验证当通过"）。
    ONE_MSG="${svc}：基线中无下限配置 —— 新增服务必须登记下限，不得无门禁上线"
    echo "   ❌ ${ONE_MSG}"
    return 1
  fi
  local actual_rc
  actual="$(measure "$svc" "$prof")"; actual_rc=$?
  if [ "$actual_rc" = "2" ] || [ -z "$actual" ]; then
    ONE_RC=2
    local why; why="$(cat "$TMPDIR_COV/$svc.reason" 2>/dev/null)"
    echo "   ⚠️  ${svc}：**无法判定覆盖率**（${why:-原因未知}），下限 ${floor}% —— 未验证 ≠ 通过"
    return 2
  fi
  if awk -v a="$actual" -v f="$floor" 'BEGIN{exit !(a+0 >= f+0)}'; then
    echo "   ✅ ${svc}：${actual}% (下限 ${floor}%)"
    ONE_RC=0
    return 0
  fi
  # ★ 低于下限时，必须先分清「真回退」与「因跳过而不可比」：
  #   有测试被 t.Skip（缺库/对象存储凭据等前置条件）⇒ 本地覆盖率与 CI **不同口径**
  #   ⇒ 差额可能是跳过造成的，**不能据此判回退** ⇒ 判 2（无法判定）。
  #   只有"测全了却仍低于下限"才是真回退（判 1）。
  local skips=0
  [ -f "$TMPDIR_COV/$svc.skips" ] && skips="$(cat "$TMPDIR_COV/$svc.skips" 2>/dev/null || echo 0)"
  if [ "${skips:-0}" -gt 0 ] 2>/dev/null; then
    ONE_RC=2
    echo "   ⚠️  ${svc}：${actual}% < 下限 ${floor}%，但本次有 ${skips} 个测试被跳过"
    echo "        ⇒ 与 CI 不同口径（缺前置条件），**无法据此判定回退**（未验证 ≠ 通过）"
    return 2
  fi
  ONE_RC=1
  echo "   ❌ ${svc}：${actual}% < 下限 ${floor}% —— 覆盖率回退（本次无跳过，口径完整）"
  return 1
}

echo "   ℹ️  工具链：$(go version 2>/dev/null | awk '{print $3}')（本仓 6/7 个 go.mod 要求 go1.26.0；GOTOOLCHAIN=${GOTOOLCHAIN:-未设}）"

rc=0
one() {  # 跑一个服务并按 2 > 1 > 0 合并退出码
  check_one "$1" "${2:-}" || true
  case "$ONE_RC" in
    2) rc=2 ;;
    1) [ "$rc" = "2" ] || rc=1 ;;
  esac
}

if [ "${1:-}" = "--all" ]; then
  setup_test_db; db_rc=$?
  if [ "$db_rc" = "2" ]; then exit 2; fi
  # ★ 缺陷 1 的修法：遍历**实际服务目录**，而不是基线文件。
  declare -a dirs=()
  for d in "$SERVICES_DIR"/*/; do
    [ -d "$d" ] || continue
    svc="$(basename "$d")"
    # 只算"含 Go 代码"的目录（shared 也是被门禁覆盖的服务，同 CI 矩阵）。
    # ★ 用 find 而非 compgen 通配：bash 默认不开 globstar，`**` 不递归
    #   （我第一版用 compgen -G "$d**/*.go" 只认出了唯一有顶层 .go 的 shared，
    #    并因此把其余 6 个误报为"陈旧条目"——已修正）。
    if [ -n "$(find "$d" -name '*.go' -print -quit 2>/dev/null)" ]; then
      dirs+=("$svc")
    fi
  done
  if [ "${#dirs[@]}" = "0" ]; then
    echo "   ⚠️  无法判定：services/ 下未找到任何含 Go 代码的服务目录（**2 ≠ 通过**）"
    exit 2
  fi
  for svc in "${dirs[@]}"; do one "$svc"; done
  # 反向检查：基线条目已无对应目录 ⇒ 陈旧条目
  while read -r svc _; do
    case "$svc" in ''|'#'*) continue;; esac
    found=0
    for d in "${dirs[@]}"; do [ "$d" = "$svc" ] && found=1; done
    if [ "$found" = "0" ]; then
      echo "   ❌ ${svc}：基线条目在 services/ 下无对应目录 —— 陈旧条目，应删除"
      [ "$rc" = "2" ] || rc=1
    fi
  done < "$BASELINE"
elif [ -n "${1:-}" ]; then
  one "$1" "${2:-}"
else
  echo "用法: $0 <service> [profile] | --all" >&2
  rc=2
fi

if [ "$rc" = "0" ]; then
  echo "   → 覆盖率门禁通过"
elif [ "$rc" = "2" ]; then
  # ★ 缺陷 2 的修法：路径**不加反引号**（双引号内的反引号是命令替换，会被真的执行）。
  echo "   → 覆盖率门禁【未验证】：存在无法判定的服务（见 .agents/skills/backend-standards/SKILL.md 覆盖率棘轮口径）"
else
  echo "   → 覆盖率门禁未通过（见 .agents/skills/backend-standards/SKILL.md 覆盖率棘轮口径）"
fi
exit "$rc"
