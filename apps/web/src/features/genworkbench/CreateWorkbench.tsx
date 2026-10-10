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
  AlertTriangle, AudioLines, Ban, ChevronDown, Download, HelpCircle, History, Image as ImageIcon,
  Info, Loader2, RefreshCw, RotateCw, Settings2, Sparkles, Video, Wallet, Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import EmptyState from '@/components/common/EmptyState';
import MentionTextarea from '@/features/genworkbench/MentionTextarea';
import ReferenceBar, { type RefItem } from '@/features/genworkbench/ReferenceBar';
import {
  attemptsNote, canCancel, canRetry, cancelPlan, extractResultUrl, formatTaskTime,
  mediaKind, parseTaskPayload, reusableDraft,
} from '@/features/genworkbench/result-utils';
import { useCreateControls } from '@/hooks/useCreateControls';
import { useCreatePrefsStore } from '@/stores/useCreatePrefsStore';
import { parseParamJson, toParamJson } from '@/features/genworkbench/param-json';
import {
  GENERATION_MODE_LABEL, TIER_LABEL, controlsUpToTier, hasTier,
  type ControlDef, type CreateKind,
} from '@/config/create/control-schema';
import { useAssetStore } from '@/stores/useAssetStore';
import { useLensStore } from '@/stores/useLensStore';
import { useStyleStore } from '@/stores/useStyleStore';
import {
  isFragmentApplied, lensFragment, styleFragment, toggleFragment,
} from '@/features/genworkbench/prompt-presets';
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
  const { schema, model, values, submitValues, setValue, issueFor, canSubmit, cost, catalogSource, models, draftRestored } = controls;

  const assets = useAssetStore(useShallow((s) => s.assets));
  // 预设来源：风格库（用户可管理，仅取启用项）与镜头语言库
  const styles = useStyleStore(useShallow((s) => s.styles.filter((item) => item.enabled)));
  const lensItems = useLensStore(useShallow((s) => s.items));
  const [presetsOpen, setPresetsOpen] = useState(false);
  // 显示偏好（档位 / 表单或 JSON 视图）是"怎么看"，与草稿内容分开持久化
  const tier = useCreatePrefsStore((s) => s.tiers[kind] ?? 'basic');
  const view = useCreatePrefsStore((s) => s.views[kind] ?? 'form');
  const setTier = useCreatePrefsStore((s) => s.setTier);
  const setView = useCreatePrefsStore((s) => s.setView);
  const [jsonDraft, setJsonDraft] = useState('');
  const [jsonError, setJsonError] = useState<string>();
  const [refs, setRefs] = useState<RefItem[]>([]);
  const [jobs, setJobs] = useState<ServerTask[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [jobsError, setJobsError] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [detailJob, setDetailJob] = useState<ServerTask>();
  const [cancelTarget, setCancelTarget] = useState<ServerTask>();
  const [busyId, setBusyId] = useState<string>();

  // ---- 结果区：拉取 + 空闲即停的轮询 ----
  const loadJobs = useCallback(async (mode: 'boot' | 'manual' | 'poll' = 'poll') => {
    if (mode === 'boot') setLoadingJobs(true);
    if (mode === 'manual') setRefreshing(true);
    try {
      const result = await api.listTasks(undefined, kind);
      setJobs(result.items.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)));
      setJobsError(undefined);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '任务服务暂时不可用';
      // 轮询失败不打断用户，但要有可恢复的错误态可查（避免把"服务不可用"显示成"结果为空"）
      if (mode !== 'poll') {
        setJobsError(message);
        toast.error(message);
      }
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

  // 产物地址：统一由 parseTaskPayload/extractResultUrl 读取（优先 result_payload，
  // 回退历史行的 intent_payload.result）；取不到就为 undefined，调用方如实回退到占位图。
  const previewUrl = useMemo(() => (preview ? extractResultUrl(parseTaskPayload(preview)) : undefined), [preview]);
  const detailPayload = useMemo(() => (detailJob ? parseTaskPayload(detailJob) : {}), [detailJob]);
  const detailResultUrl = useMemo(() => (detailJob ? extractResultUrl(parseTaskPayload(detailJob)) : undefined), [detailJob]);

  // ---- 提交 ----
  const promptText = values.prompt ?? '';
  const submit = useCallback(async () => {
    if (!canSubmit) return;
    const localRefs = buildLocalRefs(refs);
    const { mentions } = parseMentions(promptText, assets, localRefs);
    const quantity = Math.min(8, Math.max(1, Number.parseInt(submitValues.count ?? '1', 10) || 1));
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
          parameters: submitValues,
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
  }, [canSubmit, refs, promptText, assets, submitValues, meta.title, model, projectId, episodeId, assetId, kind, scopeEpoch, cost, loadJobs]);

  // ---- 结果复用：把历史任务的提示词/参数套回 composer ----
  // 两种意图必须分开（ADR-006 D6：InvokeAI 的 Remix vs Use All）：
  //   「沿用全部参数」= 连参数一起复现；「仅用提示词」= 保留当前参数、只换提示词
  const reuse = useCallback(
    (job: ServerTask, mode: 'all' | 'prompt-only') => {
      const allowedKeys = schema.controls.map((c) => c.key);
      const draft = reusableDraft(job, allowedKeys);
      if (mode === 'prompt-only') {
        if (draft.prompt === undefined) {
          toast.error('该任务没有可复用的提示词');
          return;
        }
        controls.applyDraft({ prompt: draft.prompt });
        toast.success('已套用该任务的提示词（参数保持不变）');
        return;
      }
      const { skippedKeys } = controls.applyDraft({
        prompt: draft.prompt,
        parameters: draft.parameters,
        modelId: draft.modelId,
      });
      const applied = Object.keys(draft.parameters).length;
      if (draft.modelId !== undefined && draft.modelId !== controls.model?.id) {
        const exists = controls.models.some((m) => m.id === draft.modelId);
        if (!exists) toast.warning(`原模型「${draft.modelId}」当前不可用，已保留当前模型`);
      }
      if (skippedKeys.length > 0) {
        toast.warning(`已套用 ${applied} 项参数；${skippedKeys.length} 项在当前模型不存在，已忽略：${skippedKeys.join('、')}`);
      } else {
        toast.success(`已套用该任务的提示词与 ${applied} 项参数`);
      }
    },
    [schema.controls, controls],
  );

  // ---- 取消 / 重试（真实接口）----
  const doCancel = useCallback(async (job: ServerTask) => {
    setBusyId(job.id);
    try {
      const updated = await api.cancelTask(job.id);
      setJobs((current) => current.map((item) => (item.id === job.id ? updated : item)));
      toast.success(cancelPlan(job.status)?.mayStillComplete ? '已发出中断信号' : '已取消');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : '取消失败');
    } finally {
      setBusyId(undefined);
      setCancelTarget(undefined);
    }
  }, []);

  const doRetry = useCallback(async (job: ServerTask) => {
    setBusyId(job.id);
    try {
      const updated = await api.retryTask(job.id);
      setJobs((current) => current.map((item) => (item.id === job.id ? updated : item)));
      toast.success('已重新排队（沿用原参数）');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : '重试失败');
    } finally {
      setBusyId(undefined);
    }
  }, []);

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
  // 风格对图片/视频都有意义；镜头语言是视频工作台的专属（ADR-006 D7）
  const showStylePresets = kind === 'image' || kind === 'video';
  const showLensPresets = kind === 'video';
  // 按披露档位过滤（累积：进阶 = 基础+进阶；专家 = 全部）。提示词永远显示，不受档位影响。
  const visibleControls: ControlDef[] = controlsUpToTier(
    schema.controls.filter((c) => c.key !== 'prompt'),
    tier,
  );
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

        {/* 草稿恢复提示：只恢复了参数文本与模型，参考图不入草稿（dataURL 会爆本地配额） */}
        {draftRestored && (
          <div className="flex items-start gap-2 rounded-lg border border-border bg-accent/40 px-2 py-1.5">
            <Info className="mt-px h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1 text-[10px] leading-relaxed text-muted-foreground">
              已恢复上次未提交的输入（参考图不在草稿中，需重新添加）。
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-5 shrink-0 px-1.5 text-[10px]"
              onClick={() => controls.resetDraft()}
            >
              清空
            </Button>
          </div>
        )}

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

          {/* 预设：平台独有资产（风格库 / 镜头语言库）→ 提示词片段。
              单向追加、再点即移除；chip 高亮由「提示词里是否已含该片段」派生，
              因此永远与用户手改后的文本一致（ADR-006 D7）。 */}
          {(showStylePresets || showLensPresets) && (
            <Collapsible open={presetsOpen} onOpenChange={setPresetsOpen}>
              <CollapsibleTrigger className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground">
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', presetsOpen && 'rotate-180')} />
                预设
                <span className="ml-1 font-mono text-[10px]">
                  {showStylePresets ? `风格 ${styles.length}` : ''}
                  {showStylePresets && showLensPresets ? ' · ' : ''}
                  {showLensPresets ? `镜头 ${lensItems.length}` : ''}
                </span>
                <span className="ml-auto text-[10px]">点选即并入提示词，再点移除</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 pt-2">
                {showStylePresets && (
                  <div className="space-y-1">
                    <div className="text-[10px] text-muted-foreground">风格</div>
                    <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
                      {styles.length === 0 ? (
                        <span className="text-[10px] text-muted-foreground">
                          风格库为空，可在「镜头语言/风格库」页添加
                        </span>
                      ) : (
                        styles.map((style) => {
                          const fragment = styleFragment(style);
                          const applied = isFragmentApplied(promptText, fragment);
                          return (
                            <button
                              key={style.id}
                              type="button"
                              title={fragment}
                              onClick={() => setValue('prompt', toggleFragment(promptText, fragment).prompt)}
                              className={cn(
                                'rounded-full border px-2 py-0.5 text-[10px] transition',
                                applied
                                  ? 'border-primary bg-primary/10 text-primary'
                                  : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                              )}
                            >
                              {style.name}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
                {showLensPresets && (
                  <div className="space-y-1">
                    <div className="text-[10px] text-muted-foreground">镜头语言</div>
                    <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
                      {lensItems.map((item) => {
                        const fragment = lensFragment(item);
                        const applied = isFragmentApplied(promptText, fragment);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            title={`${item.shotParams}｜${item.usage}`}
                            onClick={() => setValue('prompt', toggleFragment(promptText, fragment).prompt)}
                            className={cn(
                              'rounded-full border px-2 py-0.5 text-[10px] transition',
                              applied
                                ? 'border-sky-500 bg-sky-500/10 text-sky-600 dark:text-sky-400'
                                : 'border-border text-muted-foreground hover:border-sky-500/40 hover:text-foreground',
                            )}
                          >
                            {item.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* 参数：披露档位 + 表单/JSON 双视图（专业级改造：默认只露基础，
              深度按需展开；JSON 是同一份 schema 的另一种投影） */}
          <div className="flex items-center gap-1.5 border-t border-border pt-2">
            <span className="text-[10px] text-muted-foreground">参数</span>
            <div className="ml-auto flex items-center gap-0.5 rounded-md border border-border p-0.5">
              {(['basic', 'advanced', 'expert'] as const).map((option) => {
                // 该档没有控件就不显示按钮，避免出现点进去是空的
                if (option !== 'basic' && !hasTier(schema.controls, option)) return null;
                if (option === 'expert' && !hasTier(schema.controls, 'expert')) return null;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setTier(kind, option)}
                    className={cn(
                      'rounded px-2 py-0.5 text-[10px] transition',
                      tier === option ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {TIER_LABEL[option]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">
              {view === 'form' ? `共 ${visibleControls.length} 项` : 'JSON 视图'}
            </span>
            <div className="ml-auto flex items-center gap-0.5 rounded-md border border-border p-0.5">
              {(['form', 'json'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setView(kind, option);
                    setJsonError(undefined);
                    // 切到 JSON 时以当前值为准载入，避免看到上一次的残留
                    if (option === 'json') setJsonDraft(toParamJson(values, schema.controls));
                  }}
                  className={cn(
                    'rounded px-2 py-0.5 text-[10px] transition',
                    view === option ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {option === 'form' ? '表单' : 'JSON'}
                </button>
              ))}
            </div>
          </div>

          {view === 'json' ? (
            <div className="space-y-1.5">
              <Textarea
                value={jsonDraft}
                onChange={(e) => { setJsonDraft(e.target.value); setJsonError(undefined); }}
                rows={10}
                spellCheck={false}
                className="font-mono text-[11px] leading-5"
                placeholder='{"ratio": "16:9", "count": "2"}'
              />
              {jsonError && (
                <p className="flex items-start gap-1 text-[10px] text-destructive">
                  <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                  {jsonError}
                </p>
              )}
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 gap-1 text-[10px]"
                  onClick={() => {
                    const parsed = parseParamJson(jsonDraft, schema.controls);
                    if (parsed.error) {
                      setJsonError(parsed.error);
                      return;
                    }
                    for (const [key, value] of Object.entries(parsed.values)) setValue(key, value);
                    setJsonError(undefined);
                    if (parsed.ignoredKeys.length > 0) {
                      toast.warning(`已应用；${parsed.ignoredKeys.length} 项不属于当前模型，已忽略：${parsed.ignoredKeys.join('、')}`);
                    } else {
                      toast.success('已按 JSON 更新参数');
                    }
                  }}
                >
                  应用
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px]"
                  onClick={() => setJsonDraft(toParamJson(values, schema.controls))}
                >
                  从当前值重载
                </Button>
                <span className="ml-auto text-[10px] text-muted-foreground">键为业务参数名，只接受当前模型声明的键</span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleControls.map((control) => (
                <div key={control.key} className="space-y-1.5">
                  <div className="flex items-center gap-1">
                    <Label className="text-xs text-muted-foreground">{control.label}</Label>
                    {control.hint && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            title={`${control.label}说明`}
                            aria-label={`${control.label}说明`}
                            className="text-muted-foreground/60 transition hover:text-foreground"
                          >
                            <HelpCircle className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-64 text-[11px] leading-relaxed">{control.hint}</TooltipContent>
                      </Tooltip>
                    )}
                    {control.source === 'count-fallback' && (
                      <span className="text-[10px] text-muted-foreground/70">·取值待目录声明</span>
                    )}
                    {control.tier && control.tier !== 'basic' && (
                      <span className="rounded bg-muted px-1 text-[9px] text-muted-foreground">{TIER_LABEL[control.tier]}</span>
                    )}
                  </div>
                  {control.type === 'textarea' ? (
                    <MentionTextarea
                      value={values[control.key] ?? ''}
                      onChange={(v) => setValue(control.key, v)}
                      rows={3}
                      localRefs={buildLocalRefs(refs)}
                      disableMention
                      placeholder="不希望在画面中出现的内容"
                    />
                  ) : control.type === 'chips' ? (
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
          )}
        </div>

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

        {/* 已有结果但刷新失败：保留旧数据，同时如实提示 */}
        {jobsError && jobs.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-[10px] text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">刷新失败：{jobsError}（以下为上次成功获取的结果）</span>
            <Button type="button" variant="ghost" size="sm" className="h-5 px-1.5 text-[10px]" onClick={() => void loadJobs('manual')}>
              重试
            </Button>
          </div>
        )}

        {loadingJobs ? (
          <div className="flex flex-1 items-center justify-center gap-2 py-20 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> 正在加载任务
          </div>
        ) : jobsError && jobs.length === 0 ? (
          /* 服务不可用必须与"结果为空"区分开：前者可重试，后者是真实空态 */
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-16 text-center">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div className="space-y-1">
              <div className="text-xs font-medium text-destructive">任务服务暂时不可用</div>
              <div className="text-[11px] text-muted-foreground">{jobsError}</div>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => void loadJobs('manual')}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" /> 重试
            </Button>
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
                    previewUrl ? (
                      <ResultMedia url={previewUrl} />
                    ) : (
                      <>
                        <img
                          src={placeholderUrl(`gen-${preview.id}`)}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-contain"
                        />
                        <span className="absolute bottom-2 left-2 rounded bg-background/80 px-1.5 py-px text-[10px] text-muted-foreground">
                          演示占位图（该任务未返回真实产物地址）
                        </span>
                      </>
                    )
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
                </div>
                <div className="flex flex-wrap items-center gap-1.5 border-t border-border p-2">
                  {/* 复用：两种意图分开（沿用全部参数 / 仅用提示词），不合成一个按钮 */}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 gap-1 text-[10px]"
                    title="把该任务的提示词与参数套回左侧输入区"
                    onClick={() => reuse(preview, 'all')}
                  >
                    <Wand2 className="h-3 w-3" />
                    沿用参数
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 gap-1 text-[10px]"
                    title="只把提示词套回左侧，保留当前参数"
                    onClick={() => reuse(preview, 'prompt-only')}
                  >
                    仅用提示词
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px]"
                    onClick={() => setDetailJob(preview)}
                  >
                    详情
                  </Button>

                  {canCancel(preview.status) && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-6 gap-1 text-[10px]"
                      disabled={busyId === preview.id}
                      onClick={() => setCancelTarget(preview)}
                    >
                      {busyId === preview.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban className="h-3 w-3" />}
                      取消
                    </Button>
                  )}
                  {canRetry(preview.status) && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-6 gap-1 text-[10px]"
                      disabled={busyId === preview.id}
                      title="沿用原参数重新排队"
                      onClick={() => void doRetry(preview)}
                    >
                      {busyId === preview.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />}
                      重试
                    </Button>
                  )}
                  {preview.status === 'succeeded' && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="ml-auto h-6 gap-1 text-[10px]"
                      disabled={!previewUrl}
                      title={previewUrl ? '打开产物地址' : '该任务未返回真实产物地址'}
                      onClick={() => {
                        if (previewUrl) window.open(previewUrl, '_blank', 'noopener,noreferrer');
                      }}
                    >
                      <Download className="h-3 w-3" />
                      {previewUrl ? '打开产物' : '无产物地址'}
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
                      <JobThumb job={job} />
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
              结果历史与任务中心同源；「沿用参数」读的是该任务落库的提交负载。
              产物预览需要上游结果写回链路（当前缺失，已登记 BACKLOG），因此未返回地址时以占位图如实标注。
            </p>
          </>
        )}
      </div>

      {/* ============ 结果详情（右侧抽屉）============ */}
      <Sheet open={detailJob !== undefined} onOpenChange={(open) => { if (!open) setDetailJob(undefined); }}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          {detailJob && (
            <>
              <SheetHeader>
                <SheetTitle className="pr-6 text-sm">{detailJob.label}</SheetTitle>
                <SheetDescription className="font-mono text-[10px]">任务 {detailJob.id}</SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-4 px-4 pb-6">
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <DetailRow label="状态" value={detailJob.status} />
                  <DetailRow label="类型" value={detailJob.kind} />
                  <DetailRow label="费用" value={detailJob.cost_estimate ?? '—'} />
                  <DetailRow label="尝试" value={attemptsNote(detailJob.attempt) ?? '1 次'} />
                  <DetailRow label="创建" value={formatTaskTime(detailJob.created_at)} />
                  <DetailRow label="更新" value={formatTaskTime(detailJob.updated_at)} />
                  <DetailRow label="模型" value={detailPayload.model_id ?? '未记录'} />
                  <DetailRow label="参考图" value={String(detailPayload.reference_count ?? 0)} />
                </div>

                {detailJob.error && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-[11px] text-destructive">
                    {detailJob.error}
                  </div>
                )}

                {detailResultUrl && (
                  <div className="space-y-1">
                    <div className="text-[11px] font-medium">产物地址</div>
                    <a
                      href={detailResultUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate font-mono text-[10px] text-primary underline"
                    >
                      {detailResultUrl}
                    </a>
                  </div>
                )}

                <div className="space-y-1">
                  <div className="text-[11px] font-medium">提交时的参数快照</div>
                  {Object.keys(detailPayload.parameters ?? {}).length === 0 ? (
                    <p className="text-[10px] text-muted-foreground">该任务没有记录参数快照。</p>
                  ) : (
                    <div className="overflow-hidden rounded-lg border border-border">
                      {Object.entries(detailPayload.parameters ?? {}).map(([key, value]) => (
                        <div key={key} className="flex gap-2 border-b border-border px-2 py-1 text-[10px] last:border-b-0">
                          <span className="w-24 shrink-0 truncate font-mono text-muted-foreground">{key}</span>
                          <span className="min-w-0 flex-1 break-words">{value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={() => reuse(detailJob, 'all')}>
                    <Wand2 className="h-3 w-3" /> 沿用全部参数
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => reuse(detailJob, 'prompt-only')}>
                    仅用提示词
                  </Button>
                  {canCancel(detailJob.status) && (
                    <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={() => setCancelTarget(detailJob)}>
                      <Ban className="h-3 w-3" /> 取消
                    </Button>
                  )}
                  {canRetry(detailJob.status) && (
                    <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={() => void doRetry(detailJob)}>
                      <RotateCw className="h-3 w-3" /> 重试
                    </Button>
                  )}
                </div>

                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  「沿用全部参数」复现同一组设置；「仅用提示词」保留当前参数只换提示词 ——
                  两者是不同意图，故不做成一个按钮。种子若上游未返回则不在快照中。
                </p>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ============ 取消确认：按状态区分语义与计费口径（ADR-006 D10）============ */}
      <AlertDialog open={cancelTarget !== undefined} onOpenChange={(open) => { if (!open) setCancelTarget(undefined); }}>
        <AlertDialogContent>
          {cancelTarget && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{cancelPlan(cancelTarget.status)?.title}</AlertDialogTitle>
                <AlertDialogDescription className="space-y-2">
                  <span className="block">{cancelPlan(cancelTarget.status)?.description}</span>
                  <span className="block font-mono text-[11px]">{cancelPlan(cancelTarget.status)?.billNote}</span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>保留任务</AlertDialogCancel>
                <AlertDialogAction onClick={() => void doCancel(cancelTarget)}>
                  {cancelPlan(cancelTarget.status)?.confirmLabel}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate font-mono">{value}</span>
    </div>
  );
}

/** 按产物媒体类型渲染，避免把视频/音频地址塞进 <img> 变成裂图 */
function ResultMedia({ url }: { url: string }) {
  const kind = mediaKind(url);
  if (kind === 'video') {
    return <video src={url} controls className="h-full w-full object-contain" />;
  }
  if (kind === 'audio') {
    return <audio src={url} controls className="w-[80%]" />;
  }
  return <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain" />;
}

/** 缩略图：图片直接显示；视频/音频只显示类型标记，避免小格子里的裂图与播放器 */
function JobThumb({ job }: { job: ServerTask }) {
  const url = extractResultUrl(parseTaskPayload(job));
  if (!url) {
    return <img src={placeholderUrl(`gen-${job.id}`)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />;
  }
  const kind = mediaKind(url);
  if (kind === 'video' || kind === 'audio') {
    const Icon = kind === 'video' ? Video : AudioLines;
    return (
      <span className="flex flex-col items-center gap-1 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-[9px]">{kind === 'video' ? '视频' : '音频'}</span>
      </span>
    );
  }
  return <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />;
}
