import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// D3 接线不变量：工作区渠道的同步配置只能写【工作区域】；平台渠道不得被界面改。
// 这条错了就是跨租户改别人的事实（ADR-005 D1 护栏）。

const page = readFileSync(new URL('../src/pages/SettingsChannels.tsx', import.meta.url), 'utf8');
const store = readFileSync(new URL('../src/stores/useSettingsStore.ts', import.meta.url), 'utf8');

test('页面：工作区渠道走 api.putUserChannel（工作区域），并带 4 个同步字段', () => {
  assert.match(page, /api\.putUserChannel\(/, '必须通过工作区 API 保存渠道');
  for (const field of ['syncKind', 'syncModelsPath', 'syncPricingPath', 'trustNote']) {
    assert.ok(page.includes(field), `保存载荷必须带上 ${field}`);
  }
});

test('页面：绝不调用平台目录的渠道写接口（那是跨租户改平台事实）', () => {
  assert.doesNotMatch(page, /api\.updateCatalogChannel\(/, '设置页不得写平台目录的渠道');
  assert.doesNotMatch(page, /api\.createCatalogChannel\(/, '设置页不得创建平台渠道');
});

test('页面：写服务端之后必须重拉目录（否则卡片显示旧的同步状态）', () => {
  const save = page.indexOf('await api.putUserChannel(');
  const refresh = page.indexOf('await syncCatalog()', save);
  assert.ok(save > 0 && refresh > save, 'putUserChannel 之后必须 syncCatalog');
});

test('页面：预填必须取【该渠道自己】的配置，而不是显示用的"生效值"', () => {
  // 生效值可能来自平台行；拿它预填会在保存时把平台配置抄成工作区私有配置
  assert.match(page, /api\.listUserChannels\(\).*find/s, 'openEdit 必须回读该渠道自己的行');
});

test('store：用户渠道的同步配置按 effectiveSync 的优先级合并（工作区优先，否则退回平台）', () => {
  assert.match(store, /effectiveSync\(/, 'store 必须使用同一个纯函数，避免前后端规则漂移');
});
