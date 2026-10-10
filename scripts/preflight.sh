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
#   5b 集成测试【必须真的跑】 提供测试库 DSN 时不得出现 --- SKIP（见下）
#   6 Coverage floor         bash .github/scripts/check-coverage.sh <svc> <profile>
#     ↑ 复用 CI 自己的脚本与 .github/coverage-baseline.txt，避免"两套口径"
#
# 用法：
#   scripts/preflight.sh                 全部后端服务 + 前端
#   scripts/preflight.sh execution d6    只跑指定服务（可多个）
#   scripts/preflight.sh --changed       只跑相对 origin/develop 改动过的部分（模拟 CI 的 Relevance）
#   PREFLIGHT_BASE=origin/master scripts/preflight.sh --changed   改基线
#   PREFLIGHT_ENV_FILE=/dev/null scripts/preflight.sh              不用 .env.local（测"无测试库"分支）
#
# 退出码：0 = 所有【可本地验证】的门通过；1 = 有门失败
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT" || exit 2
BASE="${PREFLIGHT_BASE:-origin/develop}"
# 测试库 DSN 的来源文件（默认仓库约定的 .env.local）。设为 /dev/null 可模拟"无测试库"。
ENV_FILE="${PREFLIGHT_ENV_FILE:-$ROOT/.env.local}"
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

# ---- 门 0：脚本自检（`$VAR` 后紧跟非 ASCII ⇒ bash 会把多字节字符当成变量名的一部分）----
# 为什么（本项目真实事故，两次，跨两个脚本）：
#   scratch-stack.sh 的 `echo "…（端口 ${port}）…"` ⇒ `port）: unbound variable`；
#   preflight.sh 的 `warn "…${dsn_var}】⇒ …"` ⇒ `dsn_var】: unbound variable`
#   —— 后者在 set -u 下【直接中止脚本】，而管道里的 grep 掩盖了退出码，
#   于是那一次预检"看起来跑过了"，其实只跑了一半。
# ⇒ 规则靠记忆必然复发（已两次），故做成每次预检都执行的检查。
SHELL_VAR_BUG=0
for f in scripts/*.sh .husky/*; do
  [ -f "$f" ] || continue
  hits="$(python3 - "$f" <<'PYEOF'
import re,sys
raw=open(sys.argv[1],'rb').read()
out=[]
for m in re.finditer(rb'\$[A-Za-z_][A-Za-z0-9_]*', raw):
    if m.end()<len(raw) and raw[m.end()]>127:
        out.append(f'{raw[:m.start()].count(chr(10).encode())+1}:{m.group().decode()}')
print('\n'.join(out))
PYEOF
)"
  if [ -n "$hits" ]; then
    bad "$f 存在 \${VAR} 紧跟非 ASCII（bash 会误认为变量名的一部分）"
    printf '%s\n' "$hits" | sed 's/^/      /'
    SHELL_VAR_BUG=1
  fi
done
if [ "$SHELL_VAR_BUG" = "0" ]; then ok "脚本自检（\${VAR} 与非 ASCII 相邻）"; fi

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
      ok "golangci-lint（only-new-issues，比对 ${BASE}）"
    else
      bad "$svc golangci-lint"; tail -14 "$TMP/$svc.lint.out" | sed 's/^/      /'
    fi
  else
    warn "golangci-lint 未安装 ⇒ 这道门【本地未验证】（CI 会跑）"
    NOTVERIFIED+=("$svc golangci-lint")
  fi

  # ---- 测试库 DSN：与 CI 对齐 ----------------------------------------------
  # 本项目真实事故（两次）：真库集成测试在【无 DSN】时整体 t.Skip ⇒
  #   "跑过且通过"与"根本没跑"在输出里**无法区分**。CI 自 ci.md §7 起【总是】提供 DSN，
  #   因此本地若不提供，就会出现"本地绿、CI 红"（或更糟：本地也绿，而集成层早已是红的）。
  #   最近一次就发生在这里：补丁没生效、集成测试是红的，而本脚本报"✅ 通过"、
  #   于是失败代码被提交推送。
  # ⇒ 这道门让那条沉默变成【响亮的失败或响亮的声明】。
  dsn_var="$(printf '%s' "$svc" | tr 'a-z-' 'A-Z_')_TEST_DATABASE_URL"
  dsn="${!dsn_var:-}"
  if [ -z "$dsn" ] && [ -f "$ENV_FILE" ]; then
    dsn="$(grep -E "^${dsn_var}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"')"
  fi
  gated=0
  grep -rqs "$dsn_var" "$dir" --include='*_test.go' && gated=1

  # profile 写到仓库【外】，避免污染工作区
  prof="$TMP/$svc.cover.out"
  if [ -n "$dsn" ]; then export "$dsn_var=$dsn"; fi
  if ( cd "$dir" && go test ./... -race -v -coverprofile="$prof" ) >"$TMP/$svc.test.out" 2>&1; then
    if [ -n "$dsn" ] && [ "$gated" = "1" ] && grep -q -- '--- SKIP' "$TMP/$svc.test.out"; then
      bad "$svc 集成测试被跳过（已提供 $dsn_var 却出现 SKIP ⇒ 有测试但没执行）"
      grep -- '--- SKIP' "$TMP/$svc.test.out" | head -8 | sed 's/^/      /'
    else
      ok "Test（-race${dsn:+，含真库集成}）"
    fi
  else
    # ★ "测试库不可达"与"测试失败"是两件事，必须分开：
    #   前者说明【这一层没被验证】（本机没起 test profile 的库），后者才是代码问题。
    #   混为一谈会造成两种伤害：把环境问题当代码问题（假失败），
    #   或把真失败当环境问题（假绿）—— 后者本项目已发生过。
    if [ -n "$dsn" ] && grep -qE 'failed to connect|connection refused|SQLSTATE 3D000|database .* does not exist|password authentication failed' "$TMP/$svc.test.out"; then
      warn "$svc Test：【测试库不可达】⇒ 集成测试未验证（这不是代码失败）"
      grep -E 'FATAL|failed to connect' "$TMP/$svc.test.out" | head -3 | sed 's/^/      /'
      warn "  ⇒ 对照：CI 有测试库（ci.md §7）⇒ 本地这个结论与 CI 不可比"
      NOTVERIFIED+=("$svc 集成测试（测试库不可达：${dsn_var}）")
      RATCHET_SKIP=1
    else
      bad "$svc Test"; grep -E '^(--- FAIL|FAIL|panic)' "$TMP/$svc.test.out" | head -12 | sed 's/^/      /'
    fi
  fi
  if [ -n "$dsn" ]; then unset "$dsn_var"; fi
  if [ "$gated" = "1" ] && [ -z "$dsn" ]; then
    warn "该服务有 DSN 门控的集成测试，但【未提供 ${dsn_var}】⇒ 它们被跳过、本地未验证"
    warn "  ⇒ 覆盖率也会低于 CI（CI 自 ci.md §7 起总是提供测试库）"
    NOTVERIFIED+=("$svc 集成测试（无 ${dsn_var}）")
  elif [ "$gated" = "0" ]; then
    warn "该服务【没有】DSN 门控的集成测试 ⇒ 覆盖率门禁对它不含真库路径"
  fi

  # 覆盖率棘轮：复用 CI 自己的脚本与基线
  if [ "${RATCHET_SKIP:-0}" = "1" ]; then
    warn "跳过覆盖率棘轮：本轮未覆盖真库路径，数字与 CI 不可比（棘轮本身仍由 CI 把关）"
    RATCHET_SKIP=0
  elif [ -s "$prof" ]; then
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
