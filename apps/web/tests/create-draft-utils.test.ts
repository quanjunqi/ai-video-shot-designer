// 智能创作草稿纯逻辑单测（TASK-CREATE-004 / ADR-006 D6）
// 运行：cd apps/web && npm test
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DRAFT_TTL_MS,
  countFilled,
  hasRecoverableContent,
  isDraftExpired,
  pickKnown,
} from '../src/features/genworkbench/draft-utils.ts';

const NOW = 1_800_000_000_000; // 固定时间基准，避免测试依赖真实时钟

test('pickKnown 只保留当前 schema 认识的键（换模型残留的键不会发给上游）', () => {
  const values = { prompt: '钟楼', ratio: '16:9', duration: '8', provider_seed: '42', stale: '' };
  assert.deepEqual(pickKnown(values, ['prompt', 'ratio', 'duration']), {
    prompt: '钟楼',
    ratio: '16:9',
    duration: '8',
  });
  assert.deepEqual(pickKnown(values, []), {});
});

test('pickKnown 丢弃非字符串值，不把对象/数字塞进表单或请求体', () => {
  const messy = { ratio: '16:9', seed: 42 as unknown as string, nested: { a: 1 } as unknown as string };
  assert.deepEqual(pickKnown(messy, ['ratio', 'seed', 'nested']), { ratio: '16:9' });
});

test('isDraftExpired 判定保留期，并容忍时钟回拨与坏时间戳', () => {
  assert.equal(isDraftExpired({ updatedAt: NOW - 1000 }, NOW), false);
  assert.equal(isDraftExpired({ updatedAt: NOW - DRAFT_TTL_MS - 1 }, NOW), true);
  // 边界：正好等于 TTL 不算过期
  assert.equal(isDraftExpired({ updatedAt: NOW - DRAFT_TTL_MS }, NOW), false);
  // 未来时间戳（时钟回拨）不判过期，避免误删用户正在写的内容
  assert.equal(isDraftExpired({ updatedAt: NOW + 60_000 }, NOW), false);
  // 坏数据视为过期，避免长期滞留
  assert.equal(isDraftExpired({ updatedAt: Number.NaN }, NOW), true);
  assert.equal(isDraftExpired({ updatedAt: 0 }, NOW), true);
});

test('countFilled 只数非空字段', () => {
  assert.equal(countFilled({ a: '1', b: '', c: '  ', d: 'x' }), 2);
  assert.equal(countFilled({}), 0);
});

test('hasRecoverableContent 区分"有内容"与"空草稿"，避免无意义提示', () => {
  assert.equal(hasRecoverableContent(undefined), false);
  assert.equal(hasRecoverableContent({ values: {} }), false);
  assert.equal(hasRecoverableContent({ values: { prompt: '   ' } }), false);
  assert.equal(hasRecoverableContent({ values: { prompt: '钟楼' } }), true);
});
