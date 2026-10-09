// EXPORTS: default RecentProjects
// 最近项目（进度按真实产物投影：done/总集数 + 待审核 + 下一步）
import { Link } from 'react-router-dom';
import { ArrowRight, FolderOpen, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import EmptyState from '@/components/common/EmptyState';
import DemoBadge from '@/components/common/DemoBadge';
import { useProjectStore } from '@/stores/useProjectStore';
import { useShallow } from 'zustand/react/shallow';
import { placeholderUrl } from '@/lib/placeholder';
import { STATUS_META, nextStep } from '@/lib/projectMeta';

export default function RecentProjects({ onNew }: { onNew: () => void }) {
  const projects = useProjectStore(
    useShallow((s) => [...s.projects].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6)),
  );

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={FolderOpen}
        title="还没有项目"
        description="从剧本开始创建你的第一部漫剧"
        actionLabel="新建剧本项目"
        onAction={onNew}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">最近项目</h2>
        <DemoBadge />
        <Link to="/comic/projects" className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          全部项目
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {projects.map((p) => {
          const meta = STATUS_META[p.status];
          return (
            <Link
              key={p.id}
              to={`/comic/projects/${p.id}`}
              className="group overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md"
            >
              <div className="relative aspect-[16/10] overflow-hidden bg-muted">
                <img
                  src={placeholderUrl(`proj-${p.id}`)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <Badge variant={meta.tone} className="!absolute right-2 top-2 z-20 bg-background/80 text-foreground backdrop-blur">
                  {meta.label}
                </Badge>
              </div>
              <div className="p-3">
                <div className="truncate text-sm font-medium">{p.title}</div>
                <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                  <span>{p.episodeIds.length} 集</span>
                  {p.progress.pendingReview > 0 && <span className="text-amber-600">待确认 {p.progress.pendingReview}</span>}
                  {p.progress.blocked > 0 && <span className="text-destructive">阻塞 {p.progress.blocked}</span>}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Progress
                    value={p.progress.totalEpisodes === 0 ? 0 : Math.round((p.progress.doneEpisodes / p.progress.totalEpisodes) * 100)}
                    className="h-1.5 flex-1"
                  />
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {p.progress.doneEpisodes}/{p.progress.totalEpisodes} 集
                  </span>
                </div>
                <div className="mt-2 truncate text-[11px] text-muted-foreground">{nextStep(p)}</div>
              </div>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onNew}
          className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
          <Plus className="h-5 w-5" />
          新建剧本项目
        </button>
      </div>
    </div>
  );
}
