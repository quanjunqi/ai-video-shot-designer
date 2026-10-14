// 组件库展示页的「视图模型」：把 src/generated/ui-catalog.ts 的结构事实
// 翻译成三个受众各自能读的形态（组件画廊 / 设计规范 / 工程规格）。
//
// 为什么单独成文件（而不是塞进 UiKitPage.tsx）：
//   1) 本文件不含 JSX，可以被 Node 内置测试直接 import（tests/ui-kit-model.test.ts），
//      纯函数有测试，页面只负责渲染；
//   2) react-refresh 的 only-export-components 规则不允许组件文件同时导出常量/函数。
// 约束：本文件不新增事实源，只做「派生」——所有组件 / token 数据仍来自 ui-catalog.ts。
import type { UiComponent, UiThemeUtility, UiToken } from '@/generated/ui-catalog';

// 生成物与文档路径（工程规格视图里直接引用，避免多处手写字符串）
export const GENERATE_COMMAND = 'npm run ui:generate';
export const CHECK_COMMAND = 'npm run ui:check';
export const NOTES_FILE = '.agents/skills/frontend-coding/ui-components.notes.md';
export const HUMAN_DOC_PATH = 'docs/reference/ui-components.md';
export const AGENT_DOC_PATH = '.agents/skills/frontend-coding/ui-components.md';

// 未纳入当前产品的组件区块的锚点（与分类锚点同一套 scroll-mt 约定）
export const UNUSED_ANCHOR = 'unused-components';

export type UiKitView = 'gallery' | 'spec' | 'engineering';

export type UiKitViewOption = { value: UiKitView; label: string; hint: string };

// 三段式视图切换的事实源（视图名 + 面向谁）
export const UI_KIT_VIEWS: UiKitViewOption[] = [
  { value: 'gallery', label: '组件画廊', hint: '面向产品 / 设计：组件长什么样、什么时候用' },
  { value: 'spec', label: '设计规范', hint: '面向产品 / 设计：色彩、字体、间距、圆角、阴影与动效' },
  { value: 'engineering', label: '工程规格（开发者）', hint: '面向开发者：变体、引用、行数、props 与 token 映射' },
];

export type CategoryGroup = {
  id: string;
  category: string;
  number: string;
  description: string;
  components: UiComponent[];
  // 该分类下「已实现但当前产品未使用」的数量（有在用组件时也一并标注）
  unusedCount: number;
  implementedCount: number;
};

// 分类的用途说明（设计规范口径，不是工程口径）
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  基础: '原子元素与容器',
  布局: '页面结构与空间组织',
  导航: '层级跳转与视图切换',
  数据录入: '表单与输入控件',
  数据展示: '数据呈现与折叠',
  反馈: '操作结果与状态告知',
  其他: '暂未归类',
};

export function categoryDescription(category: string): string {
  return CATEGORY_DESCRIPTIONS[category] ?? '组件集合';
}

export function padIndex(index: number): string {
  return String(index + 1).padStart(2, '0');
}

export function normalizeQuery(input: string): string {
  return input.trim().toLowerCase();
}

// 分类 → 锚点 id：id 与编号都取自 UI_CATALOG.categories 的固定下标，
// 这样即使搜索结果让某个分类暂时消失，其余锚点与编号也不会错位。
export function buildCategoryGroups(
  components: UiComponent[],
  categories: string[],
): CategoryGroup[] {
  const groups: CategoryGroup[] = [];
  categories.forEach((category, index) => {
    const inCategory = components.filter((component) => component.category === category);
    if (inCategory.length === 0) return;
    const live = inCategory.filter((component) => !component.dead);
    groups.push({
      id: `cat-${index}`,
      category,
      number: padIndex(index),
      description: categoryDescription(category),
      components: live,
      unusedCount: inCategory.length - live.length,
      implementedCount: inCategory.length,
    });
  });
  return groups;
}

// 搜索口径：组件名 / 分类 / 导出名 + 「何时用」的人话（产品同学多半按用途搜）
export function matchesQuery(component: UiComponent, query: string): boolean {
  if (!query) return true;
  const haystack = [
    component.name,
    component.category,
    component.notes.when,
    ...component.exports,
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

export type VariantDimension = {
  name: string;
  values: string[];
  defaultValue?: string;
  // redline：cva 里每个取值对应的类名（生成物可选字段，缺席时为空对象）
  classes: Record<string, string>;
};

export type VariantSummary = {
  // 视觉变体总数（各维度取值之和）：工程规格表用
  total: number;
  // 去重后的维度（生成器对 item 这类组件会重复抽到同名 variant）
  dimensions: VariantDimension[];
  // size 维度的取值，工程规格表单独一列
  sizeValues: string[];
  // size 维度本身（状态矩阵用它做列）
  sizeDimension: VariantDimension | null;
};

export function summarizeVariants(component: UiComponent): VariantSummary {
  const seen = new Set<string>();
  const dimensions: VariantDimension[] = [];
  for (const variant of component.variants) {
    const key = `${variant.name}:${variant.values.join(',')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dimensions.push({
      name: variant.name,
      values: variant.values,
      defaultValue: variant.defaultValue,
      classes: variant.classes ?? {},
    });
  }
  const sizeDimension = dimensions.find((dimension) => dimension.name === 'size') ?? null;
  return {
    total: dimensions.reduce((sum, dimension) => sum + dimension.values.length, 0),
    dimensions,
    sizeValues: sizeDimension ? sizeDimension.values : [],
    sizeDimension,
  };
}

// 详情弹层的「属性表」：属性 / 取值 / 默认值 / 说明（说明取该属性默认值的类名 redline）。
export type VariantPropRow = {
  name: string;
  values: string[];
  defaultValue: string | null;
  classes: Record<string, string>;
};

export function variantPropRows(component: UiComponent): VariantPropRow[] {
  return summarizeVariants(component).dimensions.map((dimension) => ({
    name: dimension.name,
    values: dimension.values,
    defaultValue: dimension.defaultValue ?? null,
    classes: dimension.classes,
  }));
}

export function classForValue(classes: Record<string, string>, value: string | null): string | null {
  if (!value) return null;
  return classes[value] ?? null;
}

// ── 设计规范：色彩按语义分组 ────────────────────────────────────────────────
// 清单里的 group 只有「色彩 / 表面」一档（49 个 token 混在一起），
// 产品同学看不出「哪个是背景、哪个是文字、哪个是状态色」，所以再按名称前缀细分。
export const SEMANTIC_COLOR_GROUPS = ['表面', '文字', '边框', '状态', '图表', '侧栏'] as const;

export type SemanticColorGroup = { id: string; label: string; tokens: UiToken[] };

// 只把「真的是颜色」的 token 画成色卡：--opaque-button-border-intensity 之类是数值，
// 画出来是空块，属于给读者制造困惑。
export function isColorValue(value: string): boolean {
  return /^(#|hsl|rgb|oklch|lab|lch|color\()/i.test(value.trim());
}

export function semanticColorGroupOf(token: UiToken): string {
  const name = token.name;
  if (name.startsWith('--sidebar')) return '侧栏';
  if (name.startsWith('--chart-')) return '图表';
  if (/^--(info|destructive|success|warning)(-foreground)?$/.test(name)) return '状态';
  if (name.endsWith('-foreground')) return '文字';
  if (/^--(border|input|ring)$/.test(name) || name.endsWith('-border') || name.endsWith('-outline')) {
    return '边框';
  }
  return '表面';
}

export function groupColorTokens(tokens: UiToken[]): SemanticColorGroup[] {
  const colorTokens = tokens.filter(
    (token) => token.group.startsWith('色彩') && isColorValue(token.light),
  );
  return SEMANTIC_COLOR_GROUPS.map((label) => ({
    id: `color-${label}`,
    label,
    tokens: colorTokens.filter((token) => semanticColorGroupOf(token) === label),
  })).filter((group) => group.tokens.length > 0);
}

// ── 设计规范：字体 / 圆角 / 阴影 / 动效样本 ────────────────────────────────
export type CssSample = { name: string; css: string; value: string };

const FONT_ORDER = ['--font-sans', '--font-mono', '--font-serif'];

const FONT_PURPOSES: Record<string, string> = {
  '--font-sans': '正文、标题与界面文案',
  '--font-mono': '代码、token 名、数字与快捷键',
  '--font-serif': '引用、文学化标题与强调',
};

export function fontPurpose(name: string): string {
  return FONT_PURPOSES[name] ?? '字体族';
}

export function fontSamples(tokens: UiToken[]): UiToken[] {
  const byName = new Map(tokens.map((token) => [token.name, token]));
  return FONT_ORDER.map((name) => byName.get(name)).filter((token): token is UiToken =>
    Boolean(token),
  );
}

// 圆角：@theme inline 不会把 --radius-sm 等变量输出到 :root（值被内联进工具类），
// 所以这里渲染「可求值的表达式」（calc(var(--radius) - 4px)），而不是 var(--radius-sm)。
export function radiusSamples(tokens: UiToken[], utilities: UiThemeUtility[]): CssSample[] {
  const base = tokens.find((token) => token.name === '--radius');
  const samples: CssSample[] = base
    ? [{ name: base.name, css: `var(${base.name})`, value: base.light }]
    : [];
  for (const utility of utilities) {
    if (utility.group !== '圆角') continue;
    samples.push({ name: utility.name, css: utility.value, value: utility.value });
  }
  return samples;
}

// 阴影：与圆角相反，--shadow-* 是「未分层」的 :root 声明，运行时 var() 可解析，直接用变量。
// 含基础档 --shadow，共 8 档（2xs/xs/sm/base/md/lg/xl/2xl）。
export function shadowSamples(tokens: UiToken[], utilities: UiThemeUtility[]): CssSample[] {
  const themed = new Set(utilities.map((utility) => utility.name));
  return tokens
    .filter((token) => /^--shadow(-(2xs|xs|sm|md|lg|xl|2xl))?$/.test(token.name))
    .filter((token) => themed.has(token.name))
    .map((token) => ({ name: token.name, css: `var(${token.name})`, value: token.light }));
}

// 动效 token：清单里目前还没有 --animate/--duration/--ease 系列，
// 这一节会退回「暂无统一动效 token」的说明；一旦设计变量补齐即自动生效。
export function motionTokens(tokens: UiToken[]): UiToken[] {
  return tokens.filter((token) => /^--(animate|duration|ease|transition)/.test(token.name));
}

// ── 工程规格：@theme 工具类映射 ─────────────────────────────────────────────
export function utilityClassFor(name: string): string {
  if (name.startsWith('--color-')) {
    const base = name.slice('--color-'.length);
    return `bg-${base} / text-${base} / border-${base}`;
  }
  if (name.startsWith('--radius')) {
    const suffix = name.slice('--radius'.length).replace(/^-/, '');
    return suffix ? `rounded-${suffix}` : 'rounded';
  }
  if (name.startsWith('--shadow')) {
    const suffix = name.slice('--shadow'.length).replace(/^-/, '');
    return suffix ? `shadow-${suffix}` : 'shadow';
  }
  if (name.startsWith('--font-')) return `font-${name.slice('--font-'.length)}`;
  return '—';
}

// 工程规格表：变体维度摘要（不含 size，size 单独一列）
export function variantDimensionLabel(component: UiComponent): string {
  const { dimensions } = summarizeVariants(component);
  const others = dimensions.filter((dimension) => dimension.name !== 'size');
  if (others.length === 0) return '—';
  return others
    .map((dimension) => `${dimension.name}（${dimension.values.length}）`)
    .join(' · ');
}

export function sizeValuesLabel(component: UiComponent): string {
  const { sizeValues } = summarizeVariants(component);
  return sizeValues.length > 0 ? sizeValues.join(' / ') : '—';
}

export function importPathFor(componentName: string): string {
  return `@/components/ui/${componentName}`;
}

// 复制 import 路径：失败静默（HTTP 上下文 / 无权限 / jsdom 里 clipboard 可能不存在）
export async function copyImportPath(componentName: string): Promise<boolean> {
  const text = importPathFor(componentName);
  try {
    if (!navigator.clipboard) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
