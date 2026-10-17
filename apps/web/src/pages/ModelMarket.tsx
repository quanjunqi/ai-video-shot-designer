// EXPORTS: default ModelMarketPage
// 模型中心 > 模型广场（TASK-IA-001 v14 §2.2）：真实调用模型 + 详情，可设为个人创作默认。
// 数据源 = useSettingsStore.models（与创作流 StageModelPicker 同源，目录/渠道停用即时反映）。
// 能力归属在「模型目录」；广场不承载归属编辑。设默认=Admin+，写入个人创作默认（Owner 已确认）。
// M2（TASK-MARKET-M2）：详情抽屉「试跑」（Admin+）→ api.runModelTest 真实调用 execution /tasks/run
// （同步真实生成，文本可跑；图片/视频走异步任务，同步试跑不支持→禁用说明）。结果如实展示 ok/上游 status/耗时/响应摘要。
import { useMemo, useState } from 'react';
import { ShoppingBag, Check, ExternalLink, Loader2, Store } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useAuthStore, ROLE_RANK } from '@/stores/useAuthStore';
import { api, type RunModelTestResponse } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import type { CatalogModel, VideoCapability, ImageCapability, TextCapability } from '@/config/models/model-catalog';

type ModelType = 'text' | 'image' | 'video';
const TYPE_LABEL: Record<ModelType, string> = { text: '文本', image: '图片', video: '视频' };

/** 起步单价（同类型排序用；跨类型不可比）。
 *  服务端 capability 以证据溯源结构返回（billing 可为空 {}，见 serverModelToLocal 原样透传），
 *  计费缺失时按正无穷垫底排序，展示层用「—」。 */
function startPrice(m: CatalogModel): number {
  const b = m.capability?.billing as { perSecondStart?: number; perImage?: number; inputPerMTok?: number } | undefined;
  if (!b) return Number.POSITIVE_INFINITY;
  if (m.type === 'video') return b.perSecondStart ?? Number.POSITIVE_INFINITY;
  if (m.type === 'image') return b.perImage ?? Number.POSITIVE_INFINITY;
  return b.inputPerMTok ?? Number.POSITIVE_INFINITY;
}

/** 计费展示容错：billing 为空对象（服务端证据结构）时显示「—」 */
function priceText(m: CatalogModel): string {
  const b = m.capability?.billing as Record<string, number> | undefined;
  if (!b) return '—';
  if (m.type === 'video') return b.perSecondStart !== undefined ? `¥${b.perSecondStart}/秒起` : '—';
  if (m.type === 'image') return b.perImage !== undefined ? `¥${b.perImage}/张` : '—';
  return b.inputPerMTok !== undefined ? `¥${b.inputPerMTok}/百万Token起` : '—';
}

/** 个人创作默认写入键（按功能类型；Owner 确认：广场设默认=个人默认 defaultPrefs） */
const DEFAULT_KEY: Record<ModelType, 'defaultTextModel' | 'defaultImageModel' | 'defaultVideoModel'> = {
  text: 'defaultTextModel',
  image: 'defaultImageModel',
  video: 'defaultVideoModel',
};

export default function ModelMarketPage() {
  const models = useSettingsStore((s) => s.models);
  const channels = useSettingsStore((s) => s.channels);
  const preferences = useSettingsStore((s) => s.preferences);
  const catalogSource = useSettingsStore((s) => s.catalogSource);
  const update = useSettingsStore((s) => s.update);
  const role = useAuthStore((s) => s.role);
  const canDefault = (ROLE_RANK[role] ?? 0) >= ROLE_RANK.admin;

  const [typeFilter, setTypeFilter] = useState<'all' | ModelType>('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [detail, setDetail] = useState<CatalogModel | null>(null);

  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? id;
  const channelDisabled = (id: string) => channels.some((c) => c.id === id && !c.enabled);

  const list = useMemo(() => {
    return models
      .filter((m) => (typeFilter === 'all' ? true : m.type === typeFilter))
      .filter((m) => (channelFilter === 'all' ? true : m.channelId === channelFilter))
      .filter((m) => (statusFilter === 'all' ? true : m.status === statusFilter))
      .sort((a, b) => startPrice(a) - startPrice(b));
  }, [models, typeFilter, channelFilter, statusFilter]);

  const channelsOfModels = [...new Set(models.map((m) => m.channelId))].map((id) => ({ id, name: channelName(id) }));

  const isDefault = (m: CatalogModel) => preferences[DEFAULT_KEY[m.type]] === m.name;

  const setDefault = (m: CatalogModel) => {
    if (!canDefault) return;
    update({ preferences: { ...preferences, [DEFAULT_KEY[m.type]]: m.name } });
    toast.success(`已将 ${m.name} 设为个人默认${TYPE_LABEL[m.type]}模型`);
  };

  return (
    <div className="space-y-4">
      {/* 筛选行：功能类型 · 渠道 · 状态（排序=同类型起步单价低到高） */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as 'all' | ModelType)}>
          <SelectTrigger className="h-9 w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类型</SelectItem>
            <SelectItem value="text">文本</SelectItem>
            <SelectItem value="image">图片</SelectItem>
            <SelectItem value="video">视频</SelectItem>
          </SelectContent>
        </Select>
        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="h-9 w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部渠道</SelectItem>
            {channelsOfModels.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | 'enabled' | 'disabled')}>
          <SelectTrigger className="h-9 w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="enabled">启用</SelectItem>
            <SelectItem value="disabled">停用</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-2xs text-muted-foreground">同类型按起步单价低到高排序</span>
      </div>

      {/* 来源状态条（TASK-MARKET-M1）：三态透明化，杜绝把演示目录当真实可调模型 */}
      {catalogSource === 'demo' && (
        <p className="rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 px-3 py-2 text-2xs text-amber-700">
          当前为本地演示目录（平台默认模型示意），并非真实接入模型；接入渠道并同步上游后，这里展示真实调用模型。
        </p>
      )}
      {catalogSource === 'server' && (
        <p className="rounded-lg border border-dashed border-border px-3 py-2 text-2xs text-muted-foreground">
          已连接模型中心，展示真实调用模型（平台目录 + 你接入并策展的模型）。
        </p>
      )}
      {catalogSource === 'offline-fallback' && (
        <p className="rounded-lg border border-dashed border-border px-3 py-2 text-2xs text-muted-foreground">
          当前展示离线缓存目录（后端不可达）；目录刷新后自动恢复平台数据。
        </p>
      )}

      {list.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-10 text-center">
          <Store className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">暂无可用模型</p>
          <p className="max-w-80 text-2xs text-muted-foreground">
            先去「渠道」接入并提供凭据，模型会出现在这里；当前可用模型可从「模型目录」查看已接入供给。
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((m) => {
            const disabled = m.status !== 'enabled' || channelDisabled(m.channelId);
            const isDef = isDefault(m);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setDetail(m)}
                className={cn(
                  'group flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-left transition-colors',
                  'hover:border-primary/40 hover:bg-accent/40',
                  disabled && 'opacity-70',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{m.name}</p>
                    <p className="truncate text-2xs text-muted-foreground">{m.providerModel}</p>
                  </div>
                  {isDef && (
                    <Badge variant="default" className="gap-1 shrink-0">
                      <Check className="h-3 w-3" />
                      默认
                    </Badge>
                  )}
                  {catalogSource === 'demo' && (
                    <Badge variant="outline" className="shrink-0 text-2xs text-amber-600">演示</Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="font-mono text-2xs">{TYPE_LABEL[m.type]}</Badge>
                  <Badge variant="outline" className="text-2xs">{channelName(m.channelId)}</Badge>
                  {disabled ? (
                    <Badge variant="destructive" className="text-2xs">
                      {channelDisabled(m.channelId) ? '渠道停用' : '已停用'}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-2xs font-mono">{priceText(m)}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-1 text-2xs text-muted-foreground">
                  <ExternalLink className="h-3 w-3" />
                  查看详情
                  {canDefault && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="ml-auto h-6 px-2 text-2xs"
                      disabled={disabled || !canDefault}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDefault(m);
                      }}
                    >
                      设为默认
                    </Button>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* 详情抽屉：capability 完整字段 + 请求形状 */}
      <Sheet open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-primary" />
              {detail?.name ?? ''}
            </SheetTitle>
            <SheetDescription>
              {detail ? `${TYPE_LABEL[detail.type]}模型 · ${channelName(detail.channelId)}` : ''}
            </SheetDescription>
          </SheetHeader>
          {detail && <ModelDetailBody m={detail} channelName={channelName} canDefault={canDefault} onDefault={() => setDefault(detail)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ModelDetailBody({
  m,
  channelName,
  canDefault,
  onDefault,
}: {
  m: CatalogModel;
  channelName: (id: string) => string;
  canDefault: boolean;
  onDefault: () => void;
}) {
  const disabled = m.status !== 'enabled';
  // M2 试跑状态：idle / running / result / error
  const [runState, setRunState] = useState<'idle' | 'running' | 'result' | 'error'>('idle');
  const [runResult, setRunResult] = useState<RunModelTestResponse | null>(null);
  const [runError, setRunError] = useState('');
  const [runMs, setRunMs] = useState(0);

  const runTest = async () => {
    setRunState('running');
    const t0 = Date.now();
    try {
      // runtime 按协议模板标准角色构造（text→messages；image→prompt，见 execution engine api_connector）
      const runtime =
        m.type === 'image'
          ? { prompt: '一张简单的测试图：纯色背景，居中一个圆' }
          : { messages: [{ role: 'user', content: '你好，请回复一句简短测试。' }] };
      const res = await api.runModelTest(m.id, runtime);
      setRunResult(res);
      setRunMs(Date.now() - t0);
      setRunState('result');
    } catch (e) {
      setRunError(e instanceof Error ? e.message : '试跑失败，请稍后重试');
      setRunState('error');
    }
  };

  const runSummary = (() => {
    if (!runResult) return '';
    const extracted = runResult.run?.extracted?.['choices.0.message.content'];
    if (typeof extracted === 'string' && extracted.trim()) return extracted.trim().slice(0, 300);
    return runResult.run?.rawBody?.slice(0, 300) ?? '（上游未返回可读内容）';
  })();

  return (
    <div className="space-y-4 text-xs">
      {m.note && <p className="text-muted-foreground">{m.note}</p>}
      <dl className="space-y-2">
        <Row k="渠道" v={channelName(m.channelId)} />
        <Row k="模型 ID" v={m.providerModel} mono />
        <Row k="家族" v={m.family} />
        <Row k="状态" v={disabled ? '已停用' : '启用'} />
        <Row k="归属" v={m.logicalModelId ? `能力：${m.logicalModelId}` : '待归属（可显式直调，不进能力路由）'} />
        {m.type === 'video' && <VideoRows m={m} />}
        {m.type === 'image' && <ImageRows m={m} />}
        {m.type === 'text' && <TextRows m={m} />}
      </dl>
      <div>
        <p className="mb-1 font-medium text-foreground">请求形状</p>
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-2xs">
          {m.method} {m.requestPath || '（由协议模板注入）'}
        </p>
      </div>

      {/* M2 试跑（真实调用；Admin+；文本/图片同步可跑，视频禁用） */}
      {canDefault && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-foreground">试跑</p>
            {m.type !== 'video' ? (
              <Button
                type="button"
                size="sm"
                className="h-7 gap-1 text-2xs"
                onClick={() => void runTest()}
                disabled={disabled || runState === 'running'}
              >
                {runState === 'running' ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                {runState === 'running' ? '调用中…' : '发起试跑'}
              </Button>
            ) : (
              <Button type="button" size="sm" variant="outline" className="h-7 text-2xs" disabled>
                视频暂不开放试跑
              </Button>
            )}
          </div>
          {m.type === 'video' && (
            <p className="text-2xs text-muted-foreground">视频生成成本较高，暂不开放同步试跑；可到创作流发起异步生成验证。</p>
          )}
          {m.type === 'image' && (
            <p className="text-2xs text-muted-foreground">图片试跑为真实生成调用（有真实成本，通常数十秒内返回）。</p>
          )}
          {runState === 'idle' && m.type === 'text' && (
            <p className="text-2xs text-muted-foreground">将对「{m.name}」发起一次真实调用（有真实成本），验证上游可用性与响应。</p>
          )}
          {runState === 'running' && (
            <p className="text-2xs text-muted-foreground">真实调用中（文本通常数秒、图片数十秒内返回）…</p>
          )}
          {runState === 'result' && runResult && (
            <div className="space-y-1 rounded-md border border-border bg-muted/30 px-2 py-1.5">
              <p className="flex flex-wrap items-center gap-1.5 text-2xs">
                <Badge variant={runResult.ok ? 'outline' : 'destructive'} className="gap-1">
                  {runResult.ok ? '成功' : '上游失败'}
                </Badge>
                <span className="font-mono text-muted-foreground">HTTP {runResult.run?.status ?? '—'}</span>
                <span className="font-mono text-muted-foreground">{runMs}ms</span>
              </p>
              <p className="whitespace-pre-wrap break-words font-mono text-2xs text-muted-foreground">{runSummary}</p>
            </div>
          )}
          {runState === 'error' && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-2xs text-destructive">
              试跑失败：{runError}
            </p>
          )}
        </div>
      )}

      {canDefault && (
        <Button type="button" size="sm" className="w-full" onClick={onDefault} disabled={disabled}>
          设为个人默认{TYPE_LABEL[m.type]}模型
        </Button>
      )}
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{k}</dt>
      <dd className={cn('text-right text-foreground', mono && 'font-mono text-2xs')}>{v}</dd>
    </div>
  );
}

function VideoRows({ m }: { m: CatalogModel }) {
  const c = m.capability as VideoCapability;
  return (
    <>
      <Row k="生成方式" v={c.modes?.join(' / ') ?? '—'} />
      <Row k="时长" v={c.minDurationSeconds != null && c.maxDurationSeconds != null ? `${c.minDurationSeconds}–${c.maxDurationSeconds}s` : '—'} />
      <Row k="参考图" v={c.maxRefImages != null ? `${c.maxRefImages} 张` : '—'} />
      <Row k="清晰度档位" v={c.qualityTiers != null ? `${c.qualityTiers} 档` : '—'} />
      <Row k="起步单价" v={priceText(m)} />
    </>
  );
}

function ImageRows({ m }: { m: CatalogModel }) {
  const c = m.capability as ImageCapability;
  return (
    <>
      <Row k="参考图生图" v={c.refImage ? '支持' : '不支持'} />
      <Row k="比例" v={c.aspectRatios?.join(' / ') ?? (c.aspectRatioCount != null ? `${c.aspectRatioCount} 种` : '—')} />
      <Row k="清晰度档位" v={c.qualityTiers != null ? `${c.qualityTiers} 档` : '—'} />
      <Row k="单价" v={priceText(m)} />
    </>
  );
}

function TextRows({ m }: { m: CatalogModel }) {
  const c = m.capability as TextCapability;
  return (
    <>
      <Row k="推理" v={c.isReasoning ? '是' : '否'} />
      <Row k="流式" v={c.streaming ? '支持' : '不支持'} />
      <Row k="最大 Token" v={c.maxTokens != null ? `${c.maxTokens}` : '—'} />
      <Row k="单价" v={priceText(m)} />
    </>
  );
}
