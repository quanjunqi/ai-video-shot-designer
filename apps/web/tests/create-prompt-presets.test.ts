// 提示词片段组合逻辑单测（TASK-CREATE-005 / ADR-006 D7）
// 运行：cd apps/web && npm test
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendFragment,
  isFragmentApplied,
  lensFragment,
  normalizeFragment,
  removeFragment,
  styleFragment,
  toggleFragment,
} from '../src/features/genworkbench/prompt-presets.ts';

const STYLE = 'cel shaded anime style, clean bold outlines, flat color blocks';

test('appendFragment 幂等：重复点同一个片段不会写两次', () => {
  const once = appendFragment('雾夜钟楼', STYLE);
  assert.equal(once, `雾夜钟楼, ${STYLE}`);
  assert.equal(appendFragment(once, STYLE), once);
});

test('appendFragment 处理空提示词与首尾空白', () => {
  assert.equal(appendFragment('', STYLE), STYLE);
  assert.equal(appendFragment('   ', STYLE), STYLE);
  assert.equal(appendFragment('  雾夜钟楼  ', '  运镜  '), '雾夜钟楼, 运镜');
  assert.equal(appendFragment('雾夜钟楼', '   '), '雾夜钟楼');
});

test('isFragmentApplied 按归一化比较，忽略大小写与多余空白', () => {
  assert.equal(isFragmentApplied('雾夜钟楼, cel shaded', 'CEL   Shaded'), true);
  assert.equal(isFragmentApplied('雾夜钟楼', 'cel shaded'), false);
  assert.equal(isFragmentApplied('任意文本', ''), false);
  assert.equal(normalizeFragment('  A   B  '), 'a b');
});

test('removeFragment 精确移除该片段并收拾分隔符', () => {
  const prompt = `雾夜钟楼, ${STYLE}, 运镜`;
  assert.equal(removeFragment(prompt, STYLE), '雾夜钟楼, 运镜');
  // 只剩一个片段时不留尾逗号
  assert.equal(removeFragment(`雾夜钟楼, ${STYLE}`, STYLE), '雾夜钟楼');
  assert.equal(removeFragment(STYLE, STYLE), '');
  // 大小写不同也能移除（按归一化匹配）
  assert.equal(removeFragment(`雾夜钟楼, ${STYLE}`, 'CEL SHADED ANIME STYLE, CLEAN BOLD OUTLINES, FLAT COLOR BLOCKS'), '雾夜钟楼');
});

test('removeFragment 找不到时原样返回（用户可能已手动删除）', () => {
  const prompt = '雾夜钟楼, 运镜';
  assert.equal(removeFragment(prompt, STYLE), prompt);
  assert.equal(removeFragment(prompt, '   '), prompt);
});

test('toggleFragment 一轮点击可正向应用与反向撤销', () => {
  const on = toggleFragment('雾夜钟楼', STYLE);
  assert.equal(on.applied, true);
  assert.equal(on.prompt, `雾夜钟楼, ${STYLE}`);

  const off = toggleFragment(on.prompt, STYLE);
  assert.equal(off.applied, false);
  assert.equal(off.prompt, '雾夜钟楼');
});

test('风格片段缺省回退 description，镜头片段缺省回退镜头参数', () => {
  assert.equal(styleFragment({ prompt: '  水墨  ', description: '描述' }), '水墨');
  assert.equal(styleFragment({ description: '日式动画平涂' }), '日式动画平涂');
  assert.equal(lensFragment({ prompt: 'tracking shot', shotParams: '轨道跟拍' }), 'tracking shot');
  assert.equal(lensFragment({ prompt: '   ', shotParams: '轨道跟拍 · 匀速' }), '轨道跟拍 · 匀速');
});
