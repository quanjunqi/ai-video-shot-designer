// TASK-MARKET-M8：启停归位广场的源码级护栏（对齐 market-model-run 模式）
// 钉住两条不变量：
// 1) 启停按钮必须挂在 canToggle（Admin+）分支内 —— Viewer/member 不渲染
// 2) 广场页必须把 store.toggleModel 与 canToggle 一并传入卡片 —— 没有「看得见点不动」的僵尸按钮
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const card = readFileSync(new URL('../src/features/models/ModelMarketCard.tsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../src/pages/ModelMarket.tsx', import.meta.url), 'utf8');

test('M8: toggle button lives inside the canToggle (Admin+) branch', () => {
  const toggleAt = card.indexOf('{canToggle && (');
  assert.ok(toggleAt > 0, '卡片必须存在 canToggle 权限分支');
  assert.match(card, /\{canToggle && \(/, '启停按钮必须挂在 canToggle 分支内（Viewer 不渲染）');
  // 按钮在 canToggle 分支之后出现（位于同一分支内）
  const btnAt = card.indexOf('停用', toggleAt);
  assert.ok(btnAt > toggleAt, '启停按钮必须位于 canToggle 分支内');
});

test('M8: market page wires canToggle + toggleModel into the card (no zombie button)', () => {
  assert.match(page, /const canToggle = canDefault/, '启停与设默认同权限级（Admin+）');
  assert.match(page, /toggleModel = useSettingsStore\(\(s\) => s\.toggleModel\)/, '广场页必须持有 store.toggleModel');
  assert.match(page, /canToggle=\{canToggle\}/, '卡片必须接收 canToggle prop');
  assert.match(page, /toggleDisabled=\{toggleDisabled\}/, '卡片必须接收 toggleDisabled（渠道停用不可操作）');
  assert.match(page, /onToggle=\{\(\) => \{/, '卡片必须接收 onToggle 处理器');
  assert.match(page, /toggleModel\(m\.id\)/, 'onToggle 必须调用 store.toggleModel');
});
