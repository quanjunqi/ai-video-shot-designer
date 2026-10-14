import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// UI 清单的**成长不变量**：清单由 scripts/ui-inventory.mjs 从代码生成，
// 这里把「生成物必须与代码同步、必须覆盖全部组件、必须带语义注记与 demo」钉成测试，
// 免得哪天有人绕过 ui:check 直接手改清单（那会让清单随记忆腐烂，而不是随代码成长）。

const WEB = join(import.meta.dirname, '..');
const REPO = join(WEB, '..', '..');
const UI_DIR = join(WEB, 'src', 'components', 'ui');
const CATALOG = join(WEB, 'src', 'generated', 'ui-catalog.ts');
const NOTES = join(REPO, '.agents', 'skills', 'frontend-coding', 'ui-components.notes.md');
const AGENT_MD = join(REPO, '.agents', 'skills', 'frontend-coding', 'ui-components.md');
const HUMAN_MD = join(REPO, 'docs', 'reference', 'ui-components.md');
const DEBT = join(WEB, 'ui-debt-baseline.json');
const APP = join(WEB, 'src', 'app.tsx');

const CATEGORIES = ['基础', '布局', '导航', '数据录入', '数据展示', '反馈', '其他'];

function loadCatalog() {
  const src = readFileSync(CATALOG, 'utf8');
  const key = 'export const UI_CATALOG: UiCatalog = ';
  const start = src.indexOf(key);
  assert.ok(start > 0, 'ui-catalog.ts 必须由 scripts/ui-inventory.mjs 生成（找不到 UI_CATALOG 常量）');
  return JSON.parse(src.slice(start + key.length, src.lastIndexOf(';')));
}

const componentFiles = readdirSync(UI_DIR)
  .filter((f) => /\.(tsx|ts)$/.test(f) && f !== 'index.ts' && f !== 'index.tsx')
  .map((f) => f.replace(/\.(tsx|ts)$/, ''));

test('清单覆盖全部 ui 组件（新增组件必须重新生成）', () => {
  const catalog = loadCatalog();
  const names = catalog.components.map((c) => c.name).sort();
  assert.deepEqual(names, [...componentFiles].sort(), 'ui-catalog.ts 与 src/components/ui/ 不一致：请跑 npm run ui:generate');
  assert.equal(catalog.stats.components, componentFiles.length);
});

test('每个组件都有分类与语义注记（AC-008 的成长门）', () => {
  const catalog = loadCatalog();
  const bad = catalog.components.filter((c) => !CATEGORIES.includes(c.category));
  assert.deepEqual(bad.map((c) => c.name), [], '组件分类必须取自固定 7 类，且写进 ui-components.notes.md');
  const missing = catalog.components.filter((c) => !c.notes.when).map((c) => c.name);
  assert.deepEqual(missing, [], `缺语义注记（何时用）：${missing.join(', ')}`);
  assert.deepEqual(catalog.missingNotes, []);
  assert.deepEqual(catalog.unknownNotes, [], '注记里有已不存在的组件，请清理');
});

test('每个组件都有展示页 demo（否则展示页会留白）', () => {
  const catalog = loadCatalog();
  assert.deepEqual(catalog.missingDemos, [], `缺展示页 demo：${catalog.missingDemos.join(', ')}`);
});

test('组件文件路径真实存在，且 token 引用都来自主题文件', () => {
  const catalog = loadCatalog();
  const tokenNames = new Set(catalog.tokens.map((t) => t.name));
  for (const c of catalog.components) {
    assert.ok(existsSync(join(REPO, c.file)), `${c.name} 的 file 不存在：${c.file}`);
    const stray = c.tokens.filter((t) => !tokenNames.has(t));
    assert.deepEqual(stray, [], `${c.name} 引用了主题里没有的 token：${stray.join(', ')}`);
  }
  assert.ok(catalog.tokens.length > 0 && catalog.tokens.every((t) => t.light), 'token 必须有浅色值');
});

test('死组件棘轮：零引用组件不得无声变多', () => {
  const catalog = loadCatalog();
  const baseline = JSON.parse(readFileSync(DEBT, 'utf8'));
  const known = new Set(baseline.deadComponents);
  const grew = catalog.components.filter((c) => c.dead && !known.has(c.name)).map((c) => c.name);
  assert.deepEqual(grew, [], `新增零引用组件：${grew.join(', ')} —— 要么接上引用，要么显式跑 npm run ui:debt 并说明理由`);
});

test('生成物带「禁止手改」声明，且 agent 版与人类版都存在', () => {
  for (const p of [AGENT_MD, HUMAN_MD]) {
    const src = readFileSync(p, 'utf8');
    assert.match(src, /禁止手改/, `${p} 必须声明为生成物`);
    assert.match(src, /ui:generate/, `${p} 必须写明重新生成的命令`);
  }
  assert.match(readFileSync(AGENT_MD, 'utf8'), /UI 组件清单/);
});

test('展示页只在 DEV 注册（prod 不打包 ui-kit）', () => {
  const src = readFileSync(APP, 'utf8');
  assert.match(src, /import\.meta\.env\.DEV/, 'app.tsx 必须用 import.meta.env.DEV 守卫展示页路由');
  assert.match(src, /dev\/ui-kit/);
  assert.match(src, /lazy\(\(\) => import\('@\/pages\/dev\/ui-kit\/UiKitPage'\)\)/, '必须是动态 import，否则会进 prod 主包');
  assert.match(readFileSync(NOTES, 'utf8'), /## button/, '注记文件必须保留逐组件段落格式');
});
