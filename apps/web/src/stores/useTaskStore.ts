// 全局执行任务（三类状态之「执行任务」：queued/running/succeeded/failed/cancelled）
// 持久化以支持刷新恢复（正式为服务端 Job + SSE 恢复）
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GenJob, JobKind } from '@/types';

interface EnqueueInput {
  kind: JobKind;
  label: string;
  projectId?: string;
  episodeId?: string;
  assetId?: string;
  shotId?: string;
  steps?: { label: string; done: boolean }[];
  costEstimate?: string;
  contextPath?: string;
}

interface TaskState {
  jobs: GenJob[];
  enqueue(input: EnqueueInput): string;
  updateJob(id: string, patch: Partial<GenJob>): void;
  getJob(id: string): GenJob | undefined;
  getJobByAsset(assetId: string): GenJob | undefined;
  retryJob(id: string): void;
  /** 统一推进所有 running job 的进度（可恢复：刷新后由 useJobResumer 继续驱动）；返回本次完成的 job */
  tickAll(): GenJob[];
}

// 每 tick 的进度增量（演示：interpret 8 步、image 8 步、video 5 步；正式为服务端 SSE 事件）
const TICK_STEP: Record<JobKind, number> = {
  split: 25,
  interpret: 12.5,
  image: 12.5,
  video: 20,
  audio: 12.5,
  canvas_export: 12.5,
  text: 12.5,
};

let seq = 0;
const nextId = () => `job-${Date.now().toString(36)}-${(seq += 1).toString(36)}`;

export const useTaskStore = create<TaskState>()(
  persist(
    (set, get) => ({
      jobs: [],

      enqueue(input) {
        const id = nextId();
        const now = Date.now();
        const job: GenJob = {
          id,
          kind: input.kind,
          label: input.label,
          projectId: input.projectId,
          episodeId: input.episodeId,
          assetId: input.assetId,
          shotId: input.shotId,
          status: 'queued',
          progress: 0,
          attempt: 1,
          steps: input.steps,
          costEstimate: input.costEstimate,
          contextPath: input.contextPath,
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({ jobs: [job, ...s.jobs] }));
        return id;
      },

      updateJob(id, patch) {
        set((s) => ({
          jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...patch, updatedAt: Date.now() } : j)),
        }));
      },

      getJob(id) {
        return get().jobs.find((j) => j.id === id);
      },

      getJobByAsset(assetId) {
        return get().jobs.find((j) => j.assetId === assetId && (j.status === 'queued' || j.status === 'running'));
      },

      retryJob(id) {
        const job = get().getJob(id);
        if (!job) return;
        set((s) => ({
          jobs: s.jobs.map((j) =>
            j.id === id
              ? {
                  ...j,
                  status: 'queued',
                  progress: 0,
                  attempt: j.attempt + 1,
                  error: undefined,
                  updatedAt: Date.now(),
                }
              : j,
          ),
        }));
      },

      tickAll() {
        const candidates = get().jobs
          .filter((j) => (j.status === 'running' || j.status === 'queued') && j.progress < 100)
          .map((j) => j.id);
        if (candidates.length === 0) return [];
        const now = Date.now();
        const done: GenJob[] = [];
        set((s) => ({
          jobs: s.jobs.map((j) => {
            if (!candidates.includes(j.id)) return j;
            const step = TICK_STEP[j.kind] ?? 12.5;
            const next = Math.min(100, Math.round((j.progress + step) * 10) / 10);
            const finished = next >= 100;
            const steps = j.steps?.map((st, i) => {
              const pct = 100 / (j.steps?.length ?? 1);
              return { ...st, done: next >= (i + 1) * pct };
            });
            if (finished) done.push({ ...j, progress: next, status: 'succeeded', steps, updatedAt: now });
            return { ...j, progress: next, status: finished ? 'succeeded' : 'running', steps, updatedAt: now };
          }),
        }));
        return done;
      },
    }),
    { name: 'mdp:tasks' },
  ),
);
