// 智能创作结果区纯逻辑单测（TASK-CREATE-003 / ADR-006 D6·D10）
// 运行：cd apps/web && npm test
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attemptsNote,
  canCancel,
  canRetry,
  cancelPlan,
  extractResultUrl,
  formatTaskTime,
  mediaKind,
  parseTaskPayload,
  resolveTaskResult,
  reusableDraft,
} from '../src/features/genworkbench/result-utils.ts';

const PAYLOAD = {
  prompt: '雾夜钟楼，主角剪影走向街灯',
  parameters: { prompt: '雾夜钟楼', ratio: '16:9', duration: '8', count: '2', provider_seed: '42' },
  model_id: 'seedance-2.0',
  reference_count: 1,
  quantity: 2,
};

test('parseTaskPayload 同时支持对象与 JSON 字符串，坏数据回退为空对象', () => {
  assert.equal(parseTaskPayload({ intent_payload: PAYLOAD }).model_id, 'seedance-2.0');
  assert.equal(parseTaskPayload({ intent_payload: JSON.stringify(PAYLOAD) }).quantity, 2);
  assert.deepEqual(parseTaskPayload({ intent_payload: '{不是合法JSON' }), {});
  assert.deepEqual(parseTaskPayload({ intent_payload: 'null' }), {});
  assert.deepEqual(parseTaskPayload({ intent_payload: null }), {});
  assert.deepEqual(parseTaskPayload({ intent_payload: undefined }), {});
});

test('extractResultUrl 在无 result 时返回 undefined（当前链路就是这种情况）', () => {
  assert.equal(extractResultUrl(PAYLOAD), undefined);
  assert.equal(extractResultUrl({ result: {} }), undefined);
  // 非 URL 值不得被当作产物
  assert.equal(extractResultUrl({ result: { url: 'not-a-url' } }), undefined);
  assert.equal(extractResultUrl({ result: { url: 123 } }), undefined);
});

// execution 010 起结果与意图分离：新任务读 result_payload，历史任务回退 intent_payload.result
test('resolveTaskResult 优先读 result_payload（新任务）', () => {
  assert.deepEqual(
    resolveTaskResult({
      intent_payload: { prompt: '雾夜钟楼' },
      result_payload: { url: 'https://cdn/new.png' },
    }),
    { url: 'https://cdn/new.png' },
  );
  // 服务端 jsonb 也可能以 JSON 字符串返回
  assert.deepEqual(
    resolveTaskResult({ intent_payload: null, result_payload: '{"url":"https://cdn/str.png"}' }),
    { url: 'https://cdn/str.png' },
  );
});

test('resolveTaskResult 回退读历史行的 intent_payload.result', () => {
  // 010 之前：结果被覆盖写进 intent_payload.result，没有 result_payload 列
  assert.deepEqual(
    resolveTaskResult({ intent_payload: { prompt: '蓝衣', result: { url: 'https://cdn/legacy.png' } } }),
    { url: 'https://cdn/legacy.png' },
  );
  // intent_payload 为 JSON 字符串的历史形态
  assert.deepEqual(
    resolveTaskResult({ intent_payload: '{"result":{"url":"https://cdn/legacy-str.png"}}' }),
    { url: 'https://cdn/legacy-str.png' },
  );
});

test('resolveTaskResult 在两个来源都缺失/损坏时返回空对象，不抛错', () => {
  assert.deepEqual(resolveTaskResult({ intent_payload: { prompt: '无结果' } }), {});
  assert.deepEqual(resolveTaskResult({ intent_payload: null, result_payload: null }), {});
  assert.deepEqual(resolveTaskResult({ intent_payload: '{不是合法JSON', result_payload: '也不是' }), {});
  assert.deepEqual(resolveTaskResult({ intent_payload: { result: null } }), {});
  assert.deepEqual(resolveTaskResult({ intent_payload: { result: 'not-an-object' } }), {});
  assert.deepEqual(resolveTaskResult({ intent_payload: 'null' }), {});
});

test('parseTaskPayload 同时吐出意图（reusableDraft 用）与归一化后的结果', () => {
  // 新任务：意图无 result 键，结果来自 result_payload
  const fresh = parseTaskPayload({
    intent_payload: { prompt: '雾夜钟楼', model_id: 'seedance-2.0' },
    result_payload: { url: 'https://cdn/new.png' },
  });
  assert.equal(fresh.model_id, 'seedance-2.0');
  assert.equal(fresh.prompt, '雾夜钟楼');
  assert.deepEqual(fresh.result, { url: 'https://cdn/new.png' });
  assert.equal(extractResultUrl(fresh), 'https://cdn/new.png');

  // 历史任务：结果从 intent_payload.result 回退，意图字段照常可读
  const legacy = parseTaskPayload({
    intent_payload: { prompt: '蓝衣', model_id: 'image-v1', result: { url: 'https://cdn/legacy.png' } },
  });
  assert.equal(legacy.model_id, 'image-v1');
  assert.equal(extractResultUrl(legacy), 'https://cdn/legacy.png');

  // result_payload 与历史 result 同时存在时以 result_payload 为准
  const both = parseTaskPayload({
    intent_payload: { prompt: 'x', result: { url: 'https://cdn/old.png' } },
    result_payload: { url: 'https://cdn/winner.png' },
  });
  assert.equal(extractResultUrl(both), 'https://cdn/winner.png');
});

test('extractResultUrl 能识别已核实的多种上游字段形状（前向兼容）', () => {
  assert.equal(extractResultUrl({ result: { 'output.image_urls.0': 'https://cdn/a.png' } }), 'https://cdn/a.png');
  assert.equal(extractResultUrl({ result: { 'output.data.0.url': 'https://cdn/b.png' } }), 'https://cdn/b.png');
  assert.equal(extractResultUrl({ result: { 'data.0.url': 'https://cdn/c.png' } }), 'https://cdn/c.png');
  assert.equal(extractResultUrl({ result: { video_url: 'https://cdn/v.mp4' } }), 'https://cdn/v.mp4');
  assert.equal(extractResultUrl({ result: { audio_url: 'https://cdn/a.mp3' } }), 'https://cdn/a.mp3');
  assert.equal(extractResultUrl({ result: { url: 'data:image/png;base64,AAA' } }), 'data:image/png;base64,AAA');
});

test('reusableDraft 只保留当前模型认识的参数，并把忽略项如实报出', () => {
  const draft = reusableDraft({ intent_payload: PAYLOAD }, ['prompt', 'ratio', 'duration', 'count']);
  assert.equal(draft.prompt, '雾夜钟楼，主角剪影走向街灯');
  assert.equal(draft.modelId, 'seedance-2.0');
  assert.deepEqual(draft.parameters, { prompt: '雾夜钟楼', ratio: '16:9', duration: '8', count: '2' });
  // provider_seed 不在当前 schema 中 → 被忽略但不静默（调用方需告知用户）
  assert.deepEqual(draft.skippedKeys, ['provider_seed']);
});

test('reusableDraft 处理字符串负载与全量不匹配的情形', () => {
  const draft = reusableDraft({ intent_payload: JSON.stringify(PAYLOAD) }, ['ratio']);
  assert.deepEqual(draft.parameters, { ratio: '16:9' });
  assert.deepEqual(draft.skippedKeys.sort(), ['count', 'duration', 'prompt', 'provider_seed']);
});

test('reusableDraft 忽略非字符串参数值，不把对象塞进表单', () => {
  const draft = reusableDraft(
    { intent_payload: { parameters: { ratio: '16:9', seed: 42, nested: { a: 1 } } } },
    ['ratio', 'seed', 'nested'],
  );
  assert.deepEqual(draft.parameters, { ratio: '16:9' });
  assert.deepEqual(draft.skippedKeys.sort(), ['nested', 'seed']);
});

test('取消只对排队中与执行中可用，重试只对失败与已取消可用', () => {
  assert.equal(canCancel('queued'), true);
  assert.equal(canCancel('running'), true);
  assert.equal(canCancel('succeeded'), false);
  assert.equal(canCancel('failed'), false);
  assert.equal(canCancel('cancelled'), false);
  assert.equal(canRetry('failed'), true);
  assert.equal(canRetry('cancelled'), true);
  assert.equal(canRetry('queued'), false);
  assert.equal(canRetry('succeeded'), false);
});

test('取消语义区分排队中与执行中，且计费口径不同（ADR-006 D10）', () => {
  const queued = cancelPlan('queued');
  assert.ok(queued);
  assert.equal(queued.mode, 'queued');
  assert.equal(queued.mayStillComplete, false);
  assert.match(queued.billNote, /不扣费/);

  const running = cancelPlan('running');
  assert.ok(running);
  assert.equal(running.mode, 'running');
  // 执行中必须如实告知"上游可能仍会完成"，不能假装已停止
  assert.equal(running.mayStillComplete, true);
  assert.match(running.description, /可能仍会完成/);
  assert.match(running.billNote, /按已运行时长计费/);

  assert.equal(cancelPlan('succeeded'), undefined);
  assert.equal(cancelPlan('failed'), undefined);
});

test('mediaKind 由扩展名/MIME 判定渲染方式，避免视频塞进 img', () => {
  assert.equal(mediaKind('https://cdn/a.png'), 'image');
  assert.equal(mediaKind('https://cdn/a.JPEG?v=2'), 'image');
  assert.equal(mediaKind('https://cdn/v.mp4'), 'video');
  assert.equal(mediaKind('https://cdn/v.webm#t=1'), 'video');
  assert.equal(mediaKind('https://cdn/a.mp3'), 'audio');
  assert.equal(mediaKind('data:image/png;base64,AAA'), 'image');
  assert.equal(mediaKind('data:video/mp4;base64,AAA'), 'video');
  assert.equal(mediaKind('data:audio/mpeg;base64,AAA'), 'audio');
  // 未知扩展名回退 unknown（调用方按图片渲染）
  assert.equal(mediaKind('https://cdn/artifact'), 'unknown');
  assert.equal(mediaKind('https://cdn/file.bin'), 'unknown');
});

test('时间与尝试次数展示', () => {
  // 同一时刻的两种表示 → 必须格式化为同一结果（**不依赖本地时区**：
  // 本地常为 UTC+8 而 CI 跑 UTC，硬编码小时数会「本地过、CI 红」）
  assert.equal(
    formatTaskTime('2026-10-10T18:04:19+08:00'),
    formatTaskTime('2026-10-10T10:04:19Z'),
  );
  // 形状断言（不绑定具体时区）。注意实现返回 'M/D HH:MM'（月/日在前），故锚在**行尾**
  assert.match(formatTaskTime('2026-10-10T18:04:19+08:00'), /\d{2}:\d{2}$/);
  assert.equal(formatTaskTime('bad'), '—');
  assert.equal(attemptsNote(1), undefined);
  assert.match(attemptsNote(3) ?? '', /已尝试 3 次/);
});
