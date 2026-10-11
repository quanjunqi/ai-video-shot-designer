import assert from 'node:assert/strict';
import test from 'node:test';

import {
  candidatesByKey,
  candidateSummary,
  candidateTooltip,
  groupKey,
} from '../src/features/settings/model-candidates.ts';
import type { CatalogModel } from '../src/config/models/model-catalog.ts';

// T8 多渠道可视化：分组规则必须是确定的、可单测的 —— 不埋在 JSX 里。
// （本项目已四次栽在"逻辑埋在流程里、改一处漏一处"。）

const chName = (id: string) => ({ 'ch-a': '甲渠道', 'ch-b': '乙渠道', 'ch-c': '丙渠道' })[id] ?? id;

function model(over: Partial<CatalogModel> & { id: string; channelId: string }): CatalogModel {
  return {
    family: 'f', name: over.id, providerModel: over.id, type: 'image', status: 'enabled',
    sort: 1, note: '', requestPath: '/x', method: 'POST', params: [], capability: {} as CatalogModel['capability'],
    ...over,
  } as CatalogModel;
}

test('分组键：优先逻辑模型 → 再看上游模型标识 → 最后才用行 id', () => {
  assert.equal(groupKey({ id: 'a', providerModel: 'p', logicalModelId: 'lm' }), 'lm');
  assert.equal(groupKey({ id: 'a', providerModel: 'p' }), 'p');
  assert.equal(groupKey({ id: 'a', providerModel: '' }), 'a');
});

test('分组：单行不成组；多行按优先级升序（同优先级按渠道名，保证确定性）', () => {
  const models = [
    model({ id: 'solo', channelId: 'ch-c', providerModel: 'only' }),
    model({ id: 'r20', channelId: 'ch-b', logicalModelId: 'lm1', routePriority: 20 }),
    model({ id: 'r10', channelId: 'ch-a', logicalModelId: 'lm1', routePriority: 10 }),
  ];
  const groups = candidatesByKey(models, chName);
  assert.equal(groups.size, 1, '只有一组（solo 单行不应成组）');
  const peers = groups.get('lm1');
  assert.ok(peers);
  assert.deepEqual(peers.map((p) => p.id), ['r10', 'r20'], '应按优先级升序');
  assert.deepEqual(peers.map((p) => p.channelName), ['甲渠道', '乙渠道'], '渠道名应解析成展示名');
});

test('分组：未设优先级的行排在最后（不得当成 0 抢首位）', () => {
  const models = [
    model({ id: 'none', channelId: 'ch-a', logicalModelId: 'lm2' }),
    model({ id: 'p100', channelId: 'ch-b', logicalModelId: 'lm2', routePriority: 100 }),
  ];
  const peers = candidatesByKey(models, chName).get('lm2');
  assert.ok(peers);
  assert.deepEqual(peers.map((p) => p.id), ['p100', 'none'], '有优先级的在前，未设的在后');
});

test('摘要：把停用数量写出来（停用候选不会被路由到，不写会误导）', () => {
  const models = [
    model({ id: 'a', channelId: 'ch-a', logicalModelId: 'lm3', routePriority: 10, status: 'enabled' }),
    model({ id: 'b', channelId: 'ch-b', logicalModelId: 'lm3', routePriority: 20, status: 'disabled' }),
  ];
  const peers = candidatesByKey(models, chName).get('lm3');
  assert.ok(peers);
  assert.equal(candidateSummary(peers), '同款模型 2 个渠道 · 优先级 10/20 · 1 启用 / 1 停用');
});

test('摘要：全部启用时不出现"停用"字样；未设优先级显示「未设」', () => {
  const models = [
    model({ id: 'a', channelId: 'ch-a', logicalModelId: 'lm4', routePriority: 5 }),
    model({ id: 'b', channelId: 'ch-b', logicalModelId: 'lm4' }),
  ];
  const peers = candidatesByKey(models, chName).get('lm4');
  assert.ok(peers);
  const s = candidateSummary(peers);
  assert.match(s, /优先级 5\/未设/);
  assert.doesNotMatch(s, /停用/);
  assert.match(s, /全部启用/);
});

test('悬停明细：逐条列出渠道、优先级与启用状态', () => {
  const models = [
    model({ id: 'a', channelId: 'ch-a', logicalModelId: 'lm5', routePriority: 10 }),
    model({ id: 'b', channelId: 'ch-b', logicalModelId: 'lm5', routePriority: 20, status: 'disabled' }),
  ];
  const peers = candidatesByKey(models, chName).get('lm5');
  assert.ok(peers);
  const tip = candidateTooltip(peers);
  assert.match(tip, /1\. 甲渠道（优先级 10，启用）/);
  assert.match(tip, /2\. 乙渠道（优先级 20，停用）/);
});

test('取不到渠道名时回落到渠道 id（不隐藏事实）', () => {
  const models = [
    model({ id: 'a', channelId: 'ch-unknown', logicalModelId: 'lm6', routePriority: 1 }),
    model({ id: 'b', channelId: 'ch-a', logicalModelId: 'lm6', routePriority: 2 }),
  ];
  const peers = candidatesByKey(models, (id) => (id === 'ch-a' ? '甲渠道' : '')).get('lm6');
  assert.ok(peers);
  assert.deepEqual(peers.map((p) => p.channelName), ['ch-unknown', '甲渠道']);
});
