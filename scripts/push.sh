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
if ! git show-ref --verify --quiet "refs/heads/${branch}"; then
  echo "❌ 本地无此分支: ${branch}"; exit 1
fi

# 基线必须取【推送前的远端】：
#   取本地 ref 是错的 —— 提交在 push 之前就已存在，本地 ref 永远已含新提交，
#   于是判据② 会永远误报「没有新提交」（真实缺陷 6）。
remote_before=$(git ls-remote --heads origin "$branch" | awk '{print $1}')
printf "   推送 %s（推送前远端 %s）\n" "$branch" "${remote_before:-<不存在>}"

git push -u origin "$branch"

local_sha=$(git rev-parse "refs/heads/${branch}")
remote_after=$(git ls-remote --heads origin "$branch" | awk '{print $1}')
printf "   本地=%s 远端=%s\n" "${local_sha:0:7}" "${remote_after:0:7}"

[ -n "$remote_after" ] || { echo "❌ 判据①失败：远端无此分支 —— 推送未生效"; exit 1; }
[ "$local_sha" = "$remote_after" ] || { echo "❌ 判据①失败：本地 SHA ≠ 远端 SHA"; exit 1; }

if [ "$remote_after" = "$remote_before" ]; then
  echo "⚠️  判据②：远端未发生变化（${local_sha:0:7}）—— 本次推送没有产生任何变化；"
  echo "    若你期望有新提交被推上去，这就是假成功。"
else
  echo "✅ 推送已校验：${branch} @ ${local_sha:0:7}（判据① 本地==远端；判据② 远端已前进 ${remote_before:0:7} → ${remote_after:0:7}）"
fi
