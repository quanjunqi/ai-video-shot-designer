#!/usr/bin/env bash
# 本地预检：把 CI 的门搬到本地 —— 与 CI【同命令、同工作目录、同脚本、同基线】。
#
# 为什么需要它（依据：本项目真实事故，两次）
#   已【两次】出现"本地 build/vet/test 全过、CI 却失败"，两次都是 CI 的
#   **覆盖率棘轮**（B3a 删除覆盖行、D8b 新增未测代码）。根因是 CI 有六道门，
#   而人本地只跑"记得住"的那几道。
#   ⇒ 规则靠记忆必然复现，靠机制才能终止。本脚本即那个机制。
#
# 与 CI 的对应关系（逐条对齐 .github/workflows/ci.yml 的 Backend Build & Test）
#   1 Build                  go build ./...            working-directory: services/<svc>
#   2 Vet                    go vet ./...
#   3 Go format check        gofmt -l .
#   4 golangci-lint          （CI 用 action；本地无二进制时【明确标注未验证】，不装作通过）
#   5 Test                   go test ./... -v -race -coverprofile=...
#   6 Coverage floor         bash .github/scripts/check-coverage.sh <svc> <profile>
#     ↑ 复用 CI 自己的脚本与 .github/coverage-baseline.txt，避免"两套口径"
#
# 用法：
#   scripts/preflight.sh                 全部后端服务 + 前端
#   scripts/preflight.sh execution d6    只跑指定服务（可多个）
#   scripts/preflight.sh --changed       只跑相对 origin/develop 改动过的部分（模拟 CI 的 Relevance）
#   PREFLIGHT_BASE=origin/master scripts/preflight.sh --changed   改基线
#
# 退出码：0 = 所有【可本地验证】的门通过；1 = 有门失败
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT" || exit 2
BASE="${PREFLIGHT_BASE:-origin/develop}"
SERVICES=(workspace production execution asset web-bff outbox-relay)

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Go 构建缓存：在受限环境（只读 HOME 的沙箱 / 走查用的临时账户）里，默认缓存位置
# 不可写会让【每一个】go 命令直接失败 —— 而那看起来像"所有服务都坏了"，
# 是"环境问题伪装成代码问题"的典型。未显式设置时指向一个保证可写的位置。
export GOCACHE="${GOCACHE:-$TMP/gocache}"
mkdir -p "$GOCACHE"

FAILED=()
NOTVERIFIED=()

say()  { printf '%s\n' "$*"; }
ok()   { printf '   ✅ %s\n' "$*"; }
bad()  { printf '   ❌ %s\n' "$*"; FAILED+=("$*"); }
warn() { printf '   ⚠️  %s\n' "$*"; }

# ---- 选定要检查的服务与前端 ----
FRONTEND=1
declare -a TARGETS=()
if [ "${1:-}" = "--changed" ]; then
  mapfile -t CHANGED < <(git diff --name-only "$BASE"...HEAD 2>/dev/null || true)
  if [ "${#CHANGED[@]}" -eq 0 ]; then
    say "   相对 $BASE 没有改动 ⇒ 无需预检（CI 也会因 Relevance 跳过）"
    exit 0
  fi
  say "   相对 $BASE 改动的文件：${#CHANGED[@]} 个"
  for s in "${SERVICES[@]}"; do
    for f in "${CHANGED[@]}"; do
      case "$f" in services/$s/*) TARGETS+=("$s"); break;; esac
    done
  done
  FRONTEND=0
  for f in "${CHANGED[@]}"; do case "$f" in apps/web/*) FRONTEND=1;; esac; done
elif [ "$#" -gt 0 ]; then
  TARGETS=("$@"); FRONTEND=0
else
  TARGETS=("${SERVICES[@]}")
fi

# ---- 逐服务跑六道门 ----
for svc in "${TARGETS[@]}"; do
  dir="services/$svc"
  say ""
  say "── $svc ──"
  if [ ! -d "$dir" ]; then warn "$dir 不存在，跳过"; continue; fi

  if ( cd "$dir" && go build ./... ) 2>"$TMP/$svc.build.err"; then ok "Build"; else
    bad "$svc Build"; sed 's/^/      /' "$TMP/$svc.build.err" | head -12; continue; fi

  if ( cd "$dir" && go vet ./... ) 2>"$TMP/$svc.vet.err"; then ok "Vet"; else
    bad "$svc Vet"; sed 's/^/      /' "$TMP/$svc.vet.err" | head -12; fi

  unformatted="$( cd "$dir" && gofmt -l . )"
  if [ -z "$unformatted" ]; then ok "gofmt"; else
    bad "$svc gofmt"; printf '%s\n' "$unformatted" | sed 's/^/      /'; fi

  if command -v golangci-lint >/dev/null 2>&1; then
    if ( cd "$dir" && golangci-lint run --new-from-rev="$BASE" ./... ) >"$TMP/$svc.lint.out" 2>&1; then
      ok "golangci-lint（only-new-issues，比对 $BASE）"
    else
      bad "$svc golangci-lint"; tail -14 "$TMP/$svc.lint.out" | sed 's/^/      /'
    fi
  else
    warn "golangci-lint 未安装 ⇒ 这道门【本地未验证】（CI 会跑）"
    NOTVERIFIED+=("$svc golangci-lint")
  fi

  # profile 写到仓库【外】，避免污染工作区
  prof="$TMP/$svc.cover.out"
  if ( cd "$dir" && go test ./... -race -coverprofile="$prof" ) >"$TMP/$svc.test.out" 2>&1; then
    ok "Test（-race）"
  else
    bad "$svc Test"; grep -E '^(--- FAIL|FAIL|panic)' "$TMP/$svc.test.out" | head -12 | sed 's/^/      /'
  fi

  # 覆盖率棘轮：复用 CI 自己的脚本与基线
  if [ -s "$prof" ]; then
    cov_out="$(bash .github/scripts/check-coverage.sh "$svc" "$prof" 2>&1)"
    if printf '%s' "$cov_out" | grep -q '覆盖率门禁通过'; then
      printf '%s\n' "$cov_out" | grep -E '✅' | sed 's/^/   /'
    else
      bad "$svc Coverage floor（棘轮）"; printf '%s\n' "$cov_out" | sed 's/^/      /'
    fi
  else
    bad "$svc Coverage floor：无覆盖数据（测试未产出 profile）"
  fi
done

# ---- 前端 ----
if [ "$FRONTEND" = "1" ]; then
  say ""
  say "── apps/web ──"
  if [ ! -d apps/web/node_modules ]; then
    warn "apps/web/node_modules 不存在 ⇒ 前端门【本地未验证】（先 npm install，或在 worktree 里软链主目录的 node_modules）"
    NOTVERIFIED+=("apps/web gate + test")
  else
    if ( cd apps/web && npm run gate ) >"$TMP/web.gate.out" 2>&1; then
      ok "gate（typecheck + eslint + quality-gate）"
      grep -E 'problems|error\(s\)' "$TMP/web.gate.out" | tail -2 | sed 's/^/      /'
    else
      bad "apps/web gate"; tail -16 "$TMP/web.gate.out" | sed 's/^/      /'
    fi
    if ( cd apps/web && npm test ) >"$TMP/web.test.out" 2>&1; then
      ok "test"; grep -E '^# (tests|pass|fail)' "$TMP/web.test.out" | sed 's/^/      /'
    else
      bad "apps/web test"; grep -E '^(not ok|# (tests|pass|fail))' "$TMP/web.test.out" | head -12 | sed 's/^/      /'
    fi
  fi
fi

# ---- 结论 ----
say ""
say "════════ 预检结论 ════════"
if [ "${#NOTVERIFIED[@]}" -gt 0 ]; then
  say "   ⚠️  本地【未验证】的门（不等于通过）："
  for n in "${NOTVERIFIED[@]}"; do say "        · $n"; done
fi
if [ "${#FAILED[@]}" -gt 0 ]; then
  say "   ❌ 未通过 ${#FAILED[@]} 项："
  for f in "${FAILED[@]}"; do say "        · $f"; done
  say "   ⇒ 与 CI 同命令复核过；请修复后再推送。"
  exit 1
fi
say "   ✅ 所有【可本地验证】的门均通过"
[ "${#NOTVERIFIED[@]}" -gt 0 ] && say "   （注意：上面列出的门本地没跑，CI 仍可能失败）"
exit 0
