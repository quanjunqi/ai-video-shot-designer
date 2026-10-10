// EXPORTS: default ComicProjectsPage
// 漫剧导演工坊 · 项目列表（筛选 / 搜索 / 排序 / 网格-列表 / 单选-多选-全选删除）
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckSquare, Search, Square, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import ResourceList from '@/components/common/ResourceList';
import NewProjectDialog from '@/features/comic/NewProjectDialog';
import { STATUS_META, nextStep } from '@/lib/projectMeta';
import { useProjectStore } from '@/stores/useProjectStore';
import { placeholderUrl } from '@/lib/placeholder';
import type { ProjectStatus } from '@/types';
import { api } from '@/lib/api/client';
import { toast } from 'sonner';

const STATUS_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '全部状态', value: 'all' },
  { label: '待解析', value: 'pending_parse' },
  { label: '拆集中', value: 'parsing' },
  { label: '待核对分集', value: 'awaiting_confirm' },
  { label: '制作中', value: 'in_production' },
  { label: '待审核', value: 'review' },
  { label: '归档', value: 'archived' },
];

const SORT_OPTIONS = [
  { label: '最近编辑', value: 'edited' },
  { label: '完成进度', value: 'progress' },
];

export default function ComicProjectsPage() {
  const navigate = useNavigate();
  const projects = useProjectStore((s) => s.projects);
  const dataSource = useProjectStore((s) => s.dataSource);
  const setServerProjects = useProjectStore((s) => s.setServerProjects);
  const markOfflineFallback = useProjectStore((s) => s.markOfflineFallback);
  const removeProject = useProjectStore((s) => s.removeProject);
  const [statusFilter, setStatusFilter] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [sort, setSort] = useState('edited');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [dialogOpen, setDialogOpen] = useState(false);
  // 多选删除：选中集合 + 删除确认
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [singleDeleteId, setSingleDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    api.listProjects()
      .then((result) => { if (active) setServerProjects(result.items); })
      .catch(() => { if (active) markOfflineFallback(); });
    return () => { active = false; };
  }, [markOfflineFallback, setServerProjects]);

  const items = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const filtered = projects.filter(
      (p) =>
        (statusFilter === 'all' || p.status === (statusFilter as ProjectStatus)) &&
        (kw === '' || p.title.toLowerCase().includes(kw)),
    );
    return [...filtered].sort((a, b) =>
      sort === 'progress'
        ? b.progress.doneEpisodes / Math.max(b.progress.totalEpisodes, 1) - a.progress.doneEpisodes / Math.max(a.progress.totalEpisodes, 1)
        : b.updatedAt - a.updatedAt,
    );
  }, [projects, statusFilter, keyword, sort]);

  const visibleIds = items.map((p) => p.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const selectedCount = selected.size;

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const doDelete = async (ids: string[]) => {
    if (ids.length === 0) return;
    setDeleting(true);
    try {
      // 逐个调用后端删除；任一失败即中断并提示（保持前后端一致，避免部分删除静默）
      for (const id of ids) {
        await api.deleteProject(id);
      }
      ids.forEach((id) => removeProject(id));
      setSelected((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      toast.success(ids.length === 1 ? '项目已删除' : `已删除 ${ids.length} 个项目`);
    } catch {
      toast.error('删除失败，请检查服务状态后重试');
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
      setSingleDeleteId(null);
    }
  };

  // 勾选控件（点击不触发卡片导航）
  const CheckboxCell = ({ id }: { id: string }) => (
    <span
      role="checkbox"
      aria-checked={selected.has(id)}
      tabIndex={0}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSelect(id); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleSelect(id); } }}
      className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded border border-border text-primary transition-colors hover:border-primary/60"
    >
      {selected.has(id) ? <CheckSquare className="h-4 w-4" /> : <Square className="h-3.5 w-3.5 text-muted-foreground/70" />}
    </span>
  );

  const SingleDeleteButton = ({ id }: { id: string }) => (
    <span
      role="button"
      tabIndex={0}
      title="删除该项目"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSingleDeleteId(id); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setSingleDeleteId(id); } }}
      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </span>
  );

  return (
    <>
      <ResourceList
        title="漫剧导演工坊"
        count={projects.length}
        view={view}
        onViewChange={setView}
        sortOptions={SORT_OPTIONS}
        sortValue={sort}
        onSortChange={(v) => setSort(v)}
        filters={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="搜索项目…"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="h-9 w-44 pl-8"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as string)}>
              <SelectTrigger className="h-9 w-36">
                <SelectValue placeholder="全部状态" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
        headerExtra={
          selectedCount > 0 ? (
            <span className="flex items-center gap-2">
              <Badge variant="secondary" className="font-mono text-xs">
                已选 {selectedCount}
              </Badge>
              <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs" onClick={toggleSelectAll}>
                <CheckSquare className="h-3.5 w-3.5" />
                {allSelected ? '取消全选' : '全选'}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="gap-1.5 text-xs"
                disabled={deleting}
                onClick={() => setConfirmOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除所选
              </Button>
            </span>
          ) : (
            <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground" onClick={toggleSelectAll}>
              {allSelected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
              {allSelected ? '取消全选' : '全选'}
            </Button>
          )
        }
        items={items}
        onCreate={() => setDialogOpen(true)}
        createLabel="新建剧本项目"
        emptyTitle="还没有项目"
        emptyDescription="点击右上角按钮，从剧本开始创建你的第一部漫剧"
        renderCard={(p) => {
          const meta = STATUS_META[p.status];
          const isSelected = selected.has(p.id);
          return (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/comic/projects/${p.id}`)}
              onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/comic/projects/${p.id}`); }}
              className={`group relative cursor-pointer overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md ${isSelected ? 'border-primary/60 ring-1 ring-primary/30' : 'border-border'}`}
            >
              <div className="absolute left-2 top-2 z-20">
                <CheckboxCell id={p.id} />
              </div>
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
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1 truncate text-sm font-medium">{p.title}</div>
                  <SingleDeleteButton id={p.id} />
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                  {p.episodeIds.length} 集 · 更新于 {format(p.updatedAt, 'MM-dd HH:mm')}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Progress
                    value={p.progress.totalEpisodes === 0 ? 0 : Math.round((p.progress.doneEpisodes / p.progress.totalEpisodes) * 100)}
                    className="h-1.5 flex-1"
                  />
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {p.progress.doneEpisodes}/{p.progress.totalEpisodes}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-[11px]">
                  {p.progress.pendingReview > 0 && <span className="text-amber-600">待确认 {p.progress.pendingReview}</span>}
                  <span className="truncate text-muted-foreground">{nextStep(p)}</span>
                </div>
              </div>
            </div>
          );
        }}
        renderRow={(p) => {
          const meta = STATUS_META[p.status];
          const isSelected = selected.has(p.id);
          return (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/comic/projects/${p.id}`)}
              onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/comic/projects/${p.id}`); }}
              className={`group flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50 ${isSelected ? 'bg-primary/5' : ''}`}
            >
              <CheckboxCell id={p.id} />
              <img
                src={placeholderUrl(`proj-${p.id}`)}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-12 w-16 shrink-0 rounded-md object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{p.title}</div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  {p.episodeIds.length} 集 · {format(p.updatedAt, 'MM-dd HH:mm')}
                </div>
              </div>
              <div className="hidden w-44 shrink-0 items-center gap-2 md:flex">
                <Progress
                  value={p.progress.totalEpisodes === 0 ? 0 : Math.round((p.progress.doneEpisodes / p.progress.totalEpisodes) * 100)}
                  className="h-1.5 flex-1"
                />
                <span className="font-mono text-[10px] text-muted-foreground">
                  {p.progress.doneEpisodes}/{p.progress.totalEpisodes}
                </span>
              </div>
              {p.progress.pendingReview > 0 && <span className="hidden shrink-0 text-[11px] text-amber-600 md:inline">待确认 {p.progress.pendingReview}</span>}
              <Badge variant={meta.tone} className="shrink-0">
                {meta.label}
              </Badge>
              <SingleDeleteButton id={p.id} />
            </div>
          );
        }}
      />
      <div className="fixed bottom-3 right-4 z-30 rounded-md border border-border bg-background/90 px-2.5 py-1 text-[10px] text-muted-foreground shadow-sm backdrop-blur">
        数据来源：{dataSource === 'server' ? '服务端' : dataSource === 'offline-fallback' ? '离线演示回退' : '演示数据连接中'}
      </div>
      <NewProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      {/* 批量删除确认 */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除 {selectedCount} 个项目？</AlertDialogTitle>
            <AlertDialogDescription>
              将同时删除这些项目的全部剧集、解读产物与资产，且不可恢复。
              <span className="mt-2 block font-mono text-[11px] text-muted-foreground">
                {selectedCount <= 3
                  ? items.filter((p) => selected.has(p.id)).map((p) => p.title).join('、')
                  : `${items.filter((p) => selected.has(p.id)).slice(0, 3).map((p) => p.title).join('、')} 等 ${selectedCount} 个`}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => { e.preventDefault(); doDelete(Array.from(selected)); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? '删除中…' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 单选删除确认 */}
      <AlertDialog open={singleDeleteId !== null} onOpenChange={(open) => { if (!open && !deleting) setSingleDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除这个项目？</AlertDialogTitle>
            <AlertDialogDescription>
              {singleDeleteId ? projects.find((p) => p.id === singleDeleteId)?.title : ''}
              <span className="mt-2 block text-muted-foreground">将同时删除其全部剧集、解读产物与资产，且不可恢复。</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => { e.preventDefault(); if (singleDeleteId) doDelete([singleDeleteId]); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? '删除中…' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
