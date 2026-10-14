// EXPORTS: default CanvasPage
// 独立无限画布（3.3）：缩放/平移/框选/连线；节点保存为版本化画布文档；结果可提交为候选资产
import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Save, Upload, PenTool } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import DemoBadge from '@/components/common/DemoBadge';
import { useCanvasStore } from '@/stores/useCanvasStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useEpisodeStore } from '@/stores/useEpisodeStore';
import { useAssetStore } from '@/stores/useAssetStore';
import { useShallow } from 'zustand/react/shallow';
import type { AssetKind } from '@/types';

const CanvasFlow = lazy(() => import('@/features/canvas/CanvasFlow'));

export default function CanvasPage() {
  const canvas = useCanvasStore(
    useShallow((s) => ({ nodes: s.nodes, edges: s.edges, version: s.version, savedAt: s.savedAt })),
  );
  const save = useCanvasStore((s) => s.save);
  const projects = useProjectStore((s) => s.projects);
  const episodes = useEpisodeStore((s) => s.episodes);
  const upsertAssets = useAssetStore((s) => s.upsertAssets);

  const [exportOpen, setExportOpen] = useState(false);
  const [expKind, setExpKind] = useState<AssetKind>('character');
  const [expName, setExpName] = useState('');
  const [expProject, setExpProject] = useState('');
  const [expEpisode, setExpEpisode] = useState('');

  const handleSave = () => {
    save(canvas.nodes, canvas.edges);
    toast.success(`画布文档已保存 v${canvas.version + 1}`);
  };

  const handleExport = () => {
    if (!expName.trim() || !expProject || !expEpisode) return;
    const project = projects.find((p) => p.id === expProject);
    upsertAssets([
      {
        id: `canvas-${Date.now().toString(36)}`,
        projectId: expProject,
        episodeId: expEpisode,
        kind: expKind,
        name: expName.trim(),
        description: '来自无限画布的候选资产（画布结果不得直接成为 canonical 版本）',
        scope: 'episode',
        currentVersion: 1,
        versions: [
          {
            version: 1,
            prompt: `${expName.trim()}, from canvas composition, cinematic lighting, masterpiece`,
            negativePrompt: 'low quality, blurry',
            sha256: `canvas-${Date.now().toString(36)}`,
            status: 'DRAFT',
            createdAt: Date.now(),
          },
        ],
        prompt: `${expName.trim()}, from canvas composition, cinematic lighting, masterpiece`,
        negativePrompt: 'low quality, blurry',
        status: 'DRAFT',
        model: project?.defaultImageModel ?? 'SDXL',
        stale: false,
        createdAt: Date.now(),
      },
    ]);
    setExportOpen(false);
    setExpName('');
    toast.success('已提交为候选资产（DRAFT），可在漫剧工坊内审核');
  };

  const episodesOfProject = episodes.filter((e) => e.projectId === expProject);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 画布工具栏 */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" asChild>
          <Link to="/">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <PenTool className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">独立无限画布</span>
        <DemoBadge />
        <span className="ml-auto font-mono text-3xs text-muted-foreground">
          文档 v{canvas.version}{canvas.savedAt ? ` · 上次保存 ${new Date(canvas.savedAt).toLocaleTimeString()}` : ''}
        </span>
        <Button type="button" variant="outline" size="sm" onClick={() => setExportOpen(true)}>
          <Upload className="h-3.5 w-3.5" />
          提交为候选资产
        </Button>
        <Button type="button" size="sm" onClick={handleSave}>
          <Save className="h-3.5 w-3.5" />
          保存文档
        </Button>
      </div>

      {/* 画布主体 */}
      <div className="min-h-0 flex-1">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">正在加载画布…</div>
          }
        >
          <CanvasFlow />
        </Suspense>
      </div>

      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>提交为候选资产</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">类型</Label>
              <Select value={expKind} onValueChange={(v) => setExpKind(v as AssetKind)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="character">角色</SelectItem>
                  <SelectItem value="scene">场景</SelectItem>
                  <SelectItem value="prop">道具</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">名称</Label>
              <Input value={expName} placeholder="资产名称" onChange={(e) => setExpName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">目标项目（提交审核上下文）</Label>
              <Select value={expProject} onValueChange={(v) => { setExpProject(v); setExpEpisode(''); }}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="选择项目" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">目标剧集</Label>
              <Select value={expEpisode} onValueChange={setExpEpisode}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="选择剧集" />
                </SelectTrigger>
                <SelectContent>
                  {episodesOfProject.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      第 {e.index} 集
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-2xs text-muted-foreground">
              画布结果作为候选资产提交漫剧审核，不得直接成为 canonical 版本。
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setExportOpen(false)}>
              取消
            </Button>
            <Button type="button" disabled={!expName.trim() || !expProject || !expEpisode} onClick={handleExport}>
              提交
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
