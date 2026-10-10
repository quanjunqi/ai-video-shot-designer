// EXPORTS: default AssetsPage
// 资产库（3.4）：统一检索与追溯；按来源项目/剧集、全局标签筛选；展示版本与审核日志
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Globe, History, Loader2, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import ResourceList from '@/components/common/ResourceList';
import DemoBadge from '@/components/common/DemoBadge';
import { useAssetStore } from '@/stores/useAssetStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useEpisodeStore } from '@/stores/useEpisodeStore';
import { placeholderUrl } from '@/lib/placeholder';
import type { ArtifactStatus, Asset } from '@/types';
import { cn } from '@/lib/utils';
import { api, ApiError } from '@/lib/api/client';
import { toast } from 'sonner';

const KIND_LABEL: Record<Asset['kind'], string> = { character: '角色', scene: '场景', prop: '道具', other: '其他' };

const STATUS_META: Record<ArtifactStatus, { label: string; className: string }> = {
  DRAFT: { label: '草稿', className: 'bg-muted text-muted-foreground' },
  AWAITING_USER: { label: '候选待选择', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  USER_APPROVED: { label: '已批准', className: 'bg-success/15 text-success' },
  USER_REJECTED: { label: '已拒绝', className: 'bg-destructive/10 text-destructive' },
  STALE: { label: '失效', className: 'bg-destructive/10 text-destructive' },
  SUPERSEDED: { label: '已取代', className: 'bg-muted text-muted-foreground' },
};

export default function AssetsPage() {
  const assets = useAssetStore((s) => s.assets);
  const syncServerAssets = useAssetStore((s) => s.syncServerAssets);
  const auditLog = useAssetStore((s) => s.auditLog);
  const projects = useProjectStore((s) => s.projects);
  const episodes = useEpisodeStore((s) => s.episodes);
  const [params, setParams] = useSearchParams();
  const [kind, setKind] = useState('all');
  const [project, setProject] = useState('all');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [serverState, setServerState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [serverError, setServerError] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadProject, setUploadProject] = useState('');
  const [uploadKind, setUploadKind] = useState<'character' | 'prop' | 'scene' | 'other'>('character');
  const [uploadScope, setUploadScope] = useState<'project' | 'global' | 'episode'>('project');
  const [uploadName, setUploadName] = useState('');
  const [uploadPrompt, setUploadPrompt] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const detailId = params.get('asset');
  const setDetailId = (id: string | null) => setParams(id ? { asset: id } : {}, { replace: true });

  const resetUpload = () => {
    setUploadProject(projects[0]?.id ?? '');
    setUploadKind('character');
    setUploadScope('project');
    setUploadName('');
    setUploadPrompt('');
    setUploadFile(null);
  };

  const openUpload = () => {
    resetUpload();
    setUploadOpen(true);
  };

  const refreshAssets = async () => {
    const result = await api.listAssets();
    syncServerAssets(result.items);
    setServerState('ready');
  };

  const upload = async () => {
    if (!uploadProject || !uploadName.trim() || !uploadFile) return;
    setUploading(true);
    try {
      const digest = await crypto.subtle.digest('SHA-256', await uploadFile.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
      const session = await api.createAssetUpload({
        project_id: uploadProject,
        kind: uploadKind,
        scope: uploadScope,
        name: uploadName.trim(),
        prompt: uploadPrompt.trim(),
        sha256,
      });
      await api.uploadAssetContent(session.id, uploadFile);
      await api.commitAssetUpload(session.id);
      await refreshAssets();
      setUploadOpen(false);
      toast.success('资产已上传并提交到资产服务');
    } catch (error) {
      toast.error(error instanceof ApiError ? `${error.message}（${error.code}）` : '上传失败，请检查资产服务后重试');
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    let active = true;
    api.listAssets()
      .then(({ items }) => {
        if (!active) return;
        syncServerAssets(items);
        setServerState('ready');
      })
      .catch((error: unknown) => {
        if (!active) return;
        setServerState('error');
        setServerError(error instanceof ApiError ? error.message : '资产服务暂不可用');
      });
    return () => { active = false; };
  }, [syncServerAssets]);

  const detail = assets.find((a) => a.id === detailId) ?? null;
  const detailAudits = auditLog.filter((l) => l.artifactId === detailId);

  const projectTitle = (id: string) => projects.find((p) => p.id === id)?.title ?? id;
  const episodeLabel = (id: string) => {
    const e = episodes.find((x) => x.id === id);
    return e ? `第 ${e.index} 集` : id;
  };

  const filtered = useMemo(
    () =>
      assets.filter(
        (a) =>
          (kind === 'all' || a.kind === kind) &&
          (project === 'all' || a.projectId === project) &&
          (a.name.includes(search) || a.description.includes(search)),
      ),
    [assets, kind, project, search],
  );

  const statusMeta = (s: ArtifactStatus) => STATUS_META[s];

  return (
    <>
      <ResourceList
        title="资产库"
        count={filtered.length}
        view={view}
        onViewChange={setView}
        onCreate={openUpload}
        createLabel="上传资产"
        emptyTitle="暂无资产"
        emptyDescription="资产来自漫剧工坊与画布候选提交"
        filters={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={kind} onValueChange={(v) => setKind(v as string)}>
              <SelectTrigger className="h-9 w-32">
                <SelectValue placeholder="全部类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="character">角色</SelectItem>
                <SelectItem value="scene">场景</SelectItem>
                <SelectItem value="prop">道具</SelectItem>
              </SelectContent>
            </Select>
            <Select value={project} onValueChange={(v) => setProject(v as string)}>
              <SelectTrigger className="h-9 w-44">
                <SelectValue placeholder="全部项目" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部项目</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索资产名称 / 描述"
              className="h-9 w-60 text-xs"
            />
            {serverState === 'loading' && <Badge variant="outline">正在同步服务端资产…</Badge>}
            {serverState === 'ready' && <Badge variant="outline" className="border-success/40 text-success">已连接资产服务</Badge>}
            {serverState === 'error' && <Badge variant="outline" className="border-destructive/40 text-destructive" title={serverError}>资产服务不可用</Badge>}
            <DemoBadge />
          </div>
        }
        items={filtered}
        renderCard={(item) => {
          const sm = statusMeta(item.status);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setDetailId(item.id)}
              className="group overflow-hidden rounded-xl border border-border bg-card text-left transition-shadow hover:shadow-md"
            >
              <div className="relative aspect-square overflow-hidden bg-muted">
                <img
                  src={item.imageUrl ?? placeholderUrl(`asset-${item.id}`)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
                <span className="!absolute left-2 top-2 z-20 rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-medium backdrop-blur">
                  {KIND_LABEL[item.kind]}
                </span>
                {item.scope === 'global' && (
                  <Badge className="!absolute right-2 top-2 z-20 gap-1 bg-primary text-primary-foreground">
                    <Globe className="h-2.5 w-2.5" />
                    全局
                  </Badge>
                )}
              </div>
              <div className="space-y-1 p-3">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{item.name}</span>
                  <span className="font-mono text-[9px] text-muted-foreground">v{item.currentVersion}</span>
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {projectTitle(item.projectId)} · {episodeLabel(item.episodeId)}
                </div>
                <span className={cn('rounded px-1.5 py-px text-[10px]', sm.className)}>{sm.label}</span>
              </div>
            </button>
          );
        }}
        renderRow={(item) => {
          const sm = statusMeta(item.status);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setDetailId(item.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/40"
            >
              <img
                src={item.imageUrl ?? placeholderUrl(`asset-${item.id}`)}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-12 w-12 rounded object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{item.name}</div>
                <div className="truncate font-mono text-[10px] text-muted-foreground">{item.prompt}</div>
              </div>
              <span className="font-mono text-[9px] text-muted-foreground">v{item.currentVersion}</span>
              <span className={cn('rounded px-1.5 py-px text-[10px]', sm.className)}>{sm.label}</span>
              <Badge variant="outline">{KIND_LABEL[item.kind]}</Badge>
              {item.scope === 'global' && <Globe className="h-3.5 w-3.5 text-primary" />}
            </button>
          );
        }}
      />

      <Dialog open={uploadOpen} onOpenChange={(open) => { if (!uploading) setUploadOpen(open); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Upload className="h-4 w-4 text-primary" />上传资产</DialogTitle>
            <DialogDescription>文件会先写入对象存储，再由服务端校验 SHA-256 后进入资产库。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>所属项目</Label>
              {projects.length > 0 ? (
                <Select value={uploadProject} onValueChange={setUploadProject}>
                  <SelectTrigger><SelectValue placeholder="选择项目" /></SelectTrigger>
                  <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}</SelectContent>
                </Select>
              ) : <Input value={uploadProject} onChange={(e) => setUploadProject(e.target.value)} placeholder="输入项目 ID" />}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0 space-y-1.5"><Label>资产类型</Label><Select value={uploadKind} onValueChange={(v) => setUploadKind(v as typeof uploadKind)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="character">角色</SelectItem><SelectItem value="prop">道具</SelectItem><SelectItem value="scene">场景</SelectItem><SelectItem value="other">其他</SelectItem></SelectContent></Select></div>
              <div className="space-y-1.5"><Label>作用域</Label><Select value={uploadScope} onValueChange={(v) => setUploadScope(v as typeof uploadScope)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="project">项目</SelectItem><SelectItem value="global">全局</SelectItem><SelectItem value="episode">剧集</SelectItem></SelectContent></Select></div>
            </div>
            <div className="space-y-1.5"><Label>资产名称</Label><Input value={uploadName} onChange={(e) => setUploadName(e.target.value)} placeholder="例如：林默正面立绘" /></div>
            <div className="space-y-1.5"><Label>提示词（可选）</Label><Input value={uploadPrompt} onChange={(e) => setUploadPrompt(e.target.value)} placeholder="记录生成或来源说明" /></div>
            <div className="space-y-1.5"><Label>文件</Label><Input type="file" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} />{uploadFile && <p className="text-[11px] text-muted-foreground">{uploadFile.name} · {(uploadFile.size / 1024).toFixed(1)} KB</p>}</div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={uploading} onClick={() => setUploadOpen(false)}>取消</Button>
            <Button type="button" disabled={uploading || !uploadProject || !uploadName.trim() || !uploadFile} onClick={() => void upload()}>{uploading && <Loader2 className="h-4 w-4 animate-spin" />}提交上传</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(detail)} onOpenChange={(v) => !v && setDetailId(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>资产追溯</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 break-all">
                <span className="text-sm font-semibold">{detail.name}</span>
                <Badge variant="outline" className="font-mono text-[9px]">v{detail.currentVersion}</Badge>
                <span className="font-mono text-[9px] text-muted-foreground">{detail.id}</span>
              </div>
              <div className="space-y-1 break-all rounded-lg bg-muted/60 p-3 font-mono text-[10px] text-muted-foreground">
                <div>类型：{KIND_LABEL[detail.kind]} · 范围：{detail.scope === 'global' ? '全局' : '本集'}</div>
                <div>来源项目：{projectTitle(detail.projectId)} · 剧集：{episodeLabel(detail.episodeId)}</div>
                <div>当前哈希：{detail.versions.find((v) => v.version === detail.currentVersion)?.sha256 ?? '暂无'}</div>
                {detail.source === 'server' && <div>对象：{detail.objectKey} · {detail.byteSize ?? 0} bytes · {detail.contentType ?? '未知类型'}</div>}
              </div>
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium">
                  <History className="h-3.5 w-3.5 text-primary" />
                  版本历史
                </div>
                <div className="space-y-1">
                  {[...detail.versions].reverse().map((v) => (
                    <div key={v.version} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="font-mono text-primary">v{v.version}</span>
                      <span className="min-w-0 flex-1 truncate">{v.prompt}</span>
                      <span className="font-mono text-[9px]">{v.sha256.slice(0, 8)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium">
                  <History className="h-3.5 w-3.5 text-primary" />
                  审核日志（追加式）
                </div>
                {detailAudits.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">暂无审核记录</p>
                ) : (
                  <div className="space-y-1.5">
                    {detailAudits.map((l) => (
                      <div key={l.id} className="rounded-lg border border-border p-2 text-[11px]">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono text-[9px]">{l.action}</Badge>
                          <span className="font-mono text-[9px] text-muted-foreground">
                            v{l.version} · {l.sha256.slice(0, 12)}…
                          </span>
                        </div>
                        <div className="mt-1 text-muted-foreground">
                          {l.userStatement || '（未填写声明）'} · {new Date(l.createdAt).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {detail.imageUrl && (
                <img src={detail.imageUrl} alt="" loading="lazy" decoding="async" className="w-full rounded-lg border border-border" />
              )}
            </div>
          )}
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => setDetailId(null)}>
              关闭
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
