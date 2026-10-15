import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  SETTINGS_CHANNEL_RULES_PATH,
  SETTINGS_DEFAULT_PATH,
  SETTINGS_LEGACY_PATHS,
  SETTINGS_LEGACY_REDIRECTS,
  SETTINGS_MODEL_CATALOG_PATH,
  SETTINGS_MODEL_SUBVIEWS,
  SETTINGS_NAV,
  SETTINGS_EXTERNAL_TARGETS,
  SETTINGS_ROUTES,
  settingsRelativePath,
  settingsSectionForPath,
  settingsSubViewForPath,
} from '../src/features/settings/settings-navigation.ts';

/** 去掉块注释与行注释：只对「用户可见文案」做断言，不误伤注释里的历史说明 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

// 方案 A（Owner 决策）：顶层导航固定 3 项「模型 / 渠道 / 偏好」，顺序即产品顺序。
// 这个测试的作用是「把架构决策钉在测试里」：谁把导航改回 6 项、改 label/路径，或让旧深链失去落点，都会红。
test('settings navigation is exactly the 3 sections of 方案 A in order', () => {
  assert.equal(SETTINGS_NAV.length, 3, '导航必须是 3 项（方案 A：设置只放配置）');
  assert.deepEqual(
    SETTINGS_NAV.map((n) => n.key),
    ['models', 'channels', 'preferences'],
  );
  assert.deepEqual(
    SETTINGS_NAV.map((n) => n.label),
    ['模型', '渠道', '偏好'],
  );
  assert.deepEqual(
    SETTINGS_NAV.map((n) => n.path),
    ['/settings/models', '/settings/channels', '/settings/preferences'],
  );
  // 方案 A 的核心：设置里【不得】再有「看运行数据」的分组
  assert.ok(!SETTINGS_NAV.some((n) => n.key === 'usage'), '「用量」必须已移出设置中心');
});

test('every settings section carries a non-empty one-line user task statement', () => {
  for (const item of SETTINGS_NAV) {
    assert.ok(item.task.trim().length > 0, `${item.key} 缺少「用户任务一句话」`);
    // 一句话：不得是空话，也不得长到变成段落
    assert.ok(item.task.length <= 60, `${item.key} 的任务陈述过长（>60 字）`);
  }
});

test('/settings defaults to the 模型 section (first navigation item)', () => {
  assert.equal(SETTINGS_DEFAULT_PATH, '/settings/models');
  assert.equal(SETTINGS_DEFAULT_PATH, SETTINGS_NAV[0].path);
  assert.ok(SETTINGS_ROUTES.includes('/settings'), '默认入口 /settings 本身必须可达（index → 模型）');
});

// ADR-005 §3：模型配置（目录行）与逻辑模型管理在界面上几乎同义 —— 必须明确分出层级。
test('the 模型 section splits into a primary (对外能力) and a secondary (具体模型与来源渠道) view', () => {
  assert.equal(SETTINGS_MODEL_SUBVIEWS.length, 2);
  const [primary, secondary] = SETTINGS_MODEL_SUBVIEWS;
  assert.equal(primary.level, 'primary');
  assert.equal(secondary.level, 'secondary');
  assert.equal(primary.path, SETTINGS_DEFAULT_PATH, '顶层视图就是「模型」的默认入口');
  assert.equal(secondary.path, SETTINGS_MODEL_CATALOG_PATH);
  assert.equal(secondary.path, '/settings/models/catalog');
  // 次级视图的文案必须点明「来源渠道」，否则用户看不出它比顶层低一层
  assert.match(secondary.label, /来源渠道/);
  for (const s of SETTINGS_MODEL_SUBVIEWS) {
    assert.ok(s.hint.trim().length > 0, `${s.key} 缺少层级说明`);
    assert.ok(SETTINGS_ROUTES.includes(s.path), `${s.path} 不在可导航路由表里`);
  }
});

// 旧 6 条路径的最终去向（逐条锁定，改一条就红）
test('all legacy settings paths keep an explicit destination', () => {
  assert.deepEqual(
    SETTINGS_LEGACY_PATHS.map((p) => [p.from, p.to]),
    [
      ['/settings/models', '/settings/models'],
      ['/settings/logical-models', '/settings/models'],
      ['/settings/channels', '/settings/channels'],
      ['/settings/protocols', '/settings/channels/protocols'],
      ['/settings/audit', '/tasks?tab=ledger'],
      ['/settings/usage', '/tasks?tab=ledger'],
      ['/settings/preferences', '/settings/preferences'],
    ],
  );
  // 每条都要有理由（评审看得见为什么这么跳）
  for (const p of SETTINGS_LEGACY_PATHS) assert.ok(p.why.trim().length > 0, `${p.from} 缺少去向理由`);
});

test('legacy redirects target a registered real route (settings or whitelisted app route)', () => {
  assert.deepEqual(SETTINGS_LEGACY_REDIRECTS.map((p) => p.from), [
    '/settings/logical-models',
    '/settings/protocols',
    '/settings/audit',
    '/settings/usage',
  ]);
  for (const p of SETTINGS_LEGACY_REDIRECTS) {
    // 「落点必须真实存在」这条不变量【保留】：落点须在设置路由或已迁出白名单之内。
    // 修订说明（方案 A）：原规则是「落点必须都在设置中心内」；
    // Owner 决定把「用量」移出设置 ⇒ 该规则放宽为「设置内 ∪ 已迁出的真实 app 路由」，
    // 但【不】允许跳到不存在或未登记的路由。
    assert.ok(
      SETTINGS_ROUTES.includes(p.to) || SETTINGS_EXTERNAL_TARGETS.includes(p.to),
      `${p.from} 跳到未登记的落点 ${p.to}（既不在 SETTINGS_ROUTES，也不在 SETTINGS_EXTERNAL_TARGETS）`,
    );
    // 不允许「跳到自己」形成死循环
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
  assert.equal(settingsSectionForPath('/settings/models')?.key, 'models');
  assert.equal(settingsSectionForPath('/settings/models/catalog')?.key, 'models');
  assert.equal(settingsSectionForPath('/settings/channels/protocols')?.key, 'channels');
  // 方案 A 后 /settings/usage 不再是设置分组（它已迁出）——解析结果应为 undefined
  assert.equal(settingsSectionForPath('/settings/usage'), undefined);
  assert.equal(settingsSectionForPath('/settings/preferences')?.key, 'preferences');
  assert.equal(settingsSectionForPath('/comic/projects'), undefined);
});

test('settingsSubViewForPath only matches inside the 模型 section', () => {
  assert.equal(settingsSubViewForPath('/settings/models')?.level, 'primary');
  assert.equal(settingsSubViewForPath('/settings/models/catalog')?.level, 'secondary');
  assert.equal(settingsSubViewForPath('/settings/channels'), undefined);
});

// 导航事实只有被真正挂上路由才有意义：这条断言防止「模型/导航表改了，但 app.tsx 没跟上」，
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
});

// 「导航被改回 6 项」的护栏：布局只认导航表（TASK-AUTH-001 起经角色过滤渲染，
// 过滤函数 visibleSettingsNav 内部仍以 SETTINGS_NAV 为唯一事实源），且不得再出现被取消的三个顶层入口。
test('the settings layout renders SETTINGS_NAV (via role filter) only, without the three demoted top-level entries', () => {
  const layoutSource = stripComments(
    readFileSync(join(import.meta.dirname, '..', 'src', 'features', 'settings', 'SettingsLayout.tsx'), 'utf8'),
  );
  assert.match(layoutSource, /visibleSettingsNav\(/, '布局必须经 visibleSettingsNav 渲染导航（角色过滤，事实源仍是 SETTINGS_NAV）');
  for (const dropped of ['协议配置', '调用审计', '逻辑模型管理']) {
    assert.ok(!layoutSource.includes(dropped), `布局里不应再出现被取消的顶层导航「${dropped}」`);
  }
});

// ADR-005 D4（供给池可见性不变量）—— **2026-10-11 由 Owner 批准按 D4 原意收窄**。
//
// D4 的原文就写明：供给池**必须**出现在两个地方 —— ①接入向导第 2–3 步（此刻的任务就是"挑要用的"）
// ②用户自己渠道的详情（"那是他自己的资源，有权知道我这家能调什么"）；**不得**出现在
// 列表/概览/统计页。旧护栏是"设置中心一律禁止出现池化标记"的关键词扫描，它无法区分
// "用户自己渠道的策展入口"与"平台池总览"，而且它写于"供给池尚无后端接口"之时 —— 该前提已不成立。
//
// 收窄后的规则（**行为为准，不以词汇为准**）：
//   ✅ 允许：**每渠道**的策展入口（CurationPanel）—— 只能按当前渠道取供给
//   ❌ 禁止：任何**列表/概览/统计**意义的设置界面出现池化数据源（标记词仍逐个检查）
//   ❌ 禁止：跨渠道的"全平台供给池"视图
const SUPPLY_EXEMPT = [
  // 每渠道策展入口（ADR-005 D4 的"用户自己渠道的详情"这一场景的正式落地）
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

  // 池化数据源/契约的标记词：出现在设置中心即视为违反不变量（每渠道策展入口除外，见上）
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

// 收窄之后必须用**正向断言**补上行为约束 —— 否则"豁免"会变成没有边界的口子：
// 策展入口只能按当前渠道取供给，且不得出现"全平台供给池"视图。
test('the curation surface only ever reads supply for one channel (ADR-005 D4 narrowed)', () => {
  const panelPath = join(import.meta.dirname, '..', 'src', 'features', 'settings', 'CurationPanel.tsx');
  const panel = readFileSync(panelPath, 'utf8');
  assert.match(panel, /api\.listSupply\(channelId\)/, '只能按当前渠道取供给（不得跨渠道/全量拉取）');
  assert.doesNotMatch(panel, /api\.listSupply\(\)/, '不得存在不带渠道参数的全量拉取');
  assert.doesNotMatch(panel, /\.map\(([^)]*)\)\s*=>\s*[\s\S]{0,80}api\.listSupply/, '不得对渠道集合逐个拉供给来拼"全局池视图"');
  // 入口必须是"某个渠道"，而不是任何列表/概览页面的内嵌总览
  const page = readFileSync(join(import.meta.dirname, '..', 'src', 'pages', 'SettingsChannels.tsx'), 'utf8');
  assert.match(page, /setCurationFor\(c\)/, '策展入口必须由具体渠道触发');
  assert.ok(
    readFileSync(join(import.meta.dirname, '..', '..', '..', 'docs', 'adr', 'settings-information-architecture.md'), 'utf8').includes('人工策展入口'),
    'ADR-005 D4 必须写明"每渠道人工策展入口"是允许的场景（规则与实现同步）',
  );
});
