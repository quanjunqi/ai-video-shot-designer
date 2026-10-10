// 参数双视图与层级披露单测（TASK-CREATE-006 / ADR-007 专业级改造）
// 运行：cd apps/web && npm test
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildControlSchema,
  controlsUpToTier,
  hasTier,
  type ControlDef,
} from '../src/config/create/control-schema.ts';
import { parseParamJson, toParamJson } from '../src/features/genworkbench/param-json.ts';
import { MODEL_CATALOG } from '../src/config/models/model-catalog.ts';

const CONTROLS: ControlDef[] = [
  { key: 'prompt', label: '提示词', type: 'textarea', defaultValue: '', tier: 'basic' },
  { key: 'ratio', label: '画面比例', type: 'chips', options: ['16:9'], defaultValue: '16:9', tier: 'basic' },
  { key: 'duration', label: '时长', type: 'number', defaultValue: '4', min: 1, max: 30, tier: 'advanced' },
  { key: 'negative', label: '负面提示词', type: 'textarea', defaultValue: '', tier: 'advanced' },
];

test('层级是累积披露：基础只露 basic，进阶露 basic+advanced，专家露全部', () => {
  assert.deepEqual(controlsUpToTier(CONTROLS, 'basic').map((c) => c.key), ['prompt', 'ratio']);
  assert.deepEqual(controlsUpToTier(CONTROLS, 'advanced').map((c) => c.key), ['prompt', 'ratio', 'duration', 'negative']);
  assert.deepEqual(controlsUpToTier(CONTROLS, 'expert').map((c) => c.key), ['prompt', 'ratio', 'duration', 'negative']);
});

test('未标 tier 的控件视为 basic，不会因漏标而消失', () => {
  const untagged: ControlDef[] = [{ key: 'x', label: 'X', type: 'text', defaultValue: '' }];
  assert.deepEqual(controlsUpToTier(untagged, 'basic').map((c) => c.key), ['x']);
});

test('hasTier 用于决定是否显示某档按钮（避免出现空档）', () => {
  assert.equal(hasTier(CONTROLS, 'basic'), true);
  assert.equal(hasTier(CONTROLS, 'advanced'), true);
  assert.equal(hasTier(CONTROLS, 'expert'), false);
});

test('目录产出的每个控件都必须有层级与非空说明（契约测试）', () => {
  const kinds = ['image', 'video', 'audio'] as const;
  for (const model of MODEL_CATALOG) {
    for (const kind of kinds) {
      const schema = buildControlSchema(model, kind);
      for (const control of schema.controls) {
        assert.ok(control.tier, `${model.id}/${kind}/${control.key} 缺少 tier`);
        assert.ok(
          typeof control.hint === 'string' && control.hint.trim() !== '',
          `${model.id}/${kind}/${control.key} 缺少 hint（专业级要求每个字段可自解释）`,
        );
      }
    }
  }
  // 兜底：无模型时不应有控件
  assert.deepEqual(buildControlSchema(undefined, 'image').controls, []);
});

test('至少存在 basic 与 advanced 两档，保证"默认只露基础"有意义', () => {
  const video = buildControlSchema(MODEL_CATALOG.find((m) => m.type === 'video'), 'video');
  assert.equal(hasTier(video.controls, 'basic'), true);
  assert.equal(hasTier(video.controls, 'advanced'), true);
});

test('toParamJson 按控件顺序输出，只含认识的键，缺值回退默认值', () => {
  const json = toParamJson({ ratio: '9:16', 未知键: 'x' }, CONTROLS);
  assert.deepEqual(JSON.parse(json), {
    prompt: '',
    ratio: '9:16',
    duration: '4',
    negative: '',
  });
});

test('parseParamJson 接受字符串/数字/布尔，并报出被忽略的未知键', () => {
  const result = parseParamJson('{"ratio":"9:16","duration":8,"negative":false,"typo_key":"x"}', CONTROLS);
  assert.equal(result.error, undefined);
  assert.deepEqual(result.values, { ratio: '9:16', duration: '8', negative: 'false' });
  assert.deepEqual(result.ignoredKeys, ['typo_key']);
});

test('parseParamJson 对语法错误/非对象/嵌套值给出可读原因，且不留半份数据', () => {
  const syntax = parseParamJson('{不是JSON', CONTROLS);
  assert.match(syntax.error ?? '', /JSON 语法错误/);
  assert.deepEqual(syntax.values, {});

  const array = parseParamJson('[1,2]', CONTROLS);
  assert.match(array.error ?? '', /顶层必须是对象/);

  const nested = parseParamJson('{"ratio":{"a":1}}', CONTROLS);
  assert.match(nested.error ?? '', /字段「ratio」/);
  assert.deepEqual(nested.values, {});
});

test('parseParamJson 空文本视为无改动（不报错）', () => {
  const empty = parseParamJson('   ', CONTROLS);
  assert.equal(empty.error, undefined);
  assert.deepEqual(empty.values, {});
});

test('JSON 往返一致：导出再导入得到同一份值', () => {
  const values = { prompt: '雾夜钟楼', ratio: '16:9', duration: '12', negative: 'blurry' };
  const round = parseParamJson(toParamJson(values, CONTROLS), CONTROLS);
  assert.equal(round.error, undefined);
  assert.deepEqual(round.values, values);
  assert.deepEqual(round.ignoredKeys, []);
});
