import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeEvidence, hasEvidence } from '../src/lib/protocol-evidence.ts';

// ADR-008 §3 的硬约束：两类证据**并列**、差异**必须可见**、未知形状**不许崩**。

test('文档与实测各自被取出，且【不做合并】', () => {
  const s = summarizeEvidence(
    { source: 'official', url: 'https://example.test/doc', docVersion: '2026-09', sections: { submit: '§3.1', query: '§4.2' } },
    { lastProbedAt: '2026-10-10T00:00:00Z', observedStatusEnum: ['Preparing', 'Success'], observedStatusCodes: [200] },
  );
  assert.equal(s.doc.length, 5, '来源/地址/版本/两个章节');
  assert.equal(s.observed.length, 3, '最近实测/状态枚举/状态码');
  assert.equal(s.doc.find((i) => i.label === '来源')?.value, '官方文档');
  assert.equal(s.observed.find((i) => i.label === '实测状态码')?.value, '200');
  // 关键：文档侧与实测侧各自独立，没有任何"合成值"
  assert.ok(!s.doc.some((i) => /实测/.test(i.label)));
  assert.ok(!s.observed.some((i) => /文档|章节/.test(i.label)));
});

test('discrepancies 必须被暴露出来（这是 ADR 最在意的一条）', () => {
  const s = summarizeEvidence(
    { source: 'cloud' },
    { discrepancies: [{ field: 'statusEnum', doc: 'Success', observed: 'completed' }, '另一条纯字符串差异'] },
  );
  assert.equal(s.discrepancies.length, 2);
  assert.match(s.discrepancies[0], /statusEnum/);
  assert.match(s.discrepancies[0], /文档=Success/);
  assert.match(s.discrepancies[0], /实测=completed/);
  assert.equal(s.discrepancies[1], '另一条纯字符串差异');
});

test('未对齐/未实测 ⇒ 空摘要且 hasEvidence=false（不渲染整块）', () => {
  const s = summarizeEvidence(undefined, undefined);
  assert.deepEqual(s, { doc: [], observed: [], discrepancies: [] });
  assert.equal(hasEvidence(s), false);
  assert.equal(hasEvidence(summarizeEvidence({}, {})), false);
});

test('只实测未对齐文档 ⇒ 仍算有证据（并列不等于两者都有）', () => {
  const s = summarizeEvidence(undefined, { lastProbedAt: '2026-10-10T00:00:00Z' });
  assert.equal(hasEvidence(s), true);
  assert.equal(s.doc.length, 0);
});

test('未知/畸形形状优雅降级，不抛异常（jsonb 形状会演进）', () => {
  const weird = summarizeEvidence(
    { source: 123, url: '   ', sections: '不是对象' } as unknown as Record<string, unknown>,
    {
      observedStatusEnum: 'completed',
      observedEndpoints: { not: 'an array' },
      discrepancies: [null, 42, { unknownShape: true }],
    } as unknown as Record<string, unknown>,
  );
  assert.equal(weird.doc.find((i) => i.label === '来源')?.value, '123');
  assert.equal(weird.doc.find((i) => i.label === '地址'), undefined, '空白 url 应被忽略');
  assert.equal(weird.observed.find((i) => i.label === '实测状态枚举')?.value, 'completed');
  assert.equal(weird.discrepancies.length, 1, '只有对象型差异可被解释，其余忽略但仍不崩');
  assert.match(weird.discrepancies[0], /未知字段/);
});
