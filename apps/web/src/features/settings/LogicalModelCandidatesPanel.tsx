// 候选绑定面板（ADR-003 §3.1）：逻辑模型 → model_catalog 候选行，按 routePriority 小者优先路由。
// 绑定只写 logical_model_id / route_priority；解绑是「置 NULL 不删行」，目录模型本身始终保留。
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Check, Link2, Loader2, Pencil, Plus, RefreshCw, Route, Search, Unlink, X } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { ServerLogicalModel, ServerLogicalModelCandidate } from '@/lib/api/client';
import type { CatalogModel } from '@/config/models/model-catalog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DEFAULT_ROUTE_PRIORITY,
  asArray,
  LOGICAL_MODEL_TYPE_LABEL,
  ROUTE_PRIORITY_STEP,
  describeLogicalModelError,
  parseRoutePriority,
  sortCandidatesByRoutePriority,
  suggestRoutePriority,
} from '@/features/settings/logical-models';
import { cn } from '@/lib/utils';

interface CandidatePanelProps {
  model: ServerLogicalModel;
  catalogModels: CatalogModel[];
  onCandidatesChanged: () => void;
}

export default function LogicalModelCandidatesPanel({ model, catalogModels, onCandidatesChanged }: CandidatePanelProps) {
  const [candidates, setCandidates] = useState<ServerLogicalModelCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  // 空串 = 跟随建议值（已绑定优先级的下一个空位）；用户一旦输入即以其输入为准
  const [priorityDraft, setPriorityDraft] = useState('');
  const [binding, setBinding] = useState(false);
  const [editingPriorityId, setEditingPriorityId] = useState<string | null>(null);
  const [savingPriorityId, setSavingPriorityId] = useState<string | null>(null);
  const [unbindTarget, setUnbindTarget] = useState<ServerLogicalModelCandidate | null>(null);
  const [unbinding, setUnbinding] = useState(false);

  useEffect(() => {
    let active = true;
    api.listLogicalModelCandidates(model.id)
      .then((rows) => {
        if (!active) return;
        setCandidates(asArray(rows));
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setCandidates([]);
        setLoadError(describeLogicalModelError(error));
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => { active = false; };
  }, [model.id, reloadToken]);

  const sorted = useMemo(() => sortCandidatesByRoutePriority(candidates), [candidates]);
  const boundIds = useMemo(() => new Set(candidates.map((c) => c.id)), [candidates]);
  const suggestedPriority = useMemo(() => suggestRoutePriority(candidates.map((c) => c.routePriority)), [candidates]);
  const priorityInput = priorityDraft === '' ? String(suggestedPriority) : priorityDraft;

  const typeCatalogCount = catalogModels.filter((m) => m.type === model.type).length;
  const keyword = query.trim().toLowerCase();
  const available = useMemo(
    () =>
      catalogModels
        .filter((m) => m.type === model.type && !boundIds.has(m.id))
        .filter((m) =>
          !keyword
            ? true
            : [m.name, m.id, m.family, m.channelId, m.providerModel].some((v) => (v ?? '').toLowerCase().includes(keyword)),
        )
        .sort((a, b) => Number(a.status === 'disabled') - Number(b.status === 'disabled') || a.name.localeCompare(b.name)),
    [catalogModels, model.type, boundIds, keyword],
  );

  const toggleSelected = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const reload = () => {
    setLoading(true);
    setLoadError(null);
    setReloadToken((n) => n + 1);
  };

  const bindSelected = async () => {
    const priority = parseRoutePriority(priorityInput);
    if (priority === null) {
      toast.error('路由优先级必须是不小于 0 的整数（默认 100，建议以 10 为间隔）');
      return;
    }
    if (selectedIds.length === 0) {
      toast.error('请先从目录中勾选要绑定的模型');
      return;
    }
    setBinding(true);
    setActionError(null);
    const count = selectedIds.length;
    try {
      const rows = await api.bindLogicalModelCandidates(model.id, { modelIds: selectedIds, routePriority: priority });
      setCandidates(asArray(rows));
      setSelectedIds([]);
      setPriorityDraft('');
      toast.success(`已绑定 ${count} 个候选（routePriority=${priority}，小者优先）`);
      onCandidatesChanged();
    } catch (error: unknown) {
      const message = describeLogicalModelError(error);
      setActionError(message);
      toast.error(message);
    } finally {
      setBinding(false);
    }
  };

  const startEditPriority = (candidate: ServerLogicalModelCandidate) => {
    setEditingPriorityId(candidate.id);
    setPriorityDraft(String(candidate.routePriority));
  };

  const savePriority = async (candidate: ServerLogicalModelCandidate) => {
    const priority = parseRoutePriority(priorityDraft);
    if (priority === null) {
      toast.error('路由优先级必须是不小于 0 的整数');
      return;
    }
    setSavingPriorityId(candidate.id);
    setActionError(null);
    try {
      // 同一逻辑模型内重复绑定是幂等的：这里用它来重排已有候选的优先级
      const rows = await api.bindLogicalModelCandidates(model.id, { modelIds: [candidate.id], routePriority: priority });
      setCandidates(asArray(rows));
      setEditingPriorityId(null);
      setPriorityDraft('');
      toast.success(`「${candidate.name}」的 routePriority 已改为 ${priority}`);
      onCandidatesChanged();
    } catch (error: unknown) {
      const message = describeLogicalModelError(error);
      setActionError(message);
      toast.error(message);
    } finally {
      setSavingPriorityId(null);
    }
  };

  const confirmUnbind = async () => {
    if (!unbindTarget) return;
    setUnbinding(true);
    setActionError(null);
    try {
      await api.unbindLogicalModelCandidate(model.id, unbindTarget.id);
      setCandidates((prev) => prev.filter((c) => c.id !== unbindTarget.id));
      toast.success(`已解绑「${unbindTarget.name}」：目录模型行保留，仅解除候选关系`);
      setUnbindTarget(null);
      onCandidatesChanged();
    } catch (error: unknown) {
      const message = describeLogicalModelError(error);
      setActionError(message);
      toast.error(message);
    } finally {
      setUnbinding(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold">
              <Route className="h-3.5 w-3.5 shrink-0 text-primary" />
              候选路由
            </h3>
            <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground" title={model.id}>
              {model.id}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Badge variant="outline" className="font-mono text-[9px]">
              {LOGICAL_MODEL_TYPE_LABEL[model.type]}
            </Badge>
            <Button type="button" variant="ghost" size="sm" className="h-6 w-6" onClick={reload} title="刷新候选列表" aria-label="刷新候选列表">
              <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
            </Button>
          </div>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
          执行器按 routePriority <span className="font-mono text-foreground">从小到大</span> 依次尝试候选；默认{' '}
          <span className="font-mono">{DEFAULT_ROUTE_PRIORITY}</span>，建议以 <span className="font-mono">{ROUTE_PRIORITY_STEP}</span>{' '}
          为间隔留出插入空位。
        </p>
      </div>

      {actionError && (
        <p className="flex items-start gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-[10px] leading-relaxed text-destructive">
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
          <span className="min-w-0 break-words">{actionError}</span>
        </p>
      )}

      {/* 已绑定候选 */}
      <section className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <h4 className="whitespace-nowrap text-[11px] font-semibold text-muted-foreground">
            已绑定候选（{candidates.length}）
          </h4>
          {candidates.length > 1 && <span className="shrink-0 text-[10px] text-muted-foreground">按优先级升序</span>}
        </div>

        {loading && (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-3 text-[11px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            正在加载候选…
          </div>
        )}

        {!loading && loadError && (
          <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5">
            <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-destructive">
              <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
              <span className="min-w-0 break-words">{loadError}</span>
            </p>
            <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-[10px]" onClick={reload}>
              <RefreshCw className="h-3 w-3" />重试
            </Button>
          </div>
        )}

        {!loading && !loadError && sorted.length === 0 && (
          <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-border px-4 py-5 text-center">
            <Link2 className="h-5 w-5 text-muted-foreground/60" />
            <p className="text-[11px] font-medium">该逻辑模型还没有候选</p>
            <p className="text-[10px] text-muted-foreground">从下方目录勾选模型并绑定，至少绑定 1 个才能被调用</p>
          </div>
        )}

        <div className="max-h-72 space-y-1.5 overflow-y-auto pr-0.5">
          {sorted.map((c, index) => (
            <div
              key={c.id}
              className={cn(
                'rounded-lg border bg-card px-2.5 py-2 transition-colors',
                editingPriorityId === c.id ? 'border-primary/50' : 'border-border hover:bg-accent/40',
              )}
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10 font-mono text-[10px] font-semibold text-primary">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[11px] font-medium" title={c.name}>{c.name}</span>
                    <Badge variant="outline" className="shrink-0 font-mono text-[9px] text-primary">
                      P{c.routePriority}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground" title={c.id}>{c.id}</p>
                  <p className="mt-0.5 truncate text-[10px] text-muted-foreground" title={`${c.family} · ${c.channelId} · ${c.providerModel}`}>
                    {c.family} · {c.channelId} · {c.providerModel}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6"
                    onClick={() => (editingPriorityId === c.id ? setEditingPriorityId(null) : startEditPriority(c))}
                    title={editingPriorityId === c.id ? '取消调整优先级' : `调整路由优先级（当前 ${c.routePriority}）`}
                    aria-label={`调整「${c.name}」的路由优先级`}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6"
                    onClick={() => setUnbindTarget(c)}
                    title="解绑（目录模型行保留，仅解除候选关系）"
                    aria-label={`解绑「${c.name}」`}
                  >
                    <Unlink className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </div>

              {editingPriorityId === c.id && (
                <div className="mt-2 flex items-center gap-1.5 border-t border-border pt-2">
                  <Label className="shrink-0 text-[10px] text-muted-foreground">新优先级</Label>
                  <Input
                    className="h-7 w-20 min-w-0 font-mono text-xs"
                    value={priorityDraft}
                    inputMode="numeric"
                    autoFocus
                    onChange={(e) => setPriorityDraft(e.target.value)}
                  />
                  <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">小者优先</span>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 shrink-0 gap-1 text-[10px]"
                    onClick={() => void savePriority(c)}
                    disabled={savingPriorityId === c.id}
                  >
                    {savingPriorityId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    保存
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 shrink-0"
                    onClick={() => setEditingPriorityId(null)}
                    title="取消"
                    aria-label="取消调整优先级"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 绑定新候选 */}
      <section className="space-y-2.5 rounded-xl border border-border bg-muted/20 p-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold">
            <Plus className="h-3.5 w-3.5 shrink-0 text-primary" />
            绑定新候选
          </h4>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            目录 {typeCatalogCount} 个 · 已绑定 {candidates.length} 个
          </span>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-7 text-xs"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索目录模型（名称 / id / 渠道 / 厂商型号）"
          />
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
          <div className="min-w-0 space-y-1">
            <Label className="text-[10px] text-muted-foreground">路由优先级（小者优先）</Label>
            <Input
              className="h-8 font-mono text-xs"
              value={priorityInput}
              inputMode="numeric"
              onChange={(e) => setPriorityDraft(e.target.value)}
            />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-[11px]"
              onClick={() => setSelectedIds([])}
              disabled={selectedIds.length === 0 || binding}
            >
              清空
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1 text-[11px]"
              onClick={() => void bindSelected()}
              disabled={binding || selectedIds.length === 0}
            >
              {binding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              绑定（{selectedIds.length}）
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <span className="min-w-0 truncate">
            已选 {selectedIds.length} / 可绑定 {available.length}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className="rounded px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => setSelectedIds(available.map((m) => m.id))}
              disabled={available.length === 0}
            >
              全选
            </button>
            <span className="text-muted-foreground/40">|</span>
            <button
              type="button"
              className="rounded px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => setSelectedIds([])}
              disabled={selectedIds.length === 0}
            >
              清空选择
            </button>
          </div>
        </div>

        <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-lg border border-border bg-background/60 p-1">
          {available.length === 0 && (
            <p className="px-2 py-3 text-center text-[10px] leading-relaxed text-muted-foreground">
              {typeCatalogCount > 0 && available.length === 0 && !keyword
                ? '该类型的目录模型已全部绑定为候选'
                : '没有匹配的可用目录模型：请调整搜索词，或先到「模型配置」添加同类型模型'}
            </p>
          )}
          {available.map((m) => {
            const checked = selectedIds.includes(m.id);
            return (
              <label
                key={m.id}
                className={cn(
                  'flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 transition-colors',
                  checked ? 'bg-primary/10' : 'hover:bg-accent/50',
                )}
              >
                <Checkbox checked={checked} onCheckedChange={() => toggleSelected(m.id)} className="mt-0.5 h-3.5 w-3.5" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[11px]">{m.name}</span>
                    {m.status === 'disabled' && (
                      <Badge variant="destructive" className="shrink-0 font-mono text-[9px]">目录已停用</Badge>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground" title={m.id}>
                    {m.id} · {m.channelId}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        <p className="text-[10px] leading-relaxed text-muted-foreground">
          已被其它逻辑模型占用的目录模型会返回 <span className="font-mono">409 MODEL_ALREADY_BOUND</span>
          （服务端会在错误里点名归属的逻辑模型 id），不会被静默抢占。
        </p>
      </section>

      <AlertDialog open={unbindTarget !== null} onOpenChange={(open) => { if (!open) setUnbindTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>解绑候选「{unbindTarget?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              解绑只把该目录模型的归属置空（logical_model_id = NULL），<span className="font-medium">不会删除目录模型行</span>
              ，它仍可用于其它逻辑模型；此后本逻辑模型不再路由到它。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unbinding}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmUnbind()}
              disabled={unbinding}
              className="bg-destructive text-destructive-foreground"
            >
              {unbinding ? '解绑中…' : '确认解绑'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
