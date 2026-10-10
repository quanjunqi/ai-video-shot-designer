#!/usr/bin/env bash
# 覆盖率下限门禁（棘轮策略）——见 docs/development/testing.md §3.3
#
# 用法：
#   check-coverage.sh <service> [profile]     检查单个服务
#   check-coverage.sh --all                   检查 baseline 中全部服务（自行跑测试）
#
# 退出码：0 = 全部达标；1 = 有服务低于下限或无法测量
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT" || exit 2          # 统一以仓库根为工作目录，避免内部 cd 影响相对路径
BASELINE="$ROOT/.github/coverage-baseline.txt"
TMPDIR_COV="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_COV"' EXIT

floor_of() {  # $1=service -> 打印下限，找不到则打印空
  awk -v s="$1" '/^[[:space:]]*#/ {next} NF>=2 && $1==s {print $2; exit}' "$BASELINE"
}

# 计算某服务的总覆盖率（%）
measure() {  # $1=service, $2=profile(可选) -> 打印如 35.0
  local svc="$1" prof="${2:-}"
  if [ -n "$prof" ] && [ -f "$prof" ]; then
    # 转为绝对路径：下面会 cd 进服务目录，相对路径会失效
    prof="$(cd "$(dirname "$prof")" && pwd)/$(basename "$prof")"
  fi
  if [ -z "$prof" ]; then
    prof="$TMPDIR_COV/$svc.out"
    (cd "services/$svc" && go test ./... -coverprofile="$prof" >/dev/null 2>&1) || true
  fi
  if [ ! -s "$prof" ]; then
    echo ""
    return
  fi
  # go tool cover -func 末行为：total:  (statements)  35.0%
  (cd "services/$svc" && go tool cover -func="$prof" 2>/dev/null) \
    | tail -1 | grep -oE '[0-9]+\.[0-9]+' | head -1
}

check_one() {  # $1=service, $2=profile(可选)
  local svc="$1" prof="${2:-}"
  local floor actual
  floor="$(floor_of "$svc")"
  if [ -z "$floor" ]; then
    echo "   ⚠️  ${svc}：baseline 中无下限配置，跳过"
    return 0
  fi
  actual="$(measure "$svc" "$prof")"
  if [ -z "$actual" ]; then
    echo "   ❌ ${svc}：无法测量覆盖率（测试失败或无覆盖数据），下限 $floor%"
    return 1
  fi
  if awk -v a="$actual" -v f="$floor" 'BEGIN{exit !(a+0 >= f+0)}'; then
    echo "   ✅ ${svc}：${actual}% (下限 ${floor}%)"
    return 0
  fi
  echo "   ❌ ${svc}：${actual}% < 下限 ${floor}% —— 覆盖率回退"
  return 1
}

rc=0
if [ "${1:-}" = "--all" ]; then
  while read -r svc _; do
    case "$svc" in ''|'#'*) continue;; esac
    check_one "$svc" || rc=1
  done < "$BASELINE"
elif [ -n "${1:-}" ]; then
  check_one "$1" "${2:-}" || rc=1
else
  echo "用法: $0 <service> [profile] | --all" >&2
  rc=2
fi

if [ "$rc" = "0" ]; then
  echo "   → 覆盖率门禁通过"
else
  echo "   → 覆盖率门禁未通过（见 docs/development/testing.md §3.3 棘轮策略）"
fi
exit "$rc"
