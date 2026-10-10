import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Boxes, Plus, Trash2, Pencil, Copy, Power, ChevronDown, ChevronRight, Eye, TimerReset } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { ParamEditor } from '@/components/ParamEditor';
import { ProtocolPreview } from '@/components/ProtocolPreview';
import { ProtocolEvidence } from '@/components/ProtocolEvidence';
import { useSettingsStore } from '@/stores/useSettingsStore';
import type { ProtocolTemplate, ModelParam, ProtocolAsync } from '@/config/models/model-catalog';

interface TemplateFormState {
  label: string;
  desc: string;
  type: 'text' | 'image' | 'video' | 'all';
  requestPath: string;
  method: 'POST' | 'GET';
  params: ModelParam[];
  responseParams: ModelParam[];
  async?: ProtocolAsync;
}

const EMPTY_TEMPLATE: TemplateFormState = {
  label: '',
  desc: '',
  type: 'all',
  requestPath: '',
  method: 'POST',
  params: [],
  responseParams: [],
  async: undefined,
};

const TEMPLATE_TYPES: { key: 'text' | 'image' | 'video' | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'text', label: '文本' },
  { key: 'image', label: '图片' },
  { key: 'video', label: '视频' },
];
const TYPE_LABEL: Record<'text' | 'image' | 'video' | 'all', string> = { text: '文本', image: '图片', video: '视频', all: '通用' };

export default function SettingsProtocolsPage() {
  const templates = useSettingsStore((s) => s.templates);
  const models = useSettingsStore((s) => s.models);
  const catalogSource = useSettingsStore((s) => s.catalogSource);
  const syncCatalog = useSettingsStore((s) => s.syncCatalog);
  const upsertTemplate = useSettingsStore((s) => s.upsertTemplate);
  const removeTemplate = useSettingsStore((s) => s.removeTemplate);

  useEffect(() => { void syncCatalog(); }, [syncCatalog]);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [form, setForm] = useState<TemplateFormState>({ ...EMPTY_TEMPLATE });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [asyncOpen, setAsyncOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<ProtocolTemplate | undefined>(undefined);
  const [typeTab, setTypeTab] = useState<'text' | 'image' | 'video' | 'all'>('all');

  const refCountOf = (id: string) => models.filter((m) => m.protocolTemplateId === id).length;

  const openAdd = () => {
    setEditingId(undefined);
    setShowAdvanced(false);
    setForm({ ...EMPTY_TEMPLATE });
    setOpen(true);
  };
  const openEdit = (t: ProtocolTemplate) => {
    // 内置模板在界面上只读（B4a）。后端本就拒绝（handler.go 映射 400 BUILTIN_PROTECTED），
    // 此前界面仍提供「编辑」入口 ⇒ 用户点开、填写、保存后才拿到 400 —— 界面在说谎。
    if (t.builtin) { toast.error('平台预置模板只读；如需修改请「复制为自定义」后编辑副本'); return; }
    setEditingId(t.id);
    setShowAdvanced(false);
    setForm({ label: t.label, desc: t.desc, type: t.type ?? 'all', requestPath: t.requestPath, method: t.method, params: t.params.map((p) => ({ ...p })), responseParams: t.responseParams.map((p) => ({ ...p })), async: t.async ? { ...t.async } : undefined });
    setOpen(true);
  };
  const duplicate = (t: ProtocolTemplate) => {
    const copy: ProtocolTemplate = { ...t, id: `pt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 16)}`.slice(0, 24), label: `${t.label} 副本`, builtin: false, enabled: true, refCount: 0, version: 1, params: t.params.map((p) => ({ ...p })), responseParams: t.responseParams.map((p) => ({ ...p })), async: t.async ? { ...t.async } : undefined };
    upsertTemplate(copy);
    toast.success(`已复制协议「${t.label}」为自定义模板`);
  };
  const submit = () => {
    if (!form.label.trim() || !form.requestPath.trim()) {
      if (form.async?.enabled) {
        const pp = form.async.pollPath?.trim() ?? '';
        if (!pp) {
          toast.error('启用异步任务时必须填写轮询路径');
          return;
        }
        if (!pp.includes('{task_id}')) {
          toast.error('轮询路径必须包含 {task_id} 占位符');
          return;
        }
      }
      toast.error('协议名称与请求路径必填');
      return;
    }
    if (editingId) {
      const exist = templates.find((t) => t.id === editingId);
      if (exist) {
        upsertTemplate({ ...exist, ...form, params: form.params.map((p) => ({ ...p })), responseParams: form.responseParams.map((p) => ({ ...p })), async: form.async ? { ...form.async } : undefined });
        toast.success('协议已更新：所有引用该协议的模型自动生效');
      }
    } else {
      upsertTemplate({ id: '', label: form.label, desc: form.desc, type: form.type, requestPath: form.requestPath, method: form.method, params: form.params.map((p) => ({ ...p })), responseParams: form.responseParams.map((p) => ({ ...p })), async: form.async ? { ...form.async } : undefined, builtin: false, enabled: true, refCount: 0, version: 1 });
      toast.success('自定义协议已创建');
    }
    setOpen(false);
  };
  const removeOne = (t: ProtocolTemplate) => {
    if (t.builtin) { toast.error('平台预置模板不可删除，可停用或复制为自定义后修改'); return; }
    const refs = refCountOf(t.id);
    if (refs > 0) { toast.error(`有 ${refs} 个模型引用该协议，请先在模型中更换协议`); return; }
    removeTemplate(t.id);
    toast.success(`已删除协议「${t.label}」`);
  };
  const toggleEnabled = (t: ProtocolTemplate) => {
    upsertTemplate({ ...t, enabled: !t.enabled });
  };
  const toggleSelect = (id: string) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleSelectAll = () => setSelected(selected.length === templates.length ? [] : templates.map((t) => t.id));
  const batchRemove = () => {
    const targets = templates.filter((t) => selected.includes(t.id));
    const blockedBuiltin = targets.filter((t) => t.builtin);
    const blockedRef = targets.filter((t) => !t.builtin && refCountOf(t.id) > 0);
    const ok = targets.filter((t) => !t.builtin && refCountOf(t.id) === 0);
    if (blockedBuiltin.length) toast.error(`跳过 ${blockedBuiltin.length} 个内置模板（平台预置不可删除）`);
    if (blockedRef.length) toast.error(`跳过 ${blockedRef.length} 个被引用模板（请先更换模型引用）`);
    if (ok.length) {
      ok.forEach((t) => removeTemplate(t.id));
      toast.success(`已删除 ${ok.length} 个协议`);
      setSelected([]);
    }
  };

  const sorted = useMemo(() => {
    const byType = typeTab === 'all' ? templates : templates.filter((t) => (t.type ?? 'all') === typeTab || (t.type ?? 'all') === 'all');
    return [...byType].sort((a, b) => Number(b.builtin) - Number(a.builtin) || a.label.localeCompare(b.label));
  }, [templates, typeTab]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">协议配置</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            平台预置协议模板 + 自定义模板；模型只引用不复制——改一处协议，所有引用模型自动生效。
            {catalogSource === 'server' ? '（已连接服务端）' : catalogSource === 'offline-fallback' ? '（离线降级态：变更未同步服务端）' : '（本地演示态）'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selected.length > 0 && (
            <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={batchRemove}>
              <Trash2 className="h-3.5 w-3.5" />删除选中（{selected.length}）
            </Button>
          )}
          <Button size="sm" className="h-8 text-xs" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5" />新增协议
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card p-1">
        {TEMPLATE_TYPES.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTypeTab(t.key)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs transition-colors',
              typeTab === t.key ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
            <span className="ml-1 font-mono text-[9px] text-muted-foreground/60">
              {t.key === 'all' ? templates.length : templates.filter((x) => (x.type ?? 'all') === t.key || (x.type ?? 'all') === 'all').length}
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Checkbox checked={templates.length > 0 && selected.length === templates.length} onCheckedChange={toggleSelectAll} className="h-3.5 w-3.5" />
        <span>全选（{selected.length}/{templates.length}）</span>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {sorted.map((t) => {
          const refs = refCountOf(t.id);
          const sel = selected.includes(t.id);
          return (
            <div key={t.id} className={`overflow-hidden rounded-xl border bg-card transition-all ${sel ? 'border-primary ring-1 ring-primary/40' : 'border-border'}`}>
              {/* 头部：图标块 + 名称/徽标 + 右侧操作组 */}
              <div className="flex items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Checkbox checked={sel} onCheckedChange={() => toggleSelect(t.id)} className="mt-0.5 h-4 w-4" />
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Boxes className="h-4.5 w-4.5" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-semibold">{t.label}</span>
                      <Badge variant="outline" className={`shrink-0 font-mono text-[9px] ${t.type === 'all' ? 'text-violet-400' : t.type === 'text' ? 'text-primary' : t.type === 'image' ? 'text-emerald-400' : 'text-amber-400'}`}>{TYPE_LABEL[t.type ?? 'all']}</Badge>
                      {t.builtin && <Badge variant="secondary" className="shrink-0 font-mono text-[9px]">平台预置</Badge>}
                      <Badge variant={t.enabled ? 'outline' : 'destructive'} className="shrink-0 font-mono text-[9px]">{t.enabled ? '启用' : '停用'}</Badge>
                      <Badge variant="outline" className="shrink-0 font-mono text-[9px]">v{t.version}</Badge>
                    </div>
                    {t.desc && <p className="mt-1 truncate text-[11px] text-muted-foreground">{t.desc}</p>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button type="button" size="sm" variant="ghost" className="h-7 w-7" onClick={() => toggleEnabled(t)} title={t.enabled ? '停用' : '启用'}>
                    <Power className={`h-3.5 w-3.5 ${t.enabled ? 'text-primary' : 'text-muted-foreground'}`} />
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-7 w-7" onClick={() => duplicate(t)} title="复制为自定义模板">
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  {!t.builtin && (
                    <Button type="button" size="sm" variant="ghost" className="h-7 w-7" onClick={() => openEdit(t)} title="编辑协议">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  )}
                  {!t.builtin && (
                    <Button type="button" size="sm" variant="ghost" className="h-7 w-7" onClick={() => removeOne(t)} title={t.builtin ? '平台预置不可删除' : '删除协议'}>
                    <Trash2 className={`h-3.5 w-3.5 ${t.builtin ? 'text-muted-foreground/40' : 'text-destructive'}`} />
                  </Button>
                  )}
                </div>
              </div>

              {/* 主体：端点 + 参数摘要 */}
              <div className="space-y-1.5 px-4 py-3">
                <div className="flex items-center gap-2">
                  {t.async?.enabled && (
                    <Badge className="shrink-0 gap-1 bg-primary/10 font-mono text-[10px] text-primary">
                      <TimerReset className="h-2.5 w-2.5" />异步任务
                    </Badge>
                  )}
                  <Badge variant="outline" className="shrink-0 font-mono text-[10px] text-primary">{t.method}</Badge>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs" title={t.requestPath || '（渠道 BaseURL）'}>{t.requestPath || '（渠道 BaseURL）'}</span>
                  <Button type="button" size="sm" variant="outline" className="h-6 shrink-0 gap-1 text-[10px]" onClick={() => setPreview(t)}>
                    <Eye className="h-3 w-3" />预览请求
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
                  <span>请求参数 {t.params.length} 项</span>
                  <span>响应映射 {t.responseParams.length} 项</span>
                  <span>引用模型 {refs} 个</span>
                </div>
                {/* ADR-008 §3：两类证据并列呈现（无证据时不渲染） */}
                <ProtocolEvidence template={t} />
              </div>
            </div>
          );
        })}
        {templates.length === 0 && (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            暂无协议模板
          </div>
        )}
      </div>

      {/* 请求预览弹窗 */}
      <Dialog open={!!preview} onOpenChange={(v) => { if (!v) setPreview(undefined); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>协议请求预览 · {preview?.label}</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="max-h-[65vh] overflow-y-auto pr-1">
              <ProtocolPreview
                baseUrl=""
                authType="bearer"
                method={preview.method}
                requestPath={preview.requestPath}
                params={preview.params}
                responseParams={preview.responseParams}
                async={preview.async}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑协议模板' : '新增协议模板'}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-2">
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs text-muted-foreground">协议名称</Label>
                <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="如：XX 视频（异步任务）" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">适用类型</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as 'text' | 'image' | 'video' | 'all' })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">通用（全部模型可选）</SelectItem>
                    <SelectItem value="text">文本模型</SelectItem>
                    <SelectItem value="image">图片模型</SelectItem>
                    <SelectItem value="video">视频模型</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">请求方法</Label>
              <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v as 'POST' | 'GET' })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="GET">GET</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">请求路径（相对渠道 BaseURL）</Label>
              <Input value={form.requestPath} onChange={(e) => setForm({ ...form, requestPath: e.target.value })} placeholder="如 /v1/video_generation（留空 = 渠道 BaseURL）" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">协议说明</Label>
              <Input value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} placeholder="说明协议适用场景与解析方式" />
            </div>
            <Collapsible open={asyncOpen} onOpenChange={setAsyncOpen} className="rounded-lg border border-border bg-muted/30">
              <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-2.5 py-2">
                <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  {asyncOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                  异步任务模式
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {form.async?.enabled && <Badge className="bg-primary/10 font-mono text-[9px] text-primary">已启用</Badge>}
                  <Switch checked={!!form.async?.enabled} onCheckedChange={(v) => setForm({ ...form, async: { enabled: v, taskIdField: form.async?.taskIdField ?? '', statusField: form.async?.statusField ?? '', doneValue: form.async?.doneValue ?? '', failValue: form.async?.failValue ?? '', pollPath: form.async?.pollPath ?? '' } })} className="h-4 w-7" />
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 px-2.5 pb-2.5">
                <p className="text-[10px] text-muted-foreground">
                  适用于「提交 → 轮询 → 完成/失败」的异步生成类协议（视频/长任务）；轮询间隔与超时由执行器内置，模板只声明字段与判定值。
                </p>
                {form.async?.enabled && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="min-w-0 space-y-1">
                      <Label className="text-[10px] text-muted-foreground">任务 ID 字段</Label>
                      <Input className="h-8 text-xs" value={form.async?.taskIdField ?? ''} onChange={(e) => setForm({ ...form, async: { ...(form.async ?? { enabled: true, taskIdField: '', statusField: '', doneValue: '', failValue: '', pollPath: '' }), taskIdField: e.target.value } })} placeholder="如 task_id" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">状态字段</Label>
                      <Input className="h-8 text-xs" value={form.async?.statusField ?? ''} onChange={(e) => setForm({ ...form, async: { ...(form.async ?? { enabled: true, taskIdField: '', statusField: '', doneValue: '', failValue: '', pollPath: '' }), statusField: e.target.value } })} placeholder="如 status" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">完成判定值</Label>
                      <Input className="h-8 text-xs" value={form.async?.doneValue ?? ''} onChange={(e) => setForm({ ...form, async: { ...(form.async ?? { enabled: true, taskIdField: '', statusField: '', doneValue: '', failValue: '', pollPath: '' }), doneValue: e.target.value } })} placeholder="如 SUCCESS" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">失败判定值</Label>
                      <Input className="h-8 text-xs" value={form.async?.failValue ?? ''} onChange={(e) => setForm({ ...form, async: { ...(form.async ?? { enabled: true, taskIdField: '', statusField: '', doneValue: '', failValue: '', pollPath: '' }), failValue: e.target.value } })} placeholder="如 FAILED" />
                    </div>
                      <div className="col-span-2 min-w-0 space-y-1">
                        <Label className="text-[10px] text-muted-foreground">轮询路径（必填）</Label>
                        <Input className="h-8 text-xs" value={form.async?.pollPath ?? ''} onChange={(e) => setForm({ ...form, async: { ...(form.async ?? { enabled: true, taskIdField: '', statusField: '', doneValue: '', failValue: '', pollPath: '' }), pollPath: e.target.value } })} placeholder="如 /v1/video/generations/{task_id}" />
                        <p className="text-[10px] text-muted-foreground">
                          必须包含 <span className="font-mono">{"{task_id}"}</span> 占位符 —— 执行器用 ReplaceAll 替换它；
                          留空或不含占位符会静默指向错误地址（曾导致视频异步任务全部轮询失败）
                        </p>
                      </div>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>

            <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced} className="rounded-lg border border-border bg-muted/30">
              <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-2.5 py-2">
                <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  {showAdvanced ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                  请求参数 / 响应映射
                </span>
                <span className="shrink-0 rounded border px-1.5 py-0.5 text-[9px] text-muted-foreground">{showAdvanced ? '收起' : '展开'}</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 px-2.5 pb-2.5">
                <ParamEditor
                  title="请求参数（透传执行器）"
                  desc="provider 特有请求参数模板（如 stream=false）；执行器合并模型覆盖值后发送。"
                  params={form.params}
                  onChange={(v) => setForm({ ...form, params: v })}
                />
                <ParamEditor
                  title="响应参数（响应字段映射）"
                  desc="异构返回时在此定义提取路径（如 content、taskId、imageUrl）；留空 = 执行器按已知 provider 内置解析。"
                  params={form.responseParams}
                  onChange={(v) => setForm({ ...form, responseParams: v })}
                  mode="response"
                  keyPlaceholder="响应字段（如 choices.0.message.content）"
                  valuePlaceholder="说明（如 提取文本正文）"
                />
              </CollapsibleContent>
            </Collapsible>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>取消</Button>
            <Button size="sm" onClick={submit}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
