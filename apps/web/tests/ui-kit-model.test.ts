import assert from 'node:assert/strict';
import test from 'node:test';
import type { UiComponent, UiThemeUtility, UiToken } from '../src/generated/ui-catalog.ts';
import {
  buildCategoryGroups,
  classForValue,
  fontSamples,
  groupColorTokens,
  importPathFor,
  isColorValue,
  matchesQuery,
  motionTokens,
  normalizeQuery,
  padIndex,
  radiusSamples,
  semanticColorGroupOf,
  shadowSamples,
  summarizeVariants,
  utilityClassFor,
  variantPropRows,
} from '../src/pages/dev/ui-kit/uiKitModel.ts';
import {
  isDiscreteBucket,
  readScaleEntries,
  readScales,
  scaleLabel,
  spacingPx,
  sumCounts,
} from '../src/pages/dev/ui-kit/uiKitScales.ts';

// 组件库展示页的视图模型（纯函数）单测。
// 为什么值得钉住：这一层决定「产品同学看到什么、工程同学看到什么」——
// 分区错位（比如把状态色塞进表面色）、编号错位、尺度统计读错字段，页面不会报错，
// 只会安静地展示错误信息，属于最典型的假绿。

// 类型来自生成物（`import type` 在运行时被类型擦除，不需要解析 '@/generated'）。
type ComponentInput = UiComponent;
type TokenInput = UiToken;
type UtilityInput = UiThemeUtility;

function component(patch: Partial<ComponentInput> & { name: string }): ComponentInput {
  return {
    file: `apps/web/src/components/ui/${patch.name}.tsx`,
    lines: 42,
    exports: [patch.name],
    primitives: [],
    slots: [],
    props: [],
    asChild: false,
    variants: [],
    usage: { count: 0, files: [] },
    dead: false,
    tokens: [],
    category: '基础',
    notes: { when: '演示用途', avoid: '', antiPatterns: [], related: [] },
    ...patch,
  };
}

function token(patch: Partial<TokenInput> & { name: string }): TokenInput {
  return {
    light: 'hsl(0 0% 100%)',
    dark: 'hsl(0 0% 0%)',
    group: '色彩 / 表面',
    utilities: [],
    ...patch,
  };
}

function utility(patch: Partial<UtilityInput> & { name: string }): UtilityInput {
  return { value: `var(${patch.name})`, group: '色彩', ...patch };
}

test('normalizeQuery 去空白并小写', () => {
  assert.equal(normalizeQuery('  Button \n'), 'button');
});

test('matchesQuery 覆盖组件名 / 分类 / 导出名 / 用途', () => {
  const button = component({
    name: 'button',
    category: '基础',
    notes: { when: '触发一次明确动作', avoid: '', antiPatterns: [], related: [] },
  });
  assert.equal(matchesQuery(button, ''), true);
  assert.equal(matchesQuery(button, 'butt'), true);
  assert.equal(matchesQuery(button, '基础'), true);
  assert.equal(matchesQuery(button, '明确动作'), true);
  assert.equal(matchesQuery(button, 'accordion'), false);
});

test('padIndex 输出两位编号', () => {
  assert.equal(padIndex(0), '01');
  assert.equal(padIndex(5), '06');
  assert.equal(padIndex(11), '12');
});

test('buildCategoryGroups 编号按清单下标稳定，只收在用组件并给出未用数量', () => {
  const categories = ['基础', '布局', '反馈'];
  const groups = buildCategoryGroups(
    [
      component({ name: 'button', category: '反馈' }),
      component({ name: 'accordion', category: '反馈', dead: true }),
    ],
    categories,
  );
  assert.equal(groups.length, 1);
  assert.deepEqual(
    groups.map((group) => [group.id, group.number, group.category]),
    [['cat-2', '03', '反馈']],
  );
  assert.deepEqual(
    groups[0].components.map((item) => item.name),
    ['button'],
  );
  assert.equal(groups[0].unusedCount, 1);
  assert.equal(groups[0].implementedCount, 2);
  assert.equal(groups[0].description.length > 0, true);
});

test('buildCategoryGroups 保留「有实现但无在用」的分类（编号不缺号）', () => {
  const groups = buildCategoryGroups(
    [component({ name: 'accordion', category: '数据展示', dead: true })],
    ['基础', '数据展示'],
  );
  assert.deepEqual(
    groups.map((group) => [group.number, group.components.length, group.implementedCount]),
    [['02', 0, 1]],
  );
});

test('summarizeVariants 去重同名维度并统计变体总数', () => {
  const summary = summarizeVariants(
    component({
      name: 'item',
      variants: [
        { name: 'variant', values: ['default', 'outline'], defaultValue: 'default' },
        { name: 'variant', values: ['default', 'outline'], defaultValue: 'default' },
        { name: 'size', values: ['default', 'sm'], defaultValue: 'default' },
      ],
    }),
  );
  assert.equal(summary.total, 4);
  assert.equal(summary.dimensions.length, 2);
  assert.deepEqual(summary.sizeValues, ['default', 'sm']);
  assert.equal(summary.sizeDimension?.name, 'size');
  assert.deepEqual(summary.dimensions[0].classes, {});
});

test('summarizeVariants 带上 cva 类名（redline），variantPropRows 逐属性输出', () => {
  const button = component({
    name: 'button',
    variants: [
      {
        name: 'variant',
        values: ['default', 'ghost'],
        defaultValue: 'default',
        classes: { default: 'bg-primary text-primary-foreground', ghost: 'border border-transparent' },
      },
      { name: 'size', values: ['default', 'sm'], defaultValue: 'default', classes: { default: 'min-h-9 px-4 py-2', sm: 'min-h-8 px-3 text-xs' } },
    ],
  });
  const summary = summarizeVariants(button);
  assert.equal(summary.total, 4);
  assert.deepEqual(summary.dimensions[0].classes, {
    default: 'bg-primary text-primary-foreground',
    ghost: 'border border-transparent',
  });
  const rows = variantPropRows(button);
  assert.deepEqual(
    rows.map((row) => [row.name, row.defaultValue, row.classes.sm ?? null]),
    [
      ['variant', 'default', null],
      ['size', 'default', 'min-h-8 px-3 text-xs'],
    ],
  );
  assert.equal(classForValue(rows[1].classes, 'sm'), 'min-h-8 px-3 text-xs');
  assert.equal(classForValue(rows[1].classes, null), null);
});

test('semanticColorGroupOf 按用途而不是按声明顺序分组', () => {
  assert.equal(semanticColorGroupOf(token({ name: '--background' })), '表面');
  assert.equal(semanticColorGroupOf(token({ name: '--muted-foreground' })), '文字');
  assert.equal(semanticColorGroupOf(token({ name: '--destructive-border' })), '边框');
  assert.equal(semanticColorGroupOf(token({ name: '--warning-foreground' })), '状态');
  assert.equal(semanticColorGroupOf(token({ name: '--chart-3' })), '图表');
  assert.equal(semanticColorGroupOf(token({ name: '--sidebar-ring' })), '侧栏');
});

test('groupColorTokens 丢掉非颜色 token，且分组全部非空', () => {
  const groups = groupColorTokens([
    token({ name: '--background' }),
    token({ name: '--opaque-button-border-intensity', light: '-8' }),
    token({ name: '--font-sans', light: 'Inter', group: '字体 / 排版' }),
  ]);
  assert.deepEqual(
    groups.map((group) => group.label),
    ['表面'],
  );
  assert.deepEqual(
    groups[0].tokens.map((item) => item.name),
    ['--background'],
  );
});

test('radiusSamples 渲染可求值表达式（@theme inline 不输出 --radius-sm 变量）', () => {
  const samples = radiusSamples(
    [token({ name: '--radius', light: '0.5rem', group: '圆角 / 阴影' })],
    [
      utility({ name: '--radius-sm', value: 'calc(var(--radius) - 4px)', group: '圆角' }),
      utility({ name: '--radius-lg', value: 'var(--radius)', group: '圆角' }),
      utility({ name: '--color-card', value: 'var(--card)' }),
    ],
  );
  assert.deepEqual(samples, [
    { name: '--radius', css: 'var(--radius)', value: '0.5rem' },
    { name: '--radius-sm', css: 'calc(var(--radius) - 4px)', value: 'calc(var(--radius) - 4px)' },
    { name: '--radius-lg', css: 'var(--radius)', value: 'var(--radius)' },
  ]);
});

test('shadowSamples 取 8 档阴影（含基础档），用运行时变量', () => {
  const samples = shadowSamples(
    [
      token({ name: '--shadow', light: '0 1px 2px', group: '圆角 / 阴影' }),
      token({ name: '--shadow-sm', light: '0 1px 2px', group: '圆角 / 阴影' }),
      token({ name: '--shadow-x', light: '0px', group: '圆角 / 阴影' }),
    ],
    [utility({ name: '--shadow', value: 'var(--shadow)', group: '其他' }), utility({ name: '--shadow-sm', value: 'var(--shadow-sm)', group: '阴影' })],
  );
  assert.deepEqual(samples, [
    { name: '--shadow', css: 'var(--shadow)', value: '0 1px 2px' },
    { name: '--shadow-sm', css: 'var(--shadow-sm)', value: '0 1px 2px' },
  ]);
});

test('fontSamples 固定 sans / mono / serif 顺序', () => {
  const fonts = fontSamples([
    token({ name: '--font-serif', light: 'Georgia' }),
    token({ name: '--font-sans', light: 'Inter' }),
    token({ name: '--font-mono', light: 'Mono' }),
  ]);
  assert.deepEqual(
    fonts.map((font) => font.name),
    ['--font-sans', '--font-mono', '--font-serif'],
  );
});

test('motionTokens 只认动效变量前缀', () => {
  const motions = motionTokens([
    token({ name: '--animate-spin', light: 'spin 1s linear infinite' }),
    token({ name: '--duration-fast', light: '150ms' }),
    token({ name: '--ease-out', light: 'cubic-bezier(0, 0, 0.2, 1)' }),
    token({ name: '--shadow-md', light: '0 1px 2px' }),
  ]);
  assert.deepEqual(
    motions.map((item) => item.name),
    ['--animate-spin', '--duration-fast', '--ease-out'],
  );
});

test('readScaleEntries 字段缺席 / 形状不符时退化为空数组，并按次数降序', () => {
  assert.deepEqual(readScaleEntries(undefined, 'text'), []);
  assert.deepEqual(readScaleEntries({}, 'text'), []);
  assert.deepEqual(readScaleEntries({ text: 'text-sm' }, 'text'), []);
  assert.deepEqual(readScaleEntries({ text: [{ value: 'text-sm' }] }, 'text'), []);
  assert.deepEqual(
    readScaleEntries(
      {
        text: [
          { value: 'xs', count: 3 },
          { value: 'sm', count: 120 },
          { value: 'lg', count: 'many' },
        ],
      },
      'text',
    ),
    [
      { value: 'sm', count: 120 },
      { value: 'xs', count: 3 },
    ],
  );
});

test('readScales 读 scales 各桶并带 scannedFiles', () => {
  const report = readScales({
    scales: {
      scannedFiles: 197,
      text: [{ value: 'xs', count: 370 }],
      textArbitrary: [{ value: '10px', count: 438 }],
      spacing: [{ value: '2', count: 716 }],
      spacingArbitrary: [],
      radius: [{ value: 'lg', count: 198 }],
      radiusArbitrary: [],
      shadow: [{ value: 'DEFAULT', count: 65 }],
      shadowArbitrary: [],
      leading: [{ value: 'relaxed', count: 75 }],
      tracking: [{ value: 'wide', count: 12 }],
    },
  });
  assert.equal(report.scannedFiles, 197);
  assert.deepEqual(report.buckets.text, [{ value: 'xs', count: 370 }]);
  assert.deepEqual(report.buckets.shadow, [{ value: 'DEFAULT', count: 65 }]);
  assert.equal(sumCounts(report.buckets.textArbitrary), 438);
});

test('scaleLabel 把统计值翻译成可读类名', () => {
  assert.equal(scaleLabel('text', 'xs'), 'text-xs');
  assert.equal(scaleLabel('textArbitrary', '10px'), 'text-[10px]');
  assert.equal(scaleLabel('spacing', '1.5'), '1.5');
  assert.equal(scaleLabel('radius', 'DEFAULT'), 'rounded');
  assert.equal(scaleLabel('radius', 'lg'), 'rounded-lg');
  assert.equal(scaleLabel('radiusArbitrary', '2px'), 'rounded-[2px]');
  assert.equal(scaleLabel('shadow', 'DEFAULT'), 'shadow');
  assert.equal(scaleLabel('shadow', 'md'), 'shadow-md');
  assert.equal(scaleLabel('leading', 'relaxed'), 'leading-relaxed');
  assert.equal(scaleLabel('tracking', 'wide'), 'tracking-wide');
});

test('isDiscreteBucket 只认任意值桶', () => {
  assert.equal(isDiscreteBucket('textArbitrary'), true);
  assert.equal(isDiscreteBucket('spacingArbitrary'), true);
  assert.equal(isDiscreteBucket('text'), false);
});

test('spacingPx 换算 4px 节奏（含半档）', () => {
  assert.equal(spacingPx('2'), '8px');
  assert.equal(spacingPx('1.5'), '6px');
  assert.equal(spacingPx('0.5'), '2px');
  assert.equal(spacingPx('-0.45rem'), null);
});

test('utilityClassFor 覆盖四类 token 且未知返回占位符', () => {
  assert.equal(
    utilityClassFor('--color-muted-foreground'),
    'bg-muted-foreground / text-muted-foreground / border-muted-foreground',
  );
  assert.equal(utilityClassFor('--radius-sm'), 'rounded-sm');
  assert.equal(utilityClassFor('--radius'), 'rounded');
  assert.equal(utilityClassFor('--shadow-2xs'), 'shadow-2xs');
  assert.equal(utilityClassFor('--shadow'), 'shadow');
  assert.equal(utilityClassFor('--font-mono'), 'font-mono');
  assert.equal(utilityClassFor('--opaque-button-border-intensity'), '—');
});

test('importPathFor 指向 ui 目录', () => {
  assert.equal(importPathFor('alert-dialog'), '@/components/ui/alert-dialog');
});

test('isColorValue 只认颜色字面量', () => {
  assert.equal(isColorValue('hsl(40 33% 97%)'), true);
  assert.equal(isColorValue('#000000'), true);
  assert.equal(isColorValue('0.5rem'), false);
  assert.equal(isColorValue('-8'), false);
});
