// EXPORTS: default EpisodeWorkbenchPage
// 单集导演工坊（5）：固定布局，顶部上下文 / 左侧阶段导航 / 中央决策 / 右侧来源版本依赖
import { Link, Navigate, useParams } from 'react-router-dom';
import { useState } from 'react';
import { ArrowLeft, Lock, ChevronRight, FileText, Database, GitBranch, Hourglass, ScrollText, PartyPopper, Clapperboard } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import EmptyState from '@/components/common/EmptyState';
import ScriptReview from '@/features/comic/ScriptReview';
import InterpretStage from '@/features/comic/InterpretStage';
import CharacterStage from '@/features/comic/CharacterStage';
import PropStage from '@/features/comic/PropStage';
import SceneStage from '@/features/comic/SceneStage';
import BlockingStage from '@/features/comic/BlockingStage';
import UnitsStage from '@/features/comic/UnitsStage';
import ProductionStage from '@/features/comic/ProductionStage';
import { useEpisodeStore } from '@/stores/useEpisodeStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useAssetStore } from '@/stores/useAssetStore';
import { useShallow } from 'zustand/react/shallow';
import type { Episode, EpisodeStage } from '@/types';
import { cn } from '@/lib/utils';
import { belongsToProject, firstIncompleteGate } from '@/lib/workflow';
import { useTaskStore } from '@/stores/useTaskStore';

const STAGE_DEFS: Array<{ key: EpisodeStage; label: string }> = [
  { key: 'analyze', label: '首次解读' },
  { key: 'directing', label: '分镜设计' },
  { key: 'characters', label: '角色资产' },
  { key: 'props', label: '道具资产' },
  { key: 'scenes', label: '场景资产' },
  { key: 'units', label: '单元规划' },
  { key: 'production', label: '视频生产' },
];

const EP_STATUS_LABEL: Record<string, string> = {
  pending: '待解读',
  analyzing: '解读中',
  needs_review: '待确认',
  in_work: '制作中',
  blocked: '阻塞',
  done: '已完成',
};

export default function EpisodeWorkbenchPage() {
  const { projectId = '', episodeId = '', stage = 'analyze' } = useParams();
  const [showScript, setShowScript] = useState(false);
  const episode = useEpisodeStore((s) => s.episodes.find((e) => e.id === episodeId));
  const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId));
  const assets = useAssetStore(useShallow((s) => s.getAssetsByEpisode(episodeId)));
  const auditLog = useAssetStore((s) => s.auditLog);
  const jobs = useTaskStore((s) => s.jobs);
  if (!episode || !project || !belongsToProject(episode, projectId)) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState icon={Clapperboard} title="未找到该剧集" description="项目或剧集可能已被删除" />
      </div>
    );
  }

  const validStage: EpisodeStage = STAGE_DEFS.some((s) => s.key === stage) ? (stage as EpisodeStage) : 'analyze';
  if (stage !== validStage) {
    return <Navigate replace to={`/comic/projects/${projectId}/episodes/${episodeId}/${stage === 'done' ? 'production' : 'analyze'}`} />;
  }
  const chars = assets.filter((a) => a.kind === 'character');
  const props = assets.filter((a) => a.kind === 'prop');
  const scenes = assets.filter((a) => a.kind === 'scene');
  // Gate 代表该类产物全部通过审核；道具是可选资产，没有道具时直接通过。
  const allApproved = (items: typeof assets) => items.length > 0 && items.every((a) =>
    a.status === 'USER_APPROVED' && !a.stale && !jobs.some((job) => job.assetId === a.id && ['queued', 'running'].includes(job.status)),
  );
  const charApproved = allApproved(chars);
  const propApproved = props.length === 0 || allApproved(props);
  const sceneApproved = allApproved(scenes);
  // 导演阶段产物（表演基调/状态变体/调度镜头/单元资产与 Prompt）：存在则须全部批准
  const allItemsApproved = (items: { status: string }[] | undefined) =>
    !items || items.length === 0 || items.every((x) => x.status === 'USER_APPROVED');
  const perfApproved = allItemsApproved(episode.performance);
  const variantApproved = allItemsApproved(episode.sceneVariants);
  const directingApproved =
    Boolean(episode.directing?.length) && episode.directing.every((d) => d.status === 'USER_APPROVED');
  const unitsApproved =
    Boolean(episode.executableUnits?.length) &&
    episode.executableUnits.every(
      (u) =>
        u.assets.length > 0 &&
        u.assets.every((a) => a.status === 'USER_APPROVED') &&
        u.prompt.status === 'USER_APPROVED',
    );

  const gates = STAGE_DEFS.map((s) => ({
    ...s,
    done:
      s.key === 'analyze'
        ? Boolean(episode.interpretation) && Boolean(episode.interpretationConfirmed)
        : s.key === 'characters'
          ? charApproved && perfApproved
          : s.key === 'props'
            ? propApproved
            : s.key === 'scenes'
              ? sceneApproved && variantApproved
              : s.key === 'directing'
                ? directingApproved
                : s.key === 'units'
                  ? unitsApproved
                  : episode.status === 'done',
  }));
  const currentIdx = gates.findIndex((g) => g.key === validStage);
  const prevGate = firstIncompleteGate(gates, currentIdx);
  const blocked = Boolean(prevGate);

  const epAudits = auditLog.filter((l) => assets.some((a) => a.id === l.artifactId));
  const approvedCount = assets.filter((a) => a.status === 'USER_APPROVED').length;
  const pendingCount = assets.filter((a) => a.status === 'AWAITING_USER').length;
  const staleCount = assets.filter((a) => a.stale).length;
  // 导演阶段待确认项（表演基调/状态变体/调度镜头/单元资产与 Prompt）
  const directingPending =
    (episode.performance?.filter((p) => p.status !== 'USER_APPROVED').length ?? 0) +
    (episode.sceneVariants?.filter((v) => v.status !== 'USER_APPROVED').length ?? 0) +
    (episode.directing?.filter((d) => d.status !== 'USER_APPROVED').length ?? 0) +
    (episode.executableUnits?.reduce(
      (n, u) => n + u.assets.filter((a) => a.status !== 'USER_APPROVED').length + (u.prompt.status !== 'USER_APPROVED' ? 1 : 0),
      0,
    ) ?? 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 顶部：项目 > 剧集 > 当前阶段 */}
      <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <ButtonLink to={`/comic/projects/${projectId}`} />
        <Link to={`/comic/projects/${projectId}`} className="max-w-40 truncate text-xs text-muted-foreground hover:text-foreground">
          {project.title}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="truncate text-xs font-medium">
          第 {episode.index} 集 · {episode.title.replace(/^第 \d+ 集：/, '')}
        </span>
        <span className="text-xs text-muted-foreground">/ {STAGE_DEFS.find((s) => s.key === validStage)?.label}</span>
        <Badge variant="outline" className="font-mono text-[9px]">
          {EP_STATUS_LABEL[episode.status]}
        </Badge>
        <span className="ml-auto flex items-center gap-2">
          <Dialog open={showScript} onOpenChange={setShowScript}>
            <DialogTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
                <FileText className="h-3.5 w-3.5" />
                本集剧本
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle className="text-sm">本集剧本 · 第 {episode.index} 集 · {episode.title.replace(/^第 \d+ 集：/, '')}</DialogTitle>
              </DialogHeader>
              <div className="max-h-[70vh] overflow-y-auto">
                <ScriptReview episode={episode} projectId={projectId} readOnly />
              </div>
            </DialogContent>
          </Dialog>
          <span className="flex items-center gap-1 font-mono text-[9px] text-muted-foreground">
            <Database className="h-3 w-3" />
            已保存
          </span>
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* 左侧：阶段导航 */}
        <nav className="flex w-full shrink-0 gap-1 overflow-x-auto border-b border-border p-2 lg:w-48 lg:flex-col lg:space-y-1 lg:overflow-y-auto lg:overflow-x-hidden lg:border-b-0 lg:border-r lg:p-3">
          {gates.map((g, i) => {
            const isActive = g.key === validStage;
            const isBlocked = Boolean(firstIncompleteGate(gates, i));
            return (
              <Link
                key={g.key}
                to={`/comic/projects/${projectId}/episodes/${episodeId}/${g.key}`}
                className={cn(
                  'flex min-w-max items-center gap-2.5 rounded-lg px-3 py-2 text-xs transition-colors lg:w-full',
                  isActive ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
              >
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[9px]',
                    g.done ? 'bg-success text-success-foreground' : isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {g.done ? '✓' : i + 1}
                </span>
                <span className="flex-1">{g.label}</span>
                {isBlocked && <Lock className="h-3 w-3 text-muted-foreground" />}
              </Link>
            );
          })}
        </nav>

        {/* 中央：当前阶段内容 */}
        <main className="min-h-[480px] min-w-0 flex-1 overflow-y-auto p-3 md:p-4">
          {blocked ? (
            <div className="mx-auto max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
              <Lock className="mx-auto h-6 w-6 text-destructive" />
              <div className="mt-2 text-sm font-medium text-destructive">被前置 Gate 阻塞</div>
              <p className="mt-1 text-xs text-muted-foreground">
                「{prevGate?.label}」尚未完成，无法推进「{STAGE_DEFS.find((s) => s.key === validStage)?.label}」。
                <br />
                请先完成前置阶段的资产确认。
              </p>
              <Link to={`/comic/projects/${projectId}/episodes/${episodeId}/${prevGate?.key}`}>
                <Badge variant="outline" className="mt-3 cursor-pointer">前往 {prevGate?.label}</Badge>
              </Link>
            </div>
          ) : (
            <>
              {validStage === 'analyze' && <InterpretStage episode={episode} projectId={projectId} />}
              {validStage === 'characters' && <CharacterStage episode={episode} />}
              {validStage === 'props' && <PropStage episode={episode} />}
              {validStage === 'scenes' && <SceneStage episode={episode} />}
              {validStage === 'directing' && <BlockingStage episode={episode} />}
              {validStage === 'units' && <UnitsStage episode={episode} />}
              {validStage === 'production' && episode.status !== 'done' && <ProductionStage episode={episode} projectId={projectId} />}
              {validStage === 'production' && episode.status === 'done' && (
                <DoneSummary episode={episode} projectId={projectId} />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function ButtonLink({ to }: { to: string }) {
  return (
    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" asChild>
      <Link to={to}>
        <ArrowLeft className="h-3.5 w-3.5" />
      </Link>
    </Button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/60 py-1.5">
      <div className="font-mono text-sm font-semibold">{value}</div>
      <div className="text-[9px] text-muted-foreground">{label}</div>
    </div>
  );
}

function DoneSummary({ episode, projectId }: { episode: Episode; projectId: string }) {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-success/30 bg-success/5 p-6 text-center">
      <PartyPopper className="mx-auto h-7 w-7 text-success" />
      <div className="mt-2 text-sm font-semibold">第 {episode.index} 集已完成</div>
      <p className="mt-1 text-xs text-muted-foreground">演示工作流已结束。真实媒体、覆盖与哈希仍待服务端验收。</p>
      <Link to={`/comic/projects/${projectId}`} className="mt-3 inline-block">
        <Badge variant="outline" className="cursor-pointer">返回剧集列表</Badge>
      </Link>
    </div>
  );
}
