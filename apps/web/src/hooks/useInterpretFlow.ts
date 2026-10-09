// 单集导演解读任务流（解读：执行目标确认 → 解析 → 导演分析 → 基调/场次/覆盖 → 产物登记）
// 可恢复 Job 语义：启动时登记 job（幂等）；推进与完成由全局 useJobResumer + useTaskStore.tickAll 驱动，
// 刷新/卸载不丢任务；完成回调在模块顶层注册（interpret handler），不依赖组件实例。
import { useEffect } from 'react';
import { useEpisodeStore } from '@/stores/useEpisodeStore';
import { useTaskStore } from '@/stores/useTaskStore';
import { buildAssetsFromInterpret, buildInterpretation } from '@/mocks/assets';
import { buildDirecting, buildExecutableUnits, buildPerformance, buildSceneVariants } from '@/mocks/directing';
import { useAssetStore } from '@/stores/useAssetStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useRuleTemplateStore } from '@/stores/useRuleTemplateStore';
import { resolveCapacitySeconds } from '@/lib/ruleResolver';
import { registerJobHandler } from '@/lib/jobRegistry';
import type { DirectorInterpretation } from '@/types';

export const INTERPRET_STEPS = [
  { label: '解析剧本与原文范围' },
  { label: 'EV / DLG / LOCK 事实提取' },
  { label: 'director_analysis（基调 / 冲突 / 连续性）' },
  { label: '视觉基调与情绪弧线（look & feel）' },
  { label: '场次清单确认（scene breakdown）' },
  { label: 'media_implementation_plan（容量感知单元规划）' },
  { label: '剧本覆盖与初步单元（PLANNED）' },
  { label: '登记资产草案与导演产物' },
];

// 真实解读调用暂存区：确认执行目标前真实文本模型已产出导演解读原文，
// 任务完成构建完整结构化解读产物时注入，保证「真实解读内容 + 完整创作层结构」并存。
const pendingDirectorNotes = new Map<string, string>();
export function stashRealDirectorNote(episodeId: string, note: string): void {
  if (note && note.trim()) pendingDirectorNotes.set(episodeId, note.trim());
}

// 结构化导演解读暂存区：LLM 按 Schema 输出的 8 板块 JSON，任务完成时注入
const pendingDirectorInterpretations = new Map<string, DirectorInterpretation>();
export function stashRealDirectorInterpretation(episodeId: string, di: DirectorInterpretation): void {
  if (di) pendingDirectorInterpretations.set(episodeId, di);
}

// 用户点击「确认并生成解读」后直接启动解读任务（幂等；effect 的 pending 分支仅作刷新恢复兜底）
export function startInterpretation(episodeId: string): boolean {
  const ep = useEpisodeStore.getState().episodes.find((e) => e.id === episodeId);
  if (!ep || ep.interpretation || ep.stage !== 'analyze') return false;
  const existing = useTaskStore
    .getState()
    .jobs.find(
      (j) => j.episodeId === episodeId && j.kind === 'interpret' && (j.status === 'queued' || j.status === 'running'),
    );
  if (existing) return false;
  const jobId = useTaskStore.getState().enqueue({
    kind: 'interpret',
    label: `解读「${ep.title}」`,
    projectId: ep.projectId,
    episodeId,
    steps: INTERPRET_STEPS.map((s) => ({ label: s.label, done: false })),
    contextPath: `/comic/projects/${ep.projectId}/episodes/${episodeId}/analyze`,
  });
  useTaskStore.getState().updateJob(jobId, { status: 'running', progress: 0 });
  useEpisodeStore.getState().updateEpisode(episodeId, { status: 'analyzing' });
  return true;
}

// 解读完成回调（由 useJobResumer 在 job 完成后分发）：登记解读产物 + 资产草案 + 导演阶段产物
registerJobHandler('interpret', (job) => {
  if (!job.episodeId) return;
  const ep = useEpisodeStore.getState().getEpisode(job.episodeId);
  if (!ep) return;
  const project = useProjectStore.getState().getProject(ep.projectId);
  const interpretation = buildInterpretation(
    ep,
    project ?? undefined,
    ep.executionTarget,
    { maxUnitSeconds: resolveCapacitySeconds(project ?? { ruleOverrides: undefined }, useRuleTemplateStore.getState().templates) },
  );
  const realNote = pendingDirectorNotes.get(ep.id);
  if (realNote) {
    interpretation.directorNote = realNote;
    pendingDirectorNotes.delete(ep.id);
  }
  const realDI = pendingDirectorInterpretations.get(ep.id);
  if (realDI) {
    interpretation.directorInterpretation = realDI;
    pendingDirectorInterpretations.delete(ep.id);
  }
  useEpisodeStore.getState().setInterpretation(ep.id, interpretation);
  // 解读完成后登记资产草案与导演阶段产物，否则进入下游阶段会出现空列表。
  useAssetStore.getState().upsertAssets(buildAssetsFromInterpret(ep));
  useEpisodeStore.getState().updateEpisode(ep.id, {
    status: 'needs_review',
    performance: buildPerformance(ep),
    sceneVariants: buildSceneVariants(ep),
    directing: buildDirecting(ep, ep.executionTarget),
    executableUnits: buildExecutableUnits(ep, ep.executionTarget),
    counts: {
      scenes: 2 + (ep.index % 2),
      characters: 3 + (ep.index % 3),
      pendingReview: 1,
    },
  });
});

export function useInterpretFlow(episodeId: string) {
  const episode = useEpisodeStore((s) => s.episodes.find((e) => e.id === episodeId));
  const updateEpisode = useEpisodeStore((s) => s.updateEpisode);
  const enqueue = useTaskStore((s) => s.enqueue);
  const updateJob = useTaskStore((s) => s.updateJob);

  useEffect(() => {
    if (!episode) return;
    if (episode.interpretation) return;
    if (episode.stage !== 'analyze') return;

    // 启动：pending → analyzing（解读不依赖执行目标；执行目标/视频模型/衔接在视频生产阶段锁定。幂等：同集同一阶段只保留一个活跃任务）
    if (episode.status === 'pending') {
      const existing = useTaskStore
        .getState()
        .jobs.find(
          (j) => j.episodeId === episodeId && j.kind === 'interpret' && (j.status === 'queued' || j.status === 'running'),
        );
      // 只有用户点击「确认并生成解读」（真实文本调用已暂存）或已有进行中任务时才启动，避免页面加载自动解读
      if (!pendingDirectorNotes.has(episodeId) && !existing) return;
      if (!existing) {
        const jobId = enqueue({
          kind: 'interpret',
          label: `解读「${episode.title}」`,
          projectId: episode.projectId,
          episodeId,
          steps: INTERPRET_STEPS.map((s) => ({ label: s.label, done: false })),
          contextPath: `/comic/projects/${episode.projectId}/episodes/${episodeId}/analyze`,
        });
        updateJob(jobId, { status: 'running', progress: 0 });
      }
      updateEpisode(episodeId, { status: 'analyzing' });
      return;
    }

    // 恢复：analyzing 时确保存在活跃 job（刷新后由 resumer 继续推进；无 job 则重建，不卡死）
    if (episode.status === 'analyzing') {
      const job = useTaskStore.getState().jobs.find(
        (j) => j.episodeId === episodeId && j.kind === 'interpret' && (j.status === 'queued' || j.status === 'running'),
      );
      if (!job) {
        const jobId = enqueue({
          kind: 'interpret',
          label: `解读「${episode.title}」`,
          projectId: episode.projectId,
          episodeId,
          steps: INTERPRET_STEPS.map((s) => ({ label: s.label, done: false })),
          contextPath: `/comic/projects/${episode.projectId}/episodes/${episodeId}/analyze`,
        });
        updateJob(jobId, { status: 'running', progress: 0 });
      } else if (job.status === 'queued') {
        updateJob(job.id, { status: 'running' });
      }
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episode?.status, episode?.stage, episode?.interpretation, episode?.executionTarget?.confirmed, episodeId]);

  return { steps: INTERPRET_STEPS };
}
