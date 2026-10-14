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
