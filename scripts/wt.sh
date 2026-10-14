#!/usr/bin/env bash
# worktree 生命周期唯一入口。
# 规范：.agents/skills/parallel-worktree/SKILL.md（完整文档 docs/how-to/parallel-work.md）
#
# 为什么需要它：本项目在「建/进/出/删 worktree」上出过 5 次事故 ——
#   · 忘建 worktree（2 次，任务书里却写着"确认它存在"）
#   · 删除时 shell 的 cwd 还在被删目录里（3 次）：之后所有命令报
#     "Unable to read current working directory"，而 `git worktree list | wc -l`
#     返回 0，**被误读成「已清空」**（实际还有 2 个）
# 成对操作交给脚本，就不靠记性。
#
# 用法：
#   scripts/wt.sh new <线名> [基线分支]    # 默认 origin/develop
#   scripts/wt.sh done <线名>
set -euo pipefail
# ROOT 取【主 worktree】根：不能用 BASH_SOURCE/.. 推导 —— 本脚本自己也住在 worktree 里，
# 那样算出来的会是 worktree 根（曾导致 worktree 被嵌套创建到 .worktrees/mech/.worktrees/…）。
ROOT="$(git worktree list --porcelain | awk '/^worktree /{print $2; exit}')"
if [ -z "$ROOT" ] || [ ! -d "$ROOT/.git" ]; then echo "❌ 无法定位主 worktree 根"; exit 1; fi

case "${1:-}" in
  new)
    name="${2:?用法: scripts/wt.sh new <线名> [基线分支]}"
    base="${3:-origin/develop}"
    cd "$ROOT"
    git fetch -q origin "${base#origin/}" || true
    dir=".worktrees/$name"
    if [ -f "$dir/.git" ]; then
      echo "❌ 已存在: ${dir}（收工请用: scripts/wt.sh done ${name}）"; exit 1
    fi
    git worktree add "$dir" -b "chore/$name-$(date +%Y-%m-%d)" "$base"
    # 判据：.git 文件确实存在（不是看命令退出码）
    if [ ! -f "$dir/.git" ]; then echo "❌ worktree 未创建成功（判据 .git 不存在）"; exit 1; fi
    # 软链依赖，否则 worktree 内 pre-commit 会因 tsc not found 失败
    if [ -d "$ROOT/apps/web/node_modules" ]; then
      ln -sfn "$ROOT/apps/web/node_modules" "$dir/apps/web/node_modules"
    fi
    echo "✅ $dir 就绪（分支 $(cd "$dir" && git branch --show-current) @ $(cd "$dir" && git rev-parse --short HEAD)）"
    echo "   进入: cd $dir    收工: scripts/wt.sh done $name"
    ;;

  done)
    name="${2:?用法: scripts/wt.sh done <线名>}"
    dir=".worktrees/$name"
    cd "$ROOT"                      # ★ 必须先离开被删目录，否则 shell 会失去 cwd
    if [ ! -d "$dir" ]; then echo "❌ 不存在: $dir"; exit 1; fi
    rm -f "$dir/apps/web/node_modules" 2>/dev/null || true
    git worktree remove "$dir" --force
    # 判据：显式复核（失败命令会给出假读数，故不许只看退出码）
    if [ -d "$dir" ]; then echo "❌ 目录仍在: $dir"; exit 1; fi
    n=$(git worktree list | wc -l | tr -d ' ')
    if [ "$n" -lt 1 ]; then echo "❌ 复核失败: worktree 列表为空（命令可能未真正执行）"; exit 1; fi
    echo "✅ 已清理并复核：worktree 剩 $n 个"
    git worktree list
    rmdir "$ROOT/.worktrees" 2>/dev/null || true
    ;;

  *)
    echo "用法: scripts/wt.sh new <线名> [基线分支] | scripts/wt.sh done <线名>"; exit 2;;
esac
