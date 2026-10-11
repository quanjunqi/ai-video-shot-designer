import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ① 第①步（P2-1）的回归护栏：渠道页必须能**真的**触发一次上游同步，
// 并且把服务端的失败语义**原样**呈现 —— 而不是前端自己编一个"失败"。
//
// 为什么钉成不变量：一个"看起来在同步"的按钮（例如只改本地 store、不调后端）
// 不会报错、不会崩，只会让运营以为已经把模型接进来了 —— 这类缺陷人眼极难发现。

const PAGE = readFileSync(
  join(import.meta.dirname, '..', 'src', 'pages', 'SettingsChannels.tsx'),
  'utf8',
);
const CLIENT = readFileSync(join(import.meta.dirname, '..', 'src', 'lib', 'api', 'client.ts'), 'utf8');

test('渠道页提供「同步上游模型目录」，并调用后端同步接口', () => {
  assert.match(PAGE, /同步上游模型目录/, '按钮文案必须是 Owner 定的「同步上游模型目录」');
  assert.match(PAGE, /api\.syncChannel\(/, '必须调用 api.syncChannel（真去上游拉，不是改本地状态）');
});

test('同步结果按服务端计数呈现（新增/更新/缺失/变价）', () => {
  assert.match(PAGE, /r\.added/, '应展示服务端返回的 added');
  assert.match(PAGE, /r\.updated/, '应展示服务端返回的 updated');
  assert.match(PAGE, /r\.missing/, '应展示服务端返回的 missing');
  assert.match(PAGE, /r\.price_changed/, '变价计数应展示');
});

test('失败原因原样呈现服务端 message（不折叠成笼统的"失败"）', () => {
  assert.match(PAGE, /err instanceof Error \? err\.message/, '失败提示必须带服务端原因');
});

test('API 客户端命中 /api/v1/channels/{id}/sync 且为 POST', () => {
  assert.match(
    CLIENT,
    /\/api\/v1\/channels\/\$\{encodeURIComponent\(channelId\)\}\/sync/,
    '必须打到 /api/v1/channels/{id}/sync',
  );
  assert.match(CLIENT, /syncChannel:[\s\S]{0,200}method: 'POST'/, 'syncChannel 必须是 POST');
});
