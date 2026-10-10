// 执行任务完成回调注册表（可恢复 Job 语义的一部分）
// 各业务模块在模块顶层注册 kind → 完成处理函数；useJobResumer 拿到完成的 job 后分发。
// 处理函数只依赖 store getters（不依赖组件实例），保证刷新后注册依然有效。
import type { GenJob } from '@/types';

const handlers = new Map<string, (job: GenJob) => void>();

export function registerJobHandler(kind: string, fn: (job: GenJob) => void) {
  handlers.set(kind, fn);
}

export function dispatchJobDone(job: GenJob) {
  const fn = handlers.get(job.kind);
  if (fn) fn(job);
}

export function hasJobHandler(kind: string) {
  return handlers.has(kind);
}
