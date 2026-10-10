import assert from 'node:assert/strict';
import test from 'node:test';
import { api, ApiError } from '../src/lib/api/client.ts';

interface CapturedCall {
  url: string;
  method: string;
  body: string | undefined;
}

// 替换全局 fetch，记录调用并返回受控响应（不引入新测试框架，沿用 node:test）。
function stubFetch(payload: unknown, status = 200): CapturedCall[] {
  const calls: CapturedCall[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : undefined,
    });
    // 204 无响应体（Fetch 规范禁止 204 携带 body）。
    const text = payload === undefined ? null : JSON.stringify(payload);
    return new Response(text, { status, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return calls;
}

test('listLogicalModels hits the BFF path and forwards filters as query', async () => {
  const calls = stubFetch([]);
  await api.listLogicalModels({ status: 'enabled', type: 'image' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/v1/logical-models?status=enabled&type=image');
  assert.equal(calls[0].method, 'GET');
});

test('createLogicalModel posts to the collection with a JSON body', async () => {
  const calls = stubFetch({ id: 'image-t2i-high' }, 201);
  await api.createLogicalModel({ id: 'image-t2i-high', label: '高质文生图', type: 'image' });
  assert.equal(calls[0].url, '/api/v1/logical-models');
  assert.equal(calls[0].method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].body ?? ''), { id: 'image-t2i-high', label: '高质文生图', type: 'image' });
});

test('updateLogicalModel patches the detail path without read-only fields', async () => {
  const calls = stubFetch({ id: 'image-t2i-high' });
  await api.updateLogicalModel('image-t2i-high', { label: '改名' });
  assert.equal(calls[0].url, '/api/v1/logical-models/image-t2i-high');
  assert.equal(calls[0].method, 'PATCH');
  assert.deepEqual(JSON.parse(calls[0].body ?? ''), { label: '改名' });
});

test('bind and unbind candidates use the nested candidate path', async () => {
  const bindCalls = stubFetch([]);
  await api.bindLogicalModelCandidates('image-t2i-high', { modelIds: ['mod_a'], routePriority: 10 });
  assert.equal(bindCalls[0].url, '/api/v1/logical-models/image-t2i-high/candidates');
  assert.equal(bindCalls[0].method, 'POST');
  assert.deepEqual(JSON.parse(bindCalls[0].body ?? ''), { modelIds: ['mod_a'], routePriority: 10 });

  const unbindCalls = stubFetch(undefined, 204);
  await api.unbindLogicalModelCandidate('image-t2i-high', 'mod_a');
  assert.equal(unbindCalls[0].url, '/api/v1/logical-models/image-t2i-high/candidates/mod_a');
  assert.equal(unbindCalls[0].method, 'DELETE');
});

test('listLogicalModelCandidates and getLogicalModel unwrap the upstream JSON', async () => {
  const candidates = stubFetch([{ id: 'mod_a', routePriority: 10 }]);
  const listed = await api.listLogicalModelCandidates('image-t2i-high');
  assert.equal(candidates[0].url, '/api/v1/logical-models/image-t2i-high/candidates');
  assert.equal(listed[0]?.routePriority, 10);

  const detail = stubFetch({ id: 'image-t2i-high', status: 'enabled' });
  const model = await api.getLogicalModel('image-t2i-high');
  assert.equal(detail[0].url, '/api/v1/logical-models/image-t2i-high');
  assert.equal(model.status, 'enabled');
});

// BFF 原样透传上游业务错误：调用方必须能按 code 分支（而不是被压成 500/UNKNOWN_ERROR）。
test('business error codes stay distinguishable on the client', async () => {
  for (const [status, code] of [
    [400, 'ID_IMMUTABLE'],
    [409, 'MODEL_ALREADY_BOUND'],
    [404, 'MODEL_NOT_FOUND'],
    [404, 'CANDIDATE_NOT_FOUND'],
  ] as const) {
    stubFetch({ code, message: `${code} from production` }, status);
    await assert.rejects(
      () => api.updateLogicalModel('image-t2i-high', { id: 'other-id' }),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, status);
        assert.equal(error.code, code);
        return true;
      },
    );
  }
});
