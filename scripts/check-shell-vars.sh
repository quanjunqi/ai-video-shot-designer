#!/usr/bin/env bash
# 脚本自检：`$VAR` 后紧跟非 ASCII（bash 会把多字节字符当成变量名的一部分）。
#
# 为什么做成【独立脚本】而不是留在 preflight.sh 里：
#   规则写在两处迟早分叉；而这条规则需要的【两个时刻】都要用同一份实现 ——
#     · 提交时（.husky/pre-commit，只查暂存的脚本）
#     · 预检时（scripts/preflight.sh 的门 0，查仓库里全部脚本）
#
# 真实事故（本项目三次）：
#   scratch-stack.sh 的 `echo "…（端口 ${port}）…"` ⇒ `port）: unbound variable`；
#   preflight.sh 的 `warn "…${dsn_var}】⇒ …"` ⇒ 在 set -u 下**直接中止**脚本；
#   以及我在 CI 接线片里刚写下的 `echo "… ${sl}（相关行）…"`（写成未加花括号的 $sl 时，
#   连【本文件自己的注释】都会被这道门抓出来 —— 它刻意做字节级扫描、不解析 bash）。
#   —— 规则靠记忆必然复发，故做成可执行的门。
#
# 用法：
#   bash scripts/check-shell-vars.sh                # 扫【仓库里全部】shell 脚本（默认）
#   bash scripts/check-shell-vars.sh <文件>…        # 只扫给定文件（供 pre-commit 用）
# 退出码：0 = 干净；1 = 命中；2 = 【无法检查】（例如缺 python3）—— 注意 2 不等于通过。
#
# ★ 默认范围为什么是"全仓"而不是某几个目录：
#   此前有两份各自为政的实现 —— preflight 扫 `scripts/*.sh .husky/*`，
#   CI 扫 `.github/scripts deploy/`（用 grep -P，macOS 上还不可用）。
#   两者【互补】，也就是说【都有盲区】：谁都没扫对方的目录。
#   规则一旦分叉，就总会有人漏掉。现在按 git 追踪的 shell 脚本来算全量。
set -u

if ! command -v python3 >/dev/null 2>&1; then
  echo "❌ 无法检查：python3 不在 PATH ⇒ 这道门【未验证】（不等于通过）" >&2
  exit 2
fi

if [ "$#" -gt 0 ]; then
  FILES=("$@")
else
  # 默认：仓库里全部 shell 脚本（含 deploy/、.github/scripts/）与 .husky 下的钩子。
  # 用 git 追踪清单而不是写死目录 —— 新增目录时不需要有人记得回来改这里。
  FILES=()
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    [ -f "$f" ] || continue
    FILES+=("$f")
  #   ★ 必须把【未跟踪】的脚本也算进来：否则"刚写好、还没 git add"的坏脚本会被漏掉
  #     —— 那恰恰是最该被抓的时刻。本片真实踩到：验收用的 deploy/local/__tmp_bad.sh
  #     是未跟踪文件，扫描报 rc=0（"通过"），而它明明有 bug。
  #     这与 preflight --changed 曾经"只看已提交历史"是同一族错误：
  #     **检查忽略了工作区**。
  done < <( {
      git ls-files '*.sh' 2>/dev/null
      git ls-files --others --exclude-standard '*.sh' 2>/dev/null
      git ls-files '.husky/*' 2>/dev/null
      git ls-files --others --exclude-standard '.husky/*' 2>/dev/null
    } | sort -u )
fi

if [ "${#FILES[@]}" -eq 0 ]; then
  echo "⚠️  没有可检查的脚本文件"
  exit 0
fi

hits_total=0
for f in "${FILES[@]}"; do
  [ -f "$f" ] || continue
  hits="$(python3 - "$f" <<'PYEOF'
import re, sys
raw = open(sys.argv[1], 'rb').read()
out = []
for m in re.finditer(rb'\$[A-Za-z_][A-Za-z0-9_]*', raw):
    if m.end() < len(raw) and raw[m.end()] > 127:
        line = raw[:m.start()].count(b'\n') + 1
        out.append(f'{line}:{m.group().decode()}')
print('\n'.join(out))
PYEOF
)"
  if [ -n "$hits" ]; then
    echo "❌ $f 存在 \${VAR} 紧跟非 ASCII（bash 会误认为变量名的一部分）："
    printf '%s\n' "$hits" | sed 's/^/      /'
    echo "   修复：把变量写成 \${VAR}（加花括号）"
    hits_total=$((hits_total + 1))
  fi
done

if [ "$hits_total" -eq 0 ]; then
  echo "✅ 脚本自检通过（\${VAR} 与非 ASCII 相邻）：检查了 ${#FILES[@]} 个文件"
  exit 0
fi
exit 1
# 一个干净的脚本改动
