// EXPORTS: bucketOf, groupQueue, bulkCancelTargets, costTone, COST_TONE_THRESHOLDS, type QueueBucket, type QueueGroups, type CostTone
//
// 运行区专业化（ADR-007 专业级改造 / 对齐专业工具研究 B4 队列即工作区、B6 成本前置）：
//   · 队列按四段分组：排队中 / 运行中 / 已完成 / 失败（含已取消）
//   · 「全部清空」只针对**可取消**的任务（排队中 + 运行中），不会误伤已完成
//   · 成本用三色阈值前置提示（fal Sandbox 的绿/黄/红做法）
//
// 事实前提：execution 只有 `{id}/cancel` 与 `{id}/retry`，**没有** pause/resume/delete，
// 因此本模块不提供暂停/恢复/删除的语义（不假装支持）。
import type { ServerTask } from '@/lib/api/client';

export type QueueBucket = 'queued' | 'running' | 'done' | 'failed';

export interface QueueGroups {
  queued: ServerTask[];
  running: ServerTask[];
  done: ServerTask[];
  failed: ServerTask[];
}

/** 任务 → 队列分段（cancelled 归入"失败"段，与用户心智一致：没成功） */
export function bucketOf(task: Pick<ServerTask, 'status'>): QueueBucket {
  if (task.status === 'queued') return 'queued';
  if (task.status === 'running') return 'running';
  if (task.status === 'succeeded') return 'done';
  return 'failed';
}

/** 按四段分组；段内保持传入顺序（调用方通常已按时间倒序） */
export function groupQueue(tasks: ServerTask[]): QueueGroups {
  const groups: QueueGroups = { queued: [], running: [], done: [], failed: [] };
  for (const task of tasks) groups[bucketOf(task)].push(task);
  return groups;
}

/** 「全部清空」的目标：只有排队中与正在运行的可取消，已完成/失败不会被误伤 */
export function bulkCancelTargets(tasks: ServerTask[]): ServerTask[] {
  return tasks.filter((task) => task.status === 'queued' || task.status === 'running');
}

export type CostTone = 'low' | 'mid' | 'high';

/**
 * 成本三色阈值（积分）。
 * ⚠️ 这两个数字是**平台默认值，待真实定价校准** —— 目录里的积分单价目前是示例定价
 * （`model-catalog.ts` 注释已声明）。校准前不要把颜色当作承诺，UI 需同时给出数值。
 */
export const COST_TONE_THRESHOLDS = { low: 10, high: 50 } as const;

export const COST_TONE_LABEL: Record<CostTone, string> = {
  low: '低成本',
  mid: '中等成本',
  high: '高成本',
};

export function costTone(points: number, thresholds: { low: number; high: number } = COST_TONE_THRESHOLDS): CostTone {
  if (!Number.isFinite(points) || points <= thresholds.low) return 'low';
  if (points <= thresholds.high) return 'mid';
  return 'high';
}

/** 三色对应的 Tailwind 类（与平台既有的 success/destructive 语义一致） */
export const COST_TONE_CLASS: Record<CostTone, string> = {
  low: 'text-success',
  mid: 'text-amber-600 dark:text-amber-400',
  high: 'text-destructive',
};
