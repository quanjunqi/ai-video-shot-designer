// TASK-IA-001 v14：角色可见性过滤单测（把权限矩阵钉在测试里：谁改回「业务 tab 角色隐藏」都会红）
// v14 矩阵（导航级）：审计日志=仅 Owner；渠道浏览/连通检测全员（操作在页面内 Admin+）；设置 6 区全员可见。
import assert from 'node:assert/strict';
import test from 'node:test';
import { visibleModelCenterNav } from '../src/features/model-center/model-center-navigation.ts';
import { visibleSettingsNav } from '../src/features/settings/settings-navigation.ts';

const keys = (items: readonly { key: string }[]) => items.map((i) => i.key);

test('model center: owner sees all 6 sections', () => {
  const k = keys(visibleModelCenterNav('owner'));
  assert.ok(k.includes('audit') && k.includes('channels') && k.includes('catalog') && k.includes('market') && k.includes('costs'));
  assert.equal(k.length, 6);
});

test('model center: admin sees audit hidden (仅 Owner), channels visible (浏览全员)', () => {
  const k = keys(visibleModelCenterNav('admin'));
  assert.ok(!k.includes('audit'), 'audit 应仅 Owner 可见');
  assert.ok(k.includes('channels'), 'channels 浏览全员（IA v14：接入/凭据在页面内 Admin+，不隐藏入口）');
});

test('model center: viewer sees audit hidden but channels/catalog/market/costs/health visible', () => {
  const k = keys(visibleModelCenterNav('viewer'));
  assert.ok(!k.includes('audit'), 'audit 应仅 Owner 可见');
  assert.ok(k.includes('channels'), 'channels 浏览全员（v14）');
  assert.ok(k.includes('costs') && k.includes('health') && k.includes('catalog') && k.includes('market'), '成本/健康/目录/广场全角色可见');
});

test('model center: unknown role treated as member (fail-safe hidden)', () => {
  const k = keys(visibleModelCenterNav(''));
  assert.ok(!k.includes('audit'), 'audit fail-safe 隐藏');
  assert.ok(k.includes('channels'), 'channels 全员（含 member）可浏览');
});

test('settings: all 6 sections visible to every role (operations gated in-page)', () => {
  for (const role of ['member', 'viewer', 'admin', 'owner']) {
    const k = keys(visibleSettingsNav(role));
    assert.equal(k.length, 6, `${role} 应可见全部 6 区系统设置（v14：敏感操作在页面内按角色细分）`);
    assert.ok(k.includes('appearance') && k.includes('notifications') && k.includes('about'));
  }
});

test('settings: unknown role treated as member (fail-safe: still sees all 6, no business tabs)', () => {
  const k = keys(visibleSettingsNav(''));
  assert.equal(k.length, 6, '未知角色按 member，系统设置 6 区可见（无业务配置 tab）');
});
