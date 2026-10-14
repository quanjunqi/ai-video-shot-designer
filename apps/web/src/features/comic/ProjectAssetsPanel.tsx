// EXPORTS: default ProjectAssetsPanel
// 项目资产库（按角色/道具/场景、来源剧集及「全局」标签筛选）
import { useState } from 'react';
import { Globe, Layers, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAssetStore } from '@/stores/useAssetStore';
import { useShallow } from 'zustand/react/shallow';
import { placeholderUrl } from '@/lib/placeholder';
import type { AssetKind } from '@/types';
import { cn } from '@/lib/utils';

const KIND_LABEL: Record<AssetKind, string> = { character: '角色', prop: '道具', scene: '场景', other: '其他' };
const KIND_TABS = [
  { key: 'all', label: '全部' },
  { key: 'character', label: '角色' },
  { key: 'prop', label: '道具' },
  { key: 'scene', label: '场景' },
] as const;

export default function ProjectAssetsPanel({ projectId }: { projectId: string }) {
  const assets = useAssetStore(useShallow((s) => s.getProjectAssets(projectId)));
  const [kind, setKind] = useState<string>('all');
  const [source, setSource] = useState('all');
  const [globalOnly, setGlobalOnly] = useState(false);

  const filtered = assets.filter((a) => {
    const matchKind = kind === 'all' || a.kind === kind;
    const matchSource = source === 'all' || a.episodeId === source;
    const matchGlobal = !globalOnly || a.scope === 'global';
    return matchKind && matchSource && matchGlobal;
  });

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* 标题行 */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Layers className="h-4 w-4 shrink-0 text-primary" />
        <h2 className="whitespace-nowrap text-sm font-semibold">项目资产库</h2>
        <Badge variant="outline" className="font-mono text-3xs">{assets.length}</Badge>
        <button
          type="button"
          onClick={() => setGlobalOnly((v) => !v)}
          className={cn(
            'ml-auto flex h-7 items-center gap-1 rounded-md border px-2 text-3xs font-medium transition-colors',
            globalOnly ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground',
          )}
          title="仅显示全局资产"
        >
          <Globe className="h-3 w-3" />
          全局
        </button>
      </div>

      {/* 筛选行：类型 segmented + 来源集下拉 */}
      <div className="flex items-center gap-2 px-4 py-2.5">
        <div className="flex items-center rounded-md border border-border bg-muted/50 p-0.5">
          {KIND_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setKind(t.key)}
              className={cn(
                'h-6 rounded px-2 text-3xs font-medium transition-colors',
                kind === t.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Select value={source} onValueChange={(v) => setSource(v as string)}>
          <SelectTrigger className="h-7 flex-1 border-border text-3xs">
            <SelectValue placeholder="全部来源集" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部来源集</SelectItem>
            {[...new Set(assets.map((a) => a.episodeId))].map((eid) => (
              <SelectItem key={eid} value={eid}>{eid}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 内容区 */}
      <div className="px-4 pb-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Layers className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground">暂无匹配资产</p>
            <Link
              to={`/comic/projects/${projectId}`}
              className="mt-1 inline-flex h-7 items-center gap-1 rounded-md bg-primary px-3 text-2xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="h-3 w-3" />
              进入剧集工坊创建
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {filtered.map((a) => (
              <div key={a.id} className="group overflow-hidden rounded-lg border border-border bg-background transition-all hover:border-primary/30 hover:shadow-sm">
                <div className="relative aspect-square overflow-hidden bg-muted">
                  <img
                    src={a.imageUrl ?? placeholderUrl(`asset-${a.id}`)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <span className="absolute left-1.5 top-1.5 z-20 rounded bg-background/80 px-1 py-0.5 text-4xs font-medium backdrop-blur">
                    {KIND_LABEL[a.kind]}
                  </span>
                  {a.scope === 'global' && (
                    <Badge className="absolute right-1.5 top-1.5 z-20 gap-1 bg-primary text-primary-foreground">
                      <Globe className="h-2.5 w-2.5" />
                      全局
                    </Badge>
                  )}
                </div>
                <div className="p-2">
                  <div className="truncate text-2xs font-medium">{a.name}</div>
                  <div className="font-mono text-4xs text-muted-foreground">v{a.currentVersion}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
