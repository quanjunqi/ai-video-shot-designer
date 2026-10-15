// TASK-AUTH-001：角色可见性过滤单测（把权限矩阵钉在测试里：谁改回「全角色可见」都会红）
import assert from 'node:assert/strict';
import test from 'node:test';
import { visibleModelCenterNav } from '../src/features/model-center/model-center-navigation.ts';
import { visibleSettingsNav } from '../src/features/settings/settings-navigation.ts';

const keys = (items: readonly { key: string }[]) => items.map((i) => i.key);

test('model center: owner sees all 7 sections', () => {
  const k = keys(visibleModelCenterNav('owner'));
  assert.ok(k.includes('audit') && k.includes('channels') && k.includes('catalog') && k.includes('costs'));
  assert.equal(k.length, 7);
});

test('model center: admin sees audit hidden (仅 Owner)', () => {
  const k = keys(visibleModelCenterNav('admin'));
  assert.ok(!k.includes('audit'), 'audit 应仅 Owner 可见');
  assert.ok(k.includes('channels'), 'channels 应 Admin+ 可见');
});

test('model center: viewer sees channels hidden (渠道 Admin+) but audit & costs visible? no—audit owner-only, channels admin-only', () => {
  const k = keys(visibleModelCenterNav('viewer'));
  assert.ok(!k.includes('audit'), 'audit 应仅 Owner 可见');
  assert.ok(!k.includes('channels'), 'channels 应 Admin+ 可见');
  assert.ok(k.includes('costs') && k.includes('health') && k.includes('catalog'), '成本/健康/目录全角色可见');
});

test('model center: unknown role treated as member (fail-safe hidden)', () => {
  const k = keys(visibleModelCenterNav(''));
  assert.ok(!k.includes('audit') && !k.includes('channels'));
});

test('settings: preferences hidden below admin (Viewer 隐藏)', () => {
  assert.ok(keys(visibleSettingsNav('viewer')).includes('models'), 'viewer 可看模型（只读目录）');
  assert.ok(!keys(visibleSettingsNav('viewer')).includes('preferences'), 'preferences 应 Admin+');
  assert.ok(!keys(visibleSettingsNav('viewer')).includes('channels'), 'channels 应 Admin+');
  assert.ok(keys(visibleSettingsNav('admin')).includes('preferences'), 'admin 可见偏好');
});

test('settings: unknown role treated as member (fail-safe hidden)', () => {
  assert.equal(keys(visibleSettingsNav('')).length, 0);
});
