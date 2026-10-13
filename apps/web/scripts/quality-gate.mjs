// 开发期质量门禁（L2 静态检查）
// 目的：把「渲染期才能发现的样式反模式」前置到代码层拦截。
// 覆盖反例库 R1-R9 中可在源码静态判定的模式：
//   R2  SelectTrigger 等可点击控件被 w-fit 撑宽 / grid 列未 min-w-0
//   R9  `|| ??` 混用（oxc PARSE_ERROR 反例）
//   纯图标按钮缺 title/aria-label（可访问性 + 自动化定位）
//   页级容器滥用 max-w-*（卡片过窄居中）
// 用法：node scripts/quality-gate.mjs；exit 1 = 有阻断项。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const SRC = join(import.meta.dirname, '..', 'src');
const errors = [];
const warnings = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (extname(p) === '.tsx' || extname(p) === '.ts') checkFile(p, readFileSync(p, 'utf8'));
  }
}

function checkFile(file, src) {
  const lines = src.split('\n');

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
  // 检测对象：grid-cols-* 容器的列 div（同行内联 或 下一行），列 div 的 className 缺 min-w-0 即建议。
  // 注意：min-w-0 判定限定在 className 引号内（?![^"]*min-w-0），避免跨引号误报。
  for (let i = 0; i < lines.length; i++) {
    if (!/grid-cols-/.test(lines[i])) continue;
    // 同行内联列：grid 容器 div 之后紧跟的列 div，其 className 不含 min-w-0
    const inline = lines[i].match(/className="grid grid-cols-[\d-]+[^"]*">\s*<(div)(?:\s+className="(?![^"]*min-w-0)[^"]*")?\s*>/);
    if (inline) {
      warnings.push(`${rel(file)}:${i + 1} grid 列容器建议加 min-w-0（防长文本撑爆列）：${lines[i].trim().slice(0, 90)}`);
      continue;
    }
    // 下一行模式：grid 容器 div 在行尾、列 div 在下一行行首（列 className 不含 min-w-0）
    const next = lines[i + 1] ?? '';
    if (/^\s*<(div) className="(?![^"]*min-w-0)[^"]*"/.test(next)) {
      const n = next.trim();
      if (n.includes('grid') || n.includes('space-y') || n.includes('flex flex-col')) {
        warnings.push(`${rel(file)}:${i + 2} grid 列容器建议加 min-w-0（防长文本撑爆列）：${n.slice(0, 90)}`);
      }
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
}

function rel(p) {
  return p.replace(SRC, 'src');
}

walk(SRC);

console.log(`\n[quality-gate] ${errors.length} error(s), ${warnings.length} warning(s)\n`);
for (const e of errors) console.log(`✗ ${e}`);
for (const w of warnings) console.log(`⚠ ${w}`);
if (errors.length) {
  console.log('\n✗ 阻断：存在必须修复的反模式（R 清单命中）。修复后重跑。');
  process.exit(1);
}
if (warnings.length) console.log('\n⚠ 建议项：按反例库核对后决定是否修复。');
else console.log('✓ 未命中已知反模式。');
