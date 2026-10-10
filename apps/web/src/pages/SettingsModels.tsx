// EXPORTS: default SettingsModelsPage
// 模型目录（设置中心 · 三层）：渠道（来源）→ 模型（挂渠道 + 类型）→ 能力/计费（按类型分化）
// 类型 Tab：文本 / 图片 / 视频；同类型内按起步单价低到高排序（对照竞品目录）
import { useEffect, useState } from 'react';
import { Boxes, Plus, Trash2, Power, Pencil, Layers, Copy, ChevronDown, ChevronRight, Eye, Play, Loader2, CheckCircle2, XCircle, Terminal } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { type CatalogModel, type ModelType, type TextCapability, type ImageCapability, type VideoCapability, type ChannelConfig, type ModelParam, type ProtocolTemplate } from '@/config/models/model-catalog';
import { ParamEditor } from '@/components/ParamEditor';
import { ProtocolPreview } from '@/components/ProtocolPreview';
import { ProtocolParamOverrides } from '@/components/ProtocolParamOverrides';
import { api, ApiError } from '@/lib/api/client';
import type { RunModelTestResponse } from '@/lib/api/client';
import { cn } from '@/lib/utils';

const TYPE_TABS: { key: ModelType; label: string; desc: string }[] = [
  { key: 'text', label: '文本', desc: '小说、剧本、提示词优化等文本能力' },
  { key: 'image', label: '图片', desc: '静态图片、角色图和画面素材' },
  { key: 'video', label: '视频', desc: '视频片段、运镜动画和镜头成片' },
];

/** 上游/协议响应可能以 \uXXXX 转义形式返回 JSON 文本：展示前解码为可读字符 */
function decodeEscapedUnicode(s: string): string {
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

const MODE_LABEL: Record<string, string> = {
  t2v: '文生视频',
  i2v: '参考图生视频',
  first_last_frame: '首尾帧生视频',
  multi_ref: '多模态参考',
  audio_ref: '音频参考',
};

function channelName(channels: ChannelConfig[], id: string): string {
  return channels.find((c) => c.id === id)?.name ?? id;
}
function channelKind(channels: ChannelConfig[], id: string): string {
  return channels.find((c) => c.id === id)?.kind ?? 'aggregator';
}

/** 参数编辑器：请求/响应通用；支持逐条增删 + 粘贴 JSON 批量导入（对象或数组，导入即替换） */
/** 按类型渲染单价行 */
function BillingLine({ m }: { m: CatalogModel }) {
  if (m.type === 'text') {
    const c = m.capability as TextCapability | undefined;
    const b = c?.billing;
    return (
      <span className="font-mono text-[11px] text-primary">
        {b && b.inputPerMTok > 0 ? `输入 ${b.inputPerMTok}、输出 ${b.outputPerMTok} 积分/百万Token` : '计费待校准'}
        {b && b.minCharge > 0 ? ` · 每次至少 ${b.minCharge} 积分` : ''}
      </span>
    );
  }
  if (m.type === 'image') {
    const c = m.capability as ImageCapability | undefined;
    return (
      <span className="font-mono text-[11px] text-primary">
        {c?.billing && c.billing.perImage > 0 ? `${c.billing.perImage} 积分/张` : '计费待校准'}
      </span>
    );
  }
  const c = m.capability as VideoCapability | undefined;
  return (
    <span className="font-mono text-[11px] text-primary">
      {c?.billing && c.billing.perSecondStart > 0 ? `${c.billing.perSecondStart} 积分/秒起` : '计费待校准'}
    </span>
  );
}

/** 按类型渲染能力标签组（对齐竞品卡片） */
function CapabilityTags({ m }: { m: CatalogModel }) {
  if (m.type === 'text') {
    const c = m.capability as TextCapability;
    return (
      <>
        {c.isReasoning && <Badge variant="outline" className="font-mono text-[9px] text-amber-500 dark:text-amber-400">推理模型</Badge>}
        {c.streaming && <Badge variant="outline" className="font-mono text-[9px]">支持流式输出</Badge>}
        {c.systemPrompt && <Badge variant="outline" className="font-mono text-[9px]">支持系统提示词</Badge>}
        <Badge variant="outline" className="font-mono text-[9px]">Max Tokens {c.maxTokens}</Badge>
        <Badge variant="outline" className="font-mono text-[9px]">Temperature {c.temperature}</Badge>
      </>
    );
  }
  if (m.type === 'image') {
    const c = m.capability as ImageCapability;
    return (
      <>
        {c.refImage && <Badge variant="outline" className="font-mono text-[9px]">支持参考图生图</Badge>}
        <Badge variant="outline" className="font-mono text-[9px]">{c.aspectRatioCount}种比例</Badge>
        <Badge variant="outline" className="font-mono text-[9px]">{c.qualityTiers}档清晰度</Badge>
      </>
    );
  }
  const c = m.capability as VideoCapability;
  return (
    <>
      {c.modes.map((mode) => (
        <Badge key={mode} variant="outline" className="font-mono text-[9px]">{MODE_LABEL[mode]}</Badge>
      ))}
      <Badge variant="outline" className="font-mono text-[9px]">最长 {c.maxDurationSeconds}s</Badge>
      {c.maxRefImages > 0 && <Badge variant="outline" className="font-mono text-[9px]">最多 {c.maxRefImages} 张参考图</Badge>}
      {c.maxRefAudios > 0 && <Badge variant="outline" className="font-mono text-[9px]">最多 {c.maxRefAudios} 条音频</Badge>}
      <Badge variant="outline" className="font-mono text-[9px]">{c.qualityTiers}档清晰度</Badge>
    </>
  );
}

interface ModelFormState {
  name: string;
  providerModel: string;
  channelId: string;
  family: string;
  note: string;
  sort: number;
  protocolTemplateId?: string;
  requestPath: string;
  method: 'POST' | 'GET';
  params: ModelParam[];
  responseParams: ModelParam[];
  text: TextCapability;
  image: ImageCapability;
  video: VideoCapability;
}

const EMPTY_FORM: ModelFormState = {
  name: '',
  providerModel: '',
  channelId: 'grsai',
  family: '',
  note: '',
  sort: 1,
  requestPath: '',
  method: 'POST',
  params: [],
  responseParams: [],
  text: { isReasoning: false, streaming: true, systemPrompt: true, maxTokens: 8000, temperature: 0.7, billing: { inputPerMTok: 0, outputPerMTok: 0, minCharge: 0 } },
  image: { refImage: true, aspectRatioCount: 3, qualityTiers: 2, billing: { perImage: 0 } },
  video: { modes: ['t2v'], minDurationSeconds: 4, maxDurationSeconds: 15, maxRefImages: 1, maxRefAudios: 0, qualityTiers: 2, billing: { perSecondStart: 0 } },
};

export default function SettingsModelsPage() {
  const models = useSettingsStore((s) => s.models);
  const channels = useSettingsStore((s) => s.channels);
  const templates = useSettingsStore((s) => s.templates);
  const catalogSource = useSettingsStore((s) => s.catalogSource);
  const syncCatalog = useSettingsStore((s) => s.syncCatalog);
  useEffect(() => { void syncCatalog(); }, [syncCatalog]);
  const addModel = useSettingsStore((s) => s.addModel);
  const updateModel = useSettingsStore((s) => s.updateModel);
  const removeModel = useSettingsStore((s) => s.removeModel);
  const duplicateModel = useSettingsStore((s) => s.duplicateModel);
  const toggleModel = useSettingsStore((s) => s.toggleModel);
  const [tab, setTab] = useState<ModelType>('text');
  const [open, setOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const toggleSelect = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleSelectAll = () => {
    const all = list.length > 0 && selected.length === list.length;
    setSelected(all ? [] : list.map((m) => m.id));
  };
  const batchDelete = () => {
    if (selected.length === 0) return;
    selected.forEach((id) => removeModel(id));
    toast.success(`已删除 ${selected.length} 个模型`);
    setSelected([]);
  };
  const [editingId, setEditingId] = useState<string | undefined>();
  const [form, setForm] = useState<ModelFormState>({ ...EMPTY_FORM, text: { ...EMPTY_FORM.text, billing: { ...EMPTY_FORM.text.billing } }, image: { ...EMPTY_FORM.image, billing: { ...EMPTY_FORM.image.billing } }, video: { ...EMPTY_FORM.video, modes: [...EMPTY_FORM.video.modes], billing: { ...EMPTY_FORM.video.billing } } });

  // 测试调用（真实执行）：选择模型 → 编辑 runtime 业务字段 → 引擎装配发真实请求
  const [testOpen, setTestOpen] = useState(false);
  const [testModel, setTestModel] = useState<CatalogModel | null>(null);
  const [testRuntime, setTestRuntime] = useState('{\n  "messages": [\n    { "role": "user", "content": "你好，请用一句话介绍你自己" }\n  ]\n}');
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<RunModelTestResponse['run'] | null>(null);

  // runtime 占位模板按模型类型区分：文本=对话消息、图片/视频=画面描述
  const defaultRuntimeOf = (m: CatalogModel) =>
    m.type === 'text'
      ? '{\n  "messages": [\n    { "role": "user", "content": "你好，请用一句话介绍你自己" }\n  ]\n}'
      : '{\n  "prompt": "一只橘猫趴在窗台上打盹，午后阳光，写实摄影风格"\n}';

  const openTest = (m: CatalogModel) => {
    setTestModel(m);
    setTestRuntime(defaultRuntimeOf(m));
    setTestResult(null);
    setTestOpen(true);
  };
  const runTest = async () => {
    if (!testModel) return;
    let runtime: Record<string, unknown>;
    try {
      runtime = JSON.parse(testRuntime);
    } catch {
      toast.error('运行时 JSON 不合法，请检查格式');
      return;
    }
    setTestRunning(true);
    setTestResult(null);
    try {
      const res = await api.runModelTest(testModel.id, runtime);
      setTestResult(res.run);
      if (!res.ok && res.run?.error) toast.error(res.run.error);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '测试请求失败';
      toast.error(msg);
      // 非 run 结构响应（如 422 凭据缺失）也渲染到结果区，避免无反馈
      setTestResult({ status: e instanceof ApiError ? e.status : 0, duration: '-', extracted: null, rawBody: undefined, error: msg });
    } finally {
      setTestRunning(false);
    }
  };

  const openAdd = () => {
    setEditingId(undefined);
    const firstTpl = templates.find((t) => t.enabled);
    setShowAdvanced(false);
    setForm({ ...EMPTY_FORM, protocolTemplateId: firstTpl?.id, requestPath: firstTpl?.requestPath ?? '', method: firstTpl?.method ?? 'POST', params: (firstTpl?.params ?? []).map((x) => ({ ...x })), responseParams: (firstTpl?.responseParams ?? []).map((x) => ({ ...x })), text: { ...EMPTY_FORM.text, billing: { ...EMPTY_FORM.text.billing } }, image: { ...EMPTY_FORM.image, billing: { ...EMPTY_FORM.image.billing } }, video: { ...EMPTY_FORM.video, modes: [...EMPTY_FORM.video.modes], billing: { ...EMPTY_FORM.video.billing } } });
    setOpen(true);
  };
  const openEdit = (m: CatalogModel) => {
    setEditingId(m.id);
    setTab(m.type); // 编辑锁类型：编辑什么模型就是什么类型
    setShowAdvanced(false);
    const cap = m.capability as TextCapability & ImageCapability & VideoCapability;
    setForm({
      name: m.name,
      providerModel: m.providerModel ?? m.name,
      channelId: m.channelId,
      family: m.family,
      note: m.note,
      sort: m.sort,
      protocolTemplateId: m.protocolTemplateId,
      requestPath: (m.requestPath || templates.find((x) => x.id === m.protocolTemplateId)?.requestPath) ?? '',
      method: (m.method ?? templates.find((x) => x.id === m.protocolTemplateId)?.method) ?? 'POST',
      params: (m.params ?? []).map((p) => ({ ...p })),
      responseParams: (m.responseParams ?? []).map((p) => ({ ...p })),
      text: { isReasoning: !!cap.isReasoning, streaming: !!cap.streaming, systemPrompt: !!cap.systemPrompt, maxTokens: cap.maxTokens ?? 8000, temperature: cap.temperature ?? 0.7, billing: { ...cap.billing } },
      image: { refImage: !!cap.refImage, aspectRatioCount: cap.aspectRatioCount ?? 3, qualityTiers: cap.qualityTiers ?? 2, billing: { ...cap.billing } },
      video: { modes: [...(cap.modes ?? ['t2v'])], minDurationSeconds: cap.minDurationSeconds ?? 4, maxDurationSeconds: cap.maxDurationSeconds ?? 15, maxRefImages: cap.maxRefImages ?? 1, maxRefAudios: cap.maxRefAudios ?? 0, qualityTiers: cap.qualityTiers ?? 2, billing: { ...cap.billing } },
    });
    setOpen(true);
  };

  // 切换/更换协议：带出端点与方法，保留同名覆盖参数（协议里没有的旧覆盖丢弃）
  const applyTemplate = (t: ProtocolTemplate) => {
    setForm((f) => ({
      ...f,
      protocolTemplateId: t.id,
      requestPath: t.requestPath,
      method: t.method,
      params: f.params.filter((p) => t.params.some((b) => b.key === p.key)),
    }));
  };

  const submit = () => {
    if (!form.name.trim()) return;
    const capability =
      tab === 'text'
        ? { ...form.text, billing: { ...form.text.billing } }
        : tab === 'image'
          ? { ...form.image, billing: { ...form.image.billing } }
          : { ...form.video, modes: [...form.video.modes], billing: { ...form.video.billing } };
    const base = { name: form.name.trim(), providerModel: form.providerModel.trim() || form.name.trim(), channelId: form.channelId, family: form.family.trim() || form.name.trim(), note: form.note.trim(), sort: form.sort, requestPath: form.requestPath.trim(), method: form.method, params: form.params.filter((p) => p.key.trim()), responseParams: form.responseParams.filter((p) => p.key.trim()), capability };
    if (editingId) {
      updateModel(editingId, base);
      toast.success('模型能力已更新（目录版本待后端接管后留档）');
    } else {
      addModel({ ...base, type: tab, status: 'enabled' });
      toast.success(`已添加${TYPE_TABS.find((t) => t.key === tab)?.label}模型（能力由模型目录声明）`);
    }
    setOpen(false);
  };


  const list = models.filter((m) => m.type === tab).sort((a, b) => a.sort - b.sort);
  const allSelected = list.length > 0 && selected.length === list.length;

  // 预览合并视图：协议基线参数（未覆盖用模板默认值）+ 本模型覆盖/新增参数
  const mergedParams = (() => {
    const tpl = templates.find((x) => x.id === form.protocolTemplateId);
    if (!tpl) return form.params;
    const base = tpl.params.map((p) => ({ ...p }));
    for (const ov of form.params) {
      const idx = base.findIndex((p) => p.key === ov.key);
      if (idx >= 0) {
        // 覆盖模板默认值（保留来源/类型/说明，标记「模型覆盖」）
        base[idx] = { ...base[idx], value: ov.value, overridden: true };
      } else {
        base.push({ ...ov, overridden: true }); // 模型新增参数
      }
    }
    return base;
  })();

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold">模型配置</h1>
        {catalogSource === 'server' && <Badge className="font-mono text-[9px] bg-success/15 text-success">服务端目录</Badge>}
        {catalogSource === 'offline-fallback' && <Badge variant="outline" className="font-mono text-[9px] text-amber-500">服务端不可达 · 本地缓存</Badge>}
        <Button type="button" size="sm" className="ml-auto" onClick={openAdd}>
          <Plus className="h-3.5 w-3.5" />
          添加模型
        </Button>
      </div>

      {/* 类型 Tab（对齐竞品分页） */}
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card p-1">
        {TYPE_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs transition-colors',
              tab === t.key ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}模型
          </button>
        ))}
        <span className="ml-auto hidden pr-2 text-[10px] text-muted-foreground sm:block">
          {TYPE_TABS.find((t) => t.key === tab)?.desc} · 按起步单价从低到高排列
        </span>
      </div>

      {/* 多选操作条 */}
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-2">
        <label className="flex cursor-pointer items-center gap-1.5 px-1 text-xs">
          <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="accent-primary" />
          全选
        </label>
        <span className="text-[11px] text-muted-foreground">
          {selected.length > 0 ? `已选 ${selected.length} 个模型` : '支持多选后批量删除，也可对单个模型单独删除'}
        </span>
        {selected.length > 0 && (
          <Button type="button" size="sm" variant="destructive" className="ml-auto h-7" onClick={batchDelete}>
            <Trash2 className="h-3.5 w-3.5" />
            删除选中
          </Button>
        )}
      </div>

      {/* 模型卡片列表 */}
      <div className="space-y-2">
        {list.map((m) => (
          <div key={m.id} className="rounded-xl border border-border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <input type="checkbox" checked={selected.includes(m.id)} onChange={() => toggleSelect(m.id)} className="accent-primary" title="选择" />
              <span className="text-sm font-medium">{m.name}</span>
              <Badge variant="secondary" className="font-mono text-[9px]">
                <Layers className="mr-1 inline h-2.5 w-2.5" />
                {channelName(channels, m.channelId)} · {channelKind(channels, m.channelId) === 'official' ? '官方' : channelKind(channels, m.channelId) === 'aggregator' ? '聚合' : '本地'}
              </Badge>
              <BillingLine m={m} />
              <Badge className={cn('ml-auto font-mono text-[9px]', m.status === 'enabled' ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground')}>
                {m.status === 'enabled' ? '已启用' : '已停用'}
              </Badge>
              <div className="flex items-center gap-1">
                <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-primary" onClick={() => openTest(m)} title="测试调用：真实发请求验证模型/渠道/协议">
                  <Play className="h-3.5 w-3.5" />
                  <span className="ml-1 text-[11px]">测试</span>
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-7 w-7" onClick={() => openEdit(m)} title="编辑能力">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-7 w-7" onClick={() => duplicateModel(m.id)} title="克隆模型">
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-7 w-7" onClick={() => toggleModel(m.id)} title={m.status === 'enabled' ? '停用' : '启用'}>
                  <Power className={`h-3.5 w-3.5 ${m.status === 'enabled' ? 'text-success' : 'text-muted-foreground'}`} />
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-7 w-7" onClick={() => removeModel(m.id)} title="删除">
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>
            {m.note && <p className="mt-1.5 text-[11px] text-muted-foreground">{m.note}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {m.requestPath && (
                <Badge variant="outline" className="font-mono text-[9px] text-muted-foreground">
                  端点 {m.method} {m.requestPath}
                </Badge>
              )}
              {m.providerModel && m.providerModel !== m.name && (
                <Badge variant="outline" className="font-mono text-[9px] text-muted-foreground">
                  ID {m.providerModel}
                </Badge>
              )}
              {(m.params ?? []).filter((p) => p.key).length > 0 && (
                <Badge variant="outline" className="font-mono text-[9px] text-muted-foreground">
                  {m.params.filter((p) => p.key).length} 个参数
                </Badge>
              )}
              <CapabilityTags m={m} />
            </div>
          </div>
        ))}
        {list.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-xs text-muted-foreground">
            暂无{TYPE_TABS.find((x) => x.key === tab)?.label}模型，点击「添加模型」创建
          </div>
        )}
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Boxes className="h-3.5 w-3.5" />
        模型目录 = 平台默认共享（渠道/能力/计费），production 服务版本化留档；已提交任务固定模型 / 参数版本，未知模型保持不可执行。
      </p>

      {/* 添加 / 编辑模型 */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑模型能力' : '添加模型'}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[62vh] space-y-3 overflow-y-auto pr-1 [scrollbar-gutter:stable] scroll-smooth">
            {!editingId && (
              <div className="flex items-center gap-1 rounded-lg border border-border p-1">
                {TYPE_TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    className={cn(
                      'flex-1 rounded-md px-2 py-1 text-[11px] transition-colors',
                      tab === t.key ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">协议模板（请求规则：端点/参数/响应映射）</Label>
              <Select value={form.protocolTemplateId ?? ''} onValueChange={(v) => {
                const t = templates.find((x) => x.id === v);
                if (t) applyTemplate(t);
              }}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="选择协议模板" />
                </SelectTrigger>
                <SelectContent>
                  {templates.filter((t) => t.enabled && ((t.type ?? 'all') === 'all' || (t.type ?? 'all') === tab)).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label}{t.builtin ? '' : '（自定义）'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">{templates.find((x) => x.id === form.protocolTemplateId)?.desc ?? '选择协议模板：自动带出端点、请求参数与响应解析；未选择则使用模型级字段'}{form.protocolTemplateId ? '；换模板会保留同名覆盖参数' : ''}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs text-muted-foreground">模型名（展示名）</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：gpt-image-2" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">模型标识（provider 侧 ID）</Label>
                <Input value={form.providerModel} onChange={(e) => setForm({ ...form, providerModel: e.target.value })} placeholder="如：gpt-image-2-20260801（留空用模型名）" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs text-muted-foreground">来源渠道</Label>
                <Select value={form.channelId} onValueChange={(v) => setForm({ ...form, channelId: v })}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {channels.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs text-muted-foreground">模型家族（同家族跨渠道）</Label>
                <Input value={form.family} onChange={(e) => setForm({ ...form, family: e.target.value })} placeholder="如：MiniMax H3" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">排序（起步单价低到高）</Label>
                <Input type="number" value={form.sort} onChange={(e) => setForm({ ...form, sort: Number(e.target.value) || 1 })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">模型介绍</Label>
              <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="一行介绍，如：openai 最强图片模型" />
            </div>

            {/* 高级配置（协议预置，折叠） */}
            <Collapsible
              open={showAdvanced}
              onOpenChange={(v) => {
                setShowAdvanced(v);
                // 展开后把折叠区滚动进可视区（微交互：避免内容被裁切无提示）
                if (v) requestAnimationFrame(() => {
                  const t = document.querySelector('[data-slot="dialog-content"] button[type="button"]');
                  const scroller = t?.closest('[class*="overflow-y-auto"]') as HTMLElement | null;
                  const openEl = document.querySelector('[data-slot="dialog-content"] div[data-state="open"]');
                  if (scroller && openEl) scroller.scrollTo({ top: Math.max(0, (openEl as HTMLElement).offsetTop - scroller.offsetTop - 8), behavior: 'smooth' });
                });
              }}
              className="rounded-lg border border-border bg-muted/30"
            >
              <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-2.5 py-2">
                <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  {showAdvanced ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                  <span className="truncate">高级配置 · 协议预置（{templates.find((x) => x.id === form.protocolTemplateId)?.label ?? '未关联'}），一般无需修改</span>
                </span>
                <span className="shrink-0 rounded border px-1.5 py-0.5 text-[9px] text-muted-foreground">{showAdvanced ? '收起' : '展开'}</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 px-2.5 pb-2.5">
            <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-2.5">
              <p className="text-[11px] font-medium text-muted-foreground">请求配置（渠道 BaseURL 之上）</p>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <div className="min-w-0 space-y-1">
                  <Label className="text-[10px] text-muted-foreground">请求路径（端点）</Label>
                  <Input value={form.requestPath} onChange={(e) => setForm({ ...form, requestPath: e.target.value })} placeholder="如：/video_generation（留空=跟随协议模板路径）" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">方式</Label>
                  <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v as 'POST' | 'GET' })}>
                    <SelectTrigger className="h-9 w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="POST">POST</SelectItem>
                      <SelectItem value="GET">GET</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">执行时请求 = 渠道 BaseURL + 模型请求路径；不同厂商同渠道（如聚合网关）可各自指定端点。</p>
            </div>

            {/* 能力字段（按类型） */}
            {tab === 'text' && (
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-2.5">
                <div className="flex flex-wrap gap-3 text-[11px]">
                  {(['isReasoning', 'streaming', 'systemPrompt'] as const).map((k) => (
                    <label key={k} className="flex cursor-pointer items-center gap-1">
                      <input type="checkbox" checked={form.text[k]} onChange={(e) => setForm({ ...form, text: { ...form.text, [k]: e.target.checked } })} className="accent-primary" />
                      {k === 'isReasoning' ? '推理模型' : k === 'streaming' ? '流式输出' : '系统提示词'}
                    </label>
                  ))}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div className="min-w-0 space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Max Tokens</Label>
                    <Input type="number" value={form.text.maxTokens} onChange={(e) => setForm({ ...form, text: { ...form.text, maxTokens: Number(e.target.value) || 0 } })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Temperature</Label>
                    <Input type="number" step="0.1" value={form.text.temperature} onChange={(e) => setForm({ ...form, text: { ...form.text, temperature: Number(e.target.value) || 0 } })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">输入 积分/百万Token</Label>
                    <Input type="number" step="0.01" value={form.text.billing.inputPerMTok} onChange={(e) => setForm({ ...form, text: { ...form.text, billing: { ...form.text.billing, inputPerMTok: Number(e.target.value) || 0 } } })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">输出 积分/百万Token</Label>
                    <Input type="number" step="0.01" value={form.text.billing.outputPerMTok} onChange={(e) => setForm({ ...form, text: { ...form.text, billing: { ...form.text.billing, outputPerMTok: Number(e.target.value) || 0 } } })} />
                  </div>
                </div>
              </div>
            )}
            {tab === 'image' && (
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-2.5">
                <label className="flex cursor-pointer items-center gap-1 text-[11px]">
                  <input type="checkbox" checked={form.image.refImage} onChange={(e) => setForm({ ...form, image: { ...form.image, refImage: e.target.checked } })} className="accent-primary" />
                  支持参考图生图
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <div className="min-w-0 space-y-1">
                    <Label className="text-[10px] text-muted-foreground">比例数量</Label>
                    <Input type="number" value={form.image.aspectRatioCount} onChange={(e) => setForm({ ...form, image: { ...form.image, aspectRatioCount: Number(e.target.value) || 1 } })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">清晰度档位</Label>
                    <Input type="number" value={form.image.qualityTiers} onChange={(e) => setForm({ ...form, image: { ...form.image, qualityTiers: Number(e.target.value) || 1 } })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">积分/张</Label>
                    <Input type="number" step="0.5" value={form.image.billing.perImage} onChange={(e) => setForm({ ...form, image: { ...form.image, billing: { ...form.image.billing, perImage: Number(e.target.value) || 0 } } })} />
                  </div>
                </div>
              </div>
            )}
            {tab === 'video' && (
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-2.5">
                {/* 能力字段 video 开头占位 */}
                <div className="flex flex-wrap gap-2 text-[11px]">
                  {(['t2v', 'i2v', 'first_last_frame', 'multi_ref', 'audio_ref'] as const).map((mode) => (
                    <label key={mode} className="flex cursor-pointer items-center gap-1">
                      <input
                        type="checkbox"
                        checked={form.video.modes.includes(mode)}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            video: {
                              ...form.video,
                              modes: e.target.checked ? [...form.video.modes, mode] : form.video.modes.filter((x) => x !== mode),
                            },
                          })
                        }
                        className="accent-primary"
                      />
                      {MODE_LABEL[mode]}
                    </label>
                  ))}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div className="min-w-0 space-y-1">
                    <Label className="text-[10px] text-muted-foreground">最短秒数</Label>
                    <Input type="number" value={form.video.minDurationSeconds} onChange={(e) => setForm({ ...form, video: { ...form.video, minDurationSeconds: Number(e.target.value) || 1 } })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">最长秒数（容量）</Label>
                    <Input type="number" value={form.video.maxDurationSeconds} onChange={(e) => setForm({ ...form, video: { ...form.video, maxDurationSeconds: Number(e.target.value) || 1 } })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">最多参考图</Label>
                    <Input type="number" value={form.video.maxRefImages} onChange={(e) => setForm({ ...form, video: { ...form.video, maxRefImages: Number(e.target.value) || 0 } })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">积分/秒起</Label>
                    <Input type="number" step="0.5" value={form.video.billing.perSecondStart} onChange={(e) => setForm({ ...form, video: { ...form.video, billing: { ...form.video.billing, perSecondStart: Number(e.target.value) || 0 } } })} />
                  </div>
                </div>
              </div>
            )}

            {/* 参数配置：请求参数 = 协议基线覆盖（改默认值/新增参数）；响应参数 = 模型级独立 */}
            <ProtocolParamOverrides
              base={(templates.find((x) => x.id === form.protocolTemplateId)?.params ?? [])}
              overrides={form.params}
              onChange={(v) => setForm({ ...form, params: v })}
            />
            <ParamEditor
              title="响应参数（响应字段映射，可选）"
              desc="留空 = 执行器按已知 provider 内置解析；异构返回时在此定义提取路径（如 content、taskId、imageUrl）。"
              params={form.responseParams}
              onChange={(v) => setForm({ ...form, responseParams: v })}
              keyPlaceholder="响应字段（如 choices.0.message.content）"
              valuePlaceholder="说明（如 提取文本正文）"
            />
              </CollapsibleContent>
            </Collapsible>
          </div>
          <DialogFooter className="justify-between">
            <Button type="button" variant="outline" disabled={!form.channelId} onClick={() => setPreviewOpen(true)} title={form.channelId ? '预览该模型实际请求形态（含所选渠道与协议）' : '请先选择渠道'}>
              <Eye className="h-3.5 w-3.5" />预览请求
            </Button>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button type="button" disabled={!form.name.trim()} onClick={submit}>
                {editingId ? '保存修改' : '添加'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 协议请求预览弹窗（用当前表单值 + 所选渠道） */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>协议请求预览 · {form.name || '未命名模型'}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[65vh] overflow-y-auto pr-1">
            <ProtocolPreview
              baseUrl={channels.find((c) => c.id === form.channelId)?.baseUrl ?? ''}
              authType={channels.find((c) => c.id === form.channelId)?.authType ?? 'bearer'}
              method={form.method}
              requestPath={(form.requestPath || templates.find((x) => x.id === form.protocolTemplateId)?.requestPath) ?? ''}
              params={mergedParams}
              responseParams={form.responseParams}
              providerModel={form.providerModel.trim() || form.name.trim()}
            />
            {form.protocolTemplateId && (
              <p className="mt-2 text-[10px] text-muted-foreground">
                协议模板：{templates.find((x) => x.id === form.protocolTemplateId)?.label ?? '未关联'}（基线参数 + 本模型覆盖合并渲染；
                请求路径未单独填写时跟随协议）
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 测试调用弹窗（真实执行：引擎按来源装配并发真实请求） */}
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-primary" />
              测试调用 · {testModel?.name ?? ''}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[68vh] space-y-3 overflow-y-auto pr-1">
            {testModel && (
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                渠道 <span className="font-mono text-foreground">{channelName(channels, testModel.channelId)}</span>
                <span className="mx-1.5 text-muted-foreground/60">·</span>
                协议 <span className="font-mono text-foreground">{templates.find((t) => t.id === testModel.protocolTemplateId)?.label ?? '未关联'}</span>
                <span className="mx-1.5 text-muted-foreground/60">·</span>
                provider ID <span className="font-mono text-foreground">{testModel.providerModel || testModel.name}</span>
                {testModel.requestPath && (
                  <>
                    <span className="mx-1.5 text-muted-foreground/60">·</span>
                    端点 <span className="font-mono text-foreground">{testModel.method} {testModel.requestPath}</span>
                  </>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">运行时字段（role=runtime 的业务值：messages 等）</Label>
                <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-muted-foreground" onClick={() => setTestResult(null)} title="清空上次结果">
                  清空结果
                </Button>
              </div>
              <textarea
                value={testRuntime}
                onChange={(e) => setTestRuntime(e.target.value)}
                spellCheck={false}
                className="h-28 w-full resize-none rounded-lg border border-border bg-card p-2.5 font-mono text-[11px] leading-relaxed text-foreground outline-none focus:border-primary/60"
              />
              <p className="text-[10px] text-muted-foreground">
                该模型引用协议中 role=model 字段自动注入 provider ID、role=static 字段使用模板默认值；这里只需填写本次业务内容（如对话消息）。
              </p>
            </div>
            {testResult && (
              <div className={cn('space-y-2 rounded-lg border p-3', testResult.status >= 200 && testResult.status < 300 ? 'border-success/30 bg-success/5' : 'border-destructive/30 bg-destructive/5')}>
                <div className="flex flex-wrap items-center gap-2">
                  {testResult.status >= 200 && testResult.status < 300 ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-destructive" />
                  )}
                  <span className="text-xs font-medium">{testResult.status >= 200 && testResult.status < 300 ? '调用成功' : '调用失败'}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">HTTP {testResult.status || '-'} · {testResult.duration}</span>
                  {testResult.error && <span className="w-full break-all font-mono text-[10px] text-destructive">{decodeEscapedUnicode(testResult.error)}</span>}
                </div>
                {testResult.extracted && Object.keys(testResult.extracted).length > 0 && (
                  <div className="rounded-md bg-card p-2.5">
                    <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">响应映射提取（按模型响应解析规则）</p>
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed text-foreground">{JSON.stringify(testResult.extracted, null, 2)}</pre>
                  </div>
                )}
                {testResult.rawBody && (
                  <details className="group">
                    <summary className="cursor-pointer text-[10px] text-muted-foreground">原始响应体</summary>
                    <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-card p-2.5 font-mono text-[10px] leading-relaxed text-muted-foreground">{decodeEscapedUnicode(testResult.rawBody)}</pre>
                  </details>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTestOpen(false)}>关闭</Button>
            <Button type="button" disabled={testRunning} onClick={runTest}>
              {testRunning ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  请求中…
                </>
              ) : (
                <>
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                  发送真实请求
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
