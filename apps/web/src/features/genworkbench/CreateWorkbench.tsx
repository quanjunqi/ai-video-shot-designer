// EXPORTS: default CreateWorkbench
//
// 智能创作统一工作台（ADR-006 D1/D2/D5）：
//   左栏 = 提示词工作区（composer）：模型档位 → 参考图 → 提示词 → 能力胶囊 → 参数 → 费用 → 生成
//   右栏 = 结果主舞台：主预览 + 缩略图网格
//
// 与改造前的区别（都在 ADR-006 §2 有实测证据）：
//   · 参数控件由**模型目录能力**推导（useCreateControls），不再是每页写死的 options 数组
//   · 模型不支持的控件**不渲染**（例如无 i2v 的模型不出现参考图入口），而不是渲染后置灰
//   · 费用由目录 billing 计算，随张数/秒数变化，不再是写死的 unitCost 字符串
//   · 时长/数量/参考图上限在**提交前**校验并给出字段级原因
//   · 空闲时停止轮询（不再无条件每 2s 拉一次）
//
// 本片（TASK-CREATE-002）只做布局与控件接线；结果元数据/复用参数/取消重试/草稿持久化
// 分别在 TASK-CREATE-003/004 落地。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, AudioLines, ChevronDown, Download, History, Image as ImageIcon,
  Info, Loader2, RefreshCw, Settings2, Sparkles, Video, Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import EmptyState from '@/components/common/EmptyState';
import MentionTextarea from '@/features/genworkbench/MentionTextarea';
import ReferenceBar, { type RefItem } from '@/features/genworkbench/ReferenceBar';
import { useCreateControls } from '@/hooks/useCreateControls';
import { GENERATION_MODE_LABEL, type ControlDef, type CreateKind } from '@/config/create/control-schema';
import { useAssetStore } from '@/stores/useAssetStore';
import { useShallow } from 'zustand/react/shallow';
import { placeholderUrl } from '@/lib/placeholder';
import { parseMentions, type LocalRef } from '@/lib/mentions';
import { api, type ServerTask } from '@/lib/api/client';
import { cn } from '@/lib/utils';

const KIND_META: Record<CreateKind, { title: string; icon: typeof ImageIcon; accent: string; emptyHint: string }> = {
  image: {
    title: '图片创作',
    icon: ImageIcon,
    accent: 'text-primary',
    emptyHint: '写提示词，点生成；参考图贴在提示词上方并用 @ 引用',
  },
  video: {
    title: '视频创作',
    icon: Video,
    accent: 'text-sky-500',
    emptyHint: '描述镜头与运镜，时长上限由所选模型的能力决定',
  },
  audio: {
    title: '音频创作',
    icon: AudioLines,
    accent: 'text-emerald-500',
    emptyHint: '输入合成文本并选择音色',
  },
};

const CATALOG_SOURCE_NOTE: Record<string, { label: string; className: string }> = {
  server: { label: '服务端目录', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  'offline-fallback': { label: '离线缓存目录', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  demo: { label: '演示目录', className: 'bg-muted text-muted-foreground' },
};

// 参考图 → @引用素材：自由图按顺序编号「本图N」，首/尾帧固定名（沿用改造前语义）
function buildLocalRefs(refs: RefItem[]): LocalRef[] {
  let n = 0;
  const out: LocalRef[] = [];
  for (const r of refs) {
    if (r.slot === 'first') out.push({ id: r.id, name: '首帧', thumb: r.url });
    else if (r.slot === 'last') out.push({ id: r.id, name: '尾帧', thumb: r.url });
    else {
      n += 1;
      out.push({ id: r.id, name: `本图${n}`, thumb: r.url });
    }
  }
  return out;
}

const isActive = (task: ServerTask) => task.status === 'queued' || task.status === 'running';

export default function CreateWorkbench({
  kind,
  projectId,
  episodeId,
  assetId,
  scopeEpoch = 0,
}: {
  kind: CreateKind;
  projectId?: string;
  episodeId?: string;
  assetId?: string;
  scopeEpoch?: number;
}) {
  const navigate = useNavigate();
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  const controls = useCreateControls(kind);
  const { schema, model, values, setValue, issueFor, canSubmit, cost, catalogSource, models } = controls;

  const assets = useAssetStore(useShallow((s) => s.assets));
  const [refs, setRefs] = useState<RefItem[]>([]);
  const [jobs, setJobs] = useState<ServerTask[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // ---- 结果区：拉取 + 空闲即停的轮询 ----
  const loadJobs = useCallback(async (mode: 'boot' | 'manual' | 'poll' = 'poll') => {
    if (mode === 'boot') setLoadingJobs(true);
    if (mode === 'manual') setRefreshing(true);
    try {
      const result = await api.listTasks(undefined, kind);
      setJobs(result.items.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)));
    } catch (cause) {
      if (mode !== 'poll') toast.error(cause instanceof Error ? cause.message : '任务服务暂时不可用');
    } finally {
      if (mode === 'boot') setLoadingJobs(false);
      if (mode === 'manual') setRefreshing(false);
    }
  }, [kind]);

  const activeCount = jobs.filter(isActive).length;
  const activeRef = useRef(0);
  useEffect(() => {
    activeRef.current = activeCount;
  }, [activeCount]);

  useEffect(() => {
    const boot = window.setTimeout(() => void loadJobs('boot'), 0);
    // 空闲时（无排队/运行中任务）不轮询；页面不可见时也不轮询，回前台立即补一次
    const timer = window.setInterval(() => {
      if (document.hidden || activeRef.current === 0) return;
      void loadJobs('poll');
    }, 2000);
    const onVisible = () => {
      if (!document.hidden) void loadJobs('poll');
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(boot);
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadJobs]);

  const activeTask = jobs.find(isActive);
  const succeeded = useMemo(() => jobs.filter((j) => j.status === 'succeeded'), [jobs]);
  const preview = useMemo(
    () => jobs.find((j) => j.id === selectedId) ?? activeTask ?? succeeded[0] ?? jobs[0],
    [jobs, selectedId, activeTask, succeeded],
  );

  // ---- 提交 ----
  const promptText = values.prompt ?? '';
  const submit = useCallback(async () => {
    if (!canSubmit) return;
    const localRefs = buildLocalRefs(refs);
    const { mentions } = parseMentions(promptText, assets, localRefs);
    const quantity = Math.min(8, Math.max(1, Number.parseInt(values.count ?? '1', 10) || 1));
    const tagParts: string[] = [];
    if (refs.length > 0) tagParts.push(`参考图×${refs.length}`);
    if (mentions.length > 0) tagParts.push(`@引用×${mentions.length}`);
    const tag = tagParts.length > 0 ? `（${tagParts.join(' · ')}）` : '';
    const references = refs.map((ref) => ({ id: ref.id, slot: ref.slot, url: ref.url }));
    const mentionsPayload = mentions.map(({ kind: mk, id, name, version, category }) => ({ kind: mk, id, name, version, category }));

    setSubmitting(true);
    const results = await Promise.allSettled(
      Array.from({ length: quantity }, (_, index) => {
        const base = `${meta.title} · ${promptText}`;
        const label = quantity > 1 ? `${base}${tag} · 候选 ${index + 1}/${quantity}` : `${base}${tag}`;
        const payload = {
          prompt: promptText,
          parameters: values,
          model_id: model?.id,
          protocol_template_id: model?.protocolTemplateId,
          references,
          mentions: mentionsPayload,
          reference_count: refs.length,
          quantity,
          candidate_index: index,
        };
        if (projectId) {
          return api.createGenerationIntent({
            project_id: projectId,
            episode_id: episodeId,
            asset_id: assetId,
            kind,
            label,
            payload,
            scope_epoch: scopeEpoch,
          });
        }
        return api.createTask({
          kind,
          label,
          payload,
          cost_estimate: cost ? `${cost.points} 积分` : undefined,
          context_path: `/create/${kind}`,
        });
      }),
    );
    setSubmitting(false);

    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - ok;
    if (ok > 0) {
      toast.success(projectId ? `已提交 ${ok} 个生成意图` : `已提交 ${ok} 个任务`);
      await loadJobs('poll');
    }
    if (failed > 0) {
      const first = results.find((r) => r.status === 'rejected');
      toast.error(first?.status === 'rejected' && first.reason instanceof Error ? first.reason.message : '部分任务提交失败');
    }
  }, [canSubmit, refs, promptText, assets, values, meta.title, model, projectId, episodeId, assetId, kind, scopeEpoch, cost, loadJobs]);

  // Enter 提交 / Shift+Enter 换行；⌘/Ctrl+Enter 亦提交。
  // 只在事件源确实是 textarea 时拦截，避免影响 @ 下拉里的按钮。
  const onComposerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement | null)?.tagName !== 'TEXTAREA') return;
    if (e.key !== 'Enter') return;
    if (e.shiftKey) return;
    e.preventDefault();
    void submit();
  };

  const sourceNote = CATALOG_SOURCE_NOTE[catalogSource] ?? CATALOG_SOURCE_NOTE.demo;
  const advancedControls: ControlDef[] = schema.controls.filter((c) => c.key === 'negative' || c.key === 'quality');
  const inlineControls: ControlDef[] = schema.controls.filter((c) => c.key !== 'prompt' && !advancedControls.includes(c));
  const promptIssue = issueFor('prompt');

  // 无可用模型：给真实空态并指向设置中心（不回退到硬编码模型名）
  if (models.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6">
        <EmptyState
          icon={Settings2}
          title={`${meta.title}暂无可用模型`}
          description={
            kind === 'audio'
              ? '模型目录当前不含音频类型（type 仅支持 text/image/video），音频执行链路尚未接入。'
              : '请先在设置中心启用渠道并添加该类型的模型，页面会自动读取目录能力生成参数。'
          }
          actionLabel={kind === 'audio' ? undefined : '去设置中心'}
          onAction={kind === 'audio' ? undefined : () => navigate('/settings/models')}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-[1500px] grid-cols-1 gap-4 px-4 py-4 xl:grid-cols-[380px_minmax(0,1fr)]">
      {/* ============ 左：提示词工作区 ============ */}
      <div className="min-w-0 space-y-3 self-start rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Icon className={cn('h-4 w-4', meta.accent)} />
          <span className="text-sm font-medium">{meta.title}</span>
          <span className={cn('ml-auto rounded px-1.5 py-px text-[10px]', sourceNote.className)}>{sourceNote.label}</span>
        </div>

        {/* 模型档位：独立于参数之外的选择，旁标单价，让"选模型"成为可比较的决策 */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">模型档位</Label>
          <Select value={model?.id ?? ''} onValueChange={(v) => controls.selectModel(v)}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="选择模型" />
            </SelectTrigger>
            <SelectContent>
              {models.map((m) => {
                const channel = controls.channels.find((c) => c.id === m.channelId);
                return (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                    {channel ? ` · ${channel.name}` : ''}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {model?.note && <p className="text-[10px] leading-relaxed text-muted-foreground">{model.note}</p>}
        </div>

        {/* 能力胶囊：来自 capability.modes，模型支持什么就显示什么 */}
        {schema.modes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {schema.modes.map((mode) => (
              <span key={mode} className="rounded-full bg-accent/70 px-2 py-0.5 text-[10px] text-accent-foreground">
                {GENERATION_MODE_LABEL[mode]}
              </span>
            ))}
          </div>
        )}

        <div className="space-y-3" onKeyDown={onComposerKeyDown}>
          {/* 参考图：只有模型声明了参考图能力才出现 */}
          {schema.limits.maxRefImages > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                参考图
                <span className="ml-1 text-[10px] font-normal">上限 {schema.limits.maxRefImages} 张</span>
              </Label>
              <ReferenceBar
                mode={kind === 'video' ? 'video' : 'image'}
                refs={refs}
                onChange={(next) => {
                  const capped = next.slice(0, schema.limits.maxRefImages);
                  if (capped.length < next.length) toast.warning(`该模型最多 ${schema.limits.maxRefImages} 张参考图`);
                  setRefs(capped);
                  controls.setRefCount(capped.length);
                }}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              提示词 <span className="text-destructive">*</span>
            </Label>
            <MentionTextarea
              value={promptText}
              onChange={(v) => setValue('prompt', v)}
              rows={5}
              localRefs={buildLocalRefs(refs)}
              placeholder="描述画面；输入 @ 可引用参考图，Enter 提交，Shift+Enter 换行"
            />
            {promptIssue && <p className="text-[10px] text-destructive">{promptIssue}</p>}
          </div>

          {/* 常显参数：最高频的 3 个以内 */}
          {inlineControls.map((control) => (
            <div key={control.key} className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {control.label}
                {control.source === 'count-fallback' && (
                  <span className="ml-1 text-[10px] font-normal text-muted-foreground/70" title="目录只声明了数量，具体取值清单待目录声明（ADR-006 D3）">
                    ·取值待目录声明
                  </span>
                )}
              </Label>
              {control.type === 'chips' ? (
                <div className="flex flex-wrap gap-1.5">
                  {(control.options ?? []).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setValue(control.key, option)}
                      className={cn(
                        'rounded-md border px-2 py-1 font-mono text-[11px] transition',
                        values[control.key] === option
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              ) : control.type === 'select' ? (
                <Select value={values[control.key] ?? ''} onValueChange={(v) => setValue(control.key, v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(control.options ?? []).map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type="number"
                  value={values[control.key] ?? ''}
                  min={control.min}
                  max={control.max}
                  step={control.step}
                  onChange={(e) => setValue(control.key, e.target.value)}
                  className="h-9 text-xs"
                />
              )}
              {issueFor(control.key) && <p className="text-[10px] text-destructive">{issueFor(control.key)}</p>}
              {control.min !== undefined && control.max !== undefined && control.type === 'number' && !issueFor(control.key) && (
                <p className="text-[10px] text-muted-foreground">该模型支持 {control.min}–{control.max}</p>
              )}
            </div>
          ))}
        </div>

        {/* 高级参数：渐进披露（ADR-005 的结论：数据分层 ≠ 界面分层） */}
        {advancedControls.length > 0 && (
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger className="flex w-full items-center gap-1.5 rounded-md px-1 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground">
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', advancedOpen && 'rotate-180')} />
              高级参数
              <span className="ml-auto font-mono text-[10px]">{advancedControls.length}</span>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-2">
              {advancedControls.map((control) => (
                <div key={control.key} className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{control.label}</Label>
                  {control.type === 'textarea' ? (
                    <MentionTextarea
                      value={values[control.key] ?? ''}
                      onChange={(v) => setValue(control.key, v)}
                      rows={3}
                      localRefs={buildLocalRefs(refs)}
                      disableMention
                      placeholder="不希望在画面中出现的内容"
                    />
                  ) : (
                    <Select value={values[control.key] ?? ''} onValueChange={(v) => setValue(control.key, v)}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(control.options ?? []).map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* 费用 + 提交 */}
        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Wallet className="h-3.5 w-3.5" />
            {cost ? (
              <>
                <span className="font-mono text-foreground">{cost.points} 积分</span>
                <span className="truncate text-[10px]">{cost.detail}</span>
              </>
            ) : (
              <span className="text-[10px]">该模型按上游用量结算，提交前无法预估</span>
            )}
          </div>
          <p className="text-[10px] leading-relaxed text-muted-foreground">排队等待不消耗积分；失败退回以平台额度账本为准。</p>
          <Button type="button" size="sm" className="w-full" disabled={submitting || !canSubmit} onClick={() => void submit()}>
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {submitting ? '提交中…' : '生成'}
          </Button>
          {!canSubmit && controls.issues.length > 0 && (
            <ul className="space-y-0.5">
              {controls.issues.slice(0, 3).map((issue) => (
                <li key={`${issue.field}-${issue.message}`} className="flex items-start gap-1 text-[10px] text-destructive">
                  <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                  {issue.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ============ 右：结果主舞台 ============ */}
      <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">结果</span>
          <Badge variant="outline" className="font-mono text-[10px]">{jobs.length}</Badge>
          {activeCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-primary">
              <Loader2 className="h-3 w-3 animate-spin" />
              {activeCount} 个进行中
            </span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto"
            title="刷新结果"
            aria-label="刷新结果"
            disabled={refreshing}
            onClick={() => void loadJobs('manual')}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          </Button>
        </div>

        {loadingJobs ? (
          <div className="flex flex-1 items-center justify-center gap-2 py-20 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> 正在加载任务
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState icon={Icon} title="还没有生成结果" description={meta.emptyHint} />
          </div>
        ) : (
          <>
            {/* 主预览：占满宽度，状态与失败原因就地可见 */}
            {preview && (
              <div className="overflow-hidden rounded-lg border border-border">
                <div className="relative flex aspect-video items-center justify-center bg-muted">
                  {isActive(preview) ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      <span className="font-mono text-[11px]">
                        {preview.status === 'queued' ? '排队中' : `${preview.progress}%`}
                      </span>
                    </div>
                  ) : preview.status === 'succeeded' ? (
                    <>
                      <img
                        src={placeholderUrl(`gen-${preview.id}`)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-contain"
                      />
                      <span className="absolute bottom-2 left-2 rounded bg-background/80 px-1.5 py-px text-[10px] text-muted-foreground">
                        演示占位图（真实产物未接入）
                      </span>
                    </>
                  ) : (
                    <div className="max-w-[80%] space-y-2 text-center">
                      <AlertTriangle className="mx-auto h-5 w-5 text-destructive" />
                      <div className="text-[11px] text-destructive">{preview.error ?? (preview.status === 'cancelled' ? '已取消' : '生成失败')}</div>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-border p-2">
                  <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{preview.label}</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      'font-mono text-[9px]',
                      preview.status === 'succeeded' && 'border-success/40 text-success',
                      preview.status === 'failed' && 'border-destructive/40 text-destructive',
                    )}
                  >
                    {preview.status}
                  </Badge>
                  <span className="font-mono text-[9px] text-muted-foreground">{preview.cost_estimate ?? '—'}</span>
                  {preview.status === 'succeeded' && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-6 gap-1 text-[10px]"
                      onClick={() => toast.success('演示：已加入下载队列')}
                    >
                      <Download className="h-3 w-3" />
                      下载
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* 缩略图网格：点击切换主预览 */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {jobs.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => setSelectedId(job.id)}
                  className={cn(
                    'min-w-0 overflow-hidden rounded-lg border text-left transition',
                    preview?.id === job.id ? 'border-primary' : 'border-border hover:border-primary/40',
                  )}
                >
                  <div className="relative flex aspect-square items-center justify-center bg-muted">
                    {isActive(job) ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : job.status === 'succeeded' ? (
                      <img src={placeholderUrl(`gen-${job.id}`)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-muted-foreground">{job.status === 'cancelled' ? '已取消' : '失败'}</span>
                    )}
                  </div>
                  <div className="truncate px-1.5 py-1 text-[10px] text-muted-foreground">{job.label}</div>
                </button>
              ))}
            </div>

            <p className="flex items-start gap-1 text-[10px] leading-relaxed text-muted-foreground">
              <Info className="mt-px h-3 w-3 shrink-0" />
              结果历史与任务中心同源；参数复用、取消与重试将在下一片（TASK-CREATE-003）接上。
            </p>
          </>
        )}
      </div>
    </div>
  );
}
