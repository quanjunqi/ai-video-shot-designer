import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_ROUTE_PRIORITY,
  ROUTE_PRIORITY_STEP,
  asArray,
  describeLogicalModelError,
  isValidLogicalModelId,
  parseRoutePriority,
  sortCandidatesByRoutePriority,
  suggestRoutePriority,
  validateLogicalModelDraft,
  type LogicalModelDraft,
} from '../src/features/settings/logical-models.ts';
import type { ServerLogicalModelCandidate } from '../src/lib/api/client.ts';

// 用例与后端 services/production/internal/catalog/logicalmodel_test.go 的 id 规则保持一致
test('isValidLogicalModelId accepts capability-style kebab-case', () => {
  for (const id of ['a', 'image-t2i-high', 'text-chat', 'video-first-last-frame', 'image-t2i-01', 'x'.repeat(64)]) {
    assert.equal(isValidLogicalModelId(id), true, `expected valid: ${id}`);
  }
});

test('isValidLogicalModelId rejects uppercase / separator / edge-hyphen / over-length', () => {
  const invalid = ['', 'Image-T2I', 'image_t2i', 'image t2i', '-image', 'image-', 'image--t2i', '图像-t2i', 'x'.repeat(65)];
  for (const id of invalid) {
    assert.equal(isValidLogicalModelId(id), false, `expected invalid: ${JSON.stringify(id)}`);
  }
});

function draft(patch: Partial<LogicalModelDraft> = {}): LogicalModelDraft {
  return { id: 'image-t2i-high', label: '高质文生图', type: 'image', capability: 't2i', status: 'enabled', sort: '100', note: '', ...patch };
}

test('validateLogicalModelDraft enforces the id contract only on create', () => {
  assert.equal(validateLogicalModelDraft(draft(), 'create'), null);
  // 编辑不校验 id（id 只读，且服务端禁止改名）
  assert.equal(validateLogicalModelDraft(draft({ id: '' }), 'edit'), null);
  assert.match(String(validateLogicalModelDraft(draft({ id: 'Image-T2I' }), 'create')), /kebab-case/);
  assert.match(String(validateLogicalModelDraft(draft({ id: '  ' }), 'create')), /必填/);
});

test('validateLogicalModelDraft requires label / type / status / non-negative integer sort', () => {
  assert.match(String(validateLogicalModelDraft(draft({ label: '   ' }), 'create')), /显示名称必填/);
  assert.match(String(validateLogicalModelDraft(draft({ label: 'x'.repeat(201) }), 'create')), /200/);
  assert.match(String(validateLogicalModelDraft(draft({ sort: '-1' }), 'create')), /排序/);
  assert.match(String(validateLogicalModelDraft(draft({ sort: '1.5' }), 'create')), /排序/);
  assert.match(String(validateLogicalModelDraft(draft({ sort: '' }), 'create')), /排序/);
  assert.equal(validateLogicalModelDraft(draft({ sort: '0' }), 'create'), null);
});

test('parseRoutePriority only accepts non-negative integers', () => {
  assert.equal(parseRoutePriority('100'), 100);
  assert.equal(parseRoutePriority(' 0 '), 0);
  for (const raw of ['', '-1', '1.5', 'abc', '1e3', '99999999999999999999']) {
    assert.equal(parseRoutePriority(raw), null, `expected null: ${JSON.stringify(raw)}`);
  }
});

test('suggestRoutePriority leaves a 10-point gap (default 100 when empty)', () => {
  assert.equal(suggestRoutePriority([]), DEFAULT_ROUTE_PRIORITY);
  assert.equal(suggestRoutePriority([100]), 100 + ROUTE_PRIORITY_STEP);
  assert.equal(suggestRoutePriority([120, 100, 110]), 130);
});

function candidate(id: string, name: string, routePriority: number): ServerLogicalModelCandidate {
  return { id, logicalModelId: 'image-t2i-high', name, family: name, channelId: 'ch', providerModel: id, type: 'image', status: 'enabled', routePriority };
}

test('asArray normalizes a null/undefined collection (Go nil slice → JSON null) into a copy', () => {
  assert.deepEqual(asArray(null), []);
  assert.deepEqual(asArray(undefined), []);
  const input = [candidate('a', 'A', 100)];
  const copy = asArray(input);
  assert.deepEqual(copy, input);
  assert.notEqual(copy, input, 'must return a fresh array');
});

test('sortCandidatesByRoutePriority orders by priority ascending without mutating input', () => {
  const input = [candidate('c', 'C', 300), candidate('a', 'A', 100), candidate('b', 'B', 100)];
  const sorted = sortCandidatesByRoutePriority(input);
  assert.deepEqual(sorted.map((c) => c.id), ['a', 'b', 'c']);
  assert.deepEqual(input.map((c) => c.id), ['c', 'a', 'b'], 'input must stay untouched');
});

test('describeLogicalModelError explains every documented business error code', () => {
  assert.match(describeLogicalModelError({ code: 'ID_IMMUTABLE', message: 'logical model id is immutable' }), /对外接口名/);
  assert.match(describeLogicalModelError({ code: 'MODEL_ALREADY_BOUND', message: 'model mod_1 is already bound to logical model image-t2i-low' }), /已被另一个逻辑模型占用/);
  // 409 必须带上服务端归属信息，不能吞成通用错误
  assert.match(describeLogicalModelError({ code: 'MODEL_ALREADY_BOUND', message: 'model mod_1 is already bound to logical model image-t2i-low' }), /image-t2i-low/);
  assert.match(describeLogicalModelError({ code: 'LOGICAL_MODEL_NOT_FOUND', message: 'logical model not found' }), /逻辑模型不存在/);
  assert.match(describeLogicalModelError({ code: 'MODEL_NOT_FOUND', message: 'model not found: mod_1' }), /模型目录中找不到/);
  assert.match(describeLogicalModelError({ code: 'CANDIDATE_NOT_FOUND', message: 'catalog: model mod_1 is not a candidate' }), /不是此逻辑模型的候选/);
  assert.match(describeLogicalModelError({ code: 'DUPLICATE_LOGICAL_MODEL', message: 'a logical model with the same id already exists' }), /已存在同 id/);
  assert.match(describeLogicalModelError({ code: 'INVALID_ID', message: 'id must be a non-empty capability-style kebab-case identifier' }), /kebab-case/);
});

test('describeLogicalModelError falls back to message / network hint, never a bare code', () => {
  assert.equal(describeLogicalModelError(new Error('boom')), 'boom');
  assert.match(describeLogicalModelError(undefined), /无法连接服务端/);
  assert.equal(describeLogicalModelError({ code: 'SOMETHING_NEW', message: 'teapot' }), 'teapot（SOMETHING_NEW）');
  assert.equal(describeLogicalModelError({ code: 'SOMETHING_NEW' }), '请求失败（SOMETHING_NEW）');
});

test('describeLogicalModelError separates service-down (fetch failure) from business failure', () => {
  // 浏览器 fetch 的英文异常不得直接甩给用户，必须区分「服务挂了」
  assert.match(describeLogicalModelError(new TypeError('Failed to fetch')), /无法连接服务端/);
  assert.match(describeLogicalModelError({ message: 'NetworkError when attempting to fetch resource.' }), /无法连接服务端/);
});
