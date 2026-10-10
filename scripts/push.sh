#!/usr/bin/env bash
# 推送并【显式校验】。规范：AGENTS.md §12.7.3、§5.5。
#
# 为什么不是 pre-push 钩子：
#   钩子在推送【之前】运行，那时「本地 ≠ 远端」是必然的，因此钩子无法校验推送结果。
#   要校验结果，只能是「推送 + 事后校验」的包装脚本。
#
# 为什么必须两个条件（缺一不可）：
#   ① 本地 HEAD == 远端分支 SHA  —— 否则推送其实没生效（本项目出过这种假成功）
#   ② 本地 HEAD != 推送前基线    —— 否则「相等」在【没有新提交】时也成立
#
# 用法: scripts/push.sh [分支名]     # 默认当前分支
set -euo pipefail
ROOT="$(git worktree list --porcelain | awk '/^worktree /{print $2; exit}')"
cd "$ROOT"

branch="${1:-$(git rev-parse --abbrev-ref HEAD)}"
if [ "$branch" = "HEAD" ]; then echo "❌ detached HEAD，请显式指定分支名"; exit 1; fi

base_sha=$(git rev-parse HEAD)          # 推送前基线：用于验证「确实前进了」
echo "   推送 ${branch}（推送前基线 ${base_sha:0:7}）"
git push -u origin "$branch"

local_sha=$(git rev-parse HEAD)
remote_sha=$(git ls-remote --heads origin "$branch" | awk '{print $1}')
printf "   本地=%s 远端=%s\n" "${local_sha:0:7}" "${remote_sha:0:7}"

[ -n "$remote_sha" ] || { echo "❌ 判据①失败：远端无此分支 —— 推送未生效"; exit 1; }
[ "$local_sha" = "$remote_sha" ] || { echo "❌ 判据①失败：本地 HEAD ≠ 远端 SHA"; exit 1; }
if [ "$local_sha" = "$base_sha" ]; then
  echo "⚠️  判据②：本次没有新提交（HEAD 与推送前相同）—— 若你期望有新提交，这就是假成功"
else
  echo "✅ 推送已校验：$branch @ ${local_sha:0:7}（本地==远端，且相对基线已前进）"
fi
