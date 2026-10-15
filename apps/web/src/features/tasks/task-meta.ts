// EXPORTS: KIND_META, KIND_FALLBACK, STATUS_META, STATUS_FALLBACK, kindMeta, statusMeta, type KindMeta, type StatusMeta
//
// 任务 kind/status 的展示元数据（任务中心列表行 + 详情抽屉共用一份，避免两处标签各写一遍后漂移）。
//
// 为什么要有 kindMeta/statusMeta 这层访问器：kind/status 是服务端枚举，但服务端可能新增
// 未枚举值 —— 调用方一律走访问器（内部判存在 + 兜底），**禁止裸下标取值**，
// 否则查表拿到 undefined 会在渲染期崩（TASK-FIX-004 的既有口径，原先内联在 Tasks.tsx）。
import { AudioLines, FileSearch, Film, Image as ImageIcon } from 'lucide-react';
import type { JobKind, JobStatus } from '@/types';

export interface KindMeta {
  label: string;
  icon: typeof Film;
  tone: string;
}

export interface StatusMeta {
  label: string;
  className: string;
}

export const KIND_META: Record<JobKind, KindMeta> = {
  split: { label: '拆集', icon: FileSearch, tone: 'text-primary' },
  interpret: { label: '导演解读', icon: Film, tone: 'text-sky-500' },
  image: { label: '图片生成', icon: ImageIcon, tone: 'text-primary' },
  video: { label: '视频拍摄', icon: Film, tone: 'text-sky-500' },
  audio: { label: '音频', icon: AudioLines, tone: 'text-emerald-500' },
  canvas_export: { label: '画布导出', icon: ImageIcon, tone: 'text-violet-500' },
  text: { label: '文本生成', icon: FileSearch, tone: 'text-primary' },
};

/** 兜底：服务端可能新增未枚举 kind/status，查表不得裸下标崩溃（TASK-FIX-004）。 */
export const KIND_FALLBACK: KindMeta = { label: '任务', icon: FileSearch, tone: 'text-muted-foreground' };

export const STATUS_META: Record<JobStatus, StatusMeta> = {
  queued: { label: '排队中', className: 'bg-muted text-muted-foreground' },
  running: { label: '运行中', className: 'bg-primary text-primary-foreground' },
  succeeded: { label: '成功', className: 'bg-success/15 text-success' },
  failed: { label: '失败', className: 'bg-destructive/10 text-destructive' },
  cancelled: { label: '已取消', className: 'bg-muted text-muted-foreground' },
};

export const STATUS_FALLBACK: StatusMeta = { label: '未知', className: 'bg-muted text-muted-foreground' };

/**
 * 取 kind 展示元数据；未枚举值回退 KIND_FALLBACK。
 * 用 hasOwnProperty 而非 `in`：`in` 会命中原型链上的键（如 'constructor'），那不是有效 kind。
 */
export function kindMeta(kind: string): KindMeta {
  return Object.prototype.hasOwnProperty.call(KIND_META, kind)
    ? KIND_META[kind as JobKind] // 已判存在，窄化安全
    : KIND_FALLBACK;
}

/** 取 status 展示元数据；未枚举值回退 STATUS_FALLBACK（理由同 kindMeta） */
export function statusMeta(status: string): StatusMeta {
  return Object.prototype.hasOwnProperty.call(STATUS_META, status)
    ? STATUS_META[status as JobStatus]
    : STATUS_FALLBACK;
}
