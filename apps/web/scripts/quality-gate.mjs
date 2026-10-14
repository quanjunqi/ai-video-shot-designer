// 开发期质量门禁（L2 静态检查）
// 目的：把「渲染期才能发现的样式反模式」前置到代码层拦截。
// 覆盖反例库 R1-R9 中可在源码静态判定的模式：
//   R2  SelectTrigger 等可点击控件被 w-fit 撑宽 / grid 列未 min-w-0
//   R9  `|| ??` 混用（oxc PARSE_ERROR 反例）
//   纯图标按钮缺 title/aria-label（可访问性 + 自动化定位）
//   页级容器滥用 max-w-*（卡片过窄居中）
//   V-003b 小字号用任意值 text-[Npx]（TASK-UI-003：尺度 token 收敛，**阻断**新增）
// 用法：node scripts/quality-gate.mjs；exit 1 = 有阻断项。
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const SRC = join(import.meta.dirname, '..', 'src');
const TEXT_DEBT_BASELINE = join(import.meta.dirname, '..', 'ui-text-debt-baseline.json');
const errors = [];
const warnings = [];

// V-003b：小字号离散步长棘轮（TASK-UI-003）。
// 为什么是 error：字号离散步长曾是"静默债务"（实测 991 处），只有**阻断新增**才止得住；
// 存量走基线（`ui-text-debt-baseline.json`，只减不增），清零后基线应为空对象。
// 为什么豁免 components/ui/**：那是上游 shadcn 风格基础组件，不在本卡范围（已知 calendar.tsx 2 处）。
const TEXT_ARBITRARY = /\btext-\[[0-9.]+(?:px|rem)\]/g;
const textDebt = new Map();
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (extname(p) === '.tsx' || extname(p) === '.ts') checkFile(p, readFileSync(p, 'utf8'));
  }
}

function checkFile(file, src) {
  const lines = src.split('\n');

  // V-003b：统计本文件的小字号任意值（先剥注释，避免把说明文字当成用法）
  if (!file.includes('/components/ui/')) {
    const hits = stripComments(src).match(TEXT_ARBITRARY);
    if (hits) textDebt.set(rel(file), hits.length);
  }

  // R9: `|| ??` / `&& ??` 混用（oxc PARSE_ERROR 的根因模式）
  // 精确判定：同一子句内（无括号/逗号/分号隔离）`|||&&` 与 `??` 相邻 = 真反例；
  // `(a || b) ?? c` / `a || (b ?? c)` 等括号隔离为合法，不报。
  lines.forEach((line, i) => {
    const noParenScope = /[|&]{2}\s*[^,;(){\n]*\?\?|\?\?\s*[^,;(){\n]*[|&]{2}/;
    if (noParenScope.test(line)) {
      errors.push(`${rel(file)}:${i + 1} 疑似 ||/&& 与 ?? 同一子句混用（oxc PARSE_ERROR 反例，需括号隔离）：${line.trim().slice(0, 90)}`);
    }
  });

  // R2a: 显式给 SelectTrigger 传 w-fit（基类已是 w-full，显式 w-fit 必然溢出）
  lines.forEach((line, i) => {
    if (/SelectTrigger/.test(line) && /className="[^"]*w-fit/.test(line)) {
      errors.push(`${rel(file)}:${i + 1} SelectTrigger 显式 w-fit 会按内容撑宽（反例 R2，改用 w-full min-w-0）：${line.trim().slice(0, 90)}`);
    }
  });

  // R2b: grid 容器内的列没有 min-w-0（长文本会把 grid 列撑爆）
  // 粗检测：grid-cols-* 行的下一行若是列容器（grid/space-y/flex flex-col）且缺 min-w-0 则提示。
  // 实现用确定性提取（className 值字符串判断），不用零宽断言：断言里的 .* 会跨过
  // 引号/标签扫到行尾，导致已含 min-w-0 的行误报（W2 基线回归实测）。
  for (let i = 0; i < lines.length; i++) {
    if (!/grid-cols-/.test(lines[i])) continue;
    const next = (lines[i + 1] ?? '').trim();
    if (!(next.includes('grid') || next.includes('space-y') || next.includes('flex flex-col'))) continue;
    const m = next.match(/<div[^>]*className="([^"]*)"/);
    if (m && !m[1].includes('min-w-0')) {
      warnings.push(`${rel(file)}:${i + 2} grid 列容器建议加 min-w-0（防长文本撑爆列）：${next.slice(0, 90)}`);
    }
  }

  // R-可访问性: 纯图标按钮缺 title/aria-label（<Button><Icon /></Button> 无文本）
  lines.forEach((line, i) => {
    const m = line.match(/<Button[^>]*>/);
    if (m && !/title=|aria-label=/.test(m[0])) {
      const inner = lines[i + 1] ?? '';
      // 下一行只有图标组件（import 大写组件且无文本）+ 紧接着闭合
      if (/^\s*<\/?[A-Z][\w.]*[^>]*>\/?\s*$/.test(inner.replace(/<[^>]+>/g, '').trim()) && !inner.trim()) {
        warnings.push(`${rel(file)}:${i + 1} 纯图标 Button 缺 title/aria-label：${line.trim().slice(0, 80)}`);
      }
    }
  });

  // R3: 页面级容器滥用 max-w-*（卡片过窄居中，两侧大留白）
  if (file.includes('/pages/')) {
    lines.forEach((line, i) => {
      if (/max-w-(2xl|xl)\b/.test(line) && !/Dialog|Modal|Popover/.test(lines.slice(Math.max(0, i - 6), i + 2).join(' '))) {
        warnings.push(`${rel(file)}:${i + 1} 页面级 max-w-* 可能造成两侧大留白（反例 R3，仅弹窗/浮层可用）：${line.trim().slice(0, 90)}`);
      }
    });
  }

  // V-001: 间距节奏——任意值间距非 4px 基数（间距 token 体系以 4 为基数）
  // 合法任意值：4/8/12/16/20/24/28/32/36/40/44/48/56/64/80/96 等 4 的倍数；
  // 非法：gap-[3px] / p-[7px] / space-x-[5px] 等破坏节奏的奇数或非倍数。
  const spacingClass = /\b(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|space-x|space-y)-\[(\d+(?:\.\d+)?)px\]/;
  lines.forEach((line, i) => {
    const m = line.match(spacingClass);
    if (m) {
      const v = parseFloat(m[1]);
      if (v % 4 !== 0 && v !== 2) { // 2px 允许（细分割线场景），其余非 4 倍数警告
        warnings.push(`${rel(file)}:${i + 1} 间距 ${m[0].match(/\[[^\]]+\]/)[0]} 非 4px 节奏（V-001，用 4 基数间距 token）：${line.trim().slice(0, 80)}`);
      }
    }
  });

  // V-002: 色彩 token 一致性——任意值硬编码色值（#hex / rgb / hsl 字面量）
  // 合法：语义 token（text-muted-foreground / bg-card 等）；禁止：# 任意值色。
  const hardColor = /\b(?:text|bg|border|ring|from|to|via|divide|outline|accent|fill|stroke)-\[(?:#[0-9a-fA-F]{3,8}|rgba?|hsla?)[^\]]*\]/;
  lines.forEach((line, i) => {
    if (hardColor.test(line) && !/from-\[|to-\[|via-\[/.test(line)) {
      warnings.push(`${rel(file)}:${i + 1} 硬编码色值（V-002，改用语义色 token：bg-card/text-muted-foreground 等）：${line.trim().slice(0, 80)}`);
    }
  });

  // V-003: 层级对比——标题元素（h1-h3）硬编码字号破坏标题层级
  // 合法：text-lg/xl/2xl/3xl/4xl/5xl 等尺度 token；禁止：标题用 text-[Npx] 硬编码。
  // 仅查标题元素：列表/徽章/表单/描述小字（10-11px）是合法密集排版，不查。
  lines.forEach((line, i) => {
    const m = line.match(/<(h[1-3])\b[^>]*className="[^"]*text-\[(\d+(?:\.\d+)?)px\]/);
    if (m) {
      warnings.push(`${rel(file)}:${i + 1} 标题 <${m[1]}> 硬编码字号 text-[${m[2]}px]（V-003，标题用尺度 token text-lg/xl/2xl...）：${line.trim().slice(0, 80)}`);
    }
  });
}

function rel(p) {
  return p.replace(SRC, 'src');
}

walk(SRC);

// V-003b 棘轮：逐文件与基线比较，**超过基线即阻断**；减少时提示收紧基线
{
  const baseline = existsSync(TEXT_DEBT_BASELINE)
    ? JSON.parse(readFileSync(TEXT_DEBT_BASELINE, 'utf8')).textArbitrary ?? {}
    : {};
  if (process.argv.includes('--update-text-debt')) {
    const next = Object.fromEntries([...textDebt.entries()].sort());
    writeFileSync(TEXT_DEBT_BASELINE, JSON.stringify({ textArbitrary: next }, null, 2) + '\n');
    console.log(`  ✓ V-003b 基线已更新：${Object.keys(next).length} 个文件仍有小字号任意值`);
  } else {
    const TOKENS = 'text-4xs(9px) / text-3xs(10px) / text-2xs(11px) / text-xs(12px) / text-md(13px)';
    for (const [file, count] of textDebt) {
      const budget = baseline[file] ?? 0;
      if (count > budget) {
        errors.push(
          `小字号必须用尺度 token（V-003b）：${file} 有 ${count} 处 text-[Npx]（基线允许 ${budget}）。改用 ${TOKENS}`,
        );
      }
    }
    const shrank = Object.entries(baseline).filter(([f, n]) => (textDebt.get(f) ?? 0) < n);
    if (shrank.length) {
      console.log(`  ℹ️ V-003b 基线可收紧（${shrank.length} 个文件已减少/清零）：node scripts/quality-gate.mjs --update-text-debt`);
    }
  }
}

console.log(`\n[quality-gate] ${errors.length} error(s), ${warnings.length} warning(s)\n`);
for (const e of errors) console.log(`✗ ${e}`);
for (const w of warnings) console.log(`⚠ ${w}`);
if (errors.length) {
  console.log('\n✗ 阻断：存在必须修复的反模式（R 清单命中）。修复后重跑。');
  process.exit(1);
}
if (warnings.length) console.log('\n⚠ 建议项：按反例库核对后决定是否修复。');
else console.log('✓ 未命中已知反模式。');
