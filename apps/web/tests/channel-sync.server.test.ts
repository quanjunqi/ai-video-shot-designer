import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// P2-1 回归护栏（TASK-IA-001 v14 迁移后保持不变式）：
// 渠道页的「同步上游」必须**真的**触发后端同步（经 store.syncCatalog → api.getCatalog +
// api.listUserChannels），失败语义必须**可见**（markOfflineFallback + 页面数据源徽标），
// 而不是前端自己编一个"成功"。前端不得写平台同步配置（防跨工作区污染平台目录）。

const PAGE = readFileSync(
  join(import.meta.dirname, '..', 'src', 'pages', 'ModelChannels.tsx'),
  'utf8',
);
const CLIENT = readFileSync(join(import.meta.dirname, '..', 'src', 'lib', 'api', 'client.ts'), 'utf8');
const STORE = readFileSync(join(import.meta.dirname, '..', 'src', 'stores', 'useSettingsStore.ts'), 'utf8');

test('渠道页提供「同步上游」按钮，并调用 store.syncCatalog（真走后端拉目录）', () => {
  assert.match(PAGE, /同步上游/, '按钮文案必须存在');
  assert.match(PAGE, /syncCatalog\(\)/, '必须调用 syncCatalog（真去后端拉目录与用户渠道，不是只改本地状态）');
});

test('syncCatalog 真走后端：Promise.all([api.getCatalog(), api.listUserChannels()])', () => {
  assert.match(
    STORE,
    /Promise\.all\(\[api\.getCatalog\(\), api\.listUserChannels\(\)\]\)/,
    'syncCatalog 必须同时拉平台目录与用户渠道',
  );
});

test('失败语义可见：syncCatalog 降级为 offline-fallback 且原因不吞', () => {
  assert.match(STORE, /markOfflineFallback\(\)/, '后端不可达时必须降级为离线缓存标记');
  assert.match(STORE, /console\.warn\(/, '真实失败原因必须可见（console.warn），不得裸 catch 吞错');
  assert.match(PAGE, /离线缓存/, '页面必须如实显示当前数据源（离线缓存=后端不可达）');
});

test('卡片只读展示同步状态与上次同步时间（P2-1b）', () => {
  assert.match(PAGE, /上次检测/, '卡片应展示检测时间');
  assert.match(PAGE, /c\.lastSyncAt/, '上次同步时间必须来自服务端投影');
  assert.match(PAGE, /平台级/, '未配置时应说明同步配置属平台级（前端只读投影）');
});

test('只读投影的类型与映射齐备（syncKind/syncModelsPath/syncPricingPath/lastSyncAt）', () => {
  // ① client.ts 必须指向契约 schema（而非手写结构漂移）
  assert.match(CLIENT, /ServerCatalogChannel = ApiSchemas\['CatalogChannel'\]/, 'ServerCatalogChannel 必须引用契约生成类型');
  // ② 契约生成类型必须含 4 个平台侧同步投影字段（它们由契约声明、服务端返回）
  const GEN = readFileSync(join(import.meta.dirname, '..', 'src', 'types', 'api-generated.ts'), 'utf8');
  assert.match(GEN, /syncKind\?: string/, '契约必须声明 syncKind');
  assert.match(GEN, /syncModelsPath\?: string/, '契约必须声明 syncModelsPath');
  assert.match(GEN, /syncPricingPath\?: string/, '契约必须声明 syncPricingPath');
  assert.match(GEN, /lastSyncAt\?: string \| null/, '契约必须声明 lastSyncAt');
  // ③ store 仍必须把投影透传进 ChannelConfig
  assert.match(STORE, /lastSyncAt: c\.lastSyncAt/, 'store 必须把投影透传进 ChannelConfig');
});

test('前端【不】写平台同步配置（那会越权改平台目录）', () => {
  assert.doesNotMatch(PAGE, /updateCatalogChannel/, '渠道页不得写平台目录（防跨工作区污染）');
});

// ── T1/T2：同一渠道在"平台域 + 工作区域"两处都有 ⇒ 合并时【不得丢掉平台侧的同步状态】 ──
// 真实事故：syncCatalog 先用平台行建 map，再用工作区用户渠道覆盖同名 id；
// 而 userChannelToLocal 没带 syncKind/lastSyncAt ⇒ 卡片永远显示"未配置 / 从未同步"。
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

test('同步后必须重拉凭据（凭据域与服务端一致）', () => {
  assert.match(PAGE, /syncCredentials\(\)/, '同步后应刷新凭据域（与服务端一致）');
});
