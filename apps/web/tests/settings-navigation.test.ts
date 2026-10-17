import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  SETTINGS_DEFAULT_PATH,
  SETTINGS_LEGACY_PATHS,
  SETTINGS_LEGACY_REDIRECTS,
  SETTINGS_NAV,
  SETTINGS_EXTERNAL_TARGETS,
  SETTINGS_ROUTES,
  settingsRelativePath,
  settingsSectionForPath,
} from '../src/features/settings/settings-navigation.ts';

/** 去掉块注释与行注释：只对「用户可见文案」做断言，不误伤注释里的历史说明 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

// IA v14（TASK-IA-001，Owner 2026-10-17 确认）：设置中心 = 系统设置域，顶层导航固定 6 区
// 「账号与安全 / 工作区与成员 / 外观 / 通知与默认行为 / 数据与存储 / 关于」。
// 业务配置（模型/渠道/偏好）已全部迁出至模型中心；「用量/审计」唯一入口=模型中心。
// 这个测试的作用是「把架构决策钉在测试里」：谁把导航改回 3 项业务 tab、改 label/路径，
// 或让旧深链失去落点，都会红。
test('settings navigation is exactly the 6 system-settings sections of IA v14 in order', () => {
  assert.equal(SETTINGS_NAV.length, 6, '导航必须是 6 区（IA v14：设置=系统设置域）');
  assert.deepEqual(
    SETTINGS_NAV.map((n) => n.key),
    ['account', 'workspace', 'appearance', 'notifications', 'data', 'about'],
  );
  assert.deepEqual(
    SETTINGS_NAV.map((n) => n.label),
    ['账号与安全', '工作区与成员', '外观', '通知与默认行为', '数据与存储', '关于'],
  );
  assert.deepEqual(
    SETTINGS_NAV.map((n) => n.path),
    ['/settings/account', '/settings/workspace', '/settings/appearance', '/settings/notifications', '/settings/data', '/settings/about'],
  );
  // IA v14 核心：设置里【不得】再有业务对象配置（模型/渠道/偏好/用量）
  for (const banned of ['models', 'channels', 'preferences', 'usage', 'audit'] as const) {
    assert.ok(!SETTINGS_NAV.some((n) => n.key === banned), `「${banned}」必须已迁出设置中心（IA v14）`);
  }
});

test('every settings section carries a non-empty one-line user task statement', () => {
  for (const item of SETTINGS_NAV) {
    assert.ok(item.task.trim().length > 0, `${item.key} 缺少「用户任务一句话」`);
    assert.ok(item.task.length <= 60, `${item.key} 的任务陈述过长（>60 字）`);
  }
});

test('/settings defaults to the 外观 section (first implemented section)', () => {
  assert.equal(SETTINGS_DEFAULT_PATH, '/settings/appearance');
  assert.ok(SETTINGS_ROUTES.includes('/settings'), '默认入口 /settings 本身必须可达（index → 外观）');
});

// v14 §四：10 条旧路径的最终去向（逐条锁定，改一条就红）
test('all legacy settings paths keep an explicit destination (IA v14 redirect table)', () => {
  assert.deepEqual(
    SETTINGS_LEGACY_PATHS.map((p) => [p.from, p.to]),
    [
      ['/settings/models', '/models/catalog'],
      ['/settings/logical-models', '/models/catalog'],
      ['/settings/models/catalog', '/models/catalog'],
      ['/settings/channels', '/models/channels'],
      ['/settings/channels/protocols', '/models/channels'],
      ['/settings/protocols', '/models/channels'],
      ['/settings/preferences', '/settings/appearance'],
      ['/settings/usage', '/models/costs'],
      ['/settings/audit', '/models/audit'],
      ['/models/protocols', '/models/channels'],
    ],
  );
  for (const p of SETTINGS_LEGACY_PATHS) assert.ok(p.why.trim().length > 0, `${p.from} 缺少去向理由`);
});

test('legacy redirects target a registered real route (settings or whitelisted app route)', () => {
  // /models/protocols 的落点在 app.tsx 的 models 路由手动处理（绝对路径），不进入 settings 的 redirect 列表
  assert.deepEqual(SETTINGS_LEGACY_REDIRECTS.map((p) => p.from), [
    '/settings/models',
    '/settings/logical-models',
    '/settings/models/catalog',
    '/settings/channels',
    '/settings/channels/protocols',
    '/settings/protocols',
    '/settings/preferences',
    '/settings/usage',
    '/settings/audit',
  ]);
  for (const p of SETTINGS_LEGACY_REDIRECTS) {
    // 「落点必须真实存在」这条不变量保留：落点须在设置路由或已迁出白名单（模型中心/任务中心）之内。
    assert.ok(
      SETTINGS_ROUTES.includes(p.to) || SETTINGS_EXTERNAL_TARGETS.includes(p.to),
      `${p.from} 跳到未登记的落点 ${p.to}（既不在 SETTINGS_ROUTES，也不在 SETTINGS_EXTERNAL_TARGETS）`,
    );
    assert.notEqual(p.from, p.to);
  }
  for (const p of SETTINGS_LEGACY_PATHS) {
    assert.ok(
      p.to.startsWith('/settings') || SETTINGS_EXTERNAL_TARGETS.includes(p.to),
      `${p.from} 跳到设置中心之外且未在白名单登记：${p.to}`,
    );
  }
});

test('settingsRelativePath strips the /settings prefix for nested <Route> registration', () => {
  assert.equal(settingsRelativePath('/settings/logical-models'), 'logical-models');
  assert.equal(settingsRelativePath('/settings/channels/protocols'), 'channels/protocols');
  assert.equal(settingsRelativePath('/settings'), '/settings', '非子路径原样返回，避免生成空路径路由');
});

test('settingsSectionForPath resolves sub-routes to their parent section', () => {
  assert.equal(settingsSectionForPath('/settings/account')?.key, 'account');
  assert.equal(settingsSectionForPath('/settings/appearance')?.key, 'appearance');
  assert.equal(settingsSectionForPath('/settings/notifications')?.key, 'notifications');
  // 已迁出的路径不再属于任何设置分组（业务配置/用量/审计已迁模型中心）——解析结果应为 undefined
  assert.equal(settingsSectionForPath('/settings/models'), undefined);
  assert.equal(settingsSectionForPath('/settings/channels'), undefined);
  assert.equal(settingsSectionForPath('/settings/preferences'), undefined);
  assert.equal(settingsSectionForPath('/settings/usage'), undefined);
  assert.equal(settingsSectionForPath('/comic/projects'), undefined);
});

// 导航事实只有被真正挂上路由才有意义：这条断言防止「导航表改了，但 app.tsx 没跟上」，
// 也就是防止旧深链在真实路由表里变成 404。
test('app.tsx registers every settings route and wires the legacy redirects from the nav model', () => {
  const appSource = readFileSync(join(import.meta.dirname, '..', 'src', 'app.tsx'), 'utf8');
  assert.match(appSource, /path="settings"/, 'app.tsx 缺少设置中心父路由');
  assert.match(appSource, /SETTINGS_DEFAULT_PATH/, '默认入口必须来自导航表，而不是写死的路径');
  assert.match(appSource, /SETTINGS_LEGACY_REDIRECTS\.map\(/, '旧路径跳转必须由映射表生成（单一事实源）');
  for (const route of SETTINGS_ROUTES) {
    if (route === '/settings') continue;
    const rel = settingsRelativePath(route);
    assert.ok(
      appSource.includes(`path="${rel}"`),
      `app.tsx 未注册路由 ${route}（旧深链会 404）`,
    );
  }
  // /models/protocols 由 models 路由手动重定向到渠道（v14 路由稳定性）
  assert.match(appSource, /path="protocols"[\s\S]{0,120}\/models\/channels/, 'app.tsx 必须重定向 /models/protocols → /models/channels');
});

// 「设置导航被改回 3 项业务 tab」的护栏：布局只认导航表（TASK-IA-001 起经角色过滤渲染，
// 过滤函数 visibleSettingsNav 内部仍以 SETTINGS_NAV 为唯一事实源），且不得再出现被取消的业务配置入口。
test('the settings layout renders SETTINGS_NAV (via role filter) only, without the demoted business-config entries', () => {
  const layoutSource = stripComments(
    readFileSync(join(import.meta.dirname, '..', 'src', 'features', 'settings', 'SettingsLayout.tsx'), 'utf8'),
  );
  assert.match(layoutSource, /visibleSettingsNav\(/, '布局必须经 visibleSettingsNav 渲染导航（角色过滤，事实源仍是 SETTINGS_NAV）');
  for (const dropped of ['连接规则', '模型目录', '模型广场', '渠道与凭据', '逻辑模型']) {
    assert.ok(!layoutSource.includes(dropped), `布局里不应再出现被取消的导航「${dropped}」`);
  }
});

// ADR-005 D4（供给池可见性不变量）—— 2026-10-11 由 Owner 批准按 D4 原意收窄。
// 收窄后的规则（行为为准，不以词汇为准）：
//   ✅ 允许：每渠道的策展入口（CurationPanel）—— 只能按当前渠道取供给
//   ❌ 禁止：任何列表/概览/统计意义的设置界面出现池化数据源；跨渠道的"全平台供给池"视图
const SUPPLY_EXEMPT = [
  join('features', 'settings', 'CurationPanel.tsx'),
  join('features', 'settings', 'curation.ts'),
];

test('no settings surface renders the supply pool (ADR-005 D4 invariant)', () => {
  const srcRoot = join(import.meta.dirname, '..', 'src');
  const targets: string[] = [];
  const collect = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) collect(p);
      else if (/\.tsx?$/.test(p)) targets.push(p);
    }
  };
  collect(join(srcRoot, 'features', 'settings'));
  for (const name of readdirSync(join(srcRoot, 'pages'))) {
    if (name.startsWith('Settings')) targets.push(join(srcRoot, 'pages', name));
  }
  targets.push(join(srcRoot, 'stores', 'useSettingsStore.ts'));
  assert.ok(targets.length >= 8, `扫描目标过少（${targets.length}），检查测试自身`);

  const forbidden = ['供给池', 'channel_models', 'supply_pool', 'supply-pool', 'supplyPool', '/api/v1/pool', '/api/v1/supply'];
  for (const file of targets) {
    if (SUPPLY_EXEMPT.some((suffix) => file.endsWith(suffix))) continue;
    const text = readFileSync(file, 'utf8');
    for (const token of forbidden) {
      assert.ok(
        !text.includes(token),
        `${file.replace(srcRoot, 'src')} 出现供给池标记「${token}」：设置中心不得出现列表/概览/统计意义的池化数据源`,
      );
    }
  }
});

// 收窄之后必须用正向断言补上行为约束 —— 否则"豁免"会变成没有边界的口子。
test('the curation surface only ever reads supply for one channel (ADR-005 D4 narrowed)', () => {
  const panelPath = join(import.meta.dirname, '..', 'src', 'features', 'settings', 'CurationPanel.tsx');
  const panel = readFileSync(panelPath, 'utf8');
  assert.match(panel, /api\.listSupply\(channelId\)/, '只能按当前渠道取供给（不得跨渠道/全量拉取）');
  assert.doesNotMatch(panel, /api\.listSupply\(\)/, '不得存在不带渠道参数的全量拉取');
  assert.doesNotMatch(panel, /\.map\(([^)]*)\)\s*=>\s*[\s\S]{0,80}api\.listSupply/, '不得对渠道集合逐个拉供给来拼"全局池视图"');
  // 入口必须是"某个渠道"，而不是任何列表/概览页面的内嵌总览
  // （TASK-IA-001：渠道页已从设置中心迁至模型中心 → 策展入口落在 ModelChannels.tsx）
  const page = readFileSync(join(import.meta.dirname, '..', 'src', 'pages', 'ModelChannels.tsx'), 'utf8');
  assert.match(page, /setCurationFor\(c\)/, '策展入口必须由具体渠道触发');
  assert.ok(
    readFileSync(join(import.meta.dirname, '..', '..', '..', 'docs', 'adr', 'settings-information-architecture.md'), 'utf8').includes('人工策展入口'),
    'ADR-005 D4 必须写明"每渠道人工策展入口"是允许的场景（规则与实现同步）',
  );
});
