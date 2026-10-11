// EXPORTS: default SettingsChannelsPage
// 渠道配置（模型来源 L1）：内置六渠道（平台集中）+ 自定义渠道（用户自建，可删除）
// 正式态：凭据经 workspace 服务加密存储（只写不读明文）；连通性检测为后端真实 HTTP 探测
import { useState } from 'react';
import { Cable, Globe, Server, Cloud, PlugZap, Power, Plus, Trash2, UserRound, ShieldCheck, Pencil, Eye, EyeOff, Lock, Check, Copy, RefreshCw, Boxes } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useEffect } from 'react';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { api, type ChannelSyncResult } from '@/lib/api/client';
import CurationPanel from '@/features/settings/CurationPanel';
import { describeSyncSource, effectiveSync } from '@/features/settings/channel-sync';
import { MODEL_CHANNELS, type ChannelKind, type ChannelConfig, type ChannelProtocol } from '@/config/models/model-catalog';
import { cn } from '@/lib/utils';

const KIND_LABEL: Record<ChannelKind, string> = { official: '官方', aggregator: '聚合', local: '本地' };
const KIND_COLOR: Record<ChannelKind, string> = {
  official: 'bg-sky-500/15 text-sky-600',
  aggregator: 'bg-violet-500/15 text-violet-600',
  local: 'bg-amber-500/15 text-amber-600',
};
const KIND_ICON: Record<ChannelKind, typeof Cable> = { official: Globe, aggregator: Cable, local: Server };

const BUILTIN_IDS = MODEL_CHANNELS.map((c) => c.id);
const isBuiltin = (id: string) => BUILTIN_IDS.includes(id);

interface NewChannelForm {
  name: string;
  kind: ChannelKind;
  protocol: ChannelProtocol;
  baseUrl: string;
  authType: 'bearer' | 'none';
  apiKey: string;
  note: string;
}

const EMPTY_FORM: NewChannelForm = { name: '', kind: 'aggregator', protocol: 'api', baseUrl: '', authType: 'bearer', apiKey: '', note: '' };

const PROTOCOL_LABEL: Record<ChannelProtocol, string> = { api: 'HTTP API', local: '本地端口' };
const PROTOCOL_DESC: Record<ChannelProtocol, string> = {
  api: '云服务/聚合网关：BaseURL + 鉴权 + Key',
  local: '自托管服务（ComfyUI/Ollama）：host:port 可达，通常无需鉴权',
};

export default function SettingsChannelsPage() {
  const channels = useSettingsStore((s) => s.channels);
  const credentials = useSettingsStore((s) => s.credentials);
  const catalogSource = useSettingsStore((s) => s.catalogSource);
  const upsertChannel = useSettingsStore((s) => s.upsertChannel);
  const removeChannel = useSettingsStore((s) => s.removeChannel);
  const duplicateChannel = useSettingsStore((s) => s.duplicateChannel);
  const testChannel = useSettingsStore((s) => s.testChannel);
  const syncCatalog = useSettingsStore((s) => s.syncCatalog);
  // D2：策展面板（哪个渠道正在策展）
  const [curationFor, setCurationFor] = useState<ChannelConfig | null>(null);
  const syncCredentials = useSettingsStore((s) => s.syncCredentials);
  const saveCredential = useSettingsStore((s) => s.saveCredential);
  const clearCredential = useSettingsStore((s) => s.clearCredential);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<NewChannelForm>({ ...EMPTY_FORM });
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<ChannelConfig | null>(null);
  const [editForm, setEditForm] = useState({
    name: '', kind: 'aggregator' as ChannelKind, protocol: 'api' as ChannelProtocol,
    authType: 'bearer' as 'bearer' | 'none', baseUrl: '', note: '',
    // 同步配置：**只对工作区自己的渠道**可编辑（平台渠道由平台侧拥有，界面不得改）
    syncKind: 'none' as 'none' | 'openai_compatible',
    syncModelsPath: '', syncPricingPath: '', trustNote: '',
  });
  const [testingId, setTestingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  // 最近一次同步结果（每个渠道一份；权威记录在服务端的 channel_model_syncs）
  const [syncResults, setSyncResults] = useState<Record<string, ChannelSyncResult>>({});
  const [selected, setSelected] = useState<string[]>([]);

  const toggleSelect = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const allSelected = channels.length > 0 && selected.length === channels.length;
  const toggleSelectAll = () => setSelected(allSelected ? [] : channels.map((c) => c.id));
  const batchDelete = () => {
    if (selected.length === 0) return;
    const names = channels.filter((c) => selected.includes(c.id)).map((c) => c.name);
    if (window.confirm(`删除选中的 ${selected.length} 个渠道（${names.join('、')}）？其下模型将一并移除。`)) {
      selected.forEach((id) => removeChannel(id));
      toast.success(`已删除 ${selected.length} 个渠道`);
      setSelected([]);
    }
  };
  useEffect(() => { void syncCatalog(); }, [syncCatalog]);
  useEffect(() => { void syncCredentials(); }, [syncCredentials]);

  const openEdit = async (c: ChannelConfig) => {
    setEditing(c);
    setEditForm({
      name: c.name, kind: c.kind, protocol: c.protocol ?? 'api', authType: c.authType,
      baseUrl: c.baseUrl, note: c.note,
      // ★ 必须取【该渠道自己】的同步配置，而不是上面显示的"生效值"：
      //   生效值可能来自平台行，若拿它预填，一保存就把平台配置抄成了工作区私有配置。
      syncKind: 'none', syncModelsPath: '', syncPricingPath: '', trustNote: '',
    });
    setEditKey('');
    setRevealed(null);
    setEditOpen(true);
    if (!isBuiltin(c.id)) {
      try {
        const mine = (await api.listUserChannels()).items.find((x) => x.id === c.id);
        if (mine) {
          setEditForm((prev) => ({
            ...prev,
            syncKind: mine.syncKind === 'openai_compatible' ? 'openai_compatible' : 'none',
            syncModelsPath: mine.syncModelsPath ?? '',
            syncPricingPath: mine.syncPricingPath ?? '',
            trustNote: mine.trustNote ?? '',
          }));
        }
      } catch {
        // 读不到就不预填（保持 none）。用户仍可显式配置；失败不静默影响其它字段。
      }
    }
  };

  const submitEdit = async () => {
    if (!editing || !editForm.name.trim()) return;
    const isUserChannel = !isBuiltin(editing.id);
    if (isUserChannel) {
      // ★ 工作区渠道：写【工作区域】（这是它的所有者），绝不写平台目录 ——
      //   平台目录属于平台，界面改它等于跨租户改别人的事实（ADR-005 D1 的护栏）。
      await api.putUserChannel(editing.id, {
        name: editForm.name.trim(), kind: editForm.kind, protocol: editForm.protocol,
        baseUrl: editForm.baseUrl.trim(), authType: editForm.authType, enabled: editing.enabled,
        note: editForm.note.trim(),
        syncKind: editForm.syncKind,
        syncModelsPath: editForm.syncModelsPath.trim(),
        syncPricingPath: editForm.syncPricingPath.trim(),
        trustNote: editForm.trustNote.trim(),
      });
    } else {
      upsertChannel(editing.id, { name: editForm.name.trim(), kind: editForm.kind, protocol: editForm.protocol, authType: editForm.authType, baseUrl: editForm.baseUrl.trim(), note: editForm.note.trim() });
    }
    const hasCred = Boolean(credFor(editing.id)?.hasKey);
    const newKey = editKey.trim();
    try {
      if (newKey) {
        // 输入了新 Key → 覆盖存储
        await saveCredential(editing.id, { baseUrl: editForm.baseUrl.trim(), authType: editForm.authType, apiKey: newKey });
        toast.success(`「${editForm.name.trim()}」已更新，新 Key 已加密存储`);
      } else if (hasCred) {
        // 已有凭据且未改 Key → 保留密文，仅同步地址/鉴权方式
        await saveCredential(editing.id, { baseUrl: editForm.baseUrl.trim(), authType: editForm.authType });
        toast.success(`「${editForm.name.trim()}」已更新，凭据保持不变`);
      } else {
        toast.success(`「${editForm.name.trim()}」已更新`);
      }
      setEditOpen(false);
      setEditing(null);
      setRevealed(null);
      setEditKey('');
      // 写的是服务端 ⇒ 必须重拉目录，否则卡片仍显示旧的同步状态
      if (isUserChannel) await syncCatalog();
      await syncCredentials();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    }
  };

  const submit = async () => {
    if (!form.name.trim()) return;
    const id = `chan-${Date.now().toString(36)}`;
    upsertChannel(id, { name: form.name.trim(), kind: form.kind, protocol: form.protocol, baseUrl: form.baseUrl.trim(), authType: form.authType, note: form.note.trim() || '自定义渠道（用户自建）', enabled: true });
    // 创建渠道时同步保存凭据（鉴权方式非 none 且填了 Key）
    if (form.authType !== 'none' && form.apiKey.trim()) {
      try {
        await saveCredential(id, { baseUrl: form.baseUrl.trim(), authType: form.authType, apiKey: form.apiKey.trim() });
        toast.success(`已添加自定义渠道「${form.name.trim()}」并配置凭据`);
      } catch {
        toast.error(`已创建渠道「${form.name.trim()}」，但凭据保存失败（请确认后端凭据服务可用）`);
      }
    } else {
      toast.success(`已添加自定义渠道「${form.name.trim()}」，可在此渠道下添加模型`);
    }
    setOpen(false);
    setForm({ ...EMPTY_FORM });
  };

  const credFor = (id: string) => credentials.find((c) => c.channelId === id);

  const [editKey, setEditKey] = useState('');
  const [revealed, setRevealed] = useState<{ channelId: string; apiKey: string } | null>(null);
  const [revealing, setRevealing] = useState(false);

  const toggleReveal = async (channel: ChannelConfig) => {
    if (revealed?.channelId === channel.id) {
      setRevealed(null); // 再点隐藏，明文不留存
      return;
    }
    setRevealing(true);
    try {
      const r = await api.revealChannelCredential(channel.id);
      setRevealed({ channelId: channel.id, apiKey: r.apiKey });
      setEditKey('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '密钥解密失败（请确认后端凭据服务可用）');
    } finally {
      setRevealing(false);
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    await testChannel(id);
    setTestingId(null);
  };

  return (
    <div className="mx-auto max-w-none space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold">渠道配置</h1>
        {catalogSource === 'server' && <Badge className="font-mono text-[9px] bg-success/15 text-success">服务端目录</Badge>}
        {catalogSource === 'offline-fallback' && <Badge variant="outline" className="font-mono text-[9px] text-amber-500">服务端不可达 · 本地缓存</Badge>}
        <Button type="button" size="sm" className="ml-auto" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          添加渠道
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        内置渠道为平台集中接入（即梦/MiniMax/Grsai/Google/OpenAI/ComfyUI）；自定义渠道由你自建，可随时删除。API Key 经 workspace 服务加密存储，只写不读、不回显。
      </p>

      {/* 多选工具栏 */}
      <div className={cn('flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors', selected.length > 0 ? 'border-primary/40 bg-primary/5' : 'border-border')}>
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-2 px-2" onClick={toggleSelectAll} title={allSelected ? '取消全选' : '全选'}>
          <span className={cn('flex h-4 w-4 items-center justify-center rounded border', allSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
            {allSelected && <Check className="h-3 w-3" />}
          </span>
          全选
        </Button>
        {selected.length > 0 ? (
          <>
            <span className="text-xs text-muted-foreground">已选 <span className="font-medium text-foreground">{selected.length}</span> 个渠道</span>
            <Button type="button" size="sm" variant="destructive" className="ml-auto h-7 gap-1.5" onClick={batchDelete}>
              <Trash2 className="h-3.5 w-3.5" />
              批量删除
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => setSelected([])}>
              取消选择
            </Button>
          </>
        ) : (
          <span className="ml-auto text-[11px] text-muted-foreground">支持勾选多个渠道后批量删除，也可对单个渠道单独删除</span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {channels.map((c) => {
          const Icon = KIND_ICON[c.kind];
          const builtin = isBuiltin(c.id);
          const cred = credFor(c.id);
          const isSelected = selected.includes(c.id);
          return (
            <div key={c.id} className={cn('overflow-hidden rounded-xl border bg-card transition-all', isSelected ? 'border-primary ring-1 ring-primary/40' : c.enabled ? 'border-border' : 'border-dashed')}>
              {/* 头部：图标块 + 名称/徽标 + 右侧操作组 */}
              <div className="flex items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <button type="button" className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors', isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 hover:border-foreground')} onClick={() => toggleSelect(c.id)} title={isSelected ? '取消选择' : '选择'}>
                    {isSelected && <Check className="h-3 w-3" />}
                  </button>
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', KIND_COLOR[c.kind])}>
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-semibold">{c.name}</span>
                      <Badge variant="outline" className="shrink-0 font-mono text-[9px]">{KIND_LABEL[c.kind]}</Badge>
                      <Badge variant="outline" className="shrink-0 font-mono text-[9px]" title={PROTOCOL_DESC[c.protocol ?? 'api']}>{PROTOCOL_LABEL[c.protocol ?? 'api']}</Badge>
                      {builtin ? (
                        <Badge variant="secondary" className="shrink-0 font-mono text-[9px]" title="平台集中接入，可从当前工作区移出">
                          <Lock className="mr-0.5 inline h-2.5 w-2.5" />内置
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="shrink-0 font-mono text-[9px] text-sky-500">
                          <UserRound className="mr-0.5 inline h-2.5 w-2.5" />自定义
                        </Badge>
                      )}
                      <Badge className={cn('shrink-0 font-mono text-[9px]', c.enabled ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground')}>
                        {c.enabled ? '已启用' : '已停用'}
                      </Badge>
                    </div>
                    {c.note && <p className="mt-1 truncate text-[11px] text-muted-foreground">{c.note}</p>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {/* ① 的第①步：让后端真的去上游拉一次模型清单（与价格）。
                      失败语义原样呈现（没配 / 渠道不存在 / 上游失败 / 未装配），不折叠成"失败"。 */}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 px-2 text-[11px]"
                    disabled={syncingId === c.id}
                    title="同步上游模型目录：拉取该渠道的模型（与其价格）到本平台"
                    onClick={async () => {
                      setSyncingId(c.id);
                      try {
                        const r = await api.syncChannel(c.id);
                        setSyncResults((prev) => ({ ...prev, [c.id]: r }));
                        toast.success(
                          `「${c.name}」同步完成：新增 ${r.added} · 更新 ${r.updated} · 缺失 ${r.missing}` +
                            (r.price_changed > 0 ? ` · 变价 ${r.price_changed}` : ''),
                        );
                        // T2：同步会改平台的 last_sync_at ⇒ 必须重拉目录，否则卡片仍显示"从未同步"
                        await syncCatalog();
                      } catch (err) {
                        toast.error(`「${c.name}」同步失败：${err instanceof Error ? err.message : '未知错误'}`);
                      } finally {
                        setSyncingId(null);
                      }
                    }}
                  >
                    <RefreshCw className={cn('h-3.5 w-3.5', syncingId === c.id && 'animate-spin')} />
                    同步上游模型目录
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 px-2 text-[11px]"
                    title="策展上游模型：把该渠道同步进来的上游模型挑选进产品目录（加入后才对外可见、才参与路由）"
                    onClick={() => setCurationFor(c)}
                  >
                    <Boxes className="h-3.5 w-3.5" />
                    策展上游模型
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-7 w-7" onClick={() => upsertChannel(c.id, { enabled: !c.enabled })} title={c.enabled ? '停用' : '启用'}>
                    <Power className={cn('h-3.5 w-3.5', c.enabled && 'text-success')} />
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-7 w-7" onClick={() => openEdit(c)} title="编辑渠道">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-7 w-7" onClick={() => duplicateChannel(c.id)} title="克隆渠道（含其下模型）">
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => {
                    if (window.confirm(`删除渠道「${c.name}」？其下模型将一并移除（${builtin ? '内置渠道仅从当前工作区移除，不影响平台目录' : '自定义渠道级联清除'}）。`)) {
                      removeChannel(c.id);
                      setSelected((prev) => prev.filter((x) => x !== c.id));
                      toast.success(`已删除「${c.name}」`);
                    }
                  }} title="删除渠道">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* 主体：键值信息网格 */}
              <div className="space-y-2.5 px-4 py-3">
                {c.testNote && (
                  <p className={cn('rounded-md px-2.5 py-1.5 text-[11px]', c.lastTestOk ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive')}>{c.testNote}</p>
                )}
                <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                  <div className="min-w-0">
                    <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{c.protocol === 'local' ? '服务地址' : '接口地址'}</p>
                    <p className="mt-0.5 truncate font-mono text-xs" title={c.baseUrl}>{c.baseUrl || '未配置'}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] uppercase tracking-wide text-muted-foreground">鉴权方式</p>
                    <p className="mt-0.5 font-mono text-xs">{c.authType}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] uppercase tracking-wide text-muted-foreground">同步上游模型目录</p>
                    <p className="mt-0.5 font-mono text-xs">
                      {c.syncKind && c.syncKind !== 'none'
                        ? `${c.syncKind}${c.syncModelsPath ? ` · ${c.syncModelsPath}` : ''}`
                        : '未配置（同步配置属平台级，需在平台侧设置）'}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] uppercase tracking-wide text-muted-foreground">上次同步</p>
                    <p className="mt-0.5 font-mono text-xs">
                      {c.lastSyncAt ? c.lastSyncAt.replace('T', ' ').slice(0, 19) : '从未同步'}
                    </p>
                    {syncResults[c.id] && (
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        最近一次：新增 {syncResults[c.id].added} · 更新 {syncResults[c.id].updated} · 缺失{' '}
                        {syncResults[c.id].missing}
                      </p>
                    )}
                  </div>
                  <div className="min-w-0 sm:col-span-2">
                    <p className="text-[9px] uppercase tracking-wide text-muted-foreground">凭据状态</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                      {cred?.hasKey ? (
                        <Badge className="font-mono text-[9px] bg-success/15 text-success">
                          <ShieldCheck className="mr-1 inline h-2.5 w-2.5" />Key 已加密存储（{cred.updatedAt.slice(0, 10)}）
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="font-mono text-[9px] text-muted-foreground">未配置 Key</Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground">Key 不展示在卡片，编辑渠道后可查看/修改</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 底部：测试连通性 + 上次测试 */}
              <div className="flex items-center justify-between gap-2 border-t px-4 py-2.5">
                <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5" disabled={testingId === c.id} onClick={() => handleTest(c.id)}>
                  <PlugZap className="h-3 w-3" />
                  {testingId === c.id ? '检测中…' : '测试连通性'}
                </Button>
                {c.lastTestAt && (
                  <span className="shrink-0 font-mono text-[9px] text-muted-foreground">上次测试 {new Date(c.lastTestAt).toLocaleTimeString()}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Cloud className="h-3.5 w-3.5" />
        连通性检测由 production 服务发起真实 HTTP 探测（网络层 + 鉴权层），结果如实上报；凭据存储依赖 WORKSPACE_CRED_KEY（生产环境须注入真实密钥）。
      </p>

      {/* 编辑渠道（内置：名称/类型/鉴权方式锁定；自定义：全字段可改） */}
      {/* D2：策展面板（把上游供给挑进产品目录） */}
      <CurationPanel
        channel={curationFor}
        open={Boolean(curationFor)}
        onOpenChange={(value) => {
          if (!value) setCurationFor(null);
        }}
      />

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>编辑渠道{editing && !isBuiltin(editing.id) ? ` · ${editing.name}` : ''}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">渠道名称</Label>
                <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">接入方式（连接形态）</Label>
                <Select value={editForm.protocol} onValueChange={(v) => setEditForm({ ...editForm, protocol: v as ChannelProtocol, authType: v === 'local' ? 'none' : editForm.authType })}>
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="api">HTTP API 渠道（云服务/聚合网关）</SelectItem>
                    <SelectItem value="local">本地端口服务（ComfyUI / Ollama 等）</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">{PROTOCOL_DESC[editForm.protocol]}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="min-w-0 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">类型</Label>
                  <Select value={editForm.kind} onValueChange={(v) => setEditForm({ ...editForm, kind: v as ChannelKind })}>
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="official">官方</SelectItem>
                      <SelectItem value="aggregator">聚合</SelectItem>
                      <SelectItem value="local">本地</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">鉴权方式</Label>
                  <Select value={editForm.authType} onValueChange={(v) => setEditForm({ ...editForm, authType: v as 'bearer' | 'none' })}>
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bearer">bearer（Authorization 头）</SelectItem>
                      <SelectItem value="none">none（无需鉴权）</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{editForm.protocol === 'local' ? '服务地址（host:port）' : 'Base URL'}</Label>
                <Input value={editForm.baseUrl} onChange={(e) => setEditForm({ ...editForm, baseUrl: e.target.value })} placeholder={editForm.protocol === 'local' ? '如：http://127.0.0.1:8188' : 'https://api.example.com/v1'} />
              </div>
              {editForm.authType !== 'none' ? (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">API Key / 令牌</Label>
                  {credFor(editing.id)?.hasKey ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 rounded-md border px-2 py-1.5">
                        <code className="min-w-0 flex-1 truncate font-mono text-xs">
                          {revealed?.channelId === editing.id ? revealed.apiKey : '••••••••••••••••'}
                        </code>
                        <button type="button" className="text-muted-foreground hover:text-foreground disabled:opacity-50" disabled={revealing} onClick={() => toggleReveal(editing)} title={revealed?.channelId === editing.id ? '隐藏 Key' : '查看原始 Key'}>
                          {revealed?.channelId === editing.id ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Input type="password" value={editKey} onChange={(e) => setEditKey(e.target.value)} className="h-9 flex-1 text-xs" placeholder="输入新 Key 以覆盖（加密存储）" />
                        <Button type="button" size="sm" variant="ghost" className="h-9 text-destructive" onClick={() => { void clearCredential(editing.id).then(() => { void syncCredentials(); toast.info('已清除该渠道 Key'); }); }}>
                          清除
                        </Button>
                      </div>
                      <p className="text-[10px] text-muted-foreground">原始 Key 仅在点击眼睛时解密显示，关闭弹窗即清除，不缓存</p>
                    </div>
                  ) : (
                    <Input type="password" value={editKey} onChange={(e) => setEditKey(e.target.value)} className="h-9 text-xs" placeholder="输入 API Key（加密存储，只写不读）" />
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">API Key / 令牌</Label>
                  {credFor(editing.id)?.hasKey ? (
                    <div className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5">
                      <span className="text-[11px] text-muted-foreground">已配置凭据，但当前鉴权方式为 none（请求不会携带令牌）</span>
                      <Button type="button" size="sm" variant="ghost" className="h-6 text-destructive" onClick={() => { void clearCredential(editing.id).then(() => { void syncCredentials(); toast.info('已清除该渠道 Key'); }); }}>
                        清除
                      </Button>
                    </div>
                  ) : (
                    <p className="text-[10px] text-muted-foreground">无需鉴权：请求不携带 Authorization 头，无需配置令牌。</p>
                  )}
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">备注</Label>
                <Input value={editForm.note} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })} placeholder="一行说明" />
              </div>
            </div>
          )}
                        {editing && !isBuiltin(editing.id) && (
                <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-[11px] font-medium">同步配置（本渠道自己的）</p>
                  <p className="text-[11px] text-muted-foreground">
                    {describeSyncSource(effectiveSync(
                      { syncKind: editForm.syncKind, syncModelsPath: editForm.syncModelsPath, syncPricingPath: editForm.syncPricingPath },
                      { syncKind: editing.syncKind, syncModelsPath: editing.syncModelsPath, syncPricingPath: editing.syncPricingPath },
                    ).source)}
                    。留空（none）时会退回平台配置；要用本渠道自己的中转站，请在这里选好同步方式与路径。
                  </p>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">同步方式</Label>
                    <Select value={editForm.syncKind} onValueChange={(v) => setEditForm({ ...editForm, syncKind: v as 'none' | 'openai_compatible' })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">不配置（退回平台配置）</SelectItem>
                        <SelectItem value="openai_compatible">openai_compatible（/v1/models 风格）</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {editForm.syncKind !== 'none' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">模型列表路径</Label>
                        <Input value={editForm.syncModelsPath} onChange={(e) => setEditForm({ ...editForm, syncModelsPath: e.target.value })} placeholder="/v1/models" className="font-mono text-xs" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">价格路径（可选）</Label>
                        <Input value={editForm.syncPricingPath} onChange={(e) => setEditForm({ ...editForm, syncPricingPath: e.target.value })} placeholder="/v1/pricing" className="font-mono text-xs" />
                      </div>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">来源说明（信任备注，会随供给留痕）</Label>
                    <Input value={editForm.trustNote} onChange={(e) => setEditForm({ ...editForm, trustNote: e.target.value })} placeholder="例如：该中转站转售第三方模型，价格随上游浮动" />
                  </div>
                </div>
              )}

<DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
              取消
            </Button>
            <Button type="button" disabled={!editForm.name.trim()} onClick={submitEdit}>
              保存修改
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 添加自定义渠道 */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>添加自定义渠道</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">渠道名称</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：某某中转 API" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">接入方式（连接形态）</Label>
              <Select value={form.protocol} onValueChange={(v) => setForm({ ...form, protocol: v as ChannelProtocol, authType: v === 'local' ? 'none' : form.authType })}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="api">HTTP API 渠道（云服务/聚合网关）</SelectItem>
                  <SelectItem value="local">本地端口服务（ComfyUI / Ollama 等）</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">{PROTOCOL_DESC[form.protocol]}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs text-muted-foreground">类型</Label>
                <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as ChannelKind })}>
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="official">官方</SelectItem>
                    <SelectItem value="aggregator">聚合</SelectItem>
                    <SelectItem value="local">本地</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs text-muted-foreground">鉴权方式</Label>
                <Select value={form.authType} onValueChange={(v) => setForm({ ...form, authType: v as NewChannelForm['authType'] })}>
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bearer">bearer（Authorization 头）</SelectItem>
                    <SelectItem value="none">none（无需鉴权）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{form.protocol === 'local' ? '服务地址（host:port）' : 'Base URL'}</Label>
              <Input value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder={form.protocol === 'local' ? '如：http://127.0.0.1:8188' : 'https://api.example.com/v1'} />
            </div>
            {form.protocol === 'local' && form.authType === 'none' && (
              <p className="text-[10px] text-muted-foreground">本地端口服务通常无需鉴权；如需令牌请在鉴权方式中选择 bearer 并配置 Key。</p>
            )}
            {form.authType !== 'none' && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">API Key / 令牌</Label>
                <Input
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  placeholder="创建时一并配置，经 workspace 加密存储（只写不读）"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">备注（选填）</Label>
              <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="一行说明，如：自建中转，特价模型" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="button" disabled={!form.name.trim()} onClick={submit}>
              添加渠道{form.authType !== 'none' && form.apiKey.trim() ? '并配置凭据' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
