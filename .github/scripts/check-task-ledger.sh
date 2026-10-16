#!/usr/bin/env bash
# 台账一致性门禁 —— README（人读）× ledger.json（机读）× 任务卡 front-matter 三方一致。
# 规则出处：AC-008 / AC-010 / AC-011（`.agents/skills/acceptance-checklist/SKILL.md`）。
#
# 为什么需要它（本项目真实事故，已重复 6 次）
#   `.github/tasks/README.md`（人读表）与 `.github/tasks/ledger.json`（机读视图）是**双维护**，
#   一致性此前**只靠人记得**。实测漂移四类：
#     · 标题被截断在 40 字符（AUTH-001 / FIX-004 / IA-001 / ROUTE-003）
#     · 状态写成约定外的自由文本（`已合并（PR #203，fbffb64）`），按枚举消费的 agent 直接漏计
#     · 数量/口径漂移（README 抬头 40 张 vs ledger 43 条；现状段自述与本文件索引表互不一致）
#     · 状态滞后（代码已合并，台账仍停在「待验收」）
#   历史 `chore/ledger-backfill-*` PR 就是在反复修同一类漂移 —— 靠人事后回填不能终止它。
#
# 用法：
#   bash .github/scripts/check-task-ledger.sh               # 校验当前仓库
#   bash .github/scripts/check-task-ledger.sh --self-test   # 反例自检：证明这道门真的会红
#
# 退出码：0 = 通过；1 = 有违规；2 = 【无法检查】（缺 python3 / 缺台账文件）—— 2 不等于通过。
#
# ★ 单一实现：CI（ci.yml 的 Documentation Check 步骤）与本地（scripts/preflight.sh）调用的是
#   **同一个文件**，不另写第二份 —— 规则写在两处迟早分叉（见 scripts/check-shell-vars.sh 头注教训）。
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "${ROOT}" || exit 2

if ! command -v python3 >/dev/null 2>&1; then
  echo "❌ 无法检查：python3 不在 PATH ⇒ 这道门【未验证】（不等于通过）" >&2
  exit 2
fi

MODE="check"
if [ "${1:-}" = "--self-test" ]; then
  MODE="self-test"
fi

python3 - "${MODE}" "${ROOT}/.github/tasks" <<'PY'
# -*- coding: utf-8 -*-
"""台账一致性校验器（结构与词表层面，不做语义审查）。"""
import json
import os
import re
import shutil
import sys
import tempfile

STATUS_ENUM = ('待开工', '进行中', '待验收', '已验收', '已关闭')
UNKNOWN = 'unknown'
UNKNOWN_IN_README = '—'
REQUIRED_FILES = ('task.md', 'acceptance.md', 'devlog.md', 'devlog.events.json')
ID_RE = re.compile(r'^(TASK-[A-Za-z0-9._-]+|PLAN-[A-Za-z0-9._-]+)$')
LINK_RE = re.compile(r'\]\(([^)]+)\)')
FM_RE = re.compile(r'^---\s*$(.*?)^---\s*$', re.M | re.S)
FM_STATUS_RE = re.compile(r'^status:\s*(.+?)\s*$', re.M)


def parse_readme(text):
    """解析台账索引表 → ({id: {title, status}}, [id 顺序])。"""
    rows, order = {}, []
    for line in text.splitlines():
        s = line.strip()
        if not s.startswith('|'):
            continue
        cells = [c.strip() for c in s.strip('|').split('|')]
        if len(cells) < 4 or not ID_RE.match(cells[0]):
            continue
        rows[cells[0]] = {'title': cells[1], 'status': cells[3]}
        order.append(cells[0])
    return rows, order


def read_frontmatter_status(path):
    """取任务卡 front-matter 的 status 原文；无 front-matter 或无该字段返回 None。"""
    try:
        text = open(path, encoding='utf-8').read()
    except OSError:
        return None
    m = FM_RE.match(text)
    if not m:
        return None
    m2 = FM_STATUS_RE.search(m.group(1))
    return m2.group(1).strip().strip('"').strip("'") if m2 else None


def run_checks(tasks_dir):
    """返回 (errors, unverified)。unverified 非空表示「无法检查」，调用方应判为 rc=2。"""
    errors, unverified = [], []
    readme_path = os.path.join(tasks_dir, 'README.md')
    ledger_path = os.path.join(tasks_dir, 'ledger.json')

    if not os.path.isfile(readme_path):
        unverified.append('台账索引不存在：%s' % readme_path)
    if not os.path.isfile(ledger_path):
        unverified.append('台账机器视图不存在：%s' % ledger_path)
    if unverified:
        return errors, unverified

    # ---- 1. ledger.json 合法 JSON ----
    try:
        data = json.load(open(ledger_path, encoding='utf-8'))
    except (ValueError, OSError) as exc:
        errors.append('ledger.json 不是合法 JSON：%s' % exc)
        return errors, unverified
    tasks = data.get('tasks')
    if not isinstance(tasks, list) or not tasks:
        errors.append('ledger.json 缺少非空的 tasks 数组')
        return errors, unverified

    readme_rows, readme_order = parse_readme(open(readme_path, encoding='utf-8').read())

    # ---- 2. 状态枚举 ----
    for t in tasks:
        st = t.get('status')
        if st == UNKNOWN:
            continue
        if st not in STATUS_ENUM:
            errors.append("状态越界：%s 的 status=%r 不在约定五值 %s（也未标 %s）"
                          % (t.get('id'), st, '/'.join(STATUS_ENUM), UNKNOWN))

    # ---- 3. 数量一致 ----
    if len(tasks) != len(readme_order):
        errors.append('数量不一致：ledger.json 有 %d 条，README 索引表有 %d 行'
                      % (len(tasks), len(readme_order)))

    # ---- 4. ID 集合双向相等 ----
    ledger_ids = [t.get('id') for t in tasks]
    ledger_set, readme_set = set(ledger_ids), set(readme_order)
    for missing in sorted(readme_set - ledger_set):
        errors.append('ID 只在 README、不在 ledger.json：%s' % missing)
    for missing in sorted(ledger_set - readme_set):
        errors.append('ID 只在 ledger.json、不在 README：%s' % missing)

    # ---- 5/6. 逐条标题与状态一致 ----
    for t in tasks:
        tid = t.get('id')
        row = readme_rows.get(tid)
        if row is None:
            continue  # 已由判据 4 报出
        title = t.get('title') or ''
        if row['title'] != title:
            errors.append('标题不一致：%s\n      README=%s\n      ledger=%s' % (tid, row['title'], title))
        st = t.get('status')
        expect = UNKNOWN_IN_README if st == UNKNOWN else (st or '')
        if not row['status'].startswith(expect):
            errors.append('状态不一致：%s README=%r 未以 ledger 的 %r 开头' % (tid, row['status'], st))

    # ---- 7. file 字段链接可达 ----
    for t in tasks:
        raw = t.get('file') or ''
        m = LINK_RE.search(raw)
        target = m.group(1) if m else raw
        target = target.split('#')[0].strip()
        if not target:
            errors.append('file 字段为空：%s' % t.get('id'))
            continue
        if not os.path.exists(os.path.join(tasks_dir, target)):
            errors.append('file 链接悬空：%s 指向 %s（不存在）' % (t.get('id'), target))

    # ---- 8. 任务目录结构（AC-008/010/011）；平铺卡不适用 ----
    for t in tasks:
        tid = t.get('id')
        if not tid:
            continue
        d = os.path.join(tasks_dir, tid)
        if not os.path.isdir(d):
            continue
        for name in REQUIRED_FILES:
            if not os.path.isfile(os.path.join(d, name)):
                errors.append('任务目录结构不全：%s/ 缺 %s（AC-008/010/011）' % (tid, name))

    # ---- 9. front-matter 词表同源（枚举 + 与 ledger 相等）----
    for t in tasks:
        tid = t.get('id')
        if not tid:
            continue
        card = os.path.join(tasks_dir, tid, 'task.md')
        if not os.path.isfile(card):
            continue
        fm_status = read_frontmatter_status(card)
        if fm_status is None:
            errors.append('任务卡缺 front-matter status：%s/task.md（AC-011）' % tid)
            continue
        if fm_status != UNKNOWN and fm_status not in STATUS_ENUM:
            errors.append('front-matter 词表违规：%s/task.md status=%r 不在约定五值 %s'
                          % (tid, fm_status, '/'.join(STATUS_ENUM)))
        ledger_status = t.get('status')
        if fm_status != ledger_status:
            errors.append('front-matter 与台账不一致：%s front-matter=%r ledger=%r'
                          % (tid, fm_status, ledger_status))

    return errors, unverified


def report(tasks_dir):
    errors, unverified = run_checks(tasks_dir)
    if unverified:
        for u in unverified:
            print('   ❌ %s' % u)
        print('   ⇒ 台账一致性门禁【未验证】（不等于通过）')
        return 2
    if errors:
        for e in errors:
            print('   ❌ %s' % e)
        print('   ⇒ 台账一致性门禁未通过：%d 处违规' % len(errors))
        return 1
    print('   ✅ 台账一致性门禁通过')
    return 0


def self_test(tasks_dir):
    """反例自检：在临时副本上注入缺陷，证明这道门真的会红。"""
    cases = []

    def add(name, mutate, expect_rc=1):
        cases.append((name, mutate, expect_rc))

    def _mut_json_bad(d):
        open(os.path.join(d, 'ledger.json'), 'w', encoding='utf-8').write('{"tasks": [ }')

    def _mut_status(d):
        p = os.path.join(d, 'ledger.json')
        o = json.load(open(p, encoding='utf-8'))
        o['tasks'][0]['status'] = '已合并（PR #203，fbffb64）'
        json.dump(o, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

    def _mut_count(d):
        p = os.path.join(d, 'ledger.json')
        o = json.load(open(p, encoding='utf-8'))
        o['tasks'].pop()
        json.dump(o, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

    def _mut_id(d):
        p = os.path.join(d, 'README.md')
        lines = open(p, encoding='utf-8').read().splitlines(True)
        out, dropped = [], False
        for line in lines:
            if not dropped and ID_RE.match(line.strip().strip('|').split('|')[0].strip()):
                dropped = True
                continue
            out.append(line)
        open(p, 'w', encoding='utf-8').write(''.join(out))

    def _mut_title(d):
        p = os.path.join(d, 'ledger.json')
        o = json.load(open(p, encoding='utf-8'))
        for t in o['tasks']:
            if t['id'] == 'TASK-AUTH-001':
                t['title'] = t['title'][:40]  # 复现真实事故：40 字符截断
        json.dump(o, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

    def _mut_file(d):
        p = os.path.join(d, 'ledger.json')
        o = json.load(open(p, encoding='utf-8'))
        o['tasks'][0]['file'] = '[没有这个文件](no/such/file.md)'
        json.dump(o, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

    def _mut_dir(d):
        for name in sorted(os.listdir(d)):
            sub = os.path.join(d, name)
            if os.path.isdir(sub) and os.path.isfile(os.path.join(sub, 'devlog.events.json')):
                os.remove(os.path.join(sub, 'devlog.events.json'))
                return
        raise RuntimeError('自检前置失败：找不到含 devlog.events.json 的任务目录')

    def _mut_fm_word(d):
        for name in sorted(os.listdir(d)):
            card = os.path.join(d, name, 'task.md')
            if os.path.isfile(card):
                text = open(card, encoding='utf-8').read()
                open(card, 'w', encoding='utf-8').write(
                    FM_STATUS_RE.sub('status: accepted', text, count=1))
                return
        raise RuntimeError('自检前置失败：找不到任务卡')

    def _mut_fm_mismatch(d):
        for name in sorted(os.listdir(d)):
            card = os.path.join(d, name, 'task.md')
            if os.path.isfile(card):
                text = open(card, encoding='utf-8').read()
                open(card, 'w', encoding='utf-8').write(
                    FM_STATUS_RE.sub('status: 待开工', text, count=1))
                return
        raise RuntimeError('自检前置失败：找不到任务卡')

    def _mut_missing_readme(d):
        os.remove(os.path.join(d, 'README.md'))

    add('反例 A：ledger.json 非法 JSON', _mut_json_bad)
    add('反例 B：状态越界（自由文本）', _mut_status)
    add('反例 C：数量不一致（ledger 少一条）', _mut_count)
    add('反例 D：ID 只在 ledger、不在 README', _mut_id)
    add('反例 E：标题 40 字符截断', _mut_title)
    add('反例 F：file 链接悬空', _mut_file)
    add('反例 G：任务目录缺 devlog.events.json', _mut_dir)
    add('反例 H：front-matter 词表违规（accepted）', _mut_fm_word)
    add('反例 I：front-matter 与台账状态不一致', _mut_fm_mismatch)
    add('反例 J：台账索引缺失 → 无法检查', _mut_missing_readme, expect_rc=2)

    failed = []
    for name, mutate, expect_rc in cases:
        tmp = tempfile.mkdtemp(prefix='ledger-selftest-')
        try:
            dst = os.path.join(tmp, '.github', 'tasks')
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copytree(tasks_dir, dst)
            try:
                mutate(dst)
            except RuntimeError as exc:
                failed.append('%s —— 自检无法构造（%s）' % (name, exc))
                continue
            errors, unverified = run_checks(dst)
            got = 2 if unverified else (1 if errors else 0)
            if got == expect_rc:
                detail = unverified[0] if unverified else ('%d 处违规' % len(errors))
                print('   ✅ %s → rc=%d（%s）' % (name, got, detail))
            else:
                failed.append('%s —— 期望 rc=%d，实际 rc=%d（这道门漏判了）' % (name, expect_rc, got))
                print('   ❌ %s → rc=%d（期望 rc=%d）' % (name, got, expect_rc))
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    print('')
    if failed:
        for f in failed:
            print('   ❌ %s' % f)
        print('   ⇒ 反例自检未通过：%d/%d —— 门禁有效性不成立' % (len(failed), len(cases)))
        return 1
    print('   ✅ 反例自检通过：%d/%d 全部按预期拦截（含 rc=2 未验证语义）' % (len(cases), len(cases)))
    return 0


def main():
    mode, tasks_dir = sys.argv[1], sys.argv[2]
    if mode == 'self-test':
        print('台账门禁反例自检（证明这道门真的会红）')
        rc_self = self_test(tasks_dir)
        print('')
        print('当前仓库正例校验')
        rc_real = report(tasks_dir)
        return rc_self if rc_self != 0 else rc_real
    return report(tasks_dir)


if __name__ == '__main__':
    sys.exit(main())
PY
