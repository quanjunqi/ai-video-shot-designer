// TASK-MARKET-M9：创作流默认模型消费的源码级护栏
// 钉住两条不变量：
// 1) useCreateControls 首选偏好必须 id 优先、name 兜底（广场写 name、StageModelPicker 按 name）
// 2) 创作工坊空态引导与全局搜索的模型落点必须是 /models/market（M8 目录已撤销，禁回 catalog 死链）
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const controls = readFileSync(new URL('../src/hooks/useCreateControls.ts', import.meta.url), 'utf8');
const bench = readFileSync(new URL('../src/features/genworkbench/CreateWorkbench.tsx', import.meta.url), 'utf8');
const topbar = readFileSync(new URL('../src/layouts/TopBar.tsx', import.meta.url), 'utf8');

test('M9: preferred match falls back to name (market writes name, consumers read name)', () => {
  assert.match(controls, /m\.id === preferred \|\| m\.name === preferred/, '首选偏好必须 id 优先、name 兜底（广场写 name 语义）');
  assert.match(controls, /const preferred =/, '偏好读取必须存在');
});

test('M9: create workbench empty-state CTA points to /models/market (catalog removed)', () => {
  assert.doesNotMatch(bench, /models\/catalog/, '创作工坊空态禁止引用已删除的 /models/catalog');
  assert.match(bench, /navigate\('\/models\/market'\)/, '空态 action 落点必须是 /models/market');
  assert.match(bench, /去模型中心/, '空态按钮文案必须是「去模型中心」（不再是「设置中心」）');
});

test('M9: top-bar global search model items land on /models/market', () => {
  assert.doesNotMatch(topbar, /to: '\/models\/catalog'/, '全局搜索模型项禁止跳 /models/catalog');
  assert.match(topbar, /type: '模型', label: m\.name, to: '\/models\/market'/, '模型搜索结果落点必须是 /models/market');
});
