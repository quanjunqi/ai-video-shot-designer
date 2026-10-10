// 队列分组与成本阈值单测（TASK-CREATE-007 专业级改造 / B4·B6）
// 运行：cd apps/web && npm test
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COST_TONE_THRESHOLDS,
  bucketOf,
  bulkCancelTargets,
  costTone,
  groupQueue,
} from '../src/features/genworkbench/queue-utils.ts';
import type { ServerTask } from '../src/lib/api/client.ts';

function task(id: string, status: ServerTask['status']): ServerTask {
  return {
    id,
    kind: 'image',
    label: id,
    status,
    progress: 0,
    attempt: 1,
    created_at: '2026-10-10T10:00:00+08:00',
    updated_at: '2026-10-10T10:00:00+08:00',
  };
}

test('bucketOf 把 cancelled 归入失败段（用户心智是"没成功"）', () => {
  assert.equal(bucketOf({ status: 'queued' }), 'queued');
  assert.equal(bucketOf({ status: 'running' }), 'running');
  assert.equal(bucketOf({ status: 'succeeded' }), 'done');
  assert.equal(bucketOf({ status: 'failed' }), 'failed');
  assert.equal(bucketOf({ status: 'cancelled' }), 'failed');
});

test('groupQueue 四段分组且保持段内原顺序', () => {
  const tasks = [
    task('a', 'running'),
    task('b', 'succeeded'),
    task('c', 'queued'),
    task('d', 'failed'),
    task('e', 'running'),
    task('f', 'cancelled'),
  ];
  const groups = groupQueue(tasks);
  assert.deepEqual(groups.queued.map((t) => t.id), ['c']);
  assert.deepEqual(groups.running.map((t) => t.id), ['a', 'e']);
  assert.deepEqual(groups.done.map((t) => t.id), ['b']);
  assert.deepEqual(groups.failed.map((t) => t.id), ['d', 'f']);
});

test('groupQueue 对空队列返回四个空段（UI 无需额外判空分支）', () => {
  const groups = groupQueue([]);
  assert.deepEqual(groups, { queued: [], running: [], done: [], failed: [] });
});

test('bulkCancelTargets 只命中排队中与运行中，不误伤已完成/失败', () => {
  const tasks = [
    task('a', 'queued'),
    task('b', 'running'),
    task('c', 'succeeded'),
    task('d', 'failed'),
    task('e', 'cancelled'),
  ];
  assert.deepEqual(bulkCancelTargets(tasks).map((t) => t.id), ['a', 'b']);
  assert.deepEqual(bulkCancelTargets([]), []);
});

test('costTone 三色阈值：边界取低档，非法值按低成本处理', () => {
  const { low, high } = COST_TONE_THRESHOLDS;
  assert.equal(costTone(0), 'low');
  assert.equal(costTone(low), 'low');
  assert.equal(costTone(low + 1), 'mid');
  assert.equal(costTone(high), 'mid');
  assert.equal(costTone(high + 1), 'high');
  assert.equal(costTone(Number.NaN), 'low');
  assert.equal(costTone(-5), 'low');
});

test('costTone 支持自定义阈值（便于后续按真实定价校准）', () => {
  assert.equal(costTone(120, { low: 100, high: 500 }), 'mid');
  assert.equal(costTone(900, { low: 100, high: 500 }), 'high');
});
