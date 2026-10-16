#!/usr/bin/env bash
# 脚本自检（两类 bash 引号陷阱；规则只有这一份实现）：
#   A. `$VAR` 后紧跟非 ASCII —— bash 会把多字节字符当成变量名的一部分。
#   B. **双引号字符串内的反引号** —— 那是【命令替换】，会被真的执行。
#
# 为什么做成【独立脚本】而不是留在 preflight.sh 里：
#   规则写在两处迟早分叉；而这些规则需要的【两个时刻】都要用同一份实现 ——
#     · 提交时（.husky/pre-commit，只查暂存的脚本）
#     · 预检时（scripts/preflight.sh 的门 0，查仓库里全部脚本）
#
# 真实事故（本项目多次）：
#   A 类：scratch-stack.sh 的 `echo "…（端口 ${port}）…"` ⇒ `port）: unbound variable`；
#         preflight.sh 的 `warn "…${dsn_var}】⇒ …"` ⇒ 在 set -u 下**直接中止**脚本；
#         以及 CI 接线片里刚写下的 `echo "… ${sl}（相关行）…"`。
#   B 类：.github/scripts/check-coverage.sh 的
#         `echo "   → …（见 `.agents/skills/backend-standards/SKILL.md` 覆盖率棘轮口径）"`
#         ⇒ 每次门禁未通过都会去**执行**那个 Markdown 路径，
#            实测报 `.agents/skills/backend-standards/SKILL.md: Permission denied`，
#            且提示里本该有的路径**消失了**（最需要它的时候残缺）。
#         .husky/pre-push 的 `refuse "…（`AGENTS.md`「分支与提交」…）"` 同病
#         ⇒ `AGENTS.md: command not found`，拒绝提示里丢掉了"规则在哪"的指引。
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
a_hits = []          # A 类：$VAR 紧跟非 ASCII
for m in re.finditer(rb'\$[A-Za-z_][A-Za-z0-9_]*', raw):
    if m.end() < len(raw) and raw[m.end()] > 127:
        line = raw[:m.start()].count(b'\n') + 1
        a_hits.append(f'A|{line}|{m.group().decode()}')

# B 类：双引号字符串内的反引号（命令替换）。
# 必须排除两类"看起来像、其实不是 shell"的内容：
#   1) **heredoc 正文**（如 check-file-size.sh 内嵌的 Python，里面有 `<path> <行数>` 这类反引号）
#   2) 注释行
# 故用一个极简状态机跟踪 heredoc 边界，而不是纯行扫描。
b_hits = []
lines = raw.decode('utf-8', 'replace').splitlines()
heredoc_end = None
for i, line in enumerate(lines, 1):
    stripped = line.strip()
    if heredoc_end is not None:
        if stripped == heredoc_end:
            heredoc_end = None
        continue
    m = re.search(r'<<-?\s*(["\']?)([A-Za-z_][A-Za-z0-9_]*)\1', line)
    if m:
        heredoc_end = m.group(2)     # 本行自身仍是 shell，继续参与检查
    if stripped.startswith('#'):
        continue
    for dm in re.finditer(r'"((?:[^"\\]|\\.)*)"', line):
        # ★ 只看【未转义】的反引号：`\\\`` 是字面量、不构成命令替换。
        #   （我第一版直接 in 判断 ⇒ 把本文件自己的修复提示也误报了，已修正。）
        inner = re.sub(r'\\.', '', dm.group(1))
        if '`' in inner:
            b_hits.append(f'B|{i}|{line.strip()[:90]}')

for h in a_hits + b_hits:
    print(h)
PYEOF
)"
  a_lines="$(printf '%s\n' "$hits" | grep '^A|' || true)"
  b_lines="$(printf '%s\n' "$hits" | grep '^B|' || true)"
  if [ -n "$a_lines" ]; then
    echo "❌ $f 存在 \${VAR} 紧跟非 ASCII（bash 会误认为变量名的一部分）："
    printf '%s\n' "$a_lines" | sed 's/^A|/      /;s/|/:/'
    echo "   修复：把变量写成 \${VAR}（加花括号）"
    hits_total=$((hits_total + 1))
  fi
  if [ -n "$b_lines" ]; then
    echo "❌ $f 存在【双引号内的反引号】—— bash 会把它当命令替换并**真的执行**："
    printf '%s\n' "$b_lines" | sed 's/^B|/      /;s/|/:/'
    echo "   修复：去掉反引号（中文提示里不需要它们），或改用 \$(命令) 形式；"
    echo "         若只想显示字面量，用单引号或转义 \\\`"
    hits_total=$((hits_total + 1))
  fi
done

if [ "$hits_total" -eq 0 ]; then
  echo "✅ 脚本自检通过（\${VAR} 与非 ASCII 相邻 / 双引号内反引号）：检查了 ${#FILES[@]} 个文件"
  exit 0
fi
exit 1
# 一个干净的脚本改动
