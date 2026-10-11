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
const STORE = readFileSync(join(import.meta.dirname, '..', 'src', 'stores', 'useSettingsStore.ts'), 'utf8');

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

test('渠道卡片只读展示同步状态与上次同步时间（P2-1b）', () => {
  assert.match(PAGE, /上次同步/, '卡片应展示「上次同步」');
  assert.match(PAGE, /c\.lastSyncAt/, '上次同步时间必须来自服务端投影');
  assert.match(PAGE, /c\.syncKind/, '同步方式必须来自服务端投影');
  // 同步配置是【平台级】的，而渠道页写的是工作区域 ⇒ 界面必须如实说明"需平台侧设置"，
  // 否则用户会以为在这里能配（这正是 P2-1c 停下来先问的原因）
  assert.match(PAGE, /平台级/, '未配置时应说明同步配置属平台级');
});

test('只读投影的类型与映射齐备（syncKind/syncModelsPath/syncPricingPath/lastSyncAt）', () => {
  assert.match(CLIENT, /lastSyncAt/, 'ServerCatalogChannel 必须含 lastSyncAt');
  assert.match(CLIENT, /syncModelsPath/, 'ServerCatalogChannel 必须含 syncModelsPath');
  assert.match(STORE, /lastSyncAt: c\.lastSyncAt/, 'store 必须把投影透传进 ChannelConfig');
});

test('前端【不】写平台同步配置（那会越权改平台目录）', () => {
  // 渠道页只允许调用 syncChannel（触发同步）；不得调用 updateCatalogChannel 去改同步配置
  assert.doesNotMatch(PAGE, /updateCatalogChannel/, '渠道页不得写平台目录（防跨工作区污染）');
});

// ── T1/T2：同一渠道在"平台域 + 工作区域"两处都有 ⇒ 合并时【不得丢掉平台侧的同步状态】 ──
// 真实事故：syncCatalog 先用平台行建 map，再用工作区用户渠道覆盖同名 id；
// 而 userChannelToLocal 没带 syncKind/lastSyncAt ⇒ 卡片永远显示"未配置 / 从未同步"，
// 即使服务端明明已配好并同步成功。这与"两处同形代码只改一处"是同一族失误，故钉成不变量。

test('T1：用户渠道映射必须继承平台侧同步状态（不得被覆盖抹掉）', () => {
  const m = STORE.match(/function userChannelToLocal\([\s\S]*?\n\}/);
  assert.ok(m, '未找到 userChannelToLocal');
  const body = m[0];
  for (const field of ['syncKind', 'syncModelsPath', 'syncPricingPath', 'lastSyncAt']) {
    assert.match(body, new RegExp(field), `userChannelToLocal 必须带上 ${field}（平台侧拥有）`);
  }
  assert.match(body, /platform\?\./, '这些字段应从传入的平台行继承（platform?.xxx）');
});

test('T1：syncCatalog 合并时必须把平台行作为 fallback 传给用户映射', () => {
  assert.match(
    STORE,
    /user\.items\.map\(\(c\) => userChannelToLocal\(c, builtinById\.get\(c\.id\)\)\)/,
    'syncCatalog 必须传平台行 fallback；否则用户渠道覆盖同名 id 时会丢掉同步状态',
  );
});

test('T2：同步成功后必须重拉目录，否则卡片状态停在旧值', () => {
  // 用【位置关系】断言而不是脆弱的整块正则：syncCatalog() 必须出现在 syncChannel 调用之后。
  const call = PAGE.indexOf('api.syncChannel(');
  const refresh = PAGE.indexOf('await syncCatalog()');
  assert.ok(call >= 0, '页面必须调用 api.syncChannel');
  assert.ok(refresh >= 0, '页面必须调用 syncCatalog() 重拉目录');
  assert.ok(refresh > call, 'syncCatalog() 必须在同步调用【之后】（否则刷新的是旧状态）');
  assert.match(PAGE, /setSyncResults/, '应记录最近一次同步结果用于卡片即时反馈');
});
