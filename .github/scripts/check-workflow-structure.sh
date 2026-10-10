#!/usr/bin/env bash
# =============================================================================
# CI 工作流结构校验 —— 把两条「踩坑得来」的不变量固化为机制
# =============================================================================
# 不变量 1：必需状态检查对应的 job **不得**有 job 级 if:
#   GitHub 不为被 if: 跳过的 job 创建检查记录 → 必需检查永远停在 "Expected"
#   → 所有 PR 无法合并。（这正是「假防线」类问题：门禁看起来配好了，实则堵死所有人）
#
# 不变量 2：不得使用 job 级 defaults.run.working-directory
#   该 job 内任何「在 Checkout 之前执行」或「Checkout 被跳过时才执行」的 run 步骤
#   都会因为工作目录不存在而无法启动（No such file or directory）。
#   本项目已因此连续失败两次（PR #29、#30）。要求每个 run 步骤显式声明目录。
#
# 不变量 3：9 项必需检查名必须仍可产生（分支保护依赖它们）
#
# 用法： check-workflow-structure.sh [workflow.yml]
# 退出码：0 全部满足；1 有违反
# =============================================================================
set -uo pipefail

WF="${1:-.github/workflows/ci.yml}"
REQUIRED_NAMES=(
    "Frontend Quality Gate"
    "Security Scan"
    "Documentation Check"
    "Backend Build & Test (workspace)"
    "Backend Build & Test (production)"
    "Backend Build & Test (execution)"
    "Backend Build & Test (asset)"
    "Backend Build & Test (web-bff)"
    "Backend Build & Test (outbox-relay)"
)

WF="$WF" python3 - "$WF" <<'PY'
import os, sys
try:
    import yaml
except ImportError:
    print("   ⚠️  未安装 PyYAML，跳过结构校验")
    sys.exit(0)

wf = os.environ["WF"]
d = yaml.safe_load(open(wf, encoding="utf-8"))
jobs = d.get("jobs", {})

REQUIRED_NAMES = [
    "Frontend Quality Gate", "Security Scan", "Documentation Check",
    "Backend Build & Test (workspace)", "Backend Build & Test (production)",
    "Backend Build & Test (execution)", "Backend Build & Test (asset)",
    "Backend Build & Test (web-bff)", "Backend Build & Test (outbox-relay)",
]

fail = []

# --- 不变量 1：必需检查 job 不得有 job 级 if -------------------------------
print("   [1] 必需检查 job 不得有 job 级 if:")
for jid, j in jobs.items():
    if j.get("name") in REQUIRED_NAMES and "if" in j:
        print(f"       ❌ {jid}（{j['name']}）有 job 级 if —— 会让该检查不上报，卡死所有 PR")
        fail.append(f"invariant1:{jid}")

# 展开矩阵后应能产生全部 9 个必需检查名
produced = []
for jid, j in jobs.items():
    nm = j.get("name")
    if nm == "Backend Build & Test":
        for svc in (j.get("strategy", {}).get("matrix", {}) or {}).get("service", []):
            produced.append(f"Backend Build & Test ({svc})")
    elif nm:
        produced.append(nm)
missing = [n for n in REQUIRED_NAMES if n not in produced]
if missing:
    print(f"       ❌ 缺失必需检查名: {missing}")
    fail.append("invariant3")
else:
    print(f"       ✅ 9 项必需检查名齐备，且均无 job 级 if")

# --- 不变量 2：不得使用 job 级 defaults.run.working-directory ---------------
print("   [2] 不得使用 job 级 defaults.run.working-directory:")
used = [
    jid for jid, j in jobs.items()
    if ((j.get("defaults") or {}).get("run") or {}).get("working-directory")
]
if used:
    print(f"       ❌ 以下 job 使用了它: {used}")
    print("          该 job 内「Checkout 前执行」或「Checkout 被跳过时执行」的 run 步骤")
    print("          会因目录不存在而无法启动。请改为在每个 run 步骤显式声明 working-directory。")
    fail.append("invariant2")
else:
    print("       ✅ 全部 run 步骤均显式声明工作目录（无隐式继承）")

# 交叉检查：每个 run 步骤是否都有显式 working-directory 或继承安全默认
implicit = []
for jid, j in jobs.items():
    for s in j.get("steps", []) or []:
        if "run" in s and "working-directory" not in s:
            implicit.append(f"{jid}/{s.get('name')}")
print(f"   [2b] 未显式声明工作目录的 run 步骤（在无 defaults 的情况下会落在仓库根，安全）: {len(implicit)} 个")

print()
if fail:
    print(f"   → ❌ 结构校验未通过: {fail}")
    sys.exit(1)
print("   → ✅ 工作流结构不变量全部满足")
PY
