// EXPORTS: default ComicProjectDetailPage
// 项目总览：拆集任务 → 候选确认 → 剧集卡 + 项目资产库
import { useEffect, useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Clapperboard, FolderOpen, FilePenLine, Unlock, Users, Package, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import EmptyState from '@/components/common/EmptyState';
import ProjectParams from '@/features/comic/ProjectParams';
import ProjectProgress from '@/features/comic/ProjectProgress';
import EpisodeCard from '@/features/comic/EpisodeCard';
import EpisodeAnalysisRun from '@/features/comic/EpisodeAnalysisRun';
import ProjectCharacterLibrary from '@/features/comic/ProjectCharacterLibrary';
import ProjectPropLibrary from '@/features/comic/ProjectPropLibrary';
import ProjectSceneLibrary from '@/features/comic/ProjectSceneLibrary';
import SourceVersionDialog from '@/features/comic/SourceVersionDialog';
import AddEpisodeDialog from '@/features/comic/AddEpisodeDialog';
import { STATUS_META } from '@/lib/projectMeta';
import { useSplitFlow } from '@/hooks/useSplitFlow';
import { useProjectStore } from '@/stores/useProjectStore';
import { useEpisodeStore } from '@/stores/useEpisodeStore';
import { useProjectCharacterStore } from '@/stores/useProjectCharacterStore';
import { useProjectPropStore } from '@/stores/useProjectPropStore';
import { useProjectSceneStore } from '@/stores/useProjectSceneStore';
import { useShallow } from 'zustand/react/shallow';
import { api } from '@/lib/api/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function ComicProjectDetailPage() {
  const { projectId = '' } = useParams();
  const [reviseOpen, setReviseOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const [activeTab, setActiveTabState] = useState<'episodes' | 'characters' | 'props' | 'scenes'>(
    tabFromUrl === 'characters' || tabFromUrl === 'props' || tabFromUrl === 'scenes' ? tabFromUrl : 'episodes'
  );
  const setActiveTab = (tab: 'episodes' | 'characters' | 'props' | 'scenes') => {
    setActiveTabState(tab);
    setSearchParams({ tab }, { replace: true });
  };
  const unlockSplit = useProjectStore((s) => s.unlockSplit);
  const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId));
  const upsertServerProject = useProjectStore((s) => s.upsertServerProject);
  const addEpisode = useEpisodeStore((s) => s.insertEpisode);
  const episodes = useEpisodeStore(useShallow((s) => s.episodes.filter((e) => e.projectId === projectId)));
  const allProjectCharacters = useProjectCharacterStore(useShallow((s) => s.characters));
  const characterCount = allProjectCharacters.filter((c) => c.projectId === projectId).length;
  const allProjectProps = useProjectPropStore(useShallow((s) => s.props));
  const propCount = allProjectProps.filter((p) => p.projectId === projectId).length;
  const allProjectScenes = useProjectSceneStore(useShallow((s) => s.scenes));
  const sceneCount = allProjectScenes.filter((s) => s.projectId === projectId).length;
  useEffect(() => {
    if (!projectId) return;
    let active = true;
    // 总是与服务端元数据同步；生产状态（split/episodeIds/progress/规则覆盖）以本地为准，
    // status 合并规则见 mergeServerProject（本地 split.locked ⇒ in_production，防刷新回退）
    api.getProject(projectId)
      .then((item) => { if (active) upsertServerProject(item, item.source_text ?? ''); })
      .catch(() => { /* The existing Store state remains usable while the API is unavailable. */ });
    // 从后端加载剧集数据（多浏览器同步）
    useEpisodeStore.getState().loadFromServer(projectId).catch(() => {});
    return () => { active = false; };
  }, [projectId, upsertServerProject]);
  useSplitFlow(projectId);

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState icon={FolderOpen} title="项目不存在" description="该项目可能已被删除" />
      </div>
    );
  }

  const locked = Boolean(project.split?.locked) || ['in_production', 'review', 'archived'].includes(project.status);
  const splitting = ['pending_parse', 'parsing', 'awaiting_confirm'].includes(project.status) && !locked;
  const meta = STATUS_META[project.status];

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-4 px-6 py-6">
      {/* 项目头部 */}
      <div className="flex items-center gap-3">
        <ButtonLink to="/comic/projects" />
        <h1 className="text-lg font-semibold">{project.title}</h1>
        <Badge variant={meta.tone}>{meta.label}</Badge>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          源版本 v{project.currentSourceVersion} · 风格 {project.styleVersion}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          disabled={project.status === 'parsing'}
          onClick={() => setReviseOpen(true)}
          title="修订全文并保存为新版本，旧版本留档；保存后重新拆集候选核对"
        >
          <FilePenLine className="h-3.5 w-3.5" />
          修订原文
        </Button>
      </div>

      {/* Tab 导航 */}
      <div className="flex items-center gap-1 border-b border-border">
        <button
          type="button"
          onClick={() => setActiveTab('episodes')}
          className={cn(
            'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
            activeTab === 'episodes'
              ? 'border-amber-500 text-amber-500'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <Clapperboard className="h-4 w-4" />
          剧集
          <Badge variant="outline" className="ml-1 font-mono text-[10px]">{episodes.length}</Badge>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('characters')}
          className={cn(
            'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
            activeTab === 'characters'
              ? 'border-amber-500 text-amber-500'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <Users className="h-4 w-4" />
          角色库
          <Badge variant="outline" className="ml-1 font-mono text-[10px]">{characterCount}</Badge>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('props')}
          className={cn(
            'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
            activeTab === 'props'
              ? 'border-emerald-500 text-emerald-500'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <Package className="h-4 w-4" />
          道具库
          <Badge variant="outline" className="ml-1 font-mono text-[10px]">{propCount}</Badge>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('scenes')}
          className={cn(
            'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
            activeTab === 'scenes'
              ? 'border-sky-500 text-sky-500'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <MapPin className="h-4 w-4" />
          场景库
          <Badge variant="outline" className="ml-1 font-mono text-[10px]">{sceneCount}</Badge>
        </button>
      </div>

      {/* 两栏：左=功能主体（剧集 / 角色库），右=项目设置 + 项目资产侧栏 */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          {activeTab === 'episodes' ? (
            <>
              {locked && <ProjectProgress projectId={projectId} />}

              {/* 拆集区域 */}
              {splitting ? (
                <EpisodeAnalysisRun projectId={projectId} onAddEpisode={() => setAddOpen(true)} />
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold">剧集卡</h2>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {episodes.length} 集
                    </Badge>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="ml-auto h-7 gap-1 text-[11px]"
                      onClick={() => setUnlockOpen(true)}
                      title="解锁分集结构，回到候选核对态（可重新拆分、插入或删除剧集）；已制作的剧集产物保留"
                    >
                      <Unlock className="h-3 w-3" />
                      解锁分集
                    </Button>
                  </div>
                  {episodes.length === 0 ? (
                    <EmptyState icon={Clapperboard} title="还没有剧集" description="完成拆集后这里会出现剧集卡" />
                  ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {episodes.map((e) => (
                        <EpisodeCard key={e.id} episode={e} projectId={projectId} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : activeTab === 'characters' ? (
            <ProjectCharacterLibrary projectId={projectId} />
          ) : activeTab === 'props' ? (
            <ProjectPropLibrary projectId={projectId} />
          ) : (
            <ProjectSceneLibrary projectId={projectId} />
          )}
        </div>

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-4">
          <ProjectParams projectId={projectId} />
        </aside>
      </div>

      <SourceVersionDialog key={String(reviseOpen)} projectId={projectId} open={reviseOpen} onOpenChange={setReviseOpen} />
      <AddEpisodeDialog
        key={String(addOpen)}
        open={addOpen}
        onOpenChange={setAddOpen}
        sourceText={project?.sourceVersions[project.currentSourceVersion - 1]?.text ?? ''}
        episodeLabels={episodes
          .slice()
          .sort((a, b) => a.index - b.index)
          .map((e) => ({ index: e.index, title: e.title }))}
        defaultTitle={`第 ${episodes.length + 1} 集`}
        onSave={(input) => {
          const id = addEpisode(projectId, input);
          const inserted = useEpisodeStore.getState().getEpisode(id);
          const label = inserted ? `第 ${inserted.index} 集 · ${inserted.title.replace(/^第 \d+ 集：/, '')}` : input.title;
          toast.success(`已插入剧集「${label}」并并入源剧本（新版本 v${project?.currentSourceVersion ?? 1 + 1}），后续剧集已自动顺延`);
        }}
      />

      {/* 解锁分集确认弹窗 */}
      <AlertDialog open={unlockOpen} onOpenChange={setUnlockOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>解锁分集结构？</AlertDialogTitle>
            <AlertDialogDescription>
              解锁后回到候选核对态，可重新拆分、插入或删除剧集。已制作的解读 / 分镜 / 资产产物保留，但剧集边界变更后可能与已有产物不一致，需重新核对。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                unlockSplit(projectId);
                setUnlockOpen(false);
                toast.success('已解锁分集，可重新核对剧集结构');
              }}
            >
              确认解锁
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ButtonLink({ to }: { to: string }) {
  return (
    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild>
      <Link to={to}>
        <ArrowLeft className="h-4 w-4" />
      </Link>
    </Button>
  );
}
