// EXPORTS: default PropStage
// 道具资产（5.3：独立于角色组件；记录来源事件/持有者/位置状态变化；全局标记）
import { useState } from 'react';
import { Package, Globe, Check, X, Loader2, BookOpen, Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useAssetStore } from '@/stores/useAssetStore';
import { useProjectPropStore } from '@/stores/useProjectPropStore';
import { useShallow } from 'zustand/react/shallow';
import { useFakeGeneration } from '@/hooks/useFakeGeneration';
import { useSettingsStore } from '@/stores/useSettingsStore';
import StageModelPicker from '@/features/comic/StageModelPicker';
import type { Episode } from '@/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function PropStage({ episode }: { episode: Episode }) {
  const props = useAssetStore(
    useShallow((s) => s.assets.filter((a) => a.episodeId === episode.id && a.kind === 'prop')),
  );
  const approveAsset = useAssetStore((s) => s.approveAsset);
  const rejectAsset = useAssetStore((s) => s.rejectAsset);
  const toggleGlobal = useAssetStore((s) => s.toggleGlobal);
  const addAsset = useAssetStore((s) => s.upsertAssets);
  const { generate, getTaskByAsset } = useFakeGeneration();

  // 项目级道具库
  const allProjectProps = useProjectPropStore(useShallow((s) => s.props));
  const projectProps = allProjectProps.filter((p) => p.projectId === episode.projectId);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [selectedPropIds, setSelectedPropIds] = useState<Set<string>>(new Set());

  // 生效图片生成模型：阶段覆盖 → 项目默认 → 目录图片首项
  const catalogModels = useSettingsStore((s) => s.models);
  const imageModelId = (() => {
    const slot = episode.stageModels?.props as { image?: string } | undefined;
    if (slot?.image) return slot.image;
    return catalogModels.find((m) => m.type === 'image' && m.status === 'enabled')?.id ?? '';
  })();
  const imageModelName = catalogModels.find((m) => m.id === imageModelId)?.name ?? '';

  // 从项目道具库引用到本集
  const handleImportFromLibrary = () => {
    if (selectedPropIds.size === 0) {
      toast.error('请至少选择一个道具');
      return;
    }
    const existingNames = new Set(props.map((p) => p.name));
    const toImport = projectProps.filter((p) => selectedPropIds.has(p.id) && !existingNames.has(p.name));
    if (toImport.length === 0) {
      toast.info('所选道具均已存在于本集');
      setLibraryOpen(false);
      return;
    }
    const newAssets = toImport.map((p) => ({
      id: `prop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      episodeId: episode.id,
      projectId: episode.projectId,
      kind: 'prop' as const,
      name: p.name,
      description: `引用自项目道具库：${p.usage || p.propType}`,
      holder: p.defaultHolder || undefined,
      prompt: `${p.name}, ${p.material || ''} ${p.color || ''} ${p.shape || ''}, ${p.decoration || ''}`,
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
    toast.success(`已从项目道具库引用 ${newAssets.length} 个道具到本集`);
    setLibraryOpen(false);
    setSelectedPropIds(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelectedPropIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5">
        <StageModelPicker
          stage="props"
          type="image"
          label="道具图模型"
          episodeId={episode.id}
          hint="真实出图，可随时更换"
        />
      </div>
      <div className="flex items-center gap-2">
        <Package className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">道具资产</span>
        <span className="text-2xs text-muted-foreground">
          记录来源事件 · 持有者 · 位置状态变化；道具确认后进入场景阶段
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto h-7 gap-1 text-2xs"
          onClick={() => setLibraryOpen(true)}
        >
          <BookOpen className="h-3 w-3" />
          从项目道具库引用
          {projectProps.length > 0 && (
            <Badge variant="outline" className="ml-1 font-mono text-4xs">{projectProps.length}</Badge>
          )}
        </Button>
      </div>

      {props.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-xs text-muted-foreground">
          本集解读未提取到道具（可选资产）
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {props.map((p, idx) => {
          const task = getTaskByAsset(p.id);
          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.08 }}
              className="flex gap-4 rounded-xl border border-border bg-card p-4"
            >
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                {p.imageUrl && p.status !== 'DRAFT' ? (
                  <img src={p.imageUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    {task ? (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    ) : (
                      <Package className="h-5 w-5" />
                    )}
                  </div>
                )}
                {p.scope === 'global' && (
                  <Badge className="!absolute right-1.5 top-1.5 z-20 bg-primary text-primary-foreground">
                    <Globe className="h-2.5 w-2.5" />
                  </Badge>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{p.name}</span>
                  <Badge variant="outline" className="font-mono text-4xs">v{p.currentVersion}</Badge>
                  {p.stale && <span className="text-3xs text-destructive">STALE</span>}
                </div>
                <div className="mt-1 space-y-0.5 text-2xs text-muted-foreground">
                  <div>来源事件：{p.description}</div>
                  <div>持有者：{p.holder ?? '—'} · 出现集：{episode.index}</div>
                  <div className="truncate font-mono text-3xs">{p.prompt}</div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" variant="outline" disabled={Boolean(task)} onClick={() => generate(p.id, { modelId: imageModelId, modelName: imageModelName })}>
                    {task ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {task ? `生成中 ${task.progress}%` : p.status === 'USER_APPROVED' ? '重新生成' : '生成'}
                  </Button>
                  {p.status === 'AWAITING_USER' && (
                    <>
                      <Button type="button" size="sm" onClick={() => approveAsset(p.id, '确认道具版本')}>
                        <Check className="h-3.5 w-3.5" />
                        采纳
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => rejectAsset(p.id, '不符合设定')}>
                        <X className="h-3.5 w-3.5" />
                        退回
                      </Button>
                    </>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant={p.scope === 'global' ? 'outline' : 'default'}
                    className={cn('ml-auto', p.scope === 'global' && 'text-muted-foreground')}
                    onClick={() => toggleGlobal(p.id)}
                  >
                    {p.scope === 'global' ? '取消全局' : '标记全局'}
                  </Button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
      <p className="text-2xs text-muted-foreground">
        道具无需为每个场次强制生成新图，但使用中的状态差异必须显式建模；标记「全局」仅表示本项目内可复用。
      </p>

      {/* 项目道具库引用弹窗 */}
      <Dialog open={libraryOpen} onOpenChange={setLibraryOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-emerald-500" />
              从项目道具库引用
              <Badge variant="outline" className="text-3xs">{projectProps.length} 个可用</Badge>
            </DialogTitle>
            <p className="text-2xs text-muted-foreground">选择需要引用到本集的道具，已存在的道具不会重复添加</p>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-4">
            {projectProps.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Package className="mb-3 h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">项目道具库为空</p>
                <p className="mt-1 text-xs text-muted-foreground/60">请先在项目详情页「道具库」中建立道具设定</p>
              </div>
            ) : (
              <div className="space-y-2 px-6">
                {projectProps.map((p) => {
                  const exists = props.some((ep) => ep.name === p.name);
                  const selected = selectedPropIds.has(p.id);
                  return (
                    <div
                      key={p.id}
                      className={`flex items-start gap-3 rounded-xl border p-3 transition-all ${exists ? 'cursor-not-allowed border-border/30 bg-muted/10 opacity-50' : selected ? 'cursor-pointer border-emerald-500/40 bg-emerald-500/5' : 'cursor-pointer border-border/40 bg-muted/20 hover:border-emerald-500/30'}`}
                      onClick={() => !exists && toggleSelect(p.id)}
                    >
                      <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${exists ? 'border-muted bg-muted' : selected ? 'border-emerald-500 bg-emerald-500' : 'border-border'}`}>
                        {selected && !exists && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{p.name}</span>
                          {p.propType && <Badge variant="outline" className="text-4xs">{p.propType}</Badge>}
                          {p.category && <Badge variant="outline" className="text-4xs">{p.category}</Badge>}
                          {exists && <Badge variant="outline" className="border-muted text-muted-foreground text-4xs">已存在</Badge>}
                        </div>
                        <div className="mt-1 text-3xs text-muted-foreground">
                          {p.material && <span>材质：{p.material} · </span>}
                          {p.color && <span>颜色：{p.color} · </span>}
                          {p.defaultHolder && <span className="text-emerald-500">持有者：{p.defaultHolder}</span>}
                        </div>
                        {p.usage && <div className="mt-1 line-clamp-1 text-3xs text-muted-foreground/80">用途：{p.usage}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter className="border-t border-border/60 pt-4">
            <p className="mr-auto text-3xs text-muted-foreground">已选 {selectedPropIds.size} 个</p>
            <Button type="button" variant="outline" onClick={() => setLibraryOpen(false)}>取消</Button>
            <Button type="button" onClick={handleImportFromLibrary} className="bg-gradient-to-r from-emerald-500 to-teal-600" disabled={selectedPropIds.size === 0}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              引用到本集 ({selectedPropIds.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
