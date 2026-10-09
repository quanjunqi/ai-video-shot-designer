// EXPORTS: default ProjectProgress
// 整体进度（6.2：按已通过 Gate 的集数与待审核数投影，不凭访问次数增长）
import { AlertTriangle, CheckCircle2, Hourglass } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { useProjectStore } from '@/stores/useProjectStore';

export default function ProjectProgress({ projectId }: { projectId: string }) {
  const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId));
  if (!project) return null;
  const { doneEpisodes, totalEpisodes, pendingReview, blocked } = project.progress;
  const pct = totalEpisodes === 0 ? 0 : Math.round((doneEpisodes / totalEpisodes) * 100);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <Progress value={pct} className="h-2 flex-1" />
        <span className="font-mono text-xs font-semibold">
          {doneEpisodes}/{totalEpisodes} 集已完成
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
          已完成 {doneEpisodes} 集
        </span>
        <span className="flex items-center gap-1">
          <Hourglass className="h-3.5 w-3.5 text-amber-600" />
          待确认 {pendingReview} 项
        </span>
        {blocked > 0 && (
          <span className="flex items-center gap-1 text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />
            阻塞 {blocked} 项
          </span>
        )}
      </div>
    </div>
  );
}
