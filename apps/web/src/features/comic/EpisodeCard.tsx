// EXPORTS: default EpisodeCard
// 剧集卡 v2：身份行 + 剧本弹窗/删除 + 7 阶段制作状态轨道 + 元数据行（无摘要字段）
import { useMemo, useState } from 'react';
import { BookOpen, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { Episode, EpisodeStatus } from '@/types';
import { useProjectStore } from '@/stores/useProjectStore';
import { useAssetStore } from '@/stores/useAssetStore';
import { useEpisodeStore } from '@/stores/useEpisodeStore';
import { cn } from '@/lib/utils';
import EpisodeScriptDialog from '@/features/comic/EpisodeScriptDialog';

const STATUS_META: Record<EpisodeStatus, { label: string; dot: string }> = {
  pending: { label: '待解读', dot: 'bg-muted-foreground/40' },
  analyzing: { label: '解读中', dot: 'bg-primary animate-pulse' },
  needs_review: { label: '待确认', dot: 'bg-amber-500' },
  in_work: { label: '制作中', dot: 'bg-primary' },
  blocked: { label: '阻塞', dot: 'bg-destructive' },
  done: { label: '已完成', dot: 'bg-success' },
};

/** 7 阶段轨道：三态（done 已完成 / active 进行中 / pending 未到），每段下带产物计数 */
function useStageTrack(episode: Episode, projectId: string) {
  // 注意：selector 只取稳定数组引用（assets），过滤与派生全部放 useMemo，避免新引用触发无限重渲染
  const allAssets = useAssetStore((s) => s.assets);
  return useMemo(() => {
    const assets = allAssets.filter((a) => a.projectId === projectId);
    const count = (kind: 'character' | 'prop' | 'scene') =>
      assets.filter((a) => a.episodeId === episode.id && a.kind === kind).length;
    const charCount = count('character');
    const propCount = count('prop');
    const sceneCount = count('scene');
    return [
      {
        key: 'analyze',
        label: '解读',
        count: episode.interpretationConfirmed ? '已确认' : episode.interpretation ? '待确认' : '',
        active: episode.stage === 'analyze',
        done: Boolean(episode.interpretationConfirmed),
      },
      {
        key: 'directing',
        label: '分镜',
        count: episode.directing && episode.directing.length > 0 ? `${episode.directing.length} 镜` : '',
        active: episode.stage === 'directing',
        done: Boolean(episode.directing && episode.directing.length > 0),
      },
      {
        key: 'characters',
        label: '角色',
        count: charCount > 0 ? `${charCount} 个` : '',
        active: episode.stage === 'characters',
        done: charCount > 0,
      },
      {
        key: 'props',
        label: '道具',
        count: propCount > 0 ? `${propCount} 个` : '',
        active: episode.stage === 'props',
        done: propCount > 0,
      },
      {
        key: 'scenes',
        label: '场景',
        count: sceneCount > 0 ? `${sceneCount} 个` : '',
        active: episode.stage === 'scenes',
        done: sceneCount > 0,
      },
      {
        key: 'units',
        label: '单元',
        count: episode.executableUnits && episode.executableUnits.length > 0 ? `${episode.executableUnits.length} 个` : '',
        active: episode.stage === 'units',
        done: Boolean(episode.executableUnits && episode.executableUnits.length > 0),
      },
      {
        key: 'production',
        label: '生产',
        count: episode.production && episode.production.length > 0 ? `${episode.production.length} 镜` : '',
        active: episode.stage === 'production',
        done: Boolean(episode.production && episode.production.length > 0),
      },
    ];
  }, [allAssets, projectId, episode]);
}

export default function EpisodeCard({ episode, projectId, locked = true }: { episode: Episode; projectId: string; locked?: boolean }) {
  const meta = STATUS_META[episode.status];
  const to = `/comic/projects/${projectId}/episodes/${episode.id}/analyze`;
  const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId));
  const sourceText = project?.sourceVersions[project.currentSourceVersion - 1]?.text ?? '';
  const deleteEpisode = useEpisodeStore((s) => s.deleteEpisode);
  const reviseEpisodeScript = useEpisodeStore((s) => s.reviseEpisodeScript);
  const track = useStageTrack(episode, projectId);
  const activeKey = track.find((t) => t.active)?.label ?? '';
  const [scriptOpen, setScriptOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        // 卡片内部按钮（剧本/删除）点击一律不触发卡片跳转（防御事件冒泡）
        // 注意：卡片自身有 role="button"，需排除 currentTarget
        const t = e.target as HTMLElement;
        const internal = t.closest('button, a, [role="button"]');
        if (internal && internal !== e.currentTarget) return;
        window.location.href = to;
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') window.location.href = to; }}
      className="group flex cursor-pointer flex-col rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-md"
    >
      {/* L1 身份行 */}
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-accent px-2 py-0.5 font-mono text-[10px] font-semibold text-accent-foreground">
          EP{String(episode.index).padStart(2, '0')}
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
          {meta.label}
        </span>
        {activeKey && <span className="text-[10px] text-muted-foreground">· {activeKey}阶段</span>}
        <button
          type="button"
          title="查看 / 编辑本集剧本"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setScriptOpen(true); }}
          className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
        >
          <BookOpen className="h-3.5 w-3.5" />
        </button>
        {/* 锁定态隐藏删除按钮（结构冻结）；候选态可删除候选 */}
        {!locked && (
          <button
            type="button"
            title="删除本集（从源剧本移除，后续剧集顺延）"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteOpen(true); }}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* L2 标题 */}
      <div className="mt-2 truncate text-sm font-medium">{episode.title.replace(/^第 \d+ 集：/, '')}</div>

      {/* L4 7 阶段制作状态轨道 */}
      <div className="mt-3">
        <div className="flex gap-1">
          {track.map((t) => (
            <div key={t.key} className="flex-1">
              <div
                className={cn(
                  'h-1.5 rounded-full transition-colors',
                  t.done ? 'bg-success' : t.active ? 'bg-primary animate-pulse' : 'bg-muted-foreground/20',
                )}
              />
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex gap-1">
          {track.map((t) => (
            <div key={t.key} className="min-w-0 flex-1 text-center">
              <div
                className={cn(
                  'truncate text-[9px] leading-none',
                  t.done ? 'text-success' : t.active ? 'font-medium text-primary' : 'text-muted-foreground/60',
                )}
              >
                {t.label}
              </div>
              {t.count && <div className="mt-0.5 truncate font-mono text-[9px] text-muted-foreground">{t.count}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* L5 元数据行 */}
      <div className="mt-3 flex items-center gap-3 border-t border-border pt-2 font-mono text-[10px] text-muted-foreground">
        <span>原文 {episode.sourceSpan.start}–{episode.sourceSpan.end}</span>
        <span>{episode.counts.scenes} 场</span>
        <span>{episode.counts.characters} 角色</span>
        {episode.counts.pendingReview > 0 && <span className="text-amber-600">待确认 {episode.counts.pendingReview}</span>}
      </div>
      {episode.blockedBy && (
        <div className="mt-1.5 truncate text-[11px] text-destructive">阻塞：{episode.blockedBy}</div>
      )}

      <EpisodeScriptDialog
        key={`${episode.id}-${scriptOpen}`}
        episode={episode}
        sourceText={sourceText}
        open={scriptOpen}
        onOpenChange={setScriptOpen}
        onSave={(newScript) => {
          reviseEpisodeScript(episode.id, newScript);
          setScriptOpen(false);
        }}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">删除第 {episode.index} 集「{episode.title.replace(/^第 \d+ 集：/, '')}」？</AlertDialogTitle>
            <AlertDialogDescription className="space-y-1 text-xs leading-relaxed">
              <p>删除将执行：</p>
              <ul className="list-disc pl-4">
                <li>本集内容从源剧本移除（自动生成新版本 v+1 留档）</li>
                <li>本集的解读 / 分镜 / 资产产物一并删除</li>
                <li>后续剧集序号自动前移（原第 3 集变为第 2 集）</li>
              </ul>
              <p className="pt-1 text-destructive">此操作不可恢复。</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-xs text-white hover:bg-destructive/90"
              onClick={() => {
                const idx = episode.index;
                deleteEpisode(episode.id);
                setDeleteOpen(false);
                toast.success(`已删除第 ${idx} 集，后续剧集已自动前移（源剧本已生成新版本）`);
              }}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
