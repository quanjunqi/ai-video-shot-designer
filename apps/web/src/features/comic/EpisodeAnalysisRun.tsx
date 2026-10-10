// EXPORTS: default EpisodeAnalysisRun
// 拆集任务：真实任务事件逐步展示 + 候选确认（4.2：幂等、标题可编辑、单集剧本弹窗、锁定）
import { useState } from 'react';
import { BookOpen, Check, Loader2, Lock, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { useSplitFlow } from '@/hooks/useSplitFlow';
import { useProjectStore } from '@/stores/useProjectStore';
import { useEpisodeStore } from '@/stores/useEpisodeStore';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/utils';
import SplitRulePicker from '@/features/comic/SplitRulePicker';
import EpisodeScriptDialog from '@/features/comic/EpisodeScriptDialog';
import type { Episode } from '@/types';

/** 单个拆集候选卡：标题可编辑 + 单集剧本弹窗（无摘要字段） */
function CandidateCard({
  candidate,
  sourceText,
  onUpdate,
  onDelete,
  onReviseScript,
}: {
  candidate: Episode;
  sourceText: string;
  onUpdate: (id: string, patch: { title?: string; summary?: string; sourceSpan?: { start: number; end: number }; scriptDraft?: string }) => void;
  onDelete?: (id: string) => void;
  onReviseScript?: (id: string, newScript: string) => void;
}) {
  const { start, end } = candidate.sourceSpan;
  const [scriptOpen, setScriptOpen] = useState(false);
  const [deleteAsk, setDeleteAsk] = useState(false);

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="rounded bg-accent px-1.5 py-0.5 font-mono text-[10px] font-semibold text-accent-foreground">
          EP{String(candidate.index).padStart(2, '0')}
        </span>
        <span className="font-mono text-[9px] text-muted-foreground">
          原文 {start}–{end} · {end - start} 字符
        </span>
        {onDelete && (
          <button
            type="button"
            title="删除此候选集（从源剧本移除，后续候选自动前移）"
            onClick={() => setDeleteAsk(true)}
            className="ml-auto flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
      <Input
        value={candidate.title}
        className="h-8 text-xs"
        placeholder="剧集标题"
        onChange={(e) => onUpdate(candidate.id, { title: e.target.value })}
      />
      <button
        type="button"
        onClick={() => setScriptOpen(true)}
        className="mt-2 flex w-full items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-[10px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <BookOpen className="h-3.5 w-3.5" />
        查看 / 编辑本集剧本（{start}–{end}，共 {end - start} 字符）
      </button>
      {/* scriptDraft 已废弃：单集剧本修改直接同步源版本，不留草稿 */}
      <EpisodeScriptDialog
        key={`${candidate.id}-${scriptOpen}`}
        episode={candidate}
        sourceText={sourceText}
        open={scriptOpen}
        onOpenChange={setScriptOpen}
        onSave={(newScript) => {
          onReviseScript?.(candidate.id, newScript);
          setScriptOpen(false);
        }}
      />
      {/* 删除候选确认 */}
      <AlertDialog open={deleteAsk} onOpenChange={setDeleteAsk}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除第 {candidate.index} 集「{candidate.title}」？</AlertDialogTitle>
            <AlertDialogDescription>
              本集内容将从源剧本移除（自动生成新版本留档），后续候选集序号自动前移。此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDelete?.(candidate.id);
                setDeleteAsk(false);
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

export default function EpisodeAnalysisRun({ projectId, onAddEpisode }: { projectId: string; onAddEpisode?: () => void }) {
  const [resplitAsk, setResplitAsk] = useState(false);
  const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId));
  const updateProject = useProjectStore((s) => s.updateProject);
  const candidates = useEpisodeStore(useShallow((s) => s.episodes.filter((e) => e.projectId === projectId)));
  const updateCandidate = useEpisodeStore((s) => s.updateCandidate);
  const deleteEpisode = useEpisodeStore((s) => s.deleteEpisode);
  const reviseEpisodeScript = useEpisodeStore((s) => s.reviseEpisodeScript);
  const { steps, step } = useSplitFlow(projectId);

  if (!project || !project.split) return null;

  const sourceLength = project.sourceVersions[project.currentSourceVersion - 1]?.text.length ?? 0;
  const sourceText = project.sourceVersions[project.currentSourceVersion - 1]?.text ?? '';
  const validation = (() => {
    if (candidates.length === 0) return '没有可确认的剧集候选';
    const ordered = [...candidates].sort((a, b) => a.index - b.index);
    if (ordered.some((c, i) => c.index !== i + 1)) return '集号必须从 1 开始连续排列';
    if (ordered.some((c) => !c.title.trim())) return '每个剧集都需要标题';
    if (ordered[0].sourceSpan.start !== 0) return '第一集必须从原文第 0 位开始';
    if (ordered[ordered.length - 1].sourceSpan.end !== sourceLength) return '最后一集必须覆盖到原文末尾';
    for (let i = 0; i < ordered.length; i += 1) {
      const span = ordered[i].sourceSpan;
      if (span.start < 0 || span.end <= span.start || span.end > sourceLength) return `第 ${i + 1} 集原文范围无效`;
      // 相邻集之间允许不超过 2 字符的空白分隔符（\n\n），插入剧集时前缀分隔符不计入任何集 span
      if (i > 0 && span.start < ordered[i - 1].sourceSpan.end) return `第 ${i + 1} 集与上一集重叠`;
      if (i > 0 && span.start - ordered[i - 1].sourceSpan.end > 2) return `第 ${i + 1} 集与上一集之间存在过大缺口`;
    }
    return null;
  })();

  const isRunning = project.status === 'parsing' || project.status === 'pending_parse';
  const isConfirm = project.status === 'awaiting_confirm';
  const failed = Boolean(project.split.error);

  const handleLock = () => {
    if (validation) {
      toast.error(validation);
      return;
    }
    const ids = useEpisodeStore.getState().confirmSplit(projectId);
    updateProject(projectId, {
      status: 'in_production',
      episodeIds: ids,
      split: { ...project.split!, locked: true },
    });
    toast.success(`分集已锁定，共 ${ids.length} 集`);
  };

  const handleRetry = () => {
    updateProject(projectId, { split: project.split ? { ...project.split, error: undefined, step: 0 } : null, status: 'parsing' });
  };

  const doResplit = () => {
    // 丢弃当前候选（标题/摘要/边界编辑）并按生效规则重新拆分；源版本与已锁定集不受影响
    setResplitAsk(false);
    updateProject(projectId, {
      split: project.split ? { ...project.split, error: undefined, step: 0, locked: false } : null,
      status: 'parsing',
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      {/* 运行中：任务事件逐步勾选 */}
      {isRunning && (
        <div className="mx-auto max-w-md py-4">
          <div className="mb-4 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-sm font-medium">正在解析剧本并拆分剧集</span>
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">{step}/{steps.length}</span>
          </div>
          <div className="space-y-2">
            {steps.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg border px-3 py-2 text-xs',
                  i < step ? 'border-success/30 bg-success/5' : i === step ? 'border-primary/40 bg-accent/40' : 'border-border text-muted-foreground',
                )}
              >
                {i < step ? (
                  <motion.span initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="flex h-4 w-4 items-center justify-center rounded-full bg-success text-success-foreground">
                    <Check className="h-3 w-3" />
                  </motion.span>
                ) : i === step ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <span className="h-4 w-4 rounded-full border border-border" />
                )}
                <span className={cn(i < step && 'text-success')}>{s.label}</span>
              </motion.div>
            ))}
          </div>
          {failed && (
            <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              解析失败：{project.split.error}
              <Button type="button" variant="outline" size="sm" className="ml-2" onClick={handleRetry}>
                <RefreshCw className="h-3.5 w-3.5" />
                重试
              </Button>
            </div>
          )}
        </div>
      )}

      {/* 候选确认：可编辑边界/标题，锁定后生成稳定剧集 ID */}
      {isConfirm && (
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Lock className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">分集候选待核对（{candidates.length} 集）</span>
            <SplitRulePicker projectId={projectId} compact />
            <span className="ml-auto flex items-center gap-2">
              {onAddEpisode && (
                <Button type="button" size="sm" variant="outline" onClick={onAddEpisode} title="在候选中插入一集（内容并入源剧本，后续候选自动顺延）">
                  <Plus className="h-3.5 w-3.5" />
                  新增剧集
                </Button>
              )}
              {resplitAsk ? (
                <>
                  <span className="text-[11px] text-amber-600 dark:text-amber-400">将丢弃候选编辑并按当前规则重拆</span>
                  <Button type="button" size="sm" onClick={doResplit}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    确认重拆
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setResplitAsk(false)}>
                    取消
                  </Button>
                </>
              ) : (
                <Button type="button" size="sm" variant="outline" onClick={() => setResplitAsk(true)}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  重新拆分
                </Button>
              )}
            </span>
          </div>
          <div className="grid max-h-80 grid-cols-1 gap-2 overflow-y-auto md:grid-cols-2">
            {candidates.map((c) => (
              <CandidateCard
                key={c.id}
                candidate={c}
                sourceText={sourceText}
                onUpdate={updateCandidate}
                onDelete={(id) => {
                  deleteEpisode(id);
                  toast.success('已删除候选集，后续剧集已自动前移');
                }}
                onReviseScript={(id, newScript) => {
                  reviseEpisodeScript(id, newScript);
                  toast.success('已保存本集剧本并同步到源剧本（新版本留档）');
                }}
              />
            ))}
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <span className={cn('text-[11px]', validation ? 'text-destructive' : 'text-muted-foreground')}>
              {validation ?? '确认后原文覆盖完整、顺序不变'}
            </span>
            <Button type="button" size="sm" disabled={Boolean(validation)} onClick={handleLock}>
              <Lock className="h-3.5 w-3.5" />
              确认并锁定分集
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
