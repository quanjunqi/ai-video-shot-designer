// EXPORTS: default ModelChannelsPage
// 模型中心 > 渠道（TASK-IA-001 v14 §2.4）：模型从哪来——渠道接入与连通检测。
// 浏览/连通检测=全员；接入/凭据/同步上游/删除=Admin+（操作入口按角色渲染）。
// 删除渠道=确认弹窗 + 其模型禁用/移除（引用模型的项目提示由后端/任务上下文兜底）。
// 每渠道「策展入口」保留（ADR-005 D4：用户自己渠道的详情有权知道能调什么）。
import { useState } from 'react';
import { Cable, Plus, Trash2, RefreshCw, Loader2, CheckCircle2, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import CurationPanel from '@/features/settings/CurationPanel';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useAuthStore, ROLE_RANK } from '@/stores/useAuthStore';
import type { ChannelConfig } from '@/config/models/model-catalog';

interface AddForm {
  name: string;
  kind: 'aggregator' | 'official' | 'local';
  protocol: 'api' | 'local';
  baseUrl: string;
  authType: 'bearer' | 'none';
  apiKey: string;
}

const EMPTY_FORM: AddForm = { name: '', kind: 'aggregator', protocol: 'api', baseUrl: '', authType: 'bearer', apiKey: '' };

export default function ModelChannelsPage() {
  const channels = useSettingsStore((s) => s.channels);
  const credentials = useSettingsStore((s) => s.credentials);
  const catalogSource = useSettingsStore((s) => s.catalogSource);
  const upsertChannel = useSettingsStore((s) => s.upsertChannel);
  const removeChannel = useSettingsStore((s) => s.removeChannel);
  const testChannel = useSettingsStore((s) => s.testChannel);
  const syncCatalog = useSettingsStore((s) => s.syncCatalog);
  const saveCredential = useSettingsStore((s) => s.saveCredential);
  const syncCredentials = useSettingsStore((s) => s.syncCredentials);
  const role = useAuthStore((s) => s.role);
  const canWrite = (ROLE_RANK[role] ?? 0) >= ROLE_RANK.admin;

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AddForm>({ ...EMPTY_FORM });
  const [testingId, setTestingId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ChannelConfig | null>(null);
  const [curationFor, setCurationFor] = useState<ChannelConfig | null>(null);

  const credFor = (id: string) => credentials.find((c) => c.channelId === id);

  const handleTest = async (id: string) => {
    setTestingId(id);
    await testChannel(id);
    setTestingId(null);
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncCatalog();
      await syncCredentials();
      toast.success('已同步上游目录与用户渠道');
    } finally {
      setSyncing(false);
    }
  };

  const submit = async () => {
    if (!form.name.trim()) return;
    const id = `chan-${Date.now().toString(36)}`;
    upsertChannel(id, {
      name: form.name.trim(),
      kind: form.kind,
      protocol: form.protocol,
      baseUrl: form.baseUrl.trim(),
      authType: form.authType,
      note: form.name.trim() || '自定义渠道（用户自建）',
      enabled: true,
    });
    if (form.authType !== 'none' && form.apiKey.trim()) {
      try {
        await saveCredential(id, { baseUrl: form.baseUrl.trim(), authType: form.authType, apiKey: form.apiKey.trim() });
        toast.success(`已添加渠道「${form.name.trim()}」并配置凭据`);
      } catch {
        toast.error(`已创建渠道「${form.name.trim()}」，但凭据保存失败（请确认后端凭据服务可用）`);
      }
    } else {
      toast.success(`已添加渠道「${form.name.trim()}」，模型可在此渠道下通过同步/添加补充`);
    }
    setOpen(false);
    setForm({ ...EMPTY_FORM });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    removeChannel(deleteTarget.id);
    toast.success(`已删除渠道「${deleteTarget.name}」及其模型（引用项目需重新配置模型）`);
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-2xs text-muted-foreground">
          数据源：{catalogSource === 'server' ? '平台目录' : catalogSource === 'offline-fallback' ? '离线缓存（后端不可达）' : '内置演示目录'}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {canWrite && (
            <Button type="button" size="sm" variant="outline" onClick={() => void handleSync()} disabled={syncing}>
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              同步上游
            </Button>
          )}
          {canWrite && (
            <Button type="button" size="sm" onClick={() => setOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              添加渠道
            </Button>
          )}
        </div>
      </div>

      {channels.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-10 text-center">
          <Cable className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">还没有渠道</p>
          <p className="max-w-80 text-2xs text-muted-foreground">添加或同步渠道后，其模型会出现在「模型广场」与「模型目录」；归属可在目录后补。</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {channels.map((c) => {
            const cred = credFor(c.id);
            return (
              <div key={c.id} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{c.name}</p>
                    <p className="font-mono text-2xs text-muted-foreground">{c.id}</p>
                  </div>
                  {c.enabled ? (
                    <Badge variant="outline" className="gap-1 text-2xs">
                      <CheckCircle2 className="h-3 w-3 text-primary" />
                      启用
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="text-2xs">停用</Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-2xs">
                  <Badge variant="outline" className="font-mono text-2xs">{c.kind}</Badge>
                  <Badge variant="outline" className="font-mono text-2xs">{c.protocol}</Badge>
                  <Badge variant={cred?.hasKey ? 'outline' : 'secondary'} className="text-2xs">
                    {cred?.hasKey ? '凭据已配置' : '未配置凭据'}
                  </Badge>
                  {c.lastTestOk === true && <Badge variant="outline" className="text-2xs">连通 ✓</Badge>}
                  {c.lastTestOk === false && <Badge variant="destructive" className="text-2xs">不连通</Badge>}
                </div>
                <p className="text-2xs text-muted-foreground">
                  {c.lastTestAt ? `上次检测 ${new Date(c.lastTestAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : '尚未检测'}
                  {c.lastSyncAt ? ` · 同步 ${new Date(c.lastSyncAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
                </p>
                <div className="mt-auto flex flex-wrap items-center gap-1 pt-1">
                  <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-2xs" onClick={() => void handleTest(c.id)} disabled={testingId === c.id}>
                    {testingId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    连通检测
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-2xs" onClick={() => setCurationFor(c)}>
                    <Eye className="h-3 w-3" />
                    策展
                  </Button>
                  {canWrite && (
                    <Button type="button" size="sm" variant="ghost" className="ml-auto h-7 w-7 p-0 text-destructive" title="删除渠道" onClick={() => setDeleteTarget(c)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-2xs text-muted-foreground">
        同步上游 = 拉取平台目录预览并合并（模型归属在「模型目录」后补）；同步配置属平台级，前端只读投影（lastSyncAt 来自服务端）。
        删除渠道会级联移除其模型，历史任务引用不受影响（只读快照）。
      </p>

      {/* 添加渠道（Admin+）：表单 + 凭据只写不读 */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>添加渠道</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="min-w-0 space-y-1.5">
              <Label className="text-xs">渠道名称</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如 火山方舟 / 自建网关" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs">类型</Label>
                <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as AddForm['kind'] })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aggregator">聚合网关</SelectItem>
                    <SelectItem value="official">官方渠道</SelectItem>
                    <SelectItem value="local">本地服务</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs">协议</Label>
                <Select value={form.protocol} onValueChange={(v) => setForm({ ...form, protocol: v as AddForm['protocol'] })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="api">API 接入</SelectItem>
                    <SelectItem value="local">本地执行</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label className="text-xs">Base URL</Label>
              <Input value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://api.example.com/v1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs">鉴权方式</Label>
                <Select value={form.authType} onValueChange={(v) => setForm({ ...form, authType: v as AddForm['authType'] })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bearer">Bearer Token</SelectItem>
                    <SelectItem value="none">无鉴权</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs">API Key（只写不读）</Label>
                <Input type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder="sk-…" disabled={form.authType === 'none'} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button type="button" onClick={() => void submit()} disabled={!form.name.trim()}>
              添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认（R-CRUD-002）：确认弹窗 + 级联移除模型 */}
      <Dialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>删除渠道「{deleteTarget?.name ?? ''}」？</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            将同时移除该渠道下的模型（广场/目录不可再选）。历史任务的模型引用为只读快照，不受影响；如需恢复需重新添加。
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button type="button" variant="destructive" onClick={() => void confirmDelete()}>确认删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 每渠道策展入口（ADR-005 D4：用户自己渠道的详情） */}
      <CurationPanel channel={curationFor} open={Boolean(curationFor)} onOpenChange={(value) => { if (!value) setCurationFor(null); }} />
    </div>
  );
}
