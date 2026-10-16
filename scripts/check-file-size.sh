#!/usr/bin/env bash
# 后端文件行数门禁 + 债务棘轮（TASK-PROC-005）
#
# 机器化两条规范（此前只有「人工 + PR 审查」⇒ 实测已漂移 12 处）：
#   BE-SIZE-001   services/**/*.go 一律 ≤ 500 行
#   BE-LAYER-002  services/*/cmd/server/main.go ≤ 50 行（「cmd/ 只装配」）
#
# 语义（棘轮 · 只减不增，与 apps/web/ui-text-debt-baseline.json 同构）：
#   实测 > 基线登记值        ⇒ 失败（不得增长）
#   实测 < 基线登记值        ⇒ 通过 + 提示收紧
#   不在基线却超上限          ⇒ 失败（新增违规）
#   基线条目已不再超上限      ⇒ 提示删除该行
#
# 退出码（照抄 check-task-ledger.sh）：
#   0 通过 / 1 违规 / **2 无法检查（缺 python3、基线缺失、基线格式错、扫不到 Go 文件）**
#   ★ 2 ≠ 通过 —— 未验证不得当成绿（ci-triage：fail-closed）
#
# 用法：
#   bash scripts/check-file-size.sh                  # 检查
#   bash scripts/check-file-size.sh --update-baseline
#   bash scripts/check-file-size.sh --self-test      # 跑反例自证门禁会红
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASELINE="$ROOT/.github/file-size-baseline.txt"
SCAN_ROOT="$ROOT/services"
LIMIT_GO=500
LIMIT_MAIN=50

if ! command -v python3 >/dev/null 2>&1; then
  echo "  ⚠️  无法检查：缺 python3（**2 ≠ 通过**）" >&2
  exit 2
fi

# 核心逻辑放在 python 里：既可被 --self-test 用 fixture 调用，也避免 shell 算术的边界坑。
# 参数：<baseline> <scan_root> <limit_go> <limit_main> [--update]
run_check() {
  python3 - "$@" <<'PY'
import sys, pathlib

baseline_path, scan_root, limit_go, limit_main = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
update = '--update' in sys.argv

# ── 读基线（fail-closed：缺失/格式错 ⇒ 2）──
base = {}
bp = pathlib.Path(baseline_path)
if not bp.is_file():
    print(f"  ⚠️  无法检查：基线文件不存在 {baseline_path}（**2 ≠ 通过**）")
    sys.exit(2)
for lineno, raw in enumerate(bp.read_text(encoding='utf-8').splitlines(), 1):
    line = raw.strip()
    if not line or line.startswith('#'):
        continue
    path, sep, value = line.rpartition(' ')
    if not sep or not value.isdigit():
        print(f"  ⚠️  无法检查：基线第 {lineno} 行格式错（应为 `<path> <行数>`）：{raw!r}")
        sys.exit(2)
    base[path] = int(value)

# ── 扫描实测（fail-closed：一个都没扫到 ⇒ 2，空区间不得当通过）──
root = pathlib.Path(scan_root)
if not root.is_dir():
    print(f"  ⚠️  无法检查：扫描目录不存在 {scan_root}")
    sys.exit(2)
real = {}
for f in sorted(root.rglob('*.go')):
    rel = f.relative_to(pathlib.Path(scan_root).parent).as_posix() if scan_root.endswith('services') else f.as_posix()
    lines = len(f.read_text(encoding='utf-8', errors='replace').splitlines())
    limit = limit_main if f.as_posix().endswith('cmd/server/main.go') else limit_go
    if lines > limit:
        real[rel] = (lines, limit)
if not real and not base:
    print("  ⚠️  无法检查：既无实测超标、也无基线条目 —— 扫描区间可疑（**2 ≠ 通过**）")
    sys.exit(2)

# ── 更新模式 ──
if update:
    lines = [f"# （由 check-file-size.sh --update-baseline 生成；语义见脚本头注释）",
             f"# 实测日期：自动生成 · 上限 go={limit_go} / main={limit_main}",
             f"# 格式：<相对仓库根路径> <实测行数>"]
    for p in sorted(real):
        lines.append(f"{p} {real[p][0]}")
    bp.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(f"  ✓ 基线已更新：{len(real)} 条")
    sys.exit(0)

# ── 逐条比对 ──
violations, tighten, stale = [], [], []
for path, (lines, limit) in sorted(real.items()):
    if path in base:
        if lines > base[path]:
            violations.append(f"{path}: {lines} 行 > 基线 {base[path]} 行（上限 {limit}）—— 不得增长")
        elif lines < base[path]:
            tighten.append(f"{path}: 实测 {lines} < 基线 {base[path]}，可收紧")
    else:
        violations.append(f"{path}: {lines} 行 > 上限 {limit} 行 —— **新增违规**（不在基线内）")
for path in sorted(set(base) - set(real)):
    stale.append(f"{path}: 已不再超上限，可从基线删除该行")

for t in tighten:
    print(f"  ↓ {t}")
for s in stale:
    print(f"  ↓ {s}")
for v in violations:
    print(f"  ❌ {v}")

if violations:
    print(f"\n  ❌ 文件行数门禁失败：{len(violations)} 项")
    print("     改法：按域拆分（BE-SIZE-001 建议 handlers_<域>.go / <域>.go；")
    print("           main.go 的装配校验收敛进构造函数）——不要放宽阈值，也不要加基线条目。")
    sys.exit(1)
print(f"  ✅ 文件行数门禁通过（实测超标 {len(real)} 项，均在基线内且未增长）")
sys.exit(0)
PY
}

# ── --self-test：造 fixture 证明门禁真的会红（≥4 反例）──
self_test() {
  local tmp rc pass=0 fail=0
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN
  mkdir -p "$tmp/services/svc/internal/httpapi" "$tmp/services/svc/cmd/server"

  mk() { # mk <relpath> <lines>
    local p="$tmp/services/$1" n="$2"
    mkdir -p "$(dirname "$p")"
    : > "$p"; local i=0
    while [ "$i" -lt "$n" ]; do echo "// line" >> "$p"; i=$((i+1)); done
  }
  expect() { # expect <期望码> <说明>
    run_check "$tmp/base.txt" "$tmp/services" 500 50 >/dev/null 2>&1
    rc=$?
    if [ "$rc" = "$1" ]; then echo "    ✅ ${2}（rc=${rc}）"; pass=$((pass+1))
    else echo "    ❌ ${2}：期望 rc=${1}，实得 rc=$rc"; fail=$((fail+1)); fi
  }

  echo "  --- 反例 1：实测 > 基线 ⇒ 必须红 ---"
  mk big.go 501; printf 'services/big.go 500\n' > "$tmp/base.txt"; expect 1 "超基线 1 行即阻断"

  echo "  --- 反例 2：不在基线的新超限文件 ⇒ 必须红 ---"
  printf '# 空基线\n' > "$tmp/base.txt"; expect 1 "新增违规被阻断"

  echo "  --- 反例 3：main.go 超 50 行 ⇒ 必须红（阈值不同于 500）---"
  mk cmd/server/main.go 51; printf '# 空\n' > "$tmp/base.txt"; expect 1 "main.go 超 50 行被阻断"

  echo "  --- 反例 4：基线文件缺失 ⇒ 必须 rc=2（未验证 ≠ 通过）---"
  mk small.go 10; rm -f "$tmp/base.txt"; expect 2 "基线缺失判 2，不得判 0"

  echo "  --- 反例 5：基线格式错 ⇒ 必须 rc=2 ---"
  printf 'services/small.go 不是数字\n' > "$tmp/base.txt"; expect 2 "格式错判 2"

  echo "  --- 正例 6：实测 == 基线 ⇒ 必须绿（rc=0）---"
  rm -rf "$tmp/services"; mkdir -p "$tmp/services"; mk ok.go 500
  printf 'services/ok.go 500\n' > "$tmp/base.txt"; expect 0 "等于上限且等于基线 ⇒ 通过"

  echo "  --- 正例 7：实测 < 基线 ⇒ 绿（提示收紧）---"
  printf 'services/ok.go 600\n' > "$tmp/base.txt"; expect 0 "低于基线 ⇒ 通过（可收紧）"

  echo
  echo "  self-test：通过 $pass / 失败 $fail"
  [ "$fail" -eq 0 ] || { echo "  ❌ self-test 未通过 —— 门禁自身不可信"; return 1; }
  echo "  ✅ self-test 通过（7 例：5 反例 + 2 正例）"
}

case "${1:-}" in
  --self-test) echo "== check-file-size.sh --self-test =="; self_test ;;
  --update-baseline) run_check "$BASELINE" "$SCAN_ROOT" "$LIMIT_GO" "$LIMIT_MAIN" --update ;;
  "") run_check "$BASELINE" "$SCAN_ROOT" "$LIMIT_GO" "$LIMIT_MAIN" ;;
  *) echo "未知参数：${1}（可用：--self-test / --update-baseline）" >&2; exit 2 ;;
esac
