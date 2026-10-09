// EXPORTS: default ProductionStage
// 视频生产（5.5）：逐单元生成 → Take 候选（用户评审，系统不判断质量）
// 评审上下文：剧本引用 / 方案要求 / 连续性 in/out / 上一单元尾帧；全部采纳后制片总检 → 完成本集
// 可恢复 Job 语义：拍摄只登记 video job，推进由全局 useJobResumer + tickAll 驱动；完成回调注册在模块顶层。
import { useEffect, useState } from 'react';
import { Clapperboard, Loader2, Check, X, PartyPopper, ClipboardCheck, FileText, GitBranch, ShieldCheck, Target } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useEpisodeStore } from '@/stores/useEpisodeStore';
import { useTaskStore } from '@/stores/useTaskStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useAssetStore } from '@/stores/useAssetStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useRuleTemplateStore } from '@/stores/useRuleTemplateStore';
import { usePromptRuleStore } from '@/stores/usePromptRuleStore';
import { maxUnitSecondsForModel } from '@/config/models/model-catalog';
import { TRANSITION_MODES, resolveTransitionDefault, type TransitionMode } from '@/config/rules/transition-policy';
import { resolveCapacitySeconds } from '@/lib/ruleResolver';
import { buildCoverageRemap } from '@/mocks/assets';
import { buildDirecting, buildExecutableUnits } from '@/mocks/directing';
import { cn } from '@/lib/utils';
import StageModelPicker from '@/features/comic/StageModelPicker';
import { buildShots } from '@/mocks/shots';
import { placeholderUrl } from '@/lib/placeholder';
import { registerJobHandler } from '@/lib/jobRegistry';
import type { Episode, ExecutionTarget, Shot } from '@/types';

const TAKE_LABEL: Record<Shot['takeStatus'], string> = {
  none: '未生成',
  running: '拍摄中',
  candidate: 'Take 候选',
  accepted: '已采纳',
  rejected: '已退回',
};

// 视频生成完成回调：将对应 Unit 置为 Take 候选（用户评审）
registerJobHandler('video', (job) => {
  if (!job.episodeId || !job.shotId) return;
  const fresh = useEpisodeStore.getState().getEpisode(job.episodeId)?.production;
  if (!fresh) return;
  useEpisodeStore.getState().updateEpisode(job.episodeId, {
    production: fresh.map((s) =>
      s.id === job.shotId
        ? { ...s, takeStatus: 'candidate', takeImageUrl: placeholderUrl(`take-${job.shotId}-${Date.now()}`) }
        : s,
    ),
  });
});

export default function ProductionStage({ episode, projectId }: { episode: Episode; projectId: string }) {
  const updateEpisode = useEpisodeStore((s) => s.updateEpisode);
  const enqueue = useTaskStore((s) => s.enqueue);
  const updateJob = useTaskStore((s) => s.updateJob);
  const staleCount = useAssetStore((s) => s.assets.filter((a) => a.episodeId === episode.id && a.stale).length);

  // 首次进入从已确认的执行单元初始化生产清单
  useEffect(() => {
    if (!episode.production) {
      updateEpisode(episode.id, { production: buildShots(episode) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episode.id]);

  const shots = episode.production ?? [];
  const allAccepted = shots.length > 0 && shots.every((s) => s.takeStatus === 'accepted');
  const acceptedBefore = shots.filter((s) => s.takeStatus === 'accepted');

  // 演示模式只验证本地状态；真实视频尾帧、剧本覆盖与哈希需服务端验收。
  const checks = [
    { label: `执行单元：${shots.length}/${episode.executableUnits?.length ?? 0} 个已列入生产清单`, ok: shots.length > 0 && shots.length === episode.executableUnits?.length && shots.every((shot, index) => shot.id === episode.executableUnits?.[index]?.id) },
    { label: `Take 采纳：${acceptedBefore.length}/${shots.length} 个已由用户确认`, ok: allAccepted },
    { label: '单元目标 Prompt 均已确认', ok: Boolean(episode.executableUnits?.every((u) => u.prompt.status === 'USER_APPROVED')) },
    { label: `无 STALE 资产（当前 ${staleCount} 项）`, ok: staleCount === 0 },
  ];
  const allChecksOk = checks.every((c) => c.ok);

  const runShot = (shot: Shot) => {
    if (!episode.executionTarget?.confirmed) {
      toast.error('请先确认执行目标（视频模型 + 衔接 + 单元时长），再开始拍摄');
      return;
    }
    const current = useEpisodeStore.getState().getEpisode(episode.id)?.production ?? shots;
    if (shot.takeStatus === 'running' || current.some((s) => s.index < shot.index && s.takeStatus !== 'accepted') ||
      useTaskStore.getState().jobs.some((j) => j.shotId === shot.id && ['queued', 'running'].includes(j.status))) return;
    const jobId = enqueue({
      kind: 'video',
      label: `拍摄单元 ${shot.index}（${shot.shotType}）`,
      projectId,
      episodeId: episode.id,
      shotId: shot.id,
      costEstimate: '¥0.18',
      contextPath: `/comic/projects/${projectId}/episodes/${episode.id}/production`,
    });
    updateJob(jobId, { status: 'running', progress: 0 });
    updateEpisode(episode.id, {
      production: shots.map((s) => (s.id === shot.id ? { ...s, takeStatus: 'running' } : s)),
    });
  };

  const decide = (shotId: string, accept: boolean) => {
    const base = useEpisodeStore.getState().getEpisode(episode.id)?.production ?? shots;
    updateEpisode(episode.id, {
      production: base.map((s) => (s.id === shotId ? { ...s, takeStatus: accept ? 'accepted' : 'rejected' } : s)),
    });
    toast[accept ? 'success' : 'info'](accept ? `已采纳 Take ${shotId}` : '已退回，可重新拍摄');
  };

  const finish = () => {
    if (!allChecksOk) return;
    updateEpisode(episode.id, { stage: 'done', status: 'done' });
    useProjectStore.getState().recomputeProgress(projectId);
    toast.success('本集已完成，项目进度已更新');
  };

  // 执行目标锁定（视频生产阶段）：生效视频模型 + 衔接模式 → 写入 executionTarget 并按容量重映射
  const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId));
  const catalogModels = useSettingsStore((s) => s.models);
  const videoModelId = (() => {
    const slot = episode.stageModels?.production as { video?: string } | undefined;
    if (slot?.video) return slot.video;
    return project?.defaultVideoModel ?? catalogModels.find((m) => m.type === 'video' && m.status === 'enabled')?.name ?? '';
  })();
  const videoModelName =
    catalogModels.find((m) => m.id === videoModelId)?.name ??
    catalogModels.find((m) => m.name === videoModelId)?.name ??
    videoModelId;

  // 提示词契约：根据视频模型自动匹配（MiniMax H3 / Seedance 2.5 / 平台默认）
  const promptRules = usePromptRuleStore((s) => s.templates);
  const promptContract = (() => {
    const name = videoModelName.toLowerCase();
    if (name.includes('minimax') || name.includes('h3')) {
      return promptRules.find((r) => r.id === 'pr-rule-minimax-h3' && r.enabled);
    }
    if (name.includes('seedance')) {
      return promptRules.find((r) => r.id === 'pr-rule-seedance-25-direct' && r.enabled);
    }
    return promptRules.find((r) => r.id === 'pr-rule-unit-prompt' && r.enabled);
  })();
  const [transitionMode, setTransitionMode] = useState<TransitionMode>(() =>
    episode.executionTarget?.transitionMode ?? resolveTransitionDefault(project?.defaultTransitionMode),
  );

  const lockTarget = () => {
    if (!videoModelName) {
      toast.error('未找到可用的视频生成模型，请先在模型配置启用视频模型');
      return;
    }
    const target: ExecutionTarget = {
      model: videoModelName,
      maxUnitSeconds: maxUnitSecondsForModel(videoModelName),
      deliveryMethod: 'model',
      transitionMode,
      confirmed: true,
    };
    const remap = buildCoverageRemap(
      episode,
      target,
      { maxUnitSeconds: resolveCapacitySeconds(project ?? { ruleOverrides: undefined }, useRuleTemplateStore.getState().templates) },
    );
    const interp = episode.interpretation;
    // 换模型/容量：重新拆镜（镜头卡数随模型容量：15s→12 镜、30s→8 镜；创作层基调保留，导演可再编辑）
    const nextDirecting = buildDirecting(episode, target);
    updateEpisode(episode.id, {
      executionTarget: target,
      interpretation: interp ? { ...interp, coverage: remap.coverage, capacityNote: remap.capacityNote } : undefined,
      executableUnits: buildExecutableUnits(episode, target),
      directing: nextDirecting,
      production: buildShots({ ...episode, executableUnits: buildExecutableUnits(episode, target) }),
    });
    toast.success(`执行目标已锁定：${videoModelName}（单元上限 ${target.maxUnitSeconds}s）`);
    toast.info('已按新容量重映射单元与镜头数；创作层（基调/场次/剪辑）保留，容量相关项待复核');
  };

  const resetTarget = () => {
    updateEpisode(episode.id, { executionTarget: undefined });
    setTransitionMode(resolveTransitionDefault(project?.defaultTransitionMode));
    toast.info('执行目标已重置，请重新确认');
  };

  return (
    <div className="space-y-3">
      {/* 执行目标（视频生产阶段锁定：视频模型 + 衔接模式 + 容量确认；确认后单元/镜头按容量重映射） */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-xs font-medium">
          <Target className="h-3.5 w-3.5 text-primary" />
          执行目标
          <Badge variant="outline" className="ml-auto font-mono text-[9px]">
            {episode.executionTarget?.confirmed ? episode.executionTarget.model : '待确认'}
          </Badge>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <StageModelPicker
            stage="production"
            type="video"
            label="成片视频模型"
            episodeId={episode.id}
            hint="决定单元时长上限，可随时更换并重新确认"
          />
        </div>
        <div className="mt-3">
          <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">视频衔接（生成单元参考图组合方式）</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {TRANSITION_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setTransitionMode(m.id)}
                className={cn(
                  'rounded-lg border p-2.5 text-left transition-colors',
                  transitionMode === m.id ? 'border-primary/50 bg-accent/40' : 'border-border hover:border-primary/30',
                )}
              >
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <span
                    className={cn(
                      'h-3 w-3 rounded-full border',
                      transitionMode === m.id ? 'border-primary bg-primary' : 'border-border',
                    )}
                  />
                  {m.label}
                </div>
                <div className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{m.desc}</div>
              </button>
            ))}
          </div>
        </div>
        {episode.executionTarget?.confirmed && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            已锁定：{episode.executionTarget.model} · 单元上限 {episode.executionTarget.maxUnitSeconds}s · 衔接{' '}
            {TRANSITION_MODES.find((m) => m.id === episode.executionTarget?.transitionMode)?.label ?? '—'}
          </p>
        )}

        {/* 提示词契约（根据模型自动匹配） */}
        <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] font-medium text-primary">提示词契约</span>
            <Badge variant="secondary" className="ml-auto font-mono text-[9px]">
              {promptContract?.name ?? '平台默认'}
            </Badge>
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
            {promptContract?.desc ?? '根据选择的视频模型自动匹配对应的提示词结构与输出规范'}
          </p>
          {promptContract && (
            <div className="mt-2 max-h-24 overflow-y-auto rounded bg-muted/40 p-2">
              <pre className="whitespace-pre-wrap font-mono text-[9px] leading-relaxed text-muted-foreground">
                {promptContract.content.slice(0, 300)}
                {promptContract.content.length > 300 ? '...' : ''}
              </pre>
            </div>
          )}
          <p className="mt-1.5 text-[9px] text-muted-foreground">
            完整规则请前往 <span className="text-primary">规则中心 → 环节提示词规则 → 视频提示词</span> 查看
          </p>
        </div>

        <div className="mt-3 flex items-center justify-end gap-2">
          <Button type="button" size="sm" variant="outline" onClick={resetTarget}>
            重置
          </Button>
          <Button type="button" size="sm" onClick={lockTarget}>
            <Target className="h-3.5 w-3.5" />
            {episode.executionTarget?.confirmed ? '重新确认执行目标' : '确认执行目标'}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Clapperboard className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">视频生产</span>
        <span className="text-[11px] text-muted-foreground">
          按已确认的 Unit 逐个拍摄，Take 候选由用户评审。演示模式不生成真实视频。
        </span>
      </div>

      <div className="space-y-3">
        {shots.map((shot) => {
          const meta = TAKE_LABEL[shot.takeStatus];
          const prevAccepted = acceptedBefore.find((s) => s.index === shot.index - 1);
          const waitingForPrevious = shots.some((s) => s.index < shot.index && s.takeStatus !== 'accepted');
          return (
            <div key={shot.id} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row">
              <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                {shot.takeImageUrl ? (
                  <img src={shot.takeImageUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
                    {shot.takeStatus === 'running' ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : 'Take 预览'}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[9px]">Unit {shot.index}</Badge>
                  <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground">
                    {shot.shotType}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{shot.sceneLabel}</span>
                  <Badge
                    variant={
                      shot.takeStatus === 'accepted' ? 'default' : shot.takeStatus === 'candidate' ? 'outline' : 'secondary'
                    }
                    className="ml-auto font-mono text-[9px]"
                  >
                    {meta}
                  </Badge>
                </div>
                <div className="mt-1 text-xs">{shot.content}</div>

                {/* 评审上下文（系统组织材料，判断权在用户） */}
                <div className="mt-2 grid grid-cols-1 gap-1 rounded-lg border border-border bg-muted/30 p-2 md:grid-cols-3">
                  <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
                    <FileText className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                    <span className="min-w-0">
                      <span className="font-medium text-foreground">剧本引用：</span>
                      <span className="break-words">{shot.content.slice(0, 40)}…（演示草稿，非原文引用）</span>
                    </span>
                  </div>
                  <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
                    <GitBranch className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                    <span className="min-w-0">
                      <span className="font-medium text-foreground">连续性：</span>
                      {prevAccepted ? `承接单元 ${prevAccepted.index} 的计划尾态；真实尾帧未校验` : shot.index === 1 ? '首单元：计划首态进入' : '等待上一单元 Take 采纳'}
                    </span>
                  </div>
                  <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
                    <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                    <span className="min-w-0">
                      <span className="font-medium text-foreground">方案：</span>
                      <span className="truncate">{shot.unitPrompt.slice(0, 40)}…</span>
                    </span>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={shot.takeStatus === 'running' || shot.takeStatus === 'accepted' || waitingForPrevious || episode.status === 'done'}
                    onClick={() => runShot(shot)}
                  >
                    {shot.takeStatus === 'running' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {shot.takeStatus === 'running' ? '拍摄中…' : waitingForPrevious ? '等待上一单元' : shot.takeStatus === 'candidate' || shot.takeStatus === 'rejected' ? '重新拍摄' : '拍摄 Unit'}
                  </Button>
                  {shot.takeStatus === 'candidate' && (
                    <>
                      <Button type="button" size="sm" onClick={() => decide(shot.id, true)}>
                        <Check className="h-3.5 w-3.5" />
                        采纳 Take
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => decide(shot.id, false)}>
                        <X className="h-3.5 w-3.5" />
                        退回
                      </Button>
                      <span className="text-[10px] text-muted-foreground">由你评审：表演/情绪/落点/视线/声音，系统不代替判断</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {shots.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-xs text-muted-foreground">暂无执行单元，请返回上一阶段确认单元资产和 Prompt。</div>
        )}
      </div>

      {allAccepted && (
        <div className="rounded-xl border border-success/30 bg-success/5 p-3">
          <div className="flex items-center gap-2">
            <PartyPopper className="h-4 w-4 text-success" />
            <span className="text-xs text-success">全部 Take 已采纳</span>
            <ClipboardCheck className="ml-auto h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-2 rounded-lg border border-border bg-card p-3">
            <div className="mb-1.5 text-xs font-medium">本地状态检查（演示）</div>
            <ul className="space-y-1">
              {checks.map((c) => (
                <li key={c.label} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                  <span className={c.ok ? 'text-success' : 'text-destructive'}>{c.ok ? '✓' : '✗'}</span>
                  {c.label}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[10px] text-muted-foreground">
              未验证真实视频尾帧、原文 EV/DLG 覆盖、资产文件哈希与上传绑定。此处完成仅表示演示工作流结束。
            </p>
          </div>
          <Button type="button" size="sm" className="mt-2" disabled={!allChecksOk} onClick={finish}>
            完成本集
          </Button>
        </div>
      )}
    </div>
  );
}
