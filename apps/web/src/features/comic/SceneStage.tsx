// EXPORTS: default SceneStage
// 场景资产（5.4）：功能稿 → 母版 → 补充视图 → 场次状态变体 → 空间骨架 scene_map（走位/机位在分镜设计阶段）
import { useState } from 'react';
import { MapPin, Check, X, Loader2, Map, SunMoon, BookOpen, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useAssetStore } from '@/stores/useAssetStore';
import { useEpisodeStore } from '@/stores/useEpisodeStore';
import { useProjectSceneStore } from '@/stores/useProjectSceneStore';
import { useShallow } from 'zustand/react/shallow';
import { useFakeGeneration } from '@/hooks/useFakeGeneration';
import { useSettingsStore } from '@/stores/useSettingsStore';
import StageModelPicker from '@/features/comic/StageModelPicker';
import type { ConfirmedItem, Episode } from '@/types';
import { cn } from '@/lib/utils';

const SCENE_STEPS = ['功能稿', '无人场景母版', '派生补充视图', '场次状态变体', '空间骨架 scene_map'];

function sceneStepState(status: string, index: number) {
  if (status === 'USER_APPROVED') {
    return index < 2 ? 'done' : index === 2 ? 'active' : 'pending';
  }
  if (status === 'AWAITING_USER') {
    return index === 0 ? 'done' : index === 1 ? 'active' : 'pending';
  }
  return index === 0 ? 'active' : 'pending';
}

// 场次状态变体（同一空间的 时间/天气/光线/氛围 差异；由用户逐项评审）
function VariantBlock({ episode }: { episode: Episode }) {
  const updateEpisode = useEpisodeStore((s) => s.updateEpisode);
  const variants: ConfirmedItem[] = episode.sceneVariants ?? [];
  if (variants.length === 0) return null;
  const decide = (id: string, accept: boolean) => {
    updateEpisode(episode.id, {
      sceneVariants: variants.map((v) =>
        v.id === id ? { ...v, status: accept ? ('USER_APPROVED' as const) : ('USER_REJECTED' as const) } : v,
      ),
    });
    toast[accept ? 'success' : 'info'](accept ? `已确认状态变体 ${id}` : '已退回，可调整后重新提交');
  };
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium">
        <SunMoon className="h-3.5 w-3.5 text-primary" />
        场次状态变体
        <span className="text-[10px] font-normal text-muted-foreground">时间 · 天气 · 光线 · 氛围（用户评审）</span>
        <Badge variant="outline" className="ml-auto font-mono text-[9px]">
          {variants.filter((v) => v.status === 'USER_APPROVED').length}/{variants.length} 已确认
        </Badge>
      </div>
      <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
        {variants.map((v) => (
          <div key={v.id} className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">{v.label}</span>
              <span
                className={cn(
                  'ml-auto rounded px-1.5 py-px text-[9px]',
                  v.status === 'USER_APPROVED' && 'bg-success/15 text-success',
                  v.status === 'USER_REJECTED' && 'bg-destructive/10 text-destructive',
                  v.status !== 'USER_APPROVED' && v.status !== 'USER_REJECTED' && 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
                )}
              >
                {v.status === 'USER_APPROVED' ? '已确认' : v.status === 'USER_REJECTED' ? '已退回' : '待确认'}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{v.detail}</p>
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                size="sm"
                className="flex-1"
                disabled={v.status === 'USER_APPROVED'}
                onClick={() => decide(v.id, true)}
              >
                <Check className="h-3.5 w-3.5" />
                确认变体
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => decide(v.id, false)}>
                <X className="h-3.5 w-3.5" />
                退回
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SceneStage({ episode }: { episode: Episode }) {
  const scenes = useAssetStore(
    useShallow((s) => s.assets.filter((a) => a.episodeId === episode.id && a.kind === 'scene')),
  );
  const approveAsset = useAssetStore((s) => s.approveAsset);
  const rejectAsset = useAssetStore((s) => s.rejectAsset);
  const addAsset = useAssetStore((s) => s.upsertAssets);
  const { generate, getTaskByAsset } = useFakeGeneration();

  // 项目级场景库
  const allProjectScenes = useProjectSceneStore(useShallow((s) => s.scenes));
  const projectScenes = allProjectScenes.filter((s) => s.projectId === episode.projectId);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [selectedSceneIds, setSelectedSceneIds] = useState<Set<string>>(new Set());

  // 生效图片生成模型：阶段覆盖 → 项目默认 → 目录图片首项
  const catalogModels = useSettingsStore((s) => s.models);
  const imageModelId = (() => {
    const slot = episode.stageModels?.scenes as { image?: string } | undefined;
    if (slot?.image) return slot.image;
    return catalogModels.find((m) => m.type === 'image' && m.status === 'enabled')?.id ?? '';
  })();
  const imageModelName = catalogModels.find((m) => m.id === imageModelId)?.name ?? '';

  // 从项目场景库引用到本集
  const handleImportFromLibrary = () => {
    if (selectedSceneIds.size === 0) {
      toast.error('请至少选择一个场景');
      return;
    }
    const existingNames = new Set(scenes.map((s) => s.name));
    const toImport = projectScenes.filter((s) => selectedSceneIds.has(s.id) && !existingNames.has(s.name));
    if (toImport.length === 0) {
      toast.info('所选场景均已存在于本集');
      setLibraryOpen(false);
      return;
    }
    const newAssets = toImport.map((s) => ({
      id: `scene-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      episodeId: episode.id,
      projectId: episode.projectId,
      kind: 'scene' as const,
      name: s.name,
      description: `引用自项目场景库：${s.location || s.sceneType}，${s.atmosphere || ''}`,
      holder: undefined,
      prompt: `${s.name}, ${s.sceneType || ''} ${s.location || ''}, ${s.layout || ''} ${s.structure || ''}, ${s.lighting || ''} ${s.weather || ''}, ${s.atmosphere || ''}`,
      negativePrompt: '',
      imageUrl: '',
      status: 'DRAFT' as const,
      scope: 'episode' as const,
      model: imageModelName || '',
      currentVersion: 1,
      versions: [],
      stale: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));
    addAsset(newAssets);
    toast.success(`已从项目场景库引用 ${newAssets.length} 个场景到本集`);
    setLibraryOpen(false);
    setSelectedSceneIds(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelectedSceneIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5">
        <StageModelPicker
          stage="scenes"
          type="image"
          label="场景图模型"
          episodeId={episode.id}
          hint="真实出图，可随时更换"
        />
      </div>
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">场景资产</span>
        <span className="text-[11px] text-muted-foreground">
          母版决定外观，scene_map 决定边界/锚点/通行区；人物走位与机位方案在「分镜设计」阶段
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto h-7 gap-1 text-[11px]"
          onClick={() => setLibraryOpen(true)}
        >
          <BookOpen className="h-3 w-3" />
          从项目场景库引用
          {projectScenes.length > 0 && (
            <Badge variant="outline" className="ml-1 font-mono text-[9px]">{projectScenes.length}</Badge>
          )}
        </Button>
      </div>

      {scenes.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-xs text-muted-foreground">
          本集解读未提取到场景
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {scenes.map((sc) => {
          const task = getTaskByAsset(sc.id);
          return (
            <div key={sc.id} className="flex gap-4 rounded-xl border border-border bg-card p-4">
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                {sc.imageUrl && sc.status !== 'DRAFT' ? (
                  <img src={sc.imageUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    {task ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <Map className="h-5 w-5" />}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{sc.name}</span>
                  <Badge variant="outline" className="font-mono text-[9px]">v{sc.currentVersion}</Badge>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">{sc.description}</div>
                {/* 六步确认流程：当前演示只自动推进到母版确认，后续步骤保持待配置 */}
                <div className="mt-2 flex flex-wrap gap-1">
                  {SCENE_STEPS.map((s, i) => (
                    <span key={s} className={`rounded px-1.5 py-0.5 text-[9px] ${sceneStepState(sc.status, i) === 'done' ? 'bg-accent/60 text-accent-foreground' : sceneStepState(sc.status, i) === 'active' ? 'bg-primary/15 font-medium text-primary' : 'bg-muted text-muted-foreground'}`}>
                      {sceneStepState(sc.status, i) === 'done' ? '✓ ' : sceneStepState(sc.status, i) === 'active' ? '进行中 · ' : '待配置 · '}{s}
                    </span>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" variant="outline" disabled={Boolean(task)} onClick={() => generate(sc.id, { modelId: imageModelId, modelName: imageModelName })}>
                    {task ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {task ? `生成中 ${task.progress}%` : sc.status === 'USER_APPROVED' ? '重新生成' : '生成母版'}
                  </Button>
                  {sc.status === 'AWAITING_USER' && (
                    <>
                      <Button type="button" size="sm" onClick={() => approveAsset(sc.id, '确认场景母版')}>
                        <Check className="h-3.5 w-3.5" />
                        确认母版
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => rejectAsset(sc.id, '需要调整布局')}>
                        <X className="h-3.5 w-3.5" />
                        退回
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <VariantBlock episode={episode} />
      <p className="text-[11px] text-muted-foreground">
        场景共享按连续空间识别，不机械按剧情场次复制；场景资产与状态变体确认后进入「单元规划」阶段。
      </p>

      {/* 项目场景库引用弹窗 */}
      <Dialog open={libraryOpen} onOpenChange={setLibraryOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-sky-500" />
              从项目场景库引用
              <Badge variant="outline" className="text-[10px]">{projectScenes.length} 个可用</Badge>
            </DialogTitle>
            <p className="text-[11px] text-muted-foreground">选择需要引用到本集的场景，已存在的场景不会重复添加</p>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-4">
            {projectScenes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <MapPin className="mb-3 h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">项目场景库为空</p>
                <p className="mt-1 text-xs text-muted-foreground/60">请先在项目详情页「场景库」中建立场景设定</p>
              </div>
            ) : (
              <div className="space-y-2 px-6">
                {projectScenes.map((s) => {
                  const exists = scenes.some((es) => es.name === s.name);
                  const selected = selectedSceneIds.has(s.id);
                  return (
                    <div
                      key={s.id}
                      className={`flex items-start gap-3 rounded-xl border p-3 transition-all ${exists ? 'cursor-not-allowed border-border/30 bg-muted/10 opacity-50' : selected ? 'cursor-pointer border-sky-500/40 bg-sky-500/5' : 'cursor-pointer border-border/40 bg-muted/20 hover:border-sky-500/30'}`}
                      onClick={() => !exists && toggleSelect(s.id)}
                    >
                      <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${exists ? 'border-muted bg-muted' : selected ? 'border-sky-500 bg-sky-500' : 'border-border'}`}>
                        {selected && !exists && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{s.name}</span>
                          {s.sceneType && <Badge variant="outline" className="text-[9px]">{s.sceneType}</Badge>}
                          {s.timePeriod && <Badge variant="outline" className="text-[9px]">{s.timePeriod}</Badge>}
                          {exists && <Badge variant="outline" className="border-muted text-muted-foreground text-[9px]">已存在</Badge>}
                        </div>
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          {s.location && <span>地点：{s.location} · </span>}
                          {s.lighting && <span>光线：{s.lighting} · </span>}
                          {s.atmosphere && <span className="text-sky-500">氛围：{s.atmosphere}</span>}
                        </div>
                        {s.layout && <div className="mt-1 line-clamp-1 text-[10px] text-muted-foreground/80">布局：{s.layout}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter className="border-t border-border/60 pt-4">
            <p className="mr-auto text-[10px] text-muted-foreground">已选 {selectedSceneIds.size} 个</p>
            <Button type="button" variant="outline" onClick={() => setLibraryOpen(false)}>取消</Button>
            <Button type="button" onClick={handleImportFromLibrary} className="bg-gradient-to-r from-sky-500 to-blue-600" disabled={selectedSceneIds.size === 0}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              引用到本集 ({selectedSceneIds.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
