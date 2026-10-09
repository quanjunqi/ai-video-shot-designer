// EXPORTS: default GenWorkbench
// 智能创作统一工作台（3.4 / 7.6）：输入 + 模型/线路 + 费用预估 + 提交状态 + 历史与结果操作
// 可恢复 Job 语义：提交只登记 job，推进由全局 useJobResumer + tickAll 驱动；完成提示注册在模块顶层。
import { useCallback, useEffect, useState } from 'react';
import { Sparkles, Loader2, Download, Play, History } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAssetStore } from '@/stores/useAssetStore';
import { useShallow } from 'zustand/react/shallow';
import { placeholderUrl } from '@/lib/placeholder';
import ReferenceBar from '@/features/genworkbench/ReferenceBar';
import type { RefItem } from '@/features/genworkbench/ReferenceBar';
import MentionTextarea from '@/features/genworkbench/MentionTextarea';
import { parseMentions, type LocalRef } from '@/lib/mentions';
import type { JobKind } from '@/types';
import { api, type ServerTask } from '@/lib/api/client';
import { cn } from '@/lib/utils';

export interface ParamDef {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'number';
  options?: string[];
  defaultValue: string;
}

// 参考图 → @引用素材：自由图按顺序编号「本图N」，首/尾帧固定名
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

export default function GenWorkbench({
  kind,
  title,
  description,
  params,
  unitCost,
  projectId,
  episodeId,
  assetId,
  scopeEpoch = 0,
}: {
  kind: JobKind;
  title: string;
  description: string;
  params: ParamDef[];
  unitCost: string;
  projectId?: string;
  episodeId?: string;
  assetId?: string;
  scopeEpoch?: number;
}) {
  const assets = useAssetStore(useShallow((s) => s.assets));
  const [jobs, setJobs] = useState<ServerTask[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(params.map((p) => [p.key, p.defaultValue])),
  );
  const [refs, setRefs] = useState<RefItem[]>([]);

  const loadJobs = useCallback(async (showLoading = false) => {
    if (showLoading) setLoadingJobs(true);
    try {
      const result = await api.listTasks(undefined, kind);
      setJobs(result.items.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)));
    } catch (cause) {
      if (showLoading) {
        toast.error(cause instanceof Error ? cause.message : '任务服务暂时不可用');
      }
    } finally {
      if (showLoading) setLoadingJobs(false);
    }
  }, [kind]);

  useEffect(() => {
    const boot = window.setTimeout(() => void loadJobs(true), 0);
    const timer = window.setInterval(() => void loadJobs(), 2000);
    return () => { window.clearTimeout(boot); window.clearInterval(timer); };
  }, [loadJobs]);

  const setValue = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }));

  const run = async () => {
    const promptText = values[params.find((p) => p.type === 'textarea')?.key ?? ''] ?? '';
    if (!promptText.trim()) {
      toast.error('请先填写提示词或合成文本');
      return;
    }
    const localRefs = buildLocalRefs(refs);
    const { mentions } = parseMentions(promptText, assets, localRefs);
    const refCount = refs.length;
    const tagParts: string[] = [];
    if (refCount > 0) tagParts.push(`参考图×${refCount}`);
    if (mentions.length > 0) tagParts.push(`@引用×${mentions.length}`);
    const tag = tagParts.length ? `（${tagParts.join(' · ')}）` : '';
    const quantity = params.some((p) => p.key === 'count')
      ? Math.min(8, Math.max(1, Number.parseInt(values.count ?? '1', 10) || 1))
      : 1;
    const labelBase = `${title} · ${values[params[0]?.key ?? ''] ?? ''}${tag}`;
    const references = refs.map((ref) => ({ id: ref.id, slot: ref.slot, url: ref.url }));
    const mentionsPayload = mentions.map(({ kind: mentionKind, id, name, version, category }) => ({
      kind: mentionKind,
      id,
      name,
      version,
      category,
    }));

    setSubmitting(true);
    const results = await Promise.allSettled(
      Array.from({ length: quantity }, (_, index) => {
        const label = quantity > 1 ? `${labelBase} · 候选 ${index + 1}/${quantity}` : labelBase;
        const payload = {
          prompt: promptText,
          parameters: values,
          references,
          mentions: mentionsPayload,
          reference_count: refCount,
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
          cost_estimate: unitCost,
          context_path: `/create/${kind}`,
        });
      }),
    );
    setSubmitting(false);

    const succeeded = results.filter((result) => result.status === 'fulfilled').length;
    const failed = results.length - succeeded;
    if (succeeded > 0) {
      toast.success(projectId ? `已提交 ${succeeded} 个生成意图` : `已提交 ${succeeded} 个任务`);
      await loadJobs();
    }
    if (failed > 0) {
      const failure = results.find((result) => result.status === 'rejected');
      toast.error(failure?.status === 'rejected' && failure.reason instanceof Error ? failure.reason.message : '部分任务提交失败');
    }
  };

  // 参考图条只挂在第一个 textarea（提示词）上方
  const promptKey = params.find((p) => p.type === 'textarea')?.key;

  return (
    <div className="mx-auto grid w-full max-w-[1100px] grid-cols-1 gap-4 px-3 py-4 sm:px-6 sm:py-6 xl:grid-cols-[340px_minmax(0,1fr)]">
      {/* 左：参数面板 */}
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">{title}</span>
          <span className="ml-auto rounded bg-emerald-500/15 px-1.5 py-px text-[10px] text-emerald-700 dark:text-emerald-400">
            服务端任务
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground">{description}</p>

        <div className="space-y-3">
          {params.map((p) => (
            <div key={p.key} className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{p.label}</Label>
              {p.type === 'textarea' ? (
                <>
                  {p.key === promptKey && (kind === 'image' || kind === 'video') && (
                    <ReferenceBar mode={kind} refs={refs} onChange={setRefs} />
                  )}
                  <MentionTextarea
                    value={values[p.key]}
                    onChange={(v) => setValue(p.key, v)}
                    rows={4}
                    localRefs={buildLocalRefs(refs)}
                    disableMention={p.key === 'negative'}
                    placeholder="输入提示词；@ 或点下方「引用参考图」插入参考图缩略图"
                  />
                </>
              ) : p.type === 'select' ? (
                <Select value={values[p.key]} onValueChange={(v) => setValue(p.key, v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {p.options?.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type={p.type === 'number' ? 'number' : 'text'}
                  value={values[p.key]}
                  onChange={(e) => setValue(p.key, e.target.value)}
                  min={p.key === 'count' ? 1 : undefined}
                  max={p.key === 'count' ? 8 : undefined}
                  className="h-9 text-xs"
                />
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-border pt-3">
          <span className="font-mono text-[10px] text-muted-foreground">预估费用 {unitCost}/次</span>
          <Button
            type="button"
            size="sm"
            className="ml-auto"
            disabled={submitting || !(values[promptKey ?? ''] ?? '').trim()}
            onClick={() => void run()}
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {submitting ? '提交中…' : '生成'}
          </Button>
        </div>
        {!(values[promptKey ?? ''] ?? '').trim() && (
          <p className="mt-2 text-[10px] text-destructive">填写提示词或合成文本后才能生成。</p>
        )}
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          参考图贴在提示词上方，上传即自动编号；在提示词中 @ 引用（或点下方「引用素材」按钮从素材库选择）；任务进入任务中心独立执行，页面会从服务端同步状态。
        </p>
      </div>

      {/* 右：结果历史 */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">结果历史</span>
          <Badge variant="outline" className="font-mono text-[10px]">{jobs.length}</Badge>
        </div>
        {loadingJobs ? (
          <div className="flex items-center justify-center gap-2 py-14 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> 正在加载任务
          </div>
        ) : jobs.length === 0 ? (
          <div className="py-14 text-center text-xs text-muted-foreground">暂无结果，点击「生成」开始</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {jobs.map((j) => (
              <div key={j.id} className="overflow-hidden rounded-lg border border-border">
                <div className="relative aspect-square overflow-hidden bg-muted">
                  {j.status === 'running' || j.status === 'queued' ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      <span className="font-mono text-[10px]">{j.status === 'queued' ? '排队中' : `${j.progress}%`}</span>
                    </div>
                  ) : j.status === 'succeeded' ? (
                    <img src={placeholderUrl(`gen-${j.id}`)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">失败</div>
                  )}
                </div>
                <div className="space-y-1 p-2">
                  <div className="truncate text-[11px] font-medium">{j.label}</div>
                  <div className="flex items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        'font-mono text-[9px]',
                        j.status === 'succeeded' && 'border-success/40 text-success',
                        j.status === 'failed' && 'border-destructive/40 text-destructive',
                      )}
                    >
                      {j.status}
                    </Badge>
                    <span className="font-mono text-[9px] text-muted-foreground">{j.cost_estimate ?? unitCost}</span>
                  </div>
                  {j.status === 'succeeded' && (
                    <div className="flex gap-1.5">
                      <Button type="button" size="sm" variant="outline" className="h-6 flex-1 gap-1 text-[10px]" onClick={() => toast.success('演示：已加入下载队列')}>
                        <Download className="h-3 w-3" />
                        下载
                      </Button>
                      {kind === 'audio' && (
                        <Button type="button" size="sm" variant="outline" className="h-6 flex-1 gap-1 text-[10px]" onClick={() => toast.info('演示：试听占位，无真实音频')}>
                          <Play className="h-3 w-3" />
                          试听
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
