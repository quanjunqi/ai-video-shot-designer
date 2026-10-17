import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

// TASK-MARKET-M12：任务中心产物回显。
// M11 打通创作流真实消费后，任务列表行成功态只显示「成功 + —」，产物需开详情抽屉才见；
// 主流产品任务面板均直接展示缩略图。复用 result-utils（parseTaskPayload/extractResultUrl/mediaKind）单一实现。

const page = readFileSync(new URL('../src/pages/Tasks.tsx', import.meta.url), 'utf8');

test('M12: 成功任务行必须渲染产物缩略图（复用 result-utils 单一实现）', () => {
  assert.match(page, /extractResultUrl, mediaKind, parseTaskPayload/, '必须复用 result-utils 产物解析（防漂移）');
  assert.match(page, /task\.status === 'succeeded' \? extractResultUrl\(parseTaskPayload\(task\)\)/, '成功态必须解析产物 URL');
  assert.match(page, /mediaKind\(resultUrl\) === 'image'/, '必须按媒体类型区分（防视频地址塞进 img 裂图）');
  assert.match(page, /<img src=\{resultUrl\}/, '命中图片产物必须渲染 <img> 缩略图');
  assert.match(page, /target="_blank" rel="noreferrer"/, '缩略图必须新窗口打开原图');
});

test('M12: 无产物/非图片保持原 kind icon，不破坏既有行结构', () => {
  assert.match(page, /<span className=\{cn\('rounded-lg bg-accent\/60 p-2', km\.tone\)\}>/, '无产物行保留原 kind icon');
  assert.match(page, /task\.context_path && 'cursor-pointer hover/, '行点击跳转行为不回归');
});
