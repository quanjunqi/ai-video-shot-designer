import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

// TASK-MARKET-M1：模型广场来源标注与演示态引导。
// 把「catalogSource 三态透明化 + demo 演示 badge」钉在测试里：
// 谁删掉 demo 标注、把「演示」badge 错配到 server 态、或回归到只有 offline 一种标注，都会红。
// TASK-MARKET-M6 组件拆分后：三态标注在页面，演示 badge 在卡片组件（由 catalogIsDemo prop 控制）。

const page = readFileSync(new URL('../src/pages/ModelMarket.tsx', import.meta.url), 'utf8');
const card = readFileSync(new URL('../src/features/models/ModelMarketCard.tsx', import.meta.url), 'utf8');

test('广场：catalogSource 三态都有来源标注（demo / server / offline-fallback）', () => {
  assert.match(page, /catalogSource === 'demo'/, 'demo 态必须有分支');
  assert.match(page, /catalogSource === 'server'/, 'server 态必须有分支');
  assert.match(page, /catalogSource === 'offline-fallback'/, 'offline-fallback 态必须保留分支');
});

test('demo 态标注：明示"演示目录/非真实接入"，并引导同步', () => {
  assert.match(page, /本地演示目录/, '必须明确这是演示目录');
  assert.match(page, /并非真实接入模型/, '必须明确不是真实接入模型');
  assert.match(page, /同步上游后，这里展示真实调用模型|接入渠道并同步上游/, '必须给出去真实化的动作引导');
});

test('demo 态模型卡片带「演示」badge，且只出现在 demo 分支', () => {
  assert.match(card, />演示</, '卡片必须渲染独立「演示」badge');
  assert.match(card, /catalogIsDemo/, 'badge 必须由 catalogIsDemo prop 控制');
  const badgeAt = card.indexOf('>演示<');
  const demoAt = card.indexOf('catalogIsDemo');
  assert.ok(badgeAt > demoAt, '「演示」badge 必须位于 catalogIsDemo 分支内（server 态不得出现）');
  // 页面仅在 demo 态把 catalogIsDemo 置真 —— server/offline 分支不得携带「演示」badge
  assert.match(page, /catalogIsDemo=\{catalogSource === 'demo'\}/, '页面必须只在 demo 态传入 catalogIsDemo=true');
});

test('server 态标注：明示"已连接模型中心 / 真实调用模型"', () => {
  assert.match(page, /已连接模型中心/, 'server 态必须声明已连接');
  assert.match(page, /真实调用模型/, 'server 态必须明示真实调用');
});

test('offline 态标注：保留"离线缓存"语义（不因三态化丢失）', () => {
  assert.match(page, /离线缓存目录/, 'offline 态必须保留缓存语义');
  assert.match(page, /后端不可达/, 'offline 态必须保留原因');
});
