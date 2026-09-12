#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
validate_h3_prompt.py — ai-video-shot-designer 的 MiniMax H3 分段 Prompt 机械校验器。

把 Skill“交付前静默检查”里可机械化的部分固化为可重复运行的规则：
  - 六字段是否齐全、顺序是否正确、是否重复；
  - 是否只使用官方标签 <Subject/Picture/Video/Audio N>，且使用前已在 subject_definitions 定义；
  - summary 是否以官方任务前缀开头；retention_analysis 是否使用合法保留度枚举；
  - detailed_description 的 At MM:SS.mmm 是否单调递增、是否超过单段时长上限；
  - 台词是否包在 <d>[Language] ... </d>；是否混入 Visual:/Action:/Camera: 等自定义字段；
  - 六字段块内是否误塞 continuity_in/generation_inputs 等内部字段；
  - 中文生成设置里“本段时间线”的时长是否超限；声音字段句数是否在建议范围。

数值口径与 references/platform-spec.md 保持一致；单段硬上限默认 15s，可用 --max-duration 覆盖。

用法：
  python3 scripts/validate_h3_prompt.py FILE [FILE ...]
  python3 scripts/validate_h3_prompt.py --json references/worked-example.md
  cat draft.txt | python3 scripts/validate_h3_prompt.py -

退出码：存在 ERROR 返回 1，否则返回 0（WARNING 不改变退出码）。
"""

import argparse
import json
import re
import sys

FIELDS = [
    "subject_definitions",
    "summary",
    "retention_analysis",
    "detailed_description",
    "overall_soundscape",
    "non_diegetic_music",
]
KNOWN_PREFIXES = (
    "[reference generation]",
    "[reference generation + image reference]",
    "[video editing + audio reuse]",
    "[video editing]",
)
LEGAL_TAG_KINDS = ("Subject", "Picture", "Video", "Audio")
VIS_ENUMS = {"fully_preserved", "partially_preserved", "attribute_transfer", "weak_reference"}
AUD_ENUMS = {"fully_copy", "partially_copy", "reference", "weak_reference"}
ALL_ENUMS = VIS_ENUMS | AUD_ENUMS

FENCE_RE = re.compile(r"```[A-Za-z]*\n(.*?)```", re.S)
TAG_RE = re.compile(r"<(Subject|Picture|Video|Audio)\s*(\d+)>")
ILLEGAL_TAG_RE = re.compile(r"</?\s*([A-Za-z]+)\s*\d*\s*>")
TIME_RE = re.compile(r"At\s+(\d{1,2}):(\d{2}\.\d{3})")
SHOT_RE = re.compile(r"\[Shot\s+\d+\]")
D_RE = re.compile(r"<d>(.*?)</d>", re.S)
D_RAW_RE = re.compile(r"<d>")
TIMELINE_RE = re.compile(r"本段时间线：\s*(\d{1,2}):(\d{2}(?:\.\d+)?)\s*[—\-–]\s*(\d{1,2}):(\d{2}(?:\.\d+)?)")
FORBIDDEN_CUSTOM_RE = re.compile(r"(?im)^\s*(visual|action|camera|motion|lighting|sound)\s*:")
FORBIDDEN_INTERNAL_RE = re.compile(
    r"(?m)^\s*(continuity_in|continuity_out|generation_inputs|state_diff|handoff_frame|"
    r"continuity_mode|generation_duration|overlap_duration|usable_duration|audio_handoff|"
    r"shot_handoff_in|shot_handoff_out|shot_transition)\s*:"
)


def to_sec(m, s):
    return int(m) * 60 + float(s)


def field_spans(block):
    """返回 {field: (header_start, content_start, content_end)}，按出现位置。"""
    spans = {}
    hits = []
    for f in FIELDS:
        m = re.search(r"(?m)^" + re.escape(f) + r"\s*:\s*", block)
        if m:
            hits.append((m.start(), m.end(), f))
    hits.sort()
    for i, (hs, ce, f) in enumerate(hits):
        end = hits[i + 1][0] if i + 1 < len(hits) else len(block)
        spans[f] = (hs, ce, end)
    return spans


def count_sentences(text):
    parts = [p for p in re.split(r"[.!?]+", text) if p.strip()]
    return len(parts)


def validate_block(block, idx, max_duration):
    """校验一个含 subject_definitions 的六字段块。"""
    issues = []
    err = lambda code, msg: issues.append(("ERROR", f"block#{idx} {code}: {msg}"))
    warn = lambda code, msg: issues.append(("WARNING", f"block#{idx} {code}: {msg}"))

    # 1. 字段齐全性 + 顺序 + 重复
    present_order = []
    for f in FIELDS:
        occ = [m.start() for m in re.finditer(r"(?m)^" + re.escape(f) + r"\s*:", block)]
        if len(occ) > 1:
            err("duplicate-field", f"字段 {f} 出现 {len(occ)} 次，只能出现一次")
        if occ:
            present_order.append((f, occ[0]))
    missing = [f for f in FIELDS if f not in dict(present_order)]
    if missing:
        err("missing-field", f"缺少六字段: {', '.join(missing)}")
    ordered = [f for f, _ in sorted(present_order, key=lambda x: x[1])]
    expected = [f for f in FIELDS if f in dict(present_order)]
    if ordered and ordered != expected:
        err("field-order", f"字段顺序错误: {' -> '.join(ordered)}；应为 {' -> '.join(expected)}")

    spans = field_spans(block)

    def content(f):
        return block[spans[f][1]:spans[f][2]].strip() if f in spans else ""

    # 2. 标签合法性 + 先定义后使用
    defined, used = {}, {}
    subj_text = content("subject_definitions")
    for kind, num in TAG_RE.findall(subj_text):
        defined[(kind, int(num))] = True
    body_after_def = block[spans["summary"][1]:] if "summary" in spans else block
    for kind, num in TAG_RE.findall(body_after_def):
        used[(kind, int(num))] = True
    for m in ILLEGAL_TAG_RE.finditer(block):
        kind = m.group(1)
        if kind not in LEGAL_TAG_KINDS and kind not in ("d", "scenetrans", "cutoff"):
            err("illegal-tag", f"出现非官方标签 <{kind}>；只允许 Subject/Picture/Video/Audio 与 d/scenetrans/cutoff")
    for tag in sorted(used):
        if tag not in defined:
            err("tag-undefined", f"<{tag[0]} {tag[1]}> 在 subject_definitions 之后被使用，但未在其中定义")
    for tag in sorted(defined):
        if tag not in used:
            warn("tag-unused", f"<{tag[0]} {tag[1]}> 已定义但后文未使用，确认是否冗余")

    # 3. summary 前缀
    summary = content("summary")
    if summary:
        head = summary.lstrip()
        m = re.match(r"^\[([^\]]+)\]", head)
        if not m:
            err("summary-prefix", "summary 必须以官方任务前缀开头，如 [reference generation]")
        elif head[: len(KNOWN_PREFIXES[0])] and not any(head.startswith(p) for p in KNOWN_PREFIXES):
            warn("summary-prefix-unknown", f"前缀 [{m.group(1)}] 不在已知列表，确认是否为当前官方写法")

    # 4. retention_analysis 枚举
    retention = content("retention_analysis")
    if retention:
        found = set(re.findall(r"[a-z_]+_(?:preserved|copy|transfer|reference)|weak_reference|attribute_transfer|reference", retention))
        found = {x for x in found if "_" in x or x == "reference"}
        if not found:
            warn("retention-enum", "retention_analysis 未出现任何合法保留度枚举（fully_preserved / partially_copy 等）")
        else:
            bad = {x for x in found if x not in ALL_ENUMS}
            if bad:
                warn("retention-enum", f"存在疑似非法保留度取值: {', '.join(sorted(bad))}")

    # 5. detailed_description
    dd = content("detailed_description")
    if dd:
        if not SHOT_RE.search(dd):
            warn("shot-missing", "detailed_description 中没有 [Shot N] 分段")
        if FORBIDDEN_CUSTOM_RE.search(dd):
            err("custom-field", "detailed_description 不允许 Visual:/Action:/Camera: 等自定义字段，请改为自然段落")
        secs = [to_sec(mn, ss) for mn, ss in TIME_RE.findall(dd)]
        if any(b < a for a, b in zip(secs, secs[1:])):
            err("time-order", "At MM:SS.mmm 时间码不是单调递增")
        if secs and max(secs) > max_duration + 1e-6:
            err("time-overflow", f"镜头时间码最大 {max(secs):.3f}s 超过单段上限 {max_duration}s")
        # 台词标签
        for dm in D_RE.finditer(dd):
            inner = dm.group(1)
            if not inner.lstrip().startswith("["):
                err("dialogue-language", "<d> 后必须以 [Language] 标注语言，如 <d>[Chinese]... </d>")
        # 检测写了 <d> 但没闭合
        if len(D_RAW_RE.findall(dd)) != len(D_RE.findall(dd)):
            err("dialogue-unclosed", "存在未用 </d> 闭合的台词标签")

    # 6. 六字段块内不得出现内部字段
    bad_internal = sorted(set(m.group(1) for m in FORBIDDEN_INTERNAL_RE.finditer(block)))
    if bad_internal:
        err("internal-in-block", f"内部字段不得写进六字段块，应放在块前中文生成设置: {', '.join(bad_internal)}")

    # 7. 声音句数（建议项）
    osc = content("overall_soundscape")
    if osc and osc.strip() != "N/A":
        n = count_sentences(osc)
        if n > 4:
            warn("soundscape-length", f"overall_soundscape 建议 1—4 句，当前约 {n} 句")
    nm = content("non_diegetic_music")
    if nm and nm.strip() != "N/A":
        n = count_sentences(nm)
        if n > 3:
            warn("music-length", f"non_diegetic_music 建议 1—3 句，当前约 {n} 句")

    return issues


def validate_text(text, max_duration):
    issues = []
    blocks = [b for b in FENCE_RE.findall(text) if re.search(r"(?m)^subject_definitions\s*:", b)]
    if not blocks:
        issues.append(("WARNING", "未发现任何含 subject_definitions 的六字段块"))
    for i, b in enumerate(blocks, 1):
        issues.extend(validate_block(b, i, max_duration))

    # 中文生成设置：本段时间线时长
    for m in TIMELINE_RE.finditer(text):
        dur = to_sec(m.group(3), m.group(4)) - to_sec(m.group(1), m.group(2))
        if dur > max_duration + 1e-6:
            issues.append(("ERROR", f"本段时间线时长 {dur:.1f}s 超过单段上限 {max_duration}s"))
        if dur <= 0:
            issues.append(("ERROR", "本段时间线结束时间早于或等于开始时间"))
    return issues, len(blocks)


def main():
    ap = argparse.ArgumentParser(description="MiniMax H3 分段 Prompt 机械校验器")
    ap.add_argument("files", nargs="+", help="待校验文件；- 表示标准输入")
    ap.add_argument("--max-duration", type=float, default=15.0, help="单段硬上限秒数，默认 15（与 platform-spec 一致）")
    ap.add_argument("--json", action="store_true", help="以 JSON 输出结果")
    args = ap.parse_args()

    report = {}
    total_err = 0
    for path in args.files:
        if path == "-":
            text, shown = sys.stdin.read(), "<stdin>"
        else:
            try:
                with open(path, encoding="utf-8") as fh:
                    text, shown = fh.read(), path
            except OSError as e:
                report[path] = {"error": f"无法读取: {e}"}
                total_err += 1
                continue
        issues, nblocks = validate_text(text, args.max_duration)
        report[shown] = {"blocks": nblocks, "issues": issues}
        total_err += sum(1 for lvl, _ in issues if lvl == "ERROR")

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        for shown, data in report.items():
            if "error" in data:
                print(f"[{shown}] {data['error']}")
                continue
            print(f"[{shown}] 六字段块 {data['blocks']} 个")
            if not data["issues"]:
                print("  PASS  无 ERROR / WARNING")
            for lvl, msg in data["issues"]:
                print(f"  {lvl:<7} {msg}")
        print("-" * 48)
        print(f"汇总：ERROR={total_err}")

    sys.exit(1 if total_err else 0)


if __name__ == "__main__":
    main()
