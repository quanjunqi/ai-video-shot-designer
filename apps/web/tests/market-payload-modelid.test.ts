import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

// TASK-MARKET-M11：创作流真实消费修复。
// 实测：/create/image 提交任务 → execution 拒绝「missing modelId in payload」——
// execution 全链路消费 camelCase modelId（worker/writeSubmitAudit/handlers_generate），
// BFF 对 payload 直接透传不重命名；前端曾只传 snake_case model_id → worker 解析为空。
// 钉死：提交 payload 必须双写 modelId（权威）+ model_id（历史兼容）。

const wb = readFileSync(new URL('../src/features/genworkbench/CreateWorkbench.tsx', import.meta.url), 'utf8');

test('M11: 提交 payload 必须同时携带 modelId（execution 权威键）与 model_id（历史兼容）', () => {
  // 取 submit() 内 payload 定义段
  const at = wb.indexOf('const payload = {');
  assert.ok(at > 0, '必须存在提交 payload 构造');
  const seg = wb.slice(at, at + 900);
  assert.match(seg, /modelId: model\?\.id/, 'payload 必须含 camelCase modelId（execution worker/审计消费）');
  assert.match(seg, /model_id: model\?\.id/, 'payload 必须保留 snake_case model_id（草稿复用/详情展示兼容）');
});

test('M11: 不得退化为单键（只传 model_id 会致 execution 拒绝）', () => {
  // 若把 modelId 删回只留 model_id，execution 解析 payload.ModelID="" → missing modelId
  const at = wb.indexOf('const payload = {');
  const seg = wb.slice(at, at + 900);
  const modelIdCount = (seg.match(/modelId:/g) ?? []).length;
  assert.ok(modelIdCount >= 1, 'payload 至少出现一次 modelId: 赋值');
});
