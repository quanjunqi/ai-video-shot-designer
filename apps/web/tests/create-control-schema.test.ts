// 能力驱动控件 schema 的单测（TASK-CREATE-001 / ADR-006 D2）
// 运行：cd apps/web && npm test
// 说明：本测试直接加载纯函数模块，不依赖 React / 浏览器；fixture 取自真实目录（MODEL_CATALOG）
//       与合成模型（用于覆盖目录当前没有的边界），确保断言不依赖演示文案。
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMMON_ASPECT_RATIOS,
  buildControlSchema,
  estimateCost,
  initialValues,
  listAspectRatios,
  runnableModels,
  validateDraft,
  type ControlSchema,
} from '../src/config/create/control-schema.ts';
import { MODEL_CATALOG, MODEL_CHANNELS, type CatalogModel, type ChannelConfig } from '../src/config/models/model-catalog.ts';

function modelById(id: string): CatalogModel {
  const model = MODEL_CATALOG.find((m) => m.id === id);
  assert.ok(model, `fixture 缺失：${id}`);
  return model;
}

/** 合成视频模型（用于覆盖目录当前没有的能力组合） */
function syntheticVideo(id: string, modes: ('t2v' | 'i2v' | 'first_last_frame' | 'multi_ref' | 'audio_ref')[], maxDurationSeconds: number): CatalogModel {
  return {
    id,
    channelId: 'jimeng',
    family: 'Synthetic',
    name: id,
    providerModel: id,
    type: 'video',
    status: 'enabled',
    sort: 1,
    note: '',
    requestPath: '',
    method: 'POST',
    params: [],
    capability: {
      modes,
      minDurationSeconds: 1,
      maxDurationSeconds,
      maxRefImages: 1,
      maxRefAudios: 0,
      qualityTiers: 2,
      billing: { perSecondStart: 1 },
    },
  };
}

test('无可用模型时返回空 schema，不回退到硬编码模型名', () => {
  const schema = buildControlSchema(undefined, 'image');
  assert.equal(schema.catalogBacked, false);
  assert.deepEqual(schema.modes, []);
  assert.deepEqual(schema.controls, []);
  assert.equal(schema.pricing.kind, 'unknown');
});

test('图片模型：refImage 决定是否产出图生图能力', () => {
  const withRef = buildControlSchema(modelById('nano-banana-2-lite'), 'image');
  assert.equal(withRef.catalogBacked, true);
  assert.deepEqual(withRef.modes, ['text-to-image', 'image-to-image']);

  const synthetic: CatalogModel = {
    ...modelById('nano-banana-2-lite'),
    id: 'synthetic-t2i-only',
    capability: { refImage: false, aspectRatioCount: 3, qualityTiers: 1, billing: { perImage: 1 } },
  };
  const withoutRef = buildControlSchema(synthetic, 'image');
  assert.deepEqual(withoutRef.modes, ['text-to-image']);
  assert.equal(withoutRef.limits.maxRefImages, 0);
});

test('图片比例：目录只给数量，取值走 count-fallback 并如实标注', () => {
  const schema = buildControlSchema(modelById('nano-banana-2-lite'), 'image'); // aspectRatioCount: 4
  const ratio = schema.controls.find((c) => c.key === 'ratio');
  assert.ok(ratio);
  assert.equal(ratio.type, 'chips');
  assert.equal(ratio.options?.length, 4);
  assert.equal(schema.aspectRatios.source, 'count-fallback');
  assert.equal(schema.aspectRatios.declaredCount, 4);

  // gpt-image-2 声明 6 种比例 → 取满常见候选
  const six = buildControlSchema(modelById('gpt-image-2'), 'image');
  assert.equal(six.aspectRatios.values.length, 6);

  assert.equal(listAspectRatios(99).values.length, COMMON_ASPECT_RATIOS.length);
  assert.equal(listAspectRatios(undefined).values.length, 0);
});

test('视频时长范围来自模型能力，不来自前端常量', () => {
  const kling = buildControlSchema(modelById('kling-1.6'), 'video');
  const klingDuration = kling.controls.find((c) => c.key === 'duration');
  assert.ok(klingDuration);
  assert.equal(klingDuration.min, 5);
  assert.equal(klingDuration.max, 15);
  assert.equal(klingDuration.source, 'declared');

  const seedance25 = buildControlSchema(modelById('seedance-2.5'), 'video');
  assert.equal(seedance25.limits.maxDurationSeconds, 30);
});

test('视频：不支持图生的模型不要求参考图', () => {
  const t2vOnly = buildControlSchema(syntheticVideo('synthetic-t2v', ['t2v'], 10), 'video');
  assert.deepEqual(t2vOnly.modes, ['text-to-video']);
  assert.equal(t2vOnly.requiresReference, false);

  const h3 = buildControlSchema(modelById('minimax-h3'), 'video');
  assert.ok(h3.modes.includes('image-to-video'));
  assert.ok(h3.modes.includes('audio-reference'));
  assert.equal(h3.requiresReference, true);
  assert.equal(h3.limits.maxRefAudios, 1);
});

test('帧率等目录未声明的维度不产出控件（不展示无依据选项）', () => {
  const schema = buildControlSchema(modelById('seedance-2.0'), 'video');
  assert.equal(schema.controls.some((c) => c.key === 'fps'), false);
});

test('提交前校验：必填 / 时长越界 / 数量越界 / 参考图与音频上限', () => {
  const schema = buildControlSchema(modelById('kling-1.6'), 'video'); // 5-15 秒，maxRefImages 1
  const values = initialValues(schema);

  assert.deepEqual(
    validateDraft(schema, { ...values, prompt: '' }).map((i) => i.field),
    ['prompt'],
  );
  assert.equal(validateDraft(schema, { ...values, prompt: '钟楼' }).length, 0);

  const tooLong = validateDraft(schema, { ...values, prompt: '钟楼', duration: '99' });
  assert.equal(tooLong.length, 1);
  assert.equal(tooLong[0]?.field, 'duration');
  assert.match(tooLong[0]?.message ?? '', /最长 15 秒/);

  const tooShort = validateDraft(schema, { ...values, prompt: '钟楼', duration: '2' });
  assert.match(tooShort[0]?.message ?? '', /最短 5 秒/);

  const tooManyRefs = validateDraft(schema, { ...values, prompt: '钟楼' }, { refCount: 3 });
  assert.equal(tooManyRefs[0]?.field, 'reference');
  assert.match(tooManyRefs[0]?.message ?? '', /最多 1 张参考图/);
});

test('数量校验：图片工作台 1-8', () => {
  const schema = buildControlSchema(modelById('gpt-image-2'), 'image');
  const values = { ...initialValues(schema), prompt: '雾夜钟楼' };
  assert.match(validateDraft(schema, { ...values, count: '0' })[0]?.message ?? '', /至少为 1/);
  assert.match(validateDraft(schema, { ...values, count: '9' })[0]?.message ?? '', /最多 8 个/);
  assert.equal(validateDraft(schema, { ...values, count: '3' }).length, 0);
});

test('参考音频上限按模型能力校验（MiniMax H3 上限 1）', () => {
  const schema = buildControlSchema(modelById('minimax-h3'), 'video');
  const values = { ...initialValues(schema), prompt: '钟声' };
  assert.equal(validateDraft(schema, values, { audioRefCount: 1 }).length, 0);
  const issues = validateDraft(schema, values, { audioRefCount: 2 });
  assert.equal(issues[0]?.field, 'audioReference');
});

test('费用预估由目录 billing 计算，随张数/秒数变化', () => {
  const image = buildControlSchema(modelById('nano-banana-2-lite'), 'image'); // perImage: 2
  const twoImages = estimateCost(image, { ...initialValues(image), count: '2' });
  assert.equal(twoImages?.points, 4);
  assert.match(twoImages?.detail ?? '', /2 积分\/张 × 2 张/);
  assert.equal(estimateCost(image, { ...initialValues(image), count: '4' })?.points, 8);

  const video = buildControlSchema(modelById('minimax-h3'), 'video'); // perSecondStart: 0.5
  assert.equal(estimateCost(video, { ...initialValues(video), duration: '10' })?.points, 5);

  const freeVideo = buildControlSchema(modelById('seedance-2.0'), 'video'); // perSecondStart: 0
  assert.equal(estimateCost(freeVideo, { ...initialValues(freeVideo), duration: '8' })?.points, 0);
});

test('文本按 Token 计费无法在提交前预估 → 不编造数字', () => {
  const base = buildControlSchema(modelById('gpt-image-2'), 'image');
  const textLike: ControlSchema = {
    ...base,
    pricing: { kind: 'per-million-token', inputPerMTok: 3.75, outputPerMTok: 22.5, minCharge: 1 },
  };
  assert.equal(estimateCost(textLike, {}), undefined);
});

test('可运行模型：排除停用模型与停用渠道下的模型', () => {
  const channels: ChannelConfig[] = MODEL_CHANNELS.map((c) => ({ ...c }));
  const all = runnableModels(MODEL_CATALOG, channels, 'video');
  assert.ok(all.length > 0);
  assert.equal(all.every((m) => m.type === 'video' && m.status === 'enabled'), true);

  const disabledChannel = channels.map((c) => (c.id === 'jimeng' ? { ...c, enabled: false } : c));
  const filtered = runnableModels(MODEL_CATALOG, disabledChannel, 'video');
  assert.equal(filtered.some((m) => m.channelId === 'jimeng'), false);
  assert.ok(filtered.length < all.length);

  const disabledModel = MODEL_CATALOG.map((m) => (m.id === 'kling-1.6' ? { ...m, status: 'disabled' as const } : m));
  assert.equal(runnableModels(disabledModel, channels, 'video').some((m) => m.id === 'kling-1.6'), false);
});

test('音频工作台：目录无 audio 类型，如实标记 catalogBacked=false', () => {
  // 目录的 type 只有 text/image/video（DB CHECK 约束），因此音频没有可运行模型
  assert.equal(runnableModels(MODEL_CATALOG, MODEL_CHANNELS, 'audio').length, 0);

  const schema = buildControlSchema(modelById('gpt-image-2'), 'audio');
  assert.equal(schema.catalogBacked, false);
  assert.deepEqual(schema.modes, ['text-to-speech']);
  assert.ok(schema.controls.some((c) => c.key === 'voice'));
  assert.equal(schema.pricing.kind, 'unknown');
});

test('模型类型与工作台不匹配时不产出控件', () => {
  const textModel = MODEL_CATALOG.find((m) => m.type === 'text');
  assert.ok(textModel);
  const schema = buildControlSchema(textModel, 'video');
  assert.deepEqual(schema.modes, []);
  assert.equal(schema.catalogBacked, false);
});

test('initialValues 与控件一一对应，比例默认取首项', () => {
  const schema = buildControlSchema(modelById('nano-banana-2-lite'), 'image');
  const values = initialValues(schema);
  assert.deepEqual(Object.keys(values).sort(), schema.controls.map((c) => c.key).sort());
  assert.equal(values.ratio, schema.aspectRatios.values[0]);
});
