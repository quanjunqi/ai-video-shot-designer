#!/usr/bin/env bash
# Conventional Commits 校验 —— 见 CONTRIBUTING.md §提交信息规范
#
# 用法：
#   check-commit-messages.sh <range>     例如 origin/master..HEAD
#   check-commit-messages.sh --last N    校验最近 N 个提交
#
# 规则：<type>(<scope>)?: <subject>
#   type ∈ feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert
#   允许 merge / revert 提交跳过（GitHub 自动生成的合并提交不属于开发者书写）
set -uo pipefail

TYPES='feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert'
fail=0
checked=0

range="${1:-origin/master..HEAD}"
if [ "${1:-}" = "--last" ]; then
  range="HEAD~${2:-1}..HEAD"
fi

while IFS= read -r sha; do
  [ -z "$sha" ] && continue
  subject="$(git log -1 --format=%s "$sha")"
  parents="$(git log -1 --format=%P "$sha" | wc -w | tr -d ' ')"
  # 跳过合并提交
  if [ "$parents" -gt 1 ]; then
    echo "   ⏭  $sha 合并提交，跳过"
    continue
  fi
  # 跳过 revert 自动消息
  case "$subject" in
    Revert\ *) echo "   ⏭  $sha revert，跳过"; continue;;
  esac
  checked=$((checked + 1))
  if printf '%s' "$subject" | grep -qE "^(${TYPES})(\([a-z0-9._/-]+\))?!?: .+"; then
    echo "   ✅ $sha  $subject"
  else
    echo "   ❌ $sha  $subject"
    echo "        → 不符合 Conventional Commits：<type>(<scope>)?: <subject>"
    fail=1
  fi
done < <(git log --format=%H "$range" 2>/dev/null)

if [ "$checked" = "0" ]; then
  echo "   ⚠️  区间 $range 内没有可校验的提交（跳过）"
  exit 0
fi
if [ "$fail" = "0" ]; then
  echo "   → 提交信息校验通过（$checked 个）"
else
  echo "   → 提交信息校验未通过（见 CONTRIBUTING.md）"
fi
exit "$fail"
