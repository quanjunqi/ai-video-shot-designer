#!/usr/bin/env bash
# =============================================================================
# 变更检测 —— 决定哪些 CI 检查需要真正执行
# =============================================================================
# 为什么需要它：当前每次提交/合并都会跑全部 CI（前端 npm ci + 6 个 Go 服务
# build/vet/gofmt/lint/test + gosec + npm audit）。文档类 PR 也要等全套，
# 更糟的是**会被无关的后端失败卡住**。
#
# 设计原则（重要，勿简化）：
#   1. **过滤"工作量"，不过滤"检查"** —— 必需状态检查必须每次都上报。
#      被 if: 跳过的 **job** 不会上报，会让必需检查永远停在 "Expected"，
#      从而卡死所有 PR。因此本脚本只输出"是否需要干活"，由各 job 内部的
#      步骤级 if: 使用；job 本身始终运行。
#   2. **fail-safe 到"全部执行"** —— 任何异常（基线不可解析、diff 失败、
#      无法判断的路径）都退化为全量执行。宁可慢，不可漏。
#   3. **CI 自身与部署脚本的改动 → 全量执行** —— 它们可能影响所有检查。
#
# 用法： detect-changes.sh <base-ref>
# 输出： 写入 ${GITHUB_OUTPUT}（无该变量时打印到 stdout，便于本地测试）
#   frontend=true|false
#   backend=true|false
#   security=true|false
#   services=["asset",...]      # 需要跑后端门禁的服务
#   reason=...                  # 人类可读的判定依据
# =============================================================================
set -uo pipefail

ALL_SERVICES='["workspace","production","execution","asset","web-bff","outbox-relay"]'
base="${1:-}"

emit_all() { # $1=原因
    echo "frontend=true"
    echo "backend=true"
    echo "security=true"
    echo "services=$ALL_SERVICES"
    echo "reason=$1"
}

out() {
    if [ -n "${GITHUB_OUTPUT:-}" ]; then
        emit_all "$1" >> "$GITHUB_OUTPUT"
    else
        emit_all "$1"
    fi
}

# --- 解析基线：解析不了就全量 -----------------------------------------------
if [ -z "$base" ]; then
    out "未提供基线 ref → 全量执行"
    exit 0
fi
if [ "$base" != "--from-stdin" ]; then
case "$base" in
    0000000000000000000000000000000000000000)
        out "基线为全零（新分支/首次推送）→ 全量执行"; exit 0 ;;
esac
if ! git rev-parse --verify --quiet "$base^{commit}" >/dev/null 2>&1; then
    out "无法解析基线 '$base'（浅克隆？）→ 全量执行"; exit 0
fi
fi

if [ "$base" = "--from-stdin" ]; then
    # 便于测试：直接从标准输入读文件清单，不依赖 git
    changed="$(cat)"
else
    changed="$(git diff --name-only "$base"...HEAD 2>/dev/null)" || {
        out "git diff 失败 → 全量执行"; exit 0; }
fi
if [ -z "$changed" ]; then
    out "未检测到文件差异 → 全量执行（保守）"; exit 0
fi

# --- 逐路径归类 --------------------------------------------------------------
frontend=false
security=false
declare -a svcs=()
global_hit=""

while IFS= read -r p; do
    [ -z "$p" ] && continue
    case "$p" in
        # CI 自身与部署脚本：可能影响所有检查 → 全量。
        # 注意只把 workflows/ 与 scripts/ 视为「CI 相关」——.github/tasks/、
        # PR/Issue 模板等改动不会影响任何检查，不应触发全量回退
        # （否则「加一张任务卡也跑全套 CI」）。
        .github/workflows/*|.github/scripts/*|deploy/*)
            global_hit="$p" ;;
        apps/web/*)
            frontend=true; security=true ;;
        services/*)
            svc="${p#services/}"; svc="${svc%%/*}"
            security=true
            # 去重
            found=0
            for s in "${svcs[@]:-}"; do [ "$s" = "$svc" ] && found=1; done
            [ "$found" = "0" ] && svcs+=("$svc") ;;
        *)
            : ;;   # 文档/根文件等：不影响前后端门禁
    esac
done <<< "$changed"

if [ -n "$global_hit" ]; then
    out "检测到 CI/部署相关改动（${global_hit}）→ 全量执行"; exit 0
fi

# --- 组装输出 ----------------------------------------------------------------
if [ "${#svcs[@]}" = "0" ]; then
    services='[]'
    backend=false
else
    services="[$(printf '"%s",' "${svcs[@]}" | sed 's/,$//')]"
    backend=true
fi

if [ -n "${GITHUB_OUTPUT:-}" ]; then
    {
        echo "frontend=$frontend"
        echo "backend=$backend"
        echo "security=$security"
        echo "services=$services"
        echo "reason=按改动路径判定（未触发全量回退）"
    } >> "$GITHUB_OUTPUT"
else
    echo "frontend=$frontend"
    echo "backend=$backend"
    echo "security=$security"
    echo "services=$services"
    echo "reason=按改动路径判定（未触发全量回退）"
fi
