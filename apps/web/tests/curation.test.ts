import assert from 'node:assert/strict';
import test from 'node:test';

import {
  curateRequest,
  curatedKey,
  curatedKeys,
  draftFromSupply,
  inferModelType,
  proposeFamily,
  proposeModelId,
  proposeName,
  supplyRows,
  validateCurateDraft,
  type CurateDraft,
} from '../src/features/settings/curation.ts';
import type { SupplyItem } from '../src/lib/api/client.ts';

// D2 纯逻辑：策展的"默认值 + 自查"必须可单测 —— 它决定用户会不会把错的东西写进对外可见的目录。

const supply = (over: Partial<SupplyItem> & { providerModel: string }): SupplyItem => ({
  channelId: 'ch_1', displayName: '', upstreamType: 'model', tags: '', endpointTypes: null,
  pricing: null, pricingAmount: null, pricingUnit: '', lastSeenAt: '2026-10-11T00:00:00Z',
  missingSince: null, priceIsEstimate: false, ...over,
});

const draft = (over: Partial<CurateDraft> = {}): CurateDraft => ({
  id: 'mod_x', name: 'n', family: 'f', type: 'image', routePriority: '10', priceAmount: '', priceUnit: '', ...over,
});

test('对应键 = 渠道::上游模型（同一对只应策展一次）', () => {
  assert.equal(curatedKey({ channelId: 'ch_1', providerModel: 'm-1' }), 'ch_1::m-1');
  assert.equal(curatedKeys([{ channelId: 'ch_1', providerModel: 'm-1' }]).has('ch_1::m-1'), true);
});

test('已策展/未策展与已下架都要显式标出，且按 providerModel 稳定排序', () => {
  const items = [supply({ providerModel: 'b' }), supply({ providerModel: 'a', missingSince: '2026-10-10T00:00:00Z' })];
  const rows = supplyRows(items, [{ channelId: 'ch_1', providerModel: 'b' }]);
  assert.deepEqual(rows.map((r) => r.item.providerModel), ['a', 'b'], '应排序');
  assert.equal(rows[0].missing, true, '已下架必须标出（但**不隐藏**：隐藏会让人以为上游没有它）');
  assert.equal(rows[1].curated, true);
  assert.equal(rows[0].curated, false);
});

test('类型推断只认精确标签；实测中转站返回的 "model" 必须落空（不许猜）', () => {
  assert.equal(inferModelType('image'), 'image');
  assert.equal(inferModelType(' TEXT '), 'text');
  assert.equal(inferModelType('video'), 'video');
  assert.equal(inferModelType('model'), '', '真实上游就是这种粒度 ⇒ 必须让用户选');
  assert.equal(inferModelType(''), '');
});

test('model id 稳定、只含安全字符、且与既有 id 不冲突', () => {
  const a = proposeModelId('chan-muo4b9zo', 'Real-ESRGAN', []);
  const b = proposeModelId('chan-muo4b9zo', 'Real-ESRGAN', []);
  assert.equal(a, b, '同输入必须同结果（否则重复策展会写出两个 id）');
  assert.match(a, /^mod_[a-z0-9_.-]+$/);
  const taken = [a];
  const c = proposeModelId('chan-muo4b9zo', 'Real-ESRGAN', taken);
  assert.notEqual(c, a, '冲突时必须换一个');
  assert.match(c, /-2$/);
});

test('名称/家族默认值：展示名优先，家族用上游标识（T8 分组键的输入）', () => {
  assert.equal(proposeName(supply({ providerModel: 'm', displayName: '上游一' })), '上游一');
  assert.equal(proposeName(supply({ providerModel: 'm', displayName: '  ' })), 'm');
  assert.equal(proposeFamily(supply({ providerModel: 'gpt-image-2' })), 'gpt-image-2');
});

test('默认草稿：类型来自上游标签（认不出就留空等着用户选）、价格预填供给池已解析值', () => {
  const d = draftFromSupply(supply({ providerModel: 'm', upstreamType: 'model', pricingAmount: 0.2, pricingUnit: '次' }), []);
  assert.equal(d.type, '', 'model 标签 ⇒ 类型留空（不许猜）');
  assert.equal(d.priceAmount, '0.2');
  assert.equal(d.priceUnit, '次');
  assert.equal(d.routePriority, '10');
});

test('自查把后端 422 提前：类型必选 / 优先级是整数 / 售价与单位必须成对', () => {
  assert.equal(validateCurateDraft(draft()), null);
  assert.match(String(validateCurateDraft(draft({ type: '' }))), /必须选择产品面类型/);
  assert.match(String(validateCurateDraft(draft({ routePriority: 'x' }))), /优先级/);
  assert.match(String(validateCurateDraft(draft({ priceAmount: '1', priceUnit: '' }))), /就必须填单位/);
  assert.match(String(validateCurateDraft(draft({ priceAmount: '', priceUnit: '次' }))), /就必须填售价/);
  assert.match(String(validateCurateDraft(draft({ priceAmount: 'abc', priceUnit: '次' }))), /必须是数字/);
});

test('请求组装：空的可选项一律不发送（发空串会覆盖后端语义）', () => {
  const item = supply({ providerModel: 'm-1' });
  const req = curateRequest(item, draft({ logicalModelId: undefined, protocolTemplateId: undefined, note: '', priceAmount: '', priceUnit: '' }));
  assert.deepEqual(Object.keys(req).sort(), ['channelId', 'family', 'id', 'name', 'providerModel', 'routePriority', 'type']);
  const withAll = curateRequest(item, draft({ logicalModelId: 'lm', protocolTemplateId: 'pt', note: ' 说明 ', priceAmount: '0.5', priceUnit: '次' }));
  assert.equal(withAll.logicalModelId, 'lm');
  assert.equal(withAll.protocolTemplateId, 'pt');
  assert.equal(withAll.note, '说明');
  assert.equal(withAll.priceAmount, 0.5);
  assert.equal(withAll.priceUnit, '次');
});
