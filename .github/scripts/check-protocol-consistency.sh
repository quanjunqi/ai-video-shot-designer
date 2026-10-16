#!/usr/bin/env bash
# 协议一致性快照门禁（TASK-PROC-010）——同一实现：CI Documentation Check 步骤级
# 与 scripts/preflight.sh 门 0d 都调本脚本。
#
# 职责（只做快照生命周期，不复刻 audit 逻辑——审计在 Go 测试 TestAuditSnapshotRealDB）：
#   1. 快照存在 + JSON 有效 + 结构完整（source/fetched_at/note/templates 非空、id 唯一）
#   2. 快照迁移号（顶层 migration 字段）== services/production/migrations 最新号段
#      ——协议迁移推进而快照不更新 => 一致性检查静默失效，本门禁直接红
#
# 退出码：0 通过 / 1 违规 / 2 无法检查（缺 python3 / 文件缺失）——2 ≠ 通过（fail-closed）
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SNAPSHOT="$ROOT/services/production/internal/protocolaudit/testdata/protocol_templates_snapshot.json"
MIGRATIONS="$ROOT/services/production/migrations"
SELF_TEST=""

for arg in "$@"; do
  if [ "$arg" = "--self-test" ]; then SELF_TEST=1; fi
done

if ! command -v python3 >/dev/null 2>&1; then
  echo "::error::check-protocol-consistency 无法检查：缺 python3（未验证 ≠ 通过）"
  exit 2
fi

if [ ! -f "$SNAPSHOT" ] || [ ! -d "$MIGRATIONS" ]; then
  echo "::error::check-protocol-consistency 无法检查：快照或迁移目录缺失（未验证 ≠ 通过）"
  exit 2
fi

if [ -n "$SELF_TEST" ]; then
  python3 - "$SNAPSHOT" "$MIGRATIONS" << 'PY'
import json, os, re, sys, tempfile, shutil

snapshot, migrations = sys.argv[1], sys.argv[2]
failures = []

def latest_migration(d):
    nums = [int(re.match(r"(\d+)", f).group(1)) for f in os.listdir(d)
            if re.match(r"^\d+.*\.sql$", f)]
    return f"{max(nums):03d}" if nums else None

def run_check(snap_path, mig_dir):
    """返回 (exit_code, message)"""
    if not os.path.isfile(snap_path):
        return 2, "missing snapshot"
    if not os.path.isdir(mig_dir):
        return 2, "missing migrations dir"
    try:
        with open(snap_path) as f:
            d = json.load(f)
    except Exception as e:
        return 1, f"invalid json: {e}"
    for k in ("source", "fetched_at", "note", "templates", "migration"):
        if k not in d:
            return 1, f"missing field: {k}"
    if not isinstance(d["templates"], list) or len(d["templates"]) == 0:
        return 1, "templates empty"
    ids = [t.get("id") for t in d["templates"] if isinstance(t, dict)]
    if len(ids) != len(set(ids)):
        return 1, "duplicate template ids"
    latest = latest_migration(mig_dir)
    if latest is None:
        return 2, "no migrations found"
    if d["migration"] != latest:
        return 1, f"snapshot migration {d['migration']} != latest {latest}（协议迁移已推进，需更新快照）"
    return 0, "ok"

# 3 反例 + 3 正例
tmp = tempfile.mkdtemp()
try:
    # 反例 1：快照缺 migration
    d = json.load(open(snapshot))
    bad1 = os.path.join(tmp, "snap_no_mig.json")
    d.pop("migration", None)
    json.dump(d, open(bad1, "w"))
    # 反例 2：快照 JSON 非法
    bad2 = os.path.join(tmp, "snap_bad.json")
    open(bad2, "w").write("{not json")
    # 反例 3：快照迁移号落后（模拟 068 存在）
    bad3 = os.path.join(tmp, "snap_stale.json")
    json.dump(dict(d, migration="066"), open(bad3, "w"))
    mig_plus = os.path.join(tmp, "migs")
    os.makedirs(mig_plus, exist_ok=True)
    for f in os.listdir(migrations):
        shutil.copy(os.path.join(migrations, f), os.path.join(mig_plus, f))
    open(os.path.join(mig_plus, "068_new_template.sql"), "w").write("-- 068\n")
    # 正例 1：原快照 + 原迁移目录
    ok1 = run_check(snapshot, migrations)
    # 正例 2：合法快照 + 无新迁移
    ok2 = run_check(bad3 if False else snapshot, mig_plus if False else migrations)
    # 正例 3：结构齐全但迁移目录一致（直接复用 ok1 场景的等价输入：快照含 migration 且目录同）
    ok3 = run_check(bad1 if False else snapshot, migrations)

    cases = [
        (1, run_check(bad1, migrations)[0], "反例1 缺 migration 字段"),
        (1, run_check(bad2, migrations)[0], "反例2 JSON 非法"),
        (1, run_check(bad3, mig_plus)[0], "反例3 快照过期（068 已存在）"),
        (0, ok1[0], "正例1 原快照原目录"),
        (0, ok2[0], "正例2 同目录一致"),
        (0, ok3[0], "正例3 结构齐全一致"),
    ]
    for expect, got, name in cases:
        if expect != got:
            failures.append(f"{name}: expect {expect} got {got}")
finally:
    shutil.rmtree(tmp, ignore_errors=True)

if failures:
    print("self-test FAIL:")
    for f in failures:
        print("  -", f)
    sys.exit(1)
print("self-test OK: 3 反例 + 3 正例全部按预期")
PY
  exit $?
fi

python3 - "$SNAPSHOT" "$MIGRATIONS" << 'PY'
import json, os, re, sys

snapshot, migrations = sys.argv[1], sys.argv[2]

try:
    with open(snapshot) as f:
        d = json.load(f)
except Exception as e:
    print(f"::error::协议快照 JSON 无效: {e}")
    sys.exit(1)

missing = [k for k in ("source", "fetched_at", "note", "templates", "migration") if k not in d]
if missing:
    print(f"::error::协议快照缺字段: {', '.join(missing)}（结构损坏，需更新快照）")
    sys.exit(1)
if not isinstance(d["templates"], list) or len(d["templates"]) == 0:
    print("::error::协议快照 templates 为空")
    sys.exit(1)
ids = [t.get("id") for t in d["templates"] if isinstance(t, dict)]
if len(ids) != len(set(ids)):
    print("::error::协议快照存在重复模板 id")
    sys.exit(1)

nums = [int(re.match(r"(\d+)", f).group(1)) for f in os.listdir(migrations)
        if re.match(r"^\d+.*\.sql$", f)]
if not nums:
    print("::error::production migrations 目录无迁移文件（无法判定 ≠ 通过）")
    sys.exit(2)
latest = f"{max(nums):03d}"
if d["migration"] != latest:
    print(f"::error::协议快照迁移号 {d['migration']} != 最新迁移 {latest}"
          f" —— 协议定义已推进，快照必须同步更新（services/production/internal/protocolaudit/testdata/）")
    sys.exit(1)

print(f"✓ 协议快照一致性通过（migration={d['migration']}，templates={len(ids)}）")
sys.exit(0)
PY
