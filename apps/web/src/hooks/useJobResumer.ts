// 全局 Job 推进器（可恢复 Job 语义：刷新/卸载后任务不丢失）
// App 级挂载一次：每 500ms 统一推进所有 queued/running job（useTaskStore.tickAll），
// 完成的 job 通过 jobRegistry 分发给对应业务的完成回调（登记产物候选等）。
// 各业务模块不再持有自己的 setInterval，避免刷新即丢、组件卸载即停。
import { useEffect } from 'react';
import { useTaskStore } from '@/stores/useTaskStore';
import { dispatchJobDone } from '@/lib/jobRegistry';

export function useJobResumer() {
  useEffect(() => {
    const timer = window.setInterval(() => {
      const done = useTaskStore.getState().tickAll();
      done.forEach((j) => dispatchJobDone(j));
    }, 500);
    return () => window.clearInterval(timer);
  }, []);
}
