// EXPORTS: ModelDetailSheet
// 模型广场详情抽屉（TASK-IA-001 v14 §2.2 / TASK-MARKET-M6）：
// capability 全字段 + 协议模板名（含 async 标记）+ 文本 input/output 双价 + 能力依据（证据溯源）+
// 请求形状 + 试跑（M2 真实调用，视频禁用）+ 设默认（Admin+）。
import { useState } from 'react';
import { ShoppingBag, Loader2, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { api, type RunModelTestResponse } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import type { CatalogModel, CapabilityEvidence, ImageCapability, TextCapability, VideoCapability } from '@/config/models/model-catalog';
import { priceSourceLabel, priceText } from './modelPrice';
import { extractRunArtifact } from './modelRunArtifact';

type ModelType = 'text' | 'image' | 'video';
const TYPE_LABEL: Record<ModelType, string> = { text: '文本', image: '图片', video: '视频' };

/** 文本计费明细：独立价格列优先（TASK-MARKET-M7），回退 input/output 双价（M6）；缺失显示「—」 */
function textBilling(m: CatalogModel): string {
  if (m.priceAmount !== undefined) {
    return m.priceUnit && m.priceUnit.trim() !== '' ? `¥${m.priceAmount}/${m.priceUnit}` : `¥${m.priceAmount}`;
  }
  const b = m.capability?.billing as { inputPerMTok?: number; outputPerMTok?: number; minCharge?: number } | undefined;
  if (!b || b.inputPerMTok === undefined) return '—';
  const parts = [`输入 ¥${b.inputPerMTok}/百万Token`, `输出 ¥${b.outputPerMTok ?? 0}/百万Token`];
  if (typeof b.minCharge === 'number' && b.minCharge > 0) parts.push(`最低 ¥${b.minCharge}`);
  return parts.join(' · ');
}

/** 协议模板展示名（从 store 模板表取 label；未找到显示 id；async 追加标记） */
function templateLabel(id: string | undefined, async?: boolean): string {
  if (!id) return '（由执行器内置解析）';
  const t = useSettingsStore.getState().templates.find((x) => x.id === id);
  const base = t?.label ?? id;
  return async ? `${base}（异步任务）` : base;
}

/** 收集能力依据（证据溯源）条目：capability 中 *Source 字段 */
function evidenceEntries(m: CatalogModel): { label: string; ev: CapabilityEvidence }[] {
  const c = m.capability as unknown as Record<string, unknown>;
  const entries: { label: string; ev: CapabilityEvidence }[] = [];
  if (m.type === 'video') {
    if (c.modesSource) entries.push({ label: '生成方式依据', ev: c.modesSource as CapabilityEvidence });
    if (c.tiersSource) entries.push({ label: '清晰度/时长依据', ev: c.tiersSource as CapabilityEvidence });
  }
  if (m.type === 'image' && c.tiersSource) {
    entries.push({ label: '清晰度/比例依据', ev: c.tiersSource as CapabilityEvidence });
  }
  return entries;
}

export default function ModelDetailSheet({
  m,
  channelName,
  canDefault,
  onClose,
  onDefault,
}: {
  m: CatalogModel | null;
  channelName: (id: string) => string;
  canDefault: boolean;
  onClose: () => void;
  onDefault: (m: CatalogModel) => void;
}) {
  return (
    <Sheet open={m !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-primary" />
            {m?.name ?? ''}
          </SheetTitle>
          <SheetDescription>
            {m ? `${TYPE_LABEL[m.type]}模型 · ${channelName(m.channelId)}` : ''}
          </SheetDescription>
        </SheetHeader>
        {m && (
          <ModelDetailBody
            m={m}
            channelName={channelName}
            canDefault={canDefault}
            onDefault={() => onDefault(m)}
          />
        )}
      </SheetContent>
    </Sheet>
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
    const extracted = runResult.run?.extracted;
    // 文本优先：chat/completions 的 choices.0.message.content（执行器加 output. 前缀，双形态兼容）
    const text =
      extracted?.['choices.0.message.content'] ?? extracted?.['output.choices.0.message.content'];
    if (typeof text === 'string' && text.trim()) return text.trim().slice(0, 300);
    // 图片/产物 URL：执行器 extracted 键带 output. 前缀（curl 实证 output.data.0.url / output.image_urls.0）
    const artifact = extractRunArtifact(runResult.run);
    if (artifact) return artifact;
    return runResult.run?.rawBody?.slice(0, 300) ?? '（上游未返回可读内容）';
  })();
  // M10：图片试跑产物 URL（命中即渲染缩略图；对齐执行器 extracted 键与协议模板声明键）
  const runArtifact = extractRunArtifact(runResult?.run);

  const evidence = evidenceEntries(m);

  return (
    <div className="space-y-4 text-xs">
      {m.note && <p className="text-muted-foreground">{m.note}</p>}
      <dl className="space-y-2">
        <Row k="渠道" v={channelName(m.channelId)} />
        <Row k="模型 ID" v={m.providerModel} mono />
        <Row k="家族" v={m.family} />
        {/* TASK-MARKET-M6：协议模板（含 async 标记） */}
        <Row k="协议模板" v={templateLabel(m.protocolTemplateId, m.protocolTemplateId?.includes('img') || m.protocolTemplateId?.includes('video'))} />
        <Row k="状态" v={disabled ? '已停用' : '启用'} />
        <Row k="归属" v={m.logicalModelId ? `能力：${m.logicalModelId}` : '待归属（可显式直调，不进能力路由）'} />
        {m.type === 'video' && <VideoRows m={m} />}
        {m.type === 'image' && <ImageRows m={m} />}
        {m.type === 'text' && <TextRows m={m} />}
      </dl>

      {/* TASK-MARKET-M6：能力依据（证据溯源）——本项目专业差异化：能力声明可追溯 */}
      {evidence.length > 0 && (
        <div className="space-y-1.5 rounded-lg border border-border p-3">
          <p className="flex items-center gap-1.5 font-medium text-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            能力依据
          </p>
          {evidence.map(({ label, ev }) => (
            <div key={label} className="flex items-start justify-between gap-2 text-2xs">
              <span className="shrink-0 text-muted-foreground">{label}</span>
              <span className="flex flex-wrap items-center justify-end gap-1 text-right">
                <Badge variant="outline" className="text-2xs">{ev.source ?? '—'}</Badge>
                <Badge variant="outline" className="text-2xs">{ev.confidence ?? '—'}</Badge>
                {ev.verifiedAt && <span className="font-mono text-muted-foreground">{ev.verifiedAt}</span>}
              </span>
            </div>
          ))}
        </div>
      )}

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
              {/* M10：图片试跑产物渲染缩略图（点击原图新窗口打开）；文本/无产物时显示抽取文本 */}
              {m.type === 'image' && runArtifact ? (
                <a href={runArtifact} target="_blank" rel="noreferrer" className="block">
                  <img
                    src={runArtifact}
                    alt={`${m.name} 试跑产物`}
                    className="max-h-56 w-full rounded-md border border-border object-contain"
                  />
                </a>
              ) : (
                <p className="whitespace-pre-wrap break-words font-mono text-2xs text-muted-foreground">{runSummary}</p>
              )}
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
      <Row k="参考图/音频/视频" v={`${c.maxRefImages ?? 0} / ${c.maxRefAudios ?? 0} / ${c.maxRefVideos ?? 0}`} />
      <Row k="清晰度" v={c.resolutionOptions?.join(' / ') ?? (c.qualityTiers != null ? `${c.qualityTiers} 档` : '—')} />
      <Row k="起步单价" v={priceText(m)} />
      {priceSourceLabel(m) && <Row k="价格来源" v={priceSourceLabel(m)!} />}
    </>
  );
}

function ImageRows({ m }: { m: CatalogModel }) {
  const c = m.capability as ImageCapability;
  return (
    <>
      <Row k="参考图生图" v={c.refImage ? '支持' : '不支持'} />
      <Row k="比例" v={c.aspectRatios?.join(' / ') ?? (c.aspectRatioCount != null ? `${c.aspectRatioCount} 种` : '—')} />
      <Row k="清晰度档位" v={c.qualityOptions?.join(' / ') ?? (c.qualityTiers != null ? `${c.qualityTiers} 档` : '—')} />
      {c.maxN != null && <Row k="单次最多" v={`${c.maxN} 张`} />}
      <Row k="单价" v={priceText(m)} />
      {priceSourceLabel(m) && <Row k="价格来源" v={priceSourceLabel(m)!} />}
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
      {/* TASK-MARKET-M6：输入/输出双价 + 最低计费 */}
      <Row k="计费明细" v={textBilling(m)} />
      {priceSourceLabel(m) && <Row k="价格来源" v={priceSourceLabel(m)!} />}
    </>
  );
}
