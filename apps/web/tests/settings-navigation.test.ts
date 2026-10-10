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
  SETTINGS_ROUTES,
  settingsRelativePath,
  settingsSectionForPath,
  settingsSubViewForPath,
} from '../src/features/settings/settings-navigation.ts';

/** 去掉块注释与行注释：只对「用户可见文案」做断言，不误伤注释里的历史说明 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

// ADR-005 D2：顶层导航固定 4 项，顺序即产品顺序。
// 这个测试的作用是「把架构决策钉在测试里」：谁把导航改回 6 项、改 label/路径，或让旧深链失去落点，都会红。
test('settings navigation is exactly the 4 ADR-005 sections in order', () => {
  assert.equal(SETTINGS_NAV.length, 4, '导航必须是 4 项（ADR-005 D2）');
  assert.deepEqual(
    SETTINGS_NAV.map((n) => n.key),
    ['models', 'channels', 'usage', 'preferences'],
  );
  assert.deepEqual(
    SETTINGS_NAV.map((n) => n.label),
    ['模型', '渠道', '用量', '偏好'],
  );
  assert.deepEqual(
    SETTINGS_NAV.map((n) => n.path),
    ['/settings/models', '/settings/channels', '/settings/usage', '/settings/preferences'],
  );
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
test('all 6 legacy settings paths keep an explicit destination', () => {
  assert.deepEqual(
    SETTINGS_LEGACY_PATHS.map((p) => [p.from, p.to]),
    [
      ['/settings/models', '/settings/models'],
      ['/settings/logical-models', '/settings/models'],
      ['/settings/channels', '/settings/channels'],
      ['/settings/protocols', '/settings/channels/protocols'],
      ['/settings/audit', '/settings/usage'],
      ['/settings/preferences', '/settings/preferences'],
    ],
  );
  // 每条都要有理由（评审看得见为什么这么跳）
  for (const p of SETTINGS_LEGACY_PATHS) assert.ok(p.why.trim().length > 0, `${p.from} 缺少去向理由`);
});

test('legacy redirects target a real route, so no old deep link can land on a 404', () => {
  assert.deepEqual(SETTINGS_LEGACY_REDIRECTS.map((p) => p.from), [
    '/settings/logical-models',
    '/settings/protocols',
    '/settings/audit',
  ]);
  for (const p of SETTINGS_LEGACY_REDIRECTS) {
    assert.ok(SETTINGS_ROUTES.includes(p.to), `${p.from} 跳到不存在的路由 ${p.to}`);
    // 不允许「跳到自己」形成死循环
    assert.notEqual(p.from, p.to);
  }
  // 落点必须都在设置中心内
  for (const p of SETTINGS_LEGACY_PATHS) assert.ok(p.to.startsWith('/settings'), `${p.from} 跳到设置中心之外`);
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
  assert.equal(settingsSectionForPath('/settings/usage')?.key, 'usage');
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

// 「导航被改回 6 项」的护栏：布局只认导航表，且不得再出现被取消的三个顶层入口。
test('the settings layout renders SETTINGS_NAV only, without the three demoted top-level entries', () => {
  const layoutSource = stripComments(
    readFileSync(join(import.meta.dirname, '..', 'src', 'features', 'settings', 'SettingsLayout.tsx'), 'utf8'),
  );
  assert.match(layoutSource, /SETTINGS_NAV\.map\(/, '布局必须由 SETTINGS_NAV 渲染导航');
  for (const dropped of ['协议配置', '调用审计', '逻辑模型管理']) {
    assert.ok(!layoutSource.includes(dropped), `布局里不应再出现被取消的顶层导航「${dropped}」`);
  }
});

// ADR-005 D4（供给池可见性不变量）：供给池（上游/中转站池、其它用户的渠道）只能出现在
// 连接向导与「用户自己的」渠道详情里，不得出现在任何列表/概览/统计页。
// 现有实现里供给池尚无后端接口，本断言把「设置中心不得出现池化数据源」钉成回归护栏。
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

  // 池化数据源/契约的标记词：出现在设置中心即视为违反不变量
  const forbidden = ['供给池', 'channel_models', 'supply_pool', 'supply-pool', 'supplyPool', '/api/v1/pool', '/api/v1/supply'];
  for (const file of targets) {
    const text = readFileSync(file, 'utf8');
    for (const token of forbidden) {
      assert.ok(
        !text.includes(token),
        `${file.replace(srcRoot, 'src')} 出现供给池标记「${token}」：设置中心不得展示平台供给池或他人渠道`,
      );
    }
  }
});
