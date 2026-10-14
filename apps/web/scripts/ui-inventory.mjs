#!/usr/bin/env node
// =============================================================================
// UI 组件清单生成器 —— 「代码是唯一事实源」的组件/设计 token 清单
// =============================================================================
// 用法：
//   node scripts/ui-inventory.mjs               # 生成（写 3 个产物）
//   node scripts/ui-inventory.mjs --check       # 漂移检查（CI 用；不一致则 exit 1）
//   node scripts/ui-inventory.mjs --update-debt # 更新死组件棘轮基线
//
// 为什么这么做（与 `npm run api:check` 同一范式）：
//   清单如果靠人手维护，一定会腐烂——本项目已经吃过「文档与实现漂移」的亏。
//   因此：结构事实（有哪些组件、什么 variants、被谁引用、用了哪些 token）**全部从代码抽取**；
//   只有语义（何时用/别用/反例/分类）需要人写，放在 notes 里，并由本脚本**强制覆盖全部组件**
//   （新增组件忘了写注记 → `--check` 红）。这样清单可以随代码成长，而不是随记忆腐烂。
//
// 产物：
//   src/generated/ui-catalog.ts                          机器可读（展示页/未来工具消费）
//   ../../.agents/skills/frontend-coding/ui-components.md  agent 看的清单（规则域）
//   ../../docs/reference/ui-components.md                 人看的清单（技术参考域）
// 人手维护的输入：
//   ../../.agents/skills/frontend-coding/ui-components.notes.md  语义注记（逐组件）
//   src/pages/dev/ui-kit/demos/*.tsx                             可视化展示页的 demo 注册
//   ui-debt-baseline.json                                        死组件棘轮基线
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(__dirname, '..');            // apps/web
const REPO = path.resolve(WEB, '..', '..');            // 仓库根
const SRC = path.join(WEB, 'src');
const UI_DIR = path.join(SRC, 'components', 'ui');
const NOTES = path.join(REPO, '.agents/skills/frontend-coding/ui-components.notes.md');
const DEMO_DIR = path.join(SRC, 'pages/dev/ui-kit/demos');
const DEBT = path.join(WEB, 'ui-debt-baseline.json');
const OUT_CATALOG = path.join(SRC, 'generated/ui-catalog.ts');
const OUT_AGENT = path.join(REPO, '.agents/skills/frontend-coding/ui-components.md');
const OUT_HUMAN = path.join(REPO, 'docs/reference/ui-components.md');

const CATEGORIES = ['基础', '布局', '导航', '数据录入', '数据展示', '反馈', '其他'];
const TAG = '由 scripts/ui-inventory.mjs 生成 —— 禁止手改；改代码或注记后跑 `npm run ui:generate`。';

const args = new Set(process.argv.slice(2));
const CHECK = args.has('--check');
const UPDATE_DEBT = args.has('--update-debt');

const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
const rel = (p) => path.relative(REPO, p).split(path.sep).join('/');
const walk = (dir, exts, out = []) => {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, exts, out);
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
};

// ── 1. 设计 token ────────────────────────────────────────────────────────────
// 解析 :root（浅色）/.dark（深色）/ @theme inline（Tailwind 工具类映射）
function cssBlocks(css) {
  const blocks = {};
  const re = /(^|\n)(\s*(?::root|\.dark|@theme[^{]*|@utility\s+[a-zA-Z0-9_-]+))\s*\{/g;
  let m;
  while ((m = re.exec(css))) {
    const start = css.indexOf('{', m.index) + 1;
    let depth = 1;
    let i = start;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
      i++;
    }
    blocks[m[2].trim()] = css.slice(start, i - 1);
  }
  return blocks;
}
const varsOf = (block) => {
  const out = {};
  const clean = (block || '').replace(/\/\*[\s\S]*?\*\//g, '');
  // 变量值可能跨多行（如 --font-sans 后面跟一长串字体族、--shadow-md 的多段阴影），
  // 按行匹配会漏掉 —— 实测漏了 --font-sans/--font-serif 与 5 个 shadow。这里按 `;` 收口。
  const re = /(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(clean))) out[m[1]] = m[2].replace(/\s+/g, ' ').trim();
  return out;
};
const groupOf = (name) => {
  const n = name.replace(/^--/, '');
  if (/^(background|foreground|card|popover|primary|secondary|muted|accent|info|success|warning|destructive|border|input|ring|chart|sidebar|button|badge|opaque|elevate)/.test(n)) return '色彩 / 表面';
  if (/^(radius|shadow)/.test(n)) return '圆角 / 阴影';
  if (/^(font|text|leading|tracking)/.test(n)) return '字体 / 排版';
  if (/^(spacing|size)/.test(n)) return '间距 / 尺寸';
  if (/^(animate|duration|ease)/.test(n)) return '动效';
  return '其他';
};
function collectTokens() {
  const theme = read(path.join(SRC, 'tailwind-theme.css'));
  const blocks = cssBlocks(theme);
  const light = varsOf(blocks[':root']);
  const dark = varsOf(blocks['.dark']);
  const themeMap = varsOf(blocks['@theme inline']);
  const tokens = Object.keys(light).map((name) => ({
    name,
    light: light[name],
    dark: dark[name] ?? null,
    group: groupOf(name),
    utilities: Object.entries(themeMap)
      .filter(([, v]) => v.includes(`var(${name})`))
      .map(([k]) => k),
  }));
  // @theme inline 是 Tailwind 工具类的**权威映射**：--color-primary → bg-primary/text-primary/…、
  // --radius-lg → rounded-lg、--shadow-sm → shadow-sm、--font-sans → font-sans。
  // 这类 token 有的在 :root 里有语义来源（颜色/字体），有的没有（radius-sm/md/lg/xl 是 calc 派生），
  // 所以单独成表，agent 写 UI 时应按这张表选工具类而不是硬编码数值。
  const themeUtilities = Object.entries(themeMap).map(([name, value]) => ({
    name,
    value,
    group: name.startsWith('--color-')
      ? '色彩'
      : name.startsWith('--radius-')
        ? '圆角'
        : name.startsWith('--shadow-')
          ? '阴影'
          : name.startsWith('--font-')
            ? '字体'
            : name.startsWith('--text-')
              ? '字号'
              : '其他',
  }));
  // typography.css：@tailwindcss/typography 插件 + prose（长文正文）的 token 映射
  const typographySrc = read(path.join(SRC, 'typography.css'));
  const plugin = (typographySrc.match(/@plugin\s+"([^"]+)"/) || [])[1] ?? null;
  const proseBlock = cssBlocks(typographySrc)['@utility prose'] ?? '';
  const prose = Object.entries(varsOf(proseBlock)).map(([name, value]) => ({ name, value }));
  return { tokens, themeMap, themeUtilities, typography: { plugin, prose } };
}

// ── 2. 组件抽取 ─────────────────────────────────────────────────────────────
// 取某个 variant 值对应的 className（支持跨行字符串与 `"a" + "b"` 拼接）。
// 用途：规范页的 redline 标注（如 button/default 的 min-h-9 → px-4 → rounded-md）与属性表。
function classOfValue(block, value) {
  const re = new RegExp('(^|\\n)\\s*[\'"]?' + value + '[\'"]?\\s*:\\s*');
  const m = re.exec(block);
  if (!m) return '';
  // 值前面可能有注释行（如 button 的 `// Solid primary button …`），先剥掉再取字符串
  let rest = block.slice(m.index + m[0].length).replace(/\/\/[^\n]*\n/g, '\n');
  const parts = [];
  const lit = /^\s*(['"])([\s\S]*?)\1\s*(\+)?/;
  for (let i = 0; i < 8; i++) {
    const mm = lit.exec(rest);
    if (!mm) break;
    parts.push(mm[2]);
    if (!mm[3]) break;
    rest = rest.slice(mm[0].length);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function parseCva(src) {
  // 抓最外层 cva( ... )，再解析 variants / defaultVariants
  const out = [];
  let idx = src.indexOf('cva(');
  while (idx !== -1) {
    let depth = 0;
    let i = src.indexOf('(', idx);
    const start = i;
    for (; i < src.length; i++) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    const body = src.slice(start + 1, i);
    const vm = body.match(/variants\s*:/);
    const dm = body.match(/defaultVariants\s*:\s*\{([\s\S]*?)\}/);
    const defaults = {};
    if (dm) for (const d of dm[1].matchAll(/([a-zA-Z0-9_]+)\s*:\s*['"]([^'"]+)['"]/g)) defaults[d[1]] = d[2];
    if (vm) {
      // variants 块的直接子键（brace 计数保证只取第一层）
      const vbody = body.slice(vm.index);
      const open = vbody.indexOf('{');
      let d2 = 0;
      let j = open;
      for (; j < vbody.length; j++) {
        if (vbody[j] === '{') d2++;
        else if (vbody[j] === '}') {
          d2--;
          if (d2 === 0) break;
        }
      }
      const block = vbody.slice(open + 1, j);
      let d3 = 0;
      let key = null;
      let buf = '';
      for (const line of block.split('\n')) {
        const km = line.match(/^\s{6,8}([a-zA-Z0-9_]+)\s*:\s*\{/);
        if (km && d3 === 0) {
          if (key) {
            const values = valuesOf(buf);
            out.push({ name: key, values, defaultValue: defaults[key], classes: Object.fromEntries(values.map((v) => [v, classOfValue(buf, v)])) });
          }
          key = km[1];
          buf = '';
          d3 += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
          continue;
        }
        if (key) {
          buf += line + '\n';
          d3 += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
        }
      }
      if (key) {
        const values = valuesOf(buf);
        out.push({ name: key, values, defaultValue: defaults[key], classes: Object.fromEntries(values.map((v) => [v, classOfValue(buf, v)])) });
      }
    }
    idx = src.indexOf('cva(', i);
  }
  return out;
}
// 只认「值以字符串开头（或另起一行给字符串）」的键 —— 否则多行 className 里的
// Tailwind 类名（例如 `not-disabled:opacity-100`）会被误当成 variant 值。
const valuesOf = (block) =>
  [...block.matchAll(/^\s*['"]?([a-zA-Z0-9_-]+)['"]?\s*:\s*(?:['"`].*)?$/gm)].map((m) => m[1]);

function collectComponents(allSrcFiles, tokenNames) {
  const files = walk(UI_DIR, ['.tsx', '.ts']).filter((f) => !/index\.(ts|tsx)$/.test(f));
  return files
    .map((file) => {
      const src = read(file);
      const name = path.basename(file).replace(/\.(tsx|ts)$/, '');
      const exports = [
        ...[...src.matchAll(/export\s+(?:function|const|class)\s+([A-Za-z0-9_]+)/g)].map((m) => m[1]),
        ...[...src.matchAll(/export\s*\{([^}]*)\}/g)].flatMap((m) =>
          m[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop().trim()).filter(Boolean),
        ),
      ];
      const primitives = [...new Set([...src.matchAll(/from\s+['"](@radix-ui\/[a-z-]+|@base-ui-components\/[a-z-]+|cmdk|vaul|sonner|embla-carousel-react|react-day-picker|recharts|input-otp|react-resizable-panels|class-variance-authority|@dnd-kit\/[a-z-]+)['"]/g)].map((m) => m[1]))]
        .filter((p) => p !== 'class-variance-authority');
      const slots = [...new Set([...src.matchAll(/data-slot="([a-z0-9-]+)"/g)].map((m) => m[1]))];
      const props = [...new Set([...src.matchAll(/React\.ComponentProps(?:WithoutRef)?<[^>]+>|VariantProps<typeof\s+[A-Za-z0-9_]+>/g)].map((m) => m[0]))];
      const used = allSrcFiles
        // 自身不算引用；**但其它 ui 组件的引用要算**（修正口径：原来排除整个 components/ui/**，
        // 导致 separator/skeleton/item/alert/empty/toggle/image/radio-group 这 8 个被别的 ui 组件
        // 正常使用的组件被误判为"零引用"，让棘轮与画廊折叠区的数字误导决策）。
        .filter((f) => f !== file)
        // 展示页（src/pages/dev/**）会 import **全部**组件用于渲染，不能算「被业务使用」——
        // 否则展示页一上线，零引用组件就全"复活"，死代码信号与棘轮同时失效。
        .filter((f) => !f.startsWith(path.join(SRC, 'pages', 'dev')))
        .filter((f) => !f.startsWith(path.join(SRC, 'generated')))
        .filter((f) => new RegExp(`components/ui/${name}['"]`).test(read(f)))
        .map((f) => rel(f))
        .sort();
      const tokens = [...new Set([...src.matchAll(/var\((--[a-zA-Z0-9-]+)\)/g)].map((m) => m[1]))].filter((t) => tokenNames.has(t));
      return {
        name,
        file: rel(file),
        lines: src.split('\n').length,
        exports: [...new Set(exports)],
        primitives,
        slots,
        props,
        asChild: /asChild/.test(src),
        variants: parseCva(src),
        usage: { count: used.length, files: used },
        dead: used.length === 0,
        tokens: tokens.sort(),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ── 2b. 设计尺度实际用法（从源码统计，供"设计规范"视图用）───────────────────
// 为什么要它：设计同学问的不只是"有哪些 token"，而是"**实际在用哪几档**"。
// 光靠 Tailwind 默认值回答不了这个问题——必须从代码里数。另单独统计**离散步长**
// （如 text-[11px]），它们是要收敛的例外（V-003 禁标题用 text-[Npx]）。
const SCALE_KINDS = {
  text: () => /\btext-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl)\b/g,
  radius: () => /\brounded(?:-(sm|md|lg|xl|2xl|3xl|full|none))?\b/g,
  shadow: () => /\bshadow(?:-(2xs|xs|sm|md|lg|xl|2xl|none))?\b/g,
  leading: () => /\bleading-(none|tight|snug|normal|relaxed|loose|\d+)\b/g,
  tracking: () => /\btracking-(tighter|tight|normal|wide|wider|widest)\b/g,
  spacing: () => /\b(?:gap|gap-x|gap-y|space-x|space-y|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr)-(\d+(?:\.\d+)?)\b/g,
};
const ARBITRARY_KINDS = {
  text: () => /\btext-\[([^\]]+)\]/g,
  spacing: () => /\b(?:gap|gap-x|gap-y|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr)-\[([^\]]+)\]/g,
  radius: () => /\brounded-\[([^\]]+)\]/g,
  shadow: () => /\bshadow-\[([^\]]+)\]/g,
};
function collectScales() {
  const files = walk(SRC, ['.tsx', '.ts']).filter(
    (f) => !f.startsWith(path.join(SRC, 'pages', 'dev')) && !f.startsWith(path.join(SRC, 'generated')),
  );
  const bump = (map, key) => map.set(key, (map.get(key) || 0) + 1);
  const usage = {};
  const arbitrary = {};
  for (const [kind, re] of Object.entries(SCALE_KINDS)) usage[kind] = new Map();
  for (const [kind, re] of Object.entries(ARBITRARY_KINDS)) arbitrary[kind] = new Map();
  for (const f of files) {
    const src = read(f);
    for (const [kind, mk] of Object.entries(SCALE_KINDS)) {
      for (const m of src.matchAll(mk())) {
        const step = m[1] ? `${kind === 'text' ? 'text' : kind}-${m[1]}` : kind;
        bump(usage[kind], m[1] ?? 'DEFAULT');
        void step;
      }
    }
    for (const [kind, mk] of Object.entries(ARBITRARY_KINDS)) {
      for (const m of src.matchAll(mk())) bump(arbitrary[kind], m[1]);
    }
  }
  const toList = (map) => [...map.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
  return {
    scannedFiles: files.length,
    text: toList(usage.text),
    textArbitrary: toList(arbitrary.text),
    spacing: toList(usage.spacing),
    spacingArbitrary: toList(arbitrary.spacing),
    radius: toList(usage.radius),
    radiusArbitrary: toList(arbitrary.radius),
    shadow: toList(usage.shadow),
    shadowArbitrary: toList(arbitrary.shadow),
    leading: toList(usage.leading),
    tracking: toList(usage.tracking),
  };
}

// ── 3. 语义注记（人手写）与 demo 覆盖 ───────────────────────────────────────
function collectNotes() {
  const src = read(NOTES);
  const notes = {};
  let cur = null;
  for (const line of src.split('\n')) {
    const h = line.match(/^##\s+([a-z0-9-]+)\s*$/);
    if (h) {
      cur = h[1];
      notes[cur] = { 分类: '', 何时用: '', 别用: '', 反例: '', 相关: '' };
      continue;
    }
    const kv = line.match(/^-\s*(分类|何时用|别用|反例|相关)：\s*(.*)$/);
    if (cur && kv) notes[cur][kv[1]] = kv[2].trim();
  }
  return notes;
}
function collectDemos() {
  const keys = new Set();
  const placeholders = new Set();
  for (const f of walk(DEMO_DIR, ['.tsx', '.ts'])) {
    const src = read(f);
    for (const line of src.split('\n')) {
      const m = line.match(/^\s*['"]?([a-z0-9-]+)['"]?\s*:\s*[(<]/);
      if (!m) continue;
      keys.add(m[1]);
      // 占位 demo 不算覆盖：否则「demo 待补」能机械地骗过覆盖率门禁（假防线）
      if (/待补|占位|TODO|placeholder/i.test(line)) placeholders.add(m[1]);
    }
  }
  return { keys, placeholders };
}

// ── 4. 组装 catalog ─────────────────────────────────────────────────────────
function build() {
  const { tokens, themeMap, themeUtilities, typography } = collectTokens();
  const tokenNames = new Set(tokens.map((t) => t.name));
  const allSrcFiles = walk(SRC, ['.tsx', '.ts']);
  const scales = collectScales();
  const notes = collectNotes();
  const components = collectComponents(allSrcFiles, tokenNames).map((c) => ({
    ...c,
    category: notes[c.name]?.['分类'] || '其他',
    notes: {
      when: notes[c.name]?.['何时用'] || '',
      avoid: notes[c.name]?.['别用'] || '',
      antiPatterns: (notes[c.name]?.['反例'] || '').split('；').filter(Boolean),
      related: (notes[c.name]?.['相关'] || '').split(/[、,]/).filter(Boolean),
    },
  }));
  const { keys: demoKeys, placeholders } = collectDemos();
  const missingNotes = components.filter((c) => !notes[c.name] || !notes[c.name]['何时用']).map((c) => c.name);
  const missingDemos = components.filter((c) => !demoKeys.has(c.name) || placeholders.has(c.name)).map((c) => c.name);
  const unknownNotes = Object.keys(notes).filter((n) => !components.some((c) => c.name === n));
  const catalog = {
    stats: {
      components: components.length,
      lines: components.reduce((n, c) => n + c.lines, 0),
      dead: components.filter((c) => c.dead).length,
      tokens: tokens.length,
      withNotes: components.length - missingNotes.length,
      withDemo: components.length - missingDemos.length,
    },
    categories: CATEGORIES,
    components,
    tokens,
    missingNotes,
    missingDemos,
    unknownNotes,
    themeUtilities,
    typography,
    scales,
    themeUtilityCount: Object.keys(themeMap).length,
  };
  return { catalog, missingNotes, missingDemos, unknownNotes };
}

// ── 5. 渲染产物 ─────────────────────────────────────────────────────────────
const TYPE_HEADER = `// ┌─────────────────────────────────────────────────────────────────────────┐
// │ ${TAG.padEnd(69)} │
// └─────────────────────────────────────────────────────────────────────────┘
export type UiVariant = { name: string; values: string[]; defaultValue?: string; classes?: Record<string, string> };
export type UiNotes = { when: string; avoid: string; antiPatterns: string[]; related: string[] };
export type UiComponent = {
  name: string; file: string; lines: number; exports: string[]; primitives: string[];
  slots: string[]; props: string[]; asChild: boolean; variants: UiVariant[];
  usage: { count: number; files: string[] }; dead: boolean; tokens: string[];
  category: string; notes: UiNotes;
};
export type UiToken = { name: string; light: string; dark: string | null; group: string; utilities: string[] };
export type UiThemeUtility = { name: string; value: string; group: string };
export type UiTypography = { plugin: string | null; prose: { name: string; value: string }[] };
export type UiScaleStep = { value: string; count: number };
export type UiScales = {
  scannedFiles: number; text: UiScaleStep[]; textArbitrary: UiScaleStep[];
  spacing: UiScaleStep[]; spacingArbitrary: UiScaleStep[];
  radius: UiScaleStep[]; radiusArbitrary: UiScaleStep[]; shadow: UiScaleStep[]; shadowArbitrary: UiScaleStep[];
  leading: UiScaleStep[]; tracking: UiScaleStep[];
};
export type UiCatalog = {
  stats: { components: number; lines: number; dead: number; tokens: number; withNotes: number; withDemo: number };
  categories: string[]; components: UiComponent[]; tokens: UiToken[];
  missingNotes: string[]; missingDemos: string[]; unknownNotes: string[];
  themeUtilities: UiThemeUtility[]; typography: UiTypography; themeUtilityCount: number; scales: UiScales;
};
`;

const renderCatalogTs = (c) => `${TYPE_HEADER}\nexport const UI_CATALOG: UiCatalog = ${JSON.stringify(c, null, 2)};\n`;

function renderAgentMd(c) {
  const L = [];
  L.push('# UI 组件清单（agent 用）', '', `> ${TAG}`, '>',
    '> 写前端 UI 前先查这里：**能复用就别手写**（UC-* 规则）；新增组件只改代码 + 在',
    '> `ui-components.notes.md` 补一段注记，然后 `npm run ui:generate`。', '',
    `## 概览（自动统计）`, '',
    `- 组件 **${c.stats.components}** 个 / ${c.stats.lines} 行；死组件（零引用）**${c.stats.dead}** 个`,
    `- 语义 token **${c.stats.tokens}** 个；Tailwind 工具类映射 ${c.themeUtilityCount} 条；排版：字体 ${c.typography ? 3 : 0} 族 + prose 映射 ${c.typography?.prose.length ?? 0} 条`,
    `- 注记覆盖 **${c.stats.withNotes}/${c.stats.components}**；展示页 demo 覆盖 **${c.stats.withDemo}/${c.stats.components}**`,
    `- 尺度实际用法：字号常用 ${(c.scales.text[0] && `${c.scales.text[0].value}(${c.scales.text[0].count})`) || '—'}；离散步长 ${[...c.scales.textArbitrary, ...c.scales.spacingArbitrary].reduce((n, x) => n + x.count, 0)} 处（优先用尺度 token）`,
    '', '## 按分类速查', '', '| 分类 | 组件 |', '|---|---|');
  for (const cat of CATEGORIES) {
    const list = c.components.filter((x) => x.category === cat).map((x) => x.name);
    if (list.length) L.push(`| ${cat} | ${list.map((n) => `\`${n}\``).join(' ')} |`);
  }
  L.push('', '## 组件明细', '');
  for (const cat of CATEGORIES) {
    const items = c.components.filter((x) => x.category === cat);
    if (!items.length) continue;
    L.push(`### ${cat}`, '');
    for (const x of items) {
      const v = x.variants.filter((z) => z.name === 'variant').flatMap((z) => z.values);
      const s = x.variants.filter((z) => z.name === 'size').flatMap((z) => z.values);
      L.push(`#### \`${x.name}\`${x.dead ? ' ⚠️ 零引用' : ''}`, '',
        `- 文件：\`${x.file}\`（${x.lines} 行）· 导出：${x.exports.map((e) => `\`${e}\``).join('、') || '—'}`,
        v.length ? `- variant：${v.map((q) => `\`${q}\``).join(' ')}${x.variants.find((z) => z.name === 'variant')?.defaultValue ? `（默认 \`${x.variants.find((z) => z.name === 'variant').defaultValue}\`）` : ''}` : null,
        s.length ? `- size：${s.map((q) => `\`${q}\``).join(' ')}` : null,
        x.primitives.length ? `- 底座：${x.primitives.map((p) => `\`${p}\``).join('、')}${x.asChild ? ' · 支持 `asChild`' : ''}` : null,
        `- 引用：${x.usage.count} 处${x.usage.count ? `（${x.usage.files.slice(0, 3).map((f) => `\`${f.split('/').pop()}\``).join('、')}${x.usage.count > 3 ? ' 等' : ''}）` : ''}`,
        x.notes.when ? `- **何时用**：${x.notes.when}` : '- **何时用**：（缺注记 ⚠️）',
        x.notes.avoid ? `- **别用**：${x.notes.avoid}` : null,
        x.notes.antiPatterns.length ? `- 反例：${x.notes.antiPatterns.map((q) => `❌ ${q}`).join('；')}` : null,
        x.notes.related.length ? `- 相关：${x.notes.related.map((q) => `\`${q}\``).join('、')}` : null,
        '');
    }
  }
  if (c.missingNotes.length) L.push('## ⚠️ 缺注记（`npm run ui:check` 会红）', '', c.missingNotes.map((n) => `- \`${n}\``).join('\n'), '');
  if (c.missingDemos.length) L.push('## ⚠️ 缺展示页 demo（`npm run ui:check` 会红）', '', c.missingDemos.map((n) => `- \`${n}\``).join('\n'), '');
  L.push('→ 完整口径见 `docs/reference/ui-components.md`（生成物 + 设计 token 明细）');
  return L.filter((x) => x !== null).join('\n') + '\n';
}

function renderHumanMd(c) {
  const L = [];
  L.push('# UI 组件与设计 token 参考', '', `> ${TAG}`, '',
    '本文件是**生成物**，供人类查阅；agent 的精简版在 `.agents/skills/frontend-coding/ui-components.md`。',
    '改组件 → `cd apps/web && npm run ui:generate`；CI 用 `npm run ui:check` 防漂移。', '',
    '## 1. 现状统计', '',
    '| 项 | 数值 |', '|---|---|',
    `| 组件文件 | ${c.stats.components} 个 / ${c.stats.lines} 行 |`,
    `| 死组件（零引用） | ${c.stats.dead} 个 |`,
    `| 语义 token（:root/.dark） | ${c.stats.tokens} 个 |`,
    `| Tailwind 工具类映射（@theme inline） | ${c.themeUtilityCount} 条 |`,
    `| 字体族 / prose 映射（typography.css） | ${c.typography.prose.length ? 3 : 0} / ${c.typography.prose.length} |`,
    `| 语义注记覆盖 | ${c.stats.withNotes}/${c.stats.components} |`,
    `| 展示页 demo 覆盖 | ${c.stats.withDemo}/${c.stats.components} |`, '',
    '## 2. 设计 token（自动从 `src/tailwind-theme.css` 抽取）', '',
    '> 规则：**禁止硬编码色值**（V-002）；用下列语义 token 或其 Tailwind 工具类。', '');
  for (const g of [...new Set(c.tokens.map((t) => t.group))]) {
    const items = c.tokens.filter((t) => t.group === g);
    L.push(`### ${g}（${items.length}）`, '', '| token | 浅色 | 深色 | Tailwind 工具类 |', '|---|---|---|---|');
    for (const t of items) {
      L.push(`| \`${t.name}\` | \`${t.light}\` | ${t.dark ? `\`${t.dark}\`` : '—'} | ${t.utilities.length ? t.utilities.map((u) => `\`${u}\``).join(' ') : '—'} |`);
    }
    L.push('');
  }
  L.push('## 3. Tailwind 工具类映射（`@theme inline` 权威表）', '',
    '> 写 UI **用这一列的工具类**，不要硬编码数值（V-002）。', '',
    '| @theme token | 值 | 分类 | 对应工具类 |', '|---|---|---|---|');
  for (const t of c.themeUtilities) {
    const util = t.name.startsWith('--color-')
      ? `bg-${t.name.slice(8)} / text-${t.name.slice(8)} / border-${t.name.slice(8)}`
      : t.name.startsWith('--radius-')
        ? `rounded-${t.name.slice(9)}`
        : t.name.startsWith('--shadow-')
          ? `shadow-${t.name.slice(9)}`
          : t.name.startsWith('--font-')
            ? `font-${t.name.slice(7)}`
            : t.name.startsWith('--text-')
              ? `text-${t.name.slice(7)}`
              : '—';
    L.push(`| \`${t.name}\` | \`${t.value}\` | ${t.group} | \`${util}\` |`);
  }
  L.push('', '### 3.1 排版（typography）', '',
    `- 插件：${c.typography.plugin ? `\`${c.typography.plugin}\`` : '（无）'}`,
    '- 字体族：`font-sans`（界面默认）· `font-mono`（代码/数字/ID）· `font-serif`（长文衬线，少用）',
    '- 标题字号**必须用尺度 token**（禁 `text-[Npx]`，V-003）；长文正文用 `prose`（其 token 映射如下）', '',
    '| prose token | 值 |', '|---|---|');
  for (const p of c.typography.prose) L.push(`| \`${p.name}\` | \`${p.value}\` |`);
  const fmt = (list, n = 6) => list.slice(0, n).map((x) => `\`${x.value}\`(${x.count})`).join(' · ') || '—';
  L.push('### 3.2 尺度实际用法（从源码统计 ' + c.scales.scannedFiles + ' 个文件）', '',
    '> 回答的是「**实际在用哪几档**」，不是「有哪些档位」；统计按源码文本匹配，可能含少量非样式字符串。', '',
    '| 类别 | 常用档位（次数） | 离散步长（建议收敛） |', '|---|---|---|',
    `| 字号 | ${fmt(c.scales.text)} | ${fmt(c.scales.textArbitrary)} |`,
    `| 间距 | ${fmt(c.scales.spacing)} | ${fmt(c.scales.spacingArbitrary)} |`,
    `| 圆角 | ${fmt(c.scales.radius)} | ${fmt(c.scales.radiusArbitrary)} |`,
    `| 阴影 | ${fmt(c.scales.shadow)} | ${fmt(c.scales.shadowArbitrary)} |`,
    `| 行高 / 字距 | ${fmt(c.scales.leading, 4)} · ${fmt(c.scales.tracking, 4)} | — |`, '',
    `> ⚠️ 离散步长合计 **${[...c.scales.textArbitrary, ...c.scales.spacingArbitrary, ...c.scales.radiusArbitrary, ...c.scales.shadowArbitrary].reduce((n, x) => n + x.count, 0)}** 处：`,
    '> 小字号尤其集中（如 `text-[10px]`），说明"尺度 token 之外还有一套事实上的离散值"。新增 UI 请优先用尺度 token；标题禁 `text-[Npx]`（V-003）。', '')
  L.push('', '## 4. 组件规格', '', '| 组件 | 分类 | 行数 | variant | size | 引用 | 死组件 | 文件 |', '|---|---|---|---|---|---|---|---|');
  for (const x of c.components) {
    const v = x.variants.find((z) => z.name === 'variant');
    const s = x.variants.find((z) => z.name === 'size');
    L.push(`| \`${x.name}\` | ${x.category} | ${x.lines} | ${v ? v.values.join('/') : '—'} | ${s ? s.values.join('/') : '—'} | ${x.usage.count} | ${x.dead ? '⚠️' : ''} | \`${x.file.replace(/^apps\/web\//, '')}\` |`);
  }
  L.push('', '## 5. 死组件清单（决定删 / 留 / 合并）', '',);
  const dead = c.components.filter((x) => x.dead);
  L.push(dead.length ? dead.map((x) => `- \`${x.name}\`（${x.lines} 行，\`${x.file}\`）`).join('\n') : '（无）', '',
    '## 6. 怎么成长（新增/修改组件时）', '',
    '1. 改/加组件代码（`src/components/ui/*.tsx`，沿用 `cva` + `data-slot` 约定）。',
    '2. 在 `.agents/skills/frontend-coding/ui-components.notes.md` 补一段 `## <组件名>`（分类/何时用/别用/反例/相关）。',
    '3. 在 `src/pages/dev/ui-kit/demos/<分类>.tsx` 加一条 demo（展示页与截图基线要用）。',
    '4. `npm run ui:generate`，把生成物一起提交；漏做任何一步 `npm run ui:check` 会红（CI 同款）。', '',
    '## 7. 可视化展示页', '',
    '`npm run dev` 后打开 **`/dev/ui-kit`**（仅开发环境注册，prod 构建不含）——按分类渲染全部组件与变体、',
    'token 色板，并标注缺 demo 的组件。');
  return L.join('\n') + '\n';
}

// ── 6. 主流程 ───────────────────────────────────────────────────────────────
const { catalog, missingNotes, missingDemos, unknownNotes } = build();
const outputs = [
  [OUT_CATALOG, renderCatalogTs(catalog)],
  [OUT_AGENT, renderAgentMd(catalog)],
  [OUT_HUMAN, renderHumanMd(catalog)],
];
const problems = [];
if (missingNotes.length) problems.push(`缺语义注记（${missingNotes.length}）：${missingNotes.join(', ')}`);
if (missingDemos.length) problems.push(`缺展示页 demo（${missingDemos.length}）：${missingDemos.join(', ')}`);
if (unknownNotes.length) problems.push(`注记里有已不存在的组件（${unknownNotes.length}）：${unknownNotes.join(', ')}`);

// 死组件棘轮：新增死组件必须显式处理，不允许无声变多
const deadNow = catalog.components.filter((c) => c.dead).map((c) => c.name).sort();
let baseline = null;
try {
  baseline = JSON.parse(read(DEBT) || 'null');
} catch {
  problems.push('ui-debt-baseline.json 不是合法 JSON');
}
if (UPDATE_DEBT) {
  fs.writeFileSync(DEBT, JSON.stringify({ deadComponents: deadNow }, null, 2) + '\n');
  console.log(`✓ 已更新死组件基线：${deadNow.length} 个`);
} else if (baseline) {
  const known = new Set(baseline.deadComponents || []);
  const grew = deadNow.filter((n) => !known.has(n));
  const shrank = (baseline.deadComponents || []).filter((n) => !deadNow.includes(n));
  if (grew.length) problems.push(`死组件变多（不允许无声增加，删掉或确认后跑 --update-debt）：${grew.join(', ')}`);
  if (shrank.length) console.log(`  ℹ️ 死组件减少（可跑 --update-debt 收紧基线）：${shrank.join(', ')}`);
}

if (CHECK) {
  const drift = outputs.filter(([p, want]) => read(p) !== want).map(([p]) => rel(p));
  if (drift.length) {
    console.error('❌ UI 清单与代码不同步：');
    for (const d of drift) console.error(`   - ${d}`);
    console.error('   修复：cd apps/web && npm run ui:generate && git add 生成物');
  }
  if (problems.length) {
    console.error('❌ UI 清单成长机制未满足：');
    for (const p of problems) console.error(`   - ${p}`);
  }
  if (drift.length || problems.length) process.exit(1);
  console.log(`✓ UI 清单与代码同步（${catalog.stats.components} 组件 / ${catalog.stats.tokens} token / 死组件 ${catalog.stats.dead} / 注记 ${catalog.stats.withNotes} / demo ${catalog.stats.withDemo}）`);
  process.exit(0);
}

for (const [p, content] of outputs) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  console.log(`  ✍️  ${rel(p)}`);
}
console.log(`✓ 生成完成：组件 ${catalog.stats.components} / token ${catalog.stats.tokens} / 死组件 ${catalog.stats.dead} / 注记 ${catalog.stats.withNotes} / demo ${catalog.stats.withDemo}`);
for (const p of problems) console.log(`  ⚠️  ${p}`);
