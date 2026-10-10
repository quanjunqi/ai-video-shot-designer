// EXPORTS: parseTaskPayload, extractResultUrl, mediaKind, reusableDraft, cancelPlan, canCancel, canRetry, formatTaskTime, attemptsNote, type TaskPayload, type ReusableDraft, type CancelPlan, type MediaKind
//
// 智能创作结果区的纯逻辑（ADR-006 D6/D10）：解析已落库的任务负载、判定可复用参数、
// 以及区分「排队中 / 执行中」的取消语义。
//
// 为什么单独成文件：这些规则需要单测覆盖（node:test 直接加载），且不应埋在组件里。
// 本文件只依赖 type import，便于测试环境直接 strip-types 加载。
//
// 事实前提（已核实）：
//   · `POST /internal/v1/tasks` 会把前端提交的 payload 原样持久化到 `jobs.intent_payload`
//     （services/execution/internal/httpapi/handler.go:174），所以「复用参数」读的是真实数据。
//   · 但**没有任何代码把生成结果写回 intent_payload**（全仓 grep `jsonb_set` / `'result'` 命中为 0），
//     因此 `result` 只可能由未来/其它链路写入 —— 故对结果地址做**防御式探测**：
//     取到就显示真实产物，取不到就如实回退到占位图。
import type { ServerTask } from '@/lib/api/client';

/** 前端提交并被原样落库的任务负载（与 CreateWorkbench 的 submit 一一对应） */
export interface TaskPayload {
  prompt?: string;
  parameters?: Record<string, string>;
  model_id?: string;
  protocol_template_id?: string;
  references?: { id: string; slot: string; url: string }[];
  reference_count?: number;
  quantity?: number;
  candidate_index?: number;
  /** 上游结果（当前无写入链路，防御式读取） */
  result?: Record<string, unknown>;
}

/** intent_payload 可能是对象或 JSON 字符串（服务端列类型为 jsonb/raw），两种都要能吃 */
export function parseTaskPayload(task: Pick<ServerTask, 'intent_payload'>): TaskPayload {
  const raw = task.intent_payload;
  if (raw === null || raw === undefined) return {};
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed !== null && typeof parsed === 'object' ? (parsed as TaskPayload) : {};
    } catch {
      return {};
    }
  }
  return raw as TaskPayload;
}

const URL_KEYS = [
  'output.image_urls.0',
  'output.data.0.url',
  'output.video_url',
  'output.audio_url',
  'output.url',
  'data.0.url',
  'video_url',
  'audio_url',
  'file_url',
  'url',
] as const;

function isUsableUrl(value: unknown): value is string {
  return typeof value === 'string' && /^(https?:\/\/|data:)/.test(value);
}

/**
 * 从任务负载里探测真实产物地址。
 * 当前正常链路不会写入 result，因此多数情况返回 undefined（调用方如实回退到占位图）；
 * 一旦上游/后续链路开始写回，本函数即可直接展示真实产物，无需改组件。
 */
export function extractResultUrl(payload: TaskPayload): string | undefined {
  const result = payload.result;
  if (!result) return undefined;
  for (const key of URL_KEYS) {
    const value = result[key];
    if (isUsableUrl(value)) return value;
  }
  return undefined;
}

/** 产物媒体类型：决定用 img / video / audio 渲染，避免把视频地址塞进 <img> 变成裂图 */
export type MediaKind = 'image' | 'video' | 'audio' | 'unknown';

const EXT_KIND: Record<string, MediaKind> = {
  png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image', avif: 'image', bmp: 'image',
  mp4: 'video', webm: 'video', mov: 'video', mkv: 'video',
  mp3: 'audio', wav: 'audio', m4a: 'audio', aac: 'audio', ogg: 'audio', flac: 'audio',
};

/** 由地址推断媒体类型（扩展名优先，其次 data: MIME 前缀，最后回退 unknown → 按图片渲染） */
export function mediaKind(url: string): MediaKind {
  const dataMatch = /^data:([^;,]+)[;,]/.exec(url);
  if (dataMatch?.[1]) {
    const mime = dataMatch[1];
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    return 'unknown';
  }
  const withoutQuery = url.split(/[?#]/)[0] ?? url;
  const ext = withoutQuery.slice(withoutQuery.lastIndexOf('.') + 1).toLowerCase();
  return EXT_KIND[ext] ?? 'unknown';
}

export interface ReusableDraft {
  prompt?: string;
  /** 只保留当前模型 schema 认识的参数键 */
  parameters: Record<string, string>;
  /** 当前模型不认识、因而被忽略的参数键（UI 需如实告知，不静默丢弃） */
  skippedKeys: string[];
  modelId?: string;
}

/**
 * 生成「复用参数」草稿。
 * @param allowedKeys 当前所选模型 schema 的控件键集合；不在其中的参数会被跳过并记录。
 */
export function reusableDraft(
  task: Pick<ServerTask, 'intent_payload'>,
  allowedKeys: readonly string[],
): ReusableDraft {
  const payload = parseTaskPayload(task);
  const allowed = new Set(allowedKeys);
  const parameters: Record<string, string> = {};
  const skippedKeys: string[] = [];
  for (const [key, value] of Object.entries(payload.parameters ?? {})) {
    // 能还原的才还原；其余（当前模型不认识，或值不是字符串）一律记入 skippedKeys，
    // 由 UI 如实告知用户，避免"复用后参数悄悄少了"。
    if (typeof value === 'string' && allowed.has(key)) {
      parameters[key] = value;
      continue;
    }
    skippedKeys.push(key);
  }
  const draft: ReusableDraft = { parameters, skippedKeys };
  if (typeof payload.prompt === 'string' && payload.prompt !== '') draft.prompt = payload.prompt;
  if (typeof payload.model_id === 'string' && payload.model_id !== '') draft.modelId = payload.model_id;
  return draft;
}

/** 是否可取消：只有排队中与执行中 */
export function canCancel(status: ServerTask['status']): boolean {
  return status === 'queued' || status === 'running';
}

/** 是否可重试：失败与已取消 */
export function canRetry(status: ServerTask['status']): boolean {
  return status === 'failed' || status === 'cancelled';
}

export interface CancelPlan {
  mode: 'queued' | 'running';
  title: string;
  description: string;
  confirmLabel: string;
  /** 计费口径说明（ADR-006 D10：取消必须与计费口径绑定） */
  billNote: string;
  /** 执行中取消时上游可能仍会完成，UI 必须如实告知 */
  mayStillComplete: boolean;
}

/**
 * 取消的文案与口径（ADR-006 D10）。
 * 排队中取消 = 立即移除、永不执行、不产生费用；
 * 执行中取消 = 只发中断信号，上游可能仍会完成，按已运行时长计费。
 */
export function cancelPlan(status: ServerTask['status']): CancelPlan | undefined {
  if (status === 'queued') {
    return {
      mode: 'queued',
      title: '取消排队中的任务？',
      description: '该任务尚未开始执行，取消后不会产生任何费用，也不会出现在结果里。',
      confirmLabel: '取消任务',
      billNote: '未开始执行：不扣费',
      mayStillComplete: false,
    };
  }
  if (status === 'running') {
    return {
      mode: 'running',
      title: '中断正在执行的任务？',
      description: '该任务已在执行。取消只会发出中断信号，上游可能仍会完成并返回产物。',
      confirmLabel: '仍然中断',
      billNote: '已开始执行：按已运行时长计费',
      mayStillComplete: true,
    };
  }
  return undefined;
}

/** 任务时间展示（列表与详情共用，避免两处实现不一致） */
export function formatTaskTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** 尝试次数文案：1 次不展示噪音，>1 才提示 */
export function attemptsNote(attempt: number): string | undefined {
  return attempt > 1 ? `已尝试 ${attempt} 次` : undefined;
}
