import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// D3 接线不变量（TASK-IA-001 v14 迁移后）：工作区渠道的同步/保存只能写【工作区域】；
// 平台渠道不得被界面改。这条错了就是跨租户改别人的事实（ADR-005 D1 护栏）。
// 渠道页迁至模型中心后，写路径收敛在 store.upsertChannel（页面不直接碰 API），
// 故不变量在 store 层验证。

const page = readFileSync(new URL('../src/pages/ModelChannels.tsx', import.meta.url), 'utf8');
const store = readFileSync(new URL('../src/stores/useSettingsStore.ts', import.meta.url), 'utf8');

test('store：upsertChannel 必须走 api.putUserChannel（工作区域），不写平台目录', () => {
  assert.match(store, /api\.putUserChannel\(/, '必须通过工作区 API 保存渠道');
  assert.doesNotMatch(store, /api\.updateCatalogChannel\(/, 'store 不得写平台目录的渠道');
  assert.doesNotMatch(store, /api\.createCatalogChannel\(/, 'store 不得创建平台渠道');
});

test('页面：不直接调平台目录写接口（那是跨租户改平台事实）', () => {
  assert.doesNotMatch(page, /api\.updateCatalogChannel\(/, '渠道页不得写平台目录的渠道');
  assert.doesNotMatch(page, /api\.createCatalogChannel\(/, '渠道页不得创建平台渠道');
  assert.doesNotMatch(page, /api\.putUserChannel\(/, '页面应经 store 写（单向数据流），不得散落直连 API');
});

test('store：写服务端之后必须重拉目录（否则卡片显示旧的同步状态）', () => {
  const save = store.indexOf('api.putUserChannel(');
  const refresh = store.indexOf('syncCatalog', save);
  assert.ok(save > 0 && refresh > save, 'putUserChannel 之后必须 syncCatalog');
});

test('store：用户渠道的同步配置按 effectiveSync 的优先级合并（工作区优先，否则退回平台）', () => {
  assert.match(store, /effectiveSync\(/, 'store 必须使用同一个纯函数，避免前后端规则漂移');
});
