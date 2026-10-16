// EXPORTS: buildControlSchema, validateDraft, estimateCost, runnableModels, listAspectRatios, type ControlDef, type ControlSchema, type CreateKind, type ValidationIssue, type CostEstimate
//
// 生成控件 schema：把**模型能力**翻译成「界面控件 + 前置校验 + 费用预估」。
//
// 数据源优先级（ADR-006 D2）：
//   1. model.capability —— 决定**哪些控件存在**（modes / refImage / 时长范围 / 参考图上限 / billing）
//   2. 协议模板 capabilities[mode] —— 决定控件**映射到请求的哪个字段**（服务端目录持有，本文件不复制）
//   3. 本文件的按类型默认控件 —— 仅当 1、2 都未声明时兜底
//
// 红线（务必遵守，AGENTS.md 禁区 + ADR-006 D2）：
//   · 本文件只声明**控件种类、顺序与取值域**（UI 语法），**绝不声明协议字段名或协议取值**。
//   · 协议映射（例如 aspect_ratio 发到请求的哪个位置）的唯一来源是服务端协议模板。
//   · 模型不支持的能力**不产出控件**，由调用方直接不渲染（而不是渲染后置灰）。
//
// 已知的目录缺口（如实标注，不假装已知）：
//   目录对「画面比例」与「清晰度」只声明**数量**（aspectRatioCount / qualityTiers），
//   不声明**具体取值**。因此本文件只能给出常见的候选集合，并把来源标记为
//   'count-fallback'，供 UI 如实提示"取值清单待目录声明"（见 ADR-006 D3 / TASK-CREATE-006）。
import type { CatalogModel, ChannelConfig, ImageCapability, TextCapability, VideoCapability } from '@/config/models/model-catalog';

/** 智能创作支持的三类工作台（注意：模型目录的 ModelType 只有 text/image/video，不含 audio） */
export type CreateKind = 'image' | 'video' | 'audio';

/** 生成方式：由模型能力 modes / refImage 推导；UI 依此决定输入区形态 */
export type GenerationMode =
  | 'text-to-image'
  | 'image-to-image'
  | 'text-to-video'
  | 'image-to-video'
  | 'first-last-frame'
  | 'multi-reference'
  | 'audio-reference'
  | 'text-to-speech';

export const GENERATION_MODE_LABEL: Record<GenerationMode, string> = {
  'text-to-image': '文生图',
  'image-to-image': '图生图',
  'text-to-video': '文生视频',
  'image-to-video': '图生视频',
  'first-last-frame': '首尾帧',
  'multi-reference': '多模态参考',
  'audio-reference': '音频参考',
  'text-to-speech': '语音合成',
};

/** 控件种类（UI 语法）——与协议字段无关 */
export type ControlType = 'textarea' | 'chips' | 'select' | 'number';

/**
 * 披露层级（ADR-007 专业级改造 / 对齐专业工具研究的 E2「基础/进阶/专家三层，默认只露基础」）。
 * - basic：不填就没法生成（提示词、画面比例、数量）
 * - advanced：影响质量与时长，但不是每次都改（时长、清晰度、负面提示词）
 * - expert：需要理解上游协议才该动的（本平台当前为空，见文件末尾说明）
 */
export type ControlTier = 'basic' | 'advanced' | 'expert';

export const TIER_LABEL: Record<ControlTier, string> = {
  basic: '基础',
  advanced: '进阶',
  expert: '专家',
};

/** 层级是累积披露：选「进阶」= basic + advanced；选「专家」= 全部 */
export function controlsUpToTier(controls: ControlDef[], tier: ControlTier): ControlDef[] {
  const order: ControlTier[] = ['basic', 'advanced', 'expert'];
  const max = order.indexOf(tier);
  return controls.filter((control) => order.indexOf(control.tier ?? 'basic') <= max);
}

/** 某层级是否有控件（用于决定要不要显示该档按钮，避免出现空档） */
export function hasTier(controls: ControlDef[], tier: ControlTier): boolean {
  return controls.some((control) => control.tier === tier);
}

export interface ControlDef {
  /** 业务键（不是协议字段名） */
  key: string;
  label: string;
  type: ControlType;
  options?: string[];
  defaultValue: string;
  min?: number;
  max?: number;
  step?: number;
  required?: boolean;
  /** 取值域来源：declared = 目录/模板明确声明；count-fallback = 目录只给了数量，候选集合由前端兜底 */
  source?: 'declared' | 'count-fallback' | 'platform-default';
  hint?: string;
  /** 披露层级；缺省视为 basic */
  tier?: ControlTier;
}

/** 目录对「一组取值」只给了数量时的兜底内容与来源标记 */
export interface FallbackRange {
  values: string[];
  source: 'declared' | 'count-fallback' | 'platform-default';
  /** 目录声明的数量（用于 UI 如实提示"目录声明 N 项，具体取值待声明"） */
  declaredCount?: number;
}

export interface ModelLimits {
  maxRefImages: number;
  maxRefAudios: number;
  minDurationSeconds?: number;
  maxDurationSeconds?: number;
  qualityTierCount?: number;
}

/** 计费描述：只描述"怎么算"，不在这里做格式化 */
export type ModelPricing =
  | { kind: 'per-image'; pointsPerImage: number }
  | { kind: 'per-second'; pointsPerSecondStart: number }
  | { kind: 'per-million-token'; inputPerMTok: number; outputPerMTok: number; minCharge: number }
  | { kind: 'unknown' };

export interface ControlSchema {
  kind: CreateKind;
  /** 是否有目录模型支撑；audio 当前恒为 false（目录 CHECK 不含 audio，见 ADR-006 D8） */
  catalogBacked: boolean;
  modelId?: string;
  /** 可用的生成方式（空数组 = 该模型不支持当前工作台） */
  modes: GenerationMode[];
  controls: ControlDef[];
  limits: ModelLimits;
  aspectRatios: FallbackRange;
  qualityOptions: FallbackRange;
  pricing: ModelPricing;
  /** 需要用户提供参考图/音频的生成方式（用于提交前校验） */
  requiresReference: boolean;
}

/** 常见画面比例候选（仅在目录未声明具体清单时使用） */
export const COMMON_ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'] as const;

/** 常见清晰度候选（仅在目录未声明具体清单时使用） */
export const COMMON_QUALITY_TIERS = ['标准', '高清', '超清'] as const;

const DEFAULT_MAX_REF_IMAGES = 1;
const MAX_BATCH_COUNT = 8;

export function isImageCapability(capability: CatalogModel['capability']): capability is ImageCapability {
  return typeof (capability as ImageCapability).refImage === 'boolean';
}

export function isVideoCapability(capability: CatalogModel['capability']): capability is VideoCapability {
  return Array.isArray((capability as VideoCapability).modes);
}

export function isTextCapability(capability: CatalogModel['capability']): capability is TextCapability {
  return typeof (capability as TextCapability).maxTokens === 'number';
}

/** 目录只声明数量时，取常见候选的前 N 项，并如实标记来源 */
export function listFallbackRange(count: number | undefined, candidates: readonly string[]): FallbackRange {
  if (count === undefined || count <= 0) {
    return { values: [], source: 'count-fallback', declaredCount: count };
  }
  return {
    values: candidates.slice(0, Math.min(count, candidates.length)),
    source: 'count-fallback',
    declaredCount: count,
  };
}

/**
 * 比例候选（ADR 分片 6 / D3-B）：
 * - 目录**显式声明** `aspectRatios` → 走 declared，取值与声明**逐字一致**（顺序也保持）
 * - 未声明 → 退回既有 count-fallback（`aspectRatioCount` 取常见候选前 N 项），**行为不变**
 *
 * 为什么要有 declared：此前目录只能声明"数量"，前端便只能拿通用表前 N 项去猜，
 * **可能给出该模型实际不支持的比例**（用户提交后才在上游失败）。声明式让目录说了算。
 */
export function listAspectRatios(
  declared: readonly string[] | undefined,
  count: number | undefined,
): FallbackRange {
  // 去重但保序：重复声明不应产生重复选项；空白项视作未声明该项
  const cleaned = (declared ?? []).map((v) => v.trim()).filter((v) => v.length > 0);
  const values = Array.from(new Set(cleaned));
  if (values.length > 0) {
    return { values, source: 'declared' };
  }
  // 声明了空数组或全为空白 ⇒ 语义等同"未声明"，如实走 count-fallback（不放宽 source 语义）
  return listFallbackRange(count, COMMON_ASPECT_RATIOS);
}

/** 当前工作台可运行的模型：模型启用 且 其所属渠道存在且启用 */
export function runnableModels(
  models: CatalogModel[],
  channels: ChannelConfig[],
  kind: CreateKind,
): CatalogModel[] {
  if (kind === 'audio') return []; // 目录不含 audio 类型（DB CHECK 约束），见 ADR-006 D8
  const enabledChannels = new Set(channels.filter((c) => c.enabled).map((c) => c.id));
  return models
    .filter((m) => m.status === 'enabled' && m.type === kind && enabledChannels.has(m.channelId))
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

function modesForImage(capability: ImageCapability): GenerationMode[] {
  // 图片：只有声明了 refImage 才提供"图生图"，否则不出现参考图入口
  return capability.refImage ? ['text-to-image', 'image-to-image'] : ['text-to-image'];
}

function modesForVideo(capability: VideoCapability): GenerationMode[] {
  const modes: GenerationMode[] = [];
  for (const mode of capability.modes) {
    if (mode === 't2v') modes.push('text-to-video');
    else if (mode === 'i2v') modes.push('image-to-video');
    else if (mode === 'first_last_frame') modes.push('first-last-frame');
    else if (mode === 'multi_ref') modes.push('multi-reference');
    else if (mode === 'audio_ref') modes.push('audio-reference');
  }
  return modes;
}

function promptControls(kind: CreateKind, supportsNegative: boolean): ControlDef[] {
  const controls: ControlDef[] = [
    {
      key: 'prompt',
      label: kind === 'audio' ? '合成文本' : '提示词',
      type: 'textarea',
      defaultValue: '',
      required: true,
      tier: 'basic',
      hint:
        kind === 'audio'
          ? '要合成的文本内容；支持 @ 引用素材'
          : '描述画面。支持 @ 引用素材与参考图；先写主体与动作，再补环境、光线、镜头（顺序会影响权重）',
    },
  ];
  if (supportsNegative) {
    controls.push({
      key: 'negative',
      label: '负面提示词',
      type: 'textarea',
      defaultValue: '',
      tier: 'advanced',
      hint: '不希望出现在画面里的内容（如 low quality、extra fingers）。部分上游不支持该字段，是否生效取决于所选模型的协议模板',
    });
  }
  return controls;
}

/** 音频：目录无 audio 类型，只能给平台默认控件，并标记 catalogBacked=false */
function audioSchema(): ControlSchema {
  return {
    kind: 'audio',
    catalogBacked: false,
    modes: ['text-to-speech'],
    controls: [
      ...promptControls('audio', false),
      {
        key: 'voice',
        label: '音色',
        type: 'select',
        options: ['沉稳男声', '清亮女声', '童声', '旁白'],
        defaultValue: '沉稳男声',
        source: 'platform-default',
        tier: 'basic',
        hint: '平台默认音色清单（目录暂无音频类型，音色未由任何模型声明）',
      },
    ],
    limits: { maxRefImages: 0, maxRefAudios: 0 },
    aspectRatios: { values: [], source: 'platform-default' },
    qualityOptions: { values: [], source: 'platform-default' },
    pricing: { kind: 'unknown' },
    requiresReference: false,
  };
}

/**
 * 由模型能力构建控件 schema。
 * 传入 undefined（或模型不支持该工作台）时返回 `modes: []` 的空 schema —— 调用方据此给出
 * "无可用模型，请到设置中心配置渠道与模型" 的真实空态，而不是回退到硬编码模型名。
 */
export function buildControlSchema(model: CatalogModel | undefined, kind: CreateKind): ControlSchema {
  if (kind === 'audio') return audioSchema();

  if (!model) {
    return {
      kind,
      catalogBacked: false,
      modes: [],
      controls: [],
      limits: { maxRefImages: 0, maxRefAudios: 0 },
      aspectRatios: { values: [], source: 'platform-default' },
      qualityOptions: { values: [], source: 'platform-default' },
      pricing: { kind: 'unknown' },
      requiresReference: false,
    };
  }

  if (kind === 'image' && isImageCapability(model.capability)) {
    const capability = model.capability;
    const aspectRatios = listAspectRatios(capability.aspectRatios, capability.aspectRatioCount);
    const qualityOptions = listFallbackRange(capability.qualityTiers, COMMON_QUALITY_TIERS);
    const controls: ControlDef[] = [
      ...promptControls('image', true),
      {
        key: 'ratio',
        label: '画面比例',
        type: 'chips',
        options: aspectRatios.values,
        defaultValue: aspectRatios.values[0] ?? '',
        source: aspectRatios.source,
        tier: 'basic',
        hint: '成片画幅。目录只声明了该模型支持的比例数量，具体取值清单待目录补充（ADR-006 D3）',
      },
    ];
    if (qualityOptions.values.length > 0) {
      controls.push({
        key: 'quality',
        label: '清晰度',
        type: 'select',
        options: qualityOptions.values,
        defaultValue: qualityOptions.values[0],
        source: qualityOptions.source,
        tier: 'advanced',
        hint: `该模型声明了 ${qualityOptions.declaredCount ?? qualityOptions.values.length} 档清晰度；具体档位名称待目录声明。档位越高通常越慢、越贵`,
      });
    }
    controls.push({
      key: 'count',
      label: '数量',
      type: 'number',
      defaultValue: '1',
      min: 1,
      max: MAX_BATCH_COUNT,
      tier: 'basic',
      hint: `一次提交的候选数（1–${MAX_BATCH_COUNT}）。数量直接乘进费用预估；上游按张计费，多张不会更便宜`,
    });
    return {
      kind,
      catalogBacked: true,
      modelId: model.id,
      modes: modesForImage(capability),
      controls,
      limits: { maxRefImages: capability.refImage ? DEFAULT_MAX_REF_IMAGES : 0, maxRefAudios: 0 },
      aspectRatios,
      qualityOptions,
      pricing: { kind: 'per-image', pointsPerImage: capability.billing.perImage },
      requiresReference: false,
    };
  }

  if (kind === 'video' && isVideoCapability(model.capability)) {
    const capability = model.capability;
    // ADR 分片 6：目录显式声明 ratio 列表则用声明值；未声明退回既有推断（含视频侧数量未知的兜底 3）
    const aspectRatios = listAspectRatios(capability.aspectRatios, 3);
    const qualityOptions = listFallbackRange(capability.qualityTiers, COMMON_QUALITY_TIERS);
    const modes = modesForVideo(capability);
    const controls: ControlDef[] = [
      ...promptControls('video', false),
      {
        key: 'ratio',
        label: '画面比例',
        type: 'chips',
        options: aspectRatios.values,
        defaultValue: aspectRatios.values[0] ?? '',
        source: aspectRatios.source,
        tier: 'basic',
        hint: '成片画幅。目录尚未声明视频模型的比例清单，此处为常见比例候选',
      },
      {
        key: 'duration',
        label: '时长（秒）',
        type: 'number',
        defaultValue: String(capability.minDurationSeconds),
        min: capability.minDurationSeconds,
        max: capability.maxDurationSeconds,
        step: 1,
        source: 'declared',
        tier: 'advanced',
        hint: `该模型支持 ${capability.minDurationSeconds}–${capability.maxDurationSeconds} 秒（来自模型能力声明）。时长直接乘进按秒计费的费用预估`,
      },
    ];
    if (qualityOptions.values.length > 0) {
      controls.push({
        key: 'quality',
        label: '清晰度',
        type: 'select',
        options: qualityOptions.values,
        defaultValue: qualityOptions.values[0],
        source: qualityOptions.source,
        tier: 'advanced',
        hint: `该模型声明了 ${qualityOptions.declaredCount ?? qualityOptions.values.length} 档清晰度；具体档位名称待目录声明。档位越高通常越慢、越贵`,
      });
    }
    // 帧率当前目录未声明（capability 无 fps 字段），故不产出控件 —— 不展示无依据的选项
    const requiresReference = modes.some(
      (m) => m !== 'text-to-video' && m !== 'text-to-image',
    );
    return {
      kind,
      catalogBacked: true,
      modelId: model.id,
      modes,
      controls,
      limits: {
        maxRefImages: capability.maxRefImages,
        maxRefAudios: capability.maxRefAudios,
        minDurationSeconds: capability.minDurationSeconds,
        maxDurationSeconds: capability.maxDurationSeconds,
        qualityTierCount: capability.qualityTiers,
      },
      aspectRatios,
      qualityOptions,
      pricing: { kind: 'per-second', pointsPerSecondStart: capability.billing.perSecondStart },
      requiresReference,
    };
  }

  // 模型类型与工作台不匹配（例如把文本模型挂到图片工作台）
  return buildControlSchema(undefined, kind);
}

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface DraftContext {
  /** 已挂载的参考图数量 */
  refCount?: number;
  /** 已挂载的参考音频数量 */
  audioRefCount?: number;
}

/** 提交前校验：时长/数量/参考图上限，给出字段级原因（而不是提交后由 execution 报错） */
export function validateDraft(
  schema: ControlSchema,
  values: Record<string, string>,
  context: DraftContext = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const required = schema.controls.filter((c) => c.required);

  for (const control of required) {
    if (!(values[control.key] ?? '').trim()) {
      issues.push({ field: control.key, message: `${control.label}不能为空` });
    }
  }

  const duration = schema.limits;
  const durationValue = Number.parseInt(values.duration ?? '', 10);
  if (schema.kind === 'video' && values.duration !== undefined) {
    if (!Number.isFinite(durationValue)) {
      issues.push({ field: 'duration', message: '时长必须是数字' });
    } else if (duration.minDurationSeconds !== undefined && durationValue < duration.minDurationSeconds) {
      issues.push({ field: 'duration', message: `该模型最短 ${duration.minDurationSeconds} 秒` });
    } else if (duration.maxDurationSeconds !== undefined && durationValue > duration.maxDurationSeconds) {
      issues.push({ field: 'duration', message: `该模型最长 ${duration.maxDurationSeconds} 秒` });
    }
  }

  const countValue = Number.parseInt(values.count ?? '', 10);
  if (values.count !== undefined) {
    if (!Number.isFinite(countValue) || countValue < 1) {
      issues.push({ field: 'count', message: '数量至少为 1' });
    } else if (countValue > MAX_BATCH_COUNT) {
      issues.push({ field: 'count', message: `单次最多 ${MAX_BATCH_COUNT} 个` });
    }
  }

  const refCount = context.refCount ?? 0;
  if (refCount > schema.limits.maxRefImages) {
    issues.push({
      field: 'reference',
      message: `该模型最多 ${schema.limits.maxRefImages} 张参考图`,
    });
  }
  const audioRefCount = context.audioRefCount ?? 0;
  if (audioRefCount > schema.limits.maxRefAudios) {
    issues.push({
      field: 'audioReference',
      message: `该模型最多 ${schema.limits.maxRefAudios} 条参考音频`,
    });
  }

  return issues;
}

export interface CostEstimate {
  points: number;
  /** 说明文案（例如「2 积分/张 × 3 张」），由 UI 直接展示 */
  detail: string;
}

/**
 * 费用预估：由目录 billing 计算，随张数/秒数变化。
 * 文本按 Token 计费无法在提交前预估 → 返回 undefined（不编造数字）。
 * 计费配置缺失/非有限（TASK-FIX-005）→ 同样返回 undefined，由 UI 展示兜底文案。
 */
export function estimateCost(schema: ControlSchema, values: Record<string, string>): CostEstimate | undefined {
  if (schema.pricing.kind === 'per-image') {
    const count = Math.max(1, Number.parseInt(values.count ?? '1', 10) || 1);
    if (!Number.isFinite(schema.pricing.pointsPerImage)) return undefined;
    return {
      points: schema.pricing.pointsPerImage * count,
      detail: `${schema.pricing.pointsPerImage} 积分/张 × ${count} 张`,
    };
  }
  if (schema.pricing.kind === 'per-second') {
    const seconds = Math.max(
      schema.limits.minDurationSeconds ?? 1,
      Number.parseInt(values.duration ?? '', 10) || (schema.limits.minDurationSeconds ?? 1),
    );
    if (!Number.isFinite(schema.pricing.pointsPerSecondStart)) return undefined;
    return {
      points: schema.pricing.pointsPerSecondStart * seconds,
      detail: `${schema.pricing.pointsPerSecondStart} 积分/秒起 × ${seconds} 秒`,
    };
  }
  return undefined;
}

/** 由 schema 生成初始表单值 */
export function initialValues(schema: ControlSchema): Record<string, string> {
  return Object.fromEntries(schema.controls.map((c) => [c.key, c.defaultValue]));
}
