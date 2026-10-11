import assert from 'node:assert/strict';
import test from 'node:test';

import { describeSyncSource, effectiveSync, isSyncConfigured } from '../src/features/settings/channel-sync.ts';

// D3：同步配置的生效规则必须与后端 SyncChannel 完全一致（工作区优先，否则退回平台）。
// 这条规则错了会产生最坏情况：界面显示"未配置"，用户点同步却真的调了上游。

test('isSyncConfigured：空串与 none 都算未配置', () => {
  assert.equal(isSyncConfigured('openai_compatible'), true);
  assert.equal(isSyncConfigured('none'), false);
  assert.equal(isSyncConfigured(''), false);
  assert.equal(isSyncConfigured(undefined), false);
  assert.equal(isSyncConfigured(null), false);
});

test('工作区渠道自己配了同步 ⇒ 以工作区为准（即使平台也配了）', () => {
  const e = effectiveSync(
    { syncKind: 'openai_compatible', syncModelsPath: '/v1/models', syncPricingPath: '' },
    { syncKind: 'openai_compatible', syncModelsPath: '/platform/models', syncPricingPath: '/prices' },
  );
  assert.equal(e.source, 'workspace');
  assert.equal(e.syncModelsPath, '/v1/models', '必须用工作区的路径，不得被平台覆盖');
});

test('工作区没配（none/空）⇒ 退回平台配置（否则会显示"未配置"而实际在用平台配置）', () => {
  const e = effectiveSync(
    { syncKind: 'none', syncModelsPath: '', syncPricingPath: '' },
    { syncKind: 'openai_compatible', syncModelsPath: '/platform/models', syncPricingPath: '/prices' },
  );
  assert.equal(e.source, 'platform');
  assert.equal(e.syncModelsPath, '/platform/models');
  assert.equal(e.syncPricingPath, '/prices');
});

test('两侧都没配 ⇒ none（且来源如实为 none）', () => {
  const e = effectiveSync(undefined, undefined);
  assert.equal(e.syncKind, 'none');
  assert.equal(e.source, 'none');
  const e2 = effectiveSync({ syncKind: '' }, { syncKind: 'none' });
  assert.equal(e2.source, 'none');
});

test('来源说明必须让用户看得出"这条配置是谁的"（不可含糊）', () => {
  assert.match(describeSyncSource('workspace'), /本工作区/);
  assert.match(describeSyncSource('platform'), /平台/);
  assert.match(describeSyncSource('none'), /未配置/);
});
