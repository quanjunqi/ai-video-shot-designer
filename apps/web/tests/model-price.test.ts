import assert from 'node:assert/strict';
import test from 'node:test';
import type { CatalogModel } from '../src/config/models/model-catalog.ts';
import { priceSourceLabel, priceText, startPrice } from '../src/features/models/modelPrice.ts';

// TASK-MARKET-M7：价格展示口径 —— 独立价格列（price_amount/price_unit/price_source）优先，
// 回退 capability.billing（能力示例价），再无计费 →「—」。谁把价格口径弄混、漏溯源、或让缺价模型显示非「—」，都会红。

function base(over: Partial<CatalogModel>): CatalogModel {
  return {
    id: 'm1', channelId: 'c1', family: 'F', name: 'M', providerModel: 'm1',
    type: 'text', status: 'enabled', sort: 1, note: '',
    capability: { maxTokens: 8000, isReasoning: false, streaming: true, billing: {} },
    ...over,
  };
}

test('独立价格列优先：priceAmount+priceUnit → ¥x/单位起', () => {
  const m = base({ priceAmount: 0.003, priceUnit: '千 token', priceSource: 'manual' });
  assert.equal(priceText(m), '¥0.003/千 token起');
  assert.equal(startPrice(m), 0.003);
});

test('独立价格列有值但无单位 → ¥x起', () => {
  const m = base({ priceAmount: 8 });
  assert.equal(priceText(m), '¥8起');
});

test('无独立价格列 → 回退 capability.billing（按类型取起步价）', () => {
  const video = base({ type: 'video', capability: { modes: ['t2v'], minDurationSeconds: 1, maxDurationSeconds: 15, billing: { perSecondStart: 0.5 } } });
  const image = base({ type: 'image', capability: { refImage: false, billing: { perImage: 0.2 } } });
  const text = base({ type: 'text', capability: { maxTokens: 1, isReasoning: false, streaming: true, billing: { inputPerMTok: 1.5 } } });
  assert.equal(priceText(video), '¥0.5/秒起');
  assert.equal(priceText(image), '¥0.2/张');
  assert.equal(priceText(text), '¥1.5/百万Token起');
  assert.equal(startPrice(video), 0.5);
});

test('无计费（billing 空且无独立列）→「—」与正无穷垫底，不 NaN', () => {
  const m = base({}); // billing: {}
  assert.equal(priceText(m), '—');
  assert.equal(startPrice(m), Number.POSITIVE_INFINITY);
});

test('价格来源溯源：manual=人工录入 / synced=上游同步 / 无独立列=null', () => {
  assert.equal(priceSourceLabel(base({ priceAmount: 1, priceSource: 'manual' })), '人工录入');
  assert.equal(priceSourceLabel(base({ priceAmount: 1, priceSource: 'synced' })), '上游同步');
  assert.equal(priceSourceLabel(base({ priceAmount: 1 })), '人工录入'); // 缺省 manual
  assert.equal(priceSourceLabel(base({})), null); // 无价不展示溯源
});
