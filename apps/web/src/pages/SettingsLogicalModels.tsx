// EXPORTS: default SettingsLogicalModelsPage
// 逻辑模型管理（设置中心）：能力型对外标识（ADR-003 §3.1）+ 候选路由绑定（routePriority 小者优先）。
// id 是对外契约：创建后不可改名（服务端 400 ID_IMMUTABLE）、且后端未提供删除端点——下线请用「停用」。
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Boxes, Loader2, Pencil, Plus, Power, RefreshCw, Route, Sparkles } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { LogicalModelStatus, LogicalModelType, ServerLogicalModel } from '@/lib/api/client';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import LogicalModelCandidatesPanel from '@/features/settings/LogicalModelCandidatesPanel';
import {
  LOGICAL_MODEL_MAX_ID_LENGTH,
  LOGICAL_MODEL_STATUS_LABEL,
  LOGICAL_MODEL_TYPE_LABEL,
  asArray,
  describeLogicalModelError,
  isValidLogicalModelId,
  validateLogicalModelDraft,
  type LogicalModelDraft,
} from '@/features/settings/logical-models';
import { cn } from '@/lib/utils';

const TYPE_TABS: { key: LogicalModelType | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'text', label: '文本' },
  { key: 'image', label: '图片' },
  { key: 'video', label: '视频' },
];

const TYPE_COLOR: Record<LogicalModelType, string> = {
  text: 'text-primary',
  image: 'text-emerald-500 dark:text-emerald-400',
  video: 'text-amber-500 dark:text-amber-400',
};

/** 能力型 id 示例（能力 + 档位，便于运营快速起名，创建后不可改） */
const ID_SUGGESTIONS: Record<LogicalModelType, string[]> = {
  text: ['text-chat-high', 'text-reasoning', 'text-long-context'],
  image: ['image-t2i-high', 'image-t2i-fast', 'image-i2i-ref'],
  video: ['video-t2v-high', 'video-i2v-ref', 'video-first-last-frame'],
};

const EMPTY_FORM: LogicalModelDraft = {
  id: '',
  label: '',
  type: 'image',
  capability: '',
  status: 'enabled',
  sort: '100',
  note: '',
};

export default function SettingsLogicalModelsPage() {
  // 完整模型目录与 SettingsModels 同源：设置 store（syncCatalog 拉平台目录 + 用户渠道）
  const catalogModels = useSettingsStore((s) => s.models);
  const catalogSource = useSettingsStore((s) => s.catalogSource);
  const syncCatalog = useSettingsStore((s) => s.syncCatalog);
  useEffect(() => { void syncCatalog(); }, [syncCatalog]);

  const [logicalModels, setLogicalModels] = useState<ServerLogicalModel[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [typeFilter, setTypeFilter] = useState<LogicalModelType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<LogicalModelStatus | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ServerLogicalModel | null>(null);
  const [form, setForm] = useState<LogicalModelDraft>({ ...EMPTY_FORM });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    const params: { status?: LogicalModelStatus; type?: LogicalModelType } = {};
    if (statusFilter !== 'all') params.status = statusFilter;
    if (typeFilter !== 'all') params.type = typeFilter;
    api.listLogicalModels(params)
      .then(async (rows) => {
        if (!active) return;
        const list = asArray(rows);
        setLogicalModels(list);
        // R7：打开即有内容——默认选中首个逻辑模型，不留空白占位
        setSelectedId((current) => (current && list.some((m) => m.id === current) ? current : (list[0]?.id ?? null)));
        // 候选数：列表接口不含候选数，只能逐个取候选列表长度（失败标记 -1，不阻断列表）
        const results = await Promise.all(
          list.map(async (m): Promise<[string, number]> => {
            try {
              const bound = asArray(await api.listLogicalModelCandidates(m.id));
              return [m.id, bound.length];
            } catch {
              return [m.id, -1];
            }
          }),
        );
        if (!active) return;
        const next: Record<string, number> = {};
        for (const [id, countOfModel] of results) next[id] = countOfModel;
        setCounts(next);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLogicalModels([]);
        setCounts({});
        setSelectedId(null);
        setLoadError(describeLogicalModelError(error));
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => { active = false; };
  }, [statusFilter, typeFilter, reloadToken]);

  const sorted = useMemo(
    () => [...logicalModels].sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label)),
    [logicalModels],
  );
  const selected = useMemo(() => logicalModels.find((m) => m.id === selectedId) ?? null, [logicalModels, selectedId]);
  const hasFilter = typeFilter !== 'all' || statusFilter !== 'all';

  const reload = () => {
    setLoading(true);
    setLoadError(null);
    setReloadToken((n) => n + 1);
  };
  const changeTypeFilter = (next: LogicalModelType | 'all') => {
    setLoading(true);
    setLoadError(null);
    setTypeFilter(next);
  };
  const changeStatusFilter = (next: LogicalModelStatus | 'all') => {
    setLoading(true);
    setLoadError(null);
    setStatusFilter(next);
  };
  const clearFilters = () => {
    setLoading(true);
    setLoadError(null);
    setTypeFilter('all');
    setStatusFilter('all');
  };

  /** 候选绑定面板改动后只刷新候选数，避免整表重载 */
  const refreshCounts = () => {
    void Promise.all(
      logicalModels.map(async (m): Promise<[string, number]> => {
        try {
          const bound = asArray(await api.listLogicalModelCandidates(m.id));
          return [m.id, bound.length];
        } catch {
          return [m.id, -1];
        }
      }),
    ).then((results) => {
      const next: Record<string, number> = {};
      for (const [id, countOfModel] of results) next[id] = countOfModel;
      setCounts(next);
    });
  };

  const openCreate = () => {
    setEditing(null);
    setFormError(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  };
  const openEdit = (m: ServerLogicalModel) => {
    setEditing(m);
    setFormError(null);
    setForm({ id: m.id, label: m.label, type: m.type, capability: m.capability, status: m.status, sort: String(m.sort), note: m.note });
    setDialogOpen(true);
  };

  const submit = async () => {
    const invalid = validateLogicalModelDraft(form, editing ? 'edit' : 'create');
    if (invalid) {
      setFormError(invalid);
      toast.error(invalid);
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      if (editing) {
        // 编辑**不发送 id**：id 只用于表达改名意图，带上必定被服务端 400 ID_IMMUTABLE 拒绝
        const updated = await api.updateLogicalModel(editing.id, {
          label: form.label.trim(),
          type: form.type,
          capability: form.capability.trim(),
          status: form.status,
          sort: Number(form.sort),
          note: form.note.trim(),
        });
        toast.success(`逻辑模型「${updated.label}」已更新（id 保持不变）`);
      } else {
        const created = await api.createLogicalModel({
          id: form.id.trim(),
          label: form.label.trim(),
          type: form.type,
          capability: form.capability.trim(),
          status: form.status,
          sort: Number(form.sort),
          note: form.note.trim(),
        });
        toast.success(`逻辑模型「${created.label}」已创建：id ${created.id} 自此成为对外契约`);
        setSelectedId(created.id);
      }
      setDialogOpen(false);
      setEditing(null);
      reload();
    } catch (error: unknown) {
      const message = describeLogicalModelError(error);
      setFormError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (m: ServerLogicalModel) => {
    const next: LogicalModelStatus = m.status === 'enabled' ? 'disabled' : 'enabled';
    setTogglingId(m.id);
    try {
      await api.updateLogicalModel(m.id, { status: next });
      setLogicalModels((prev) => prev.map((x) => (x.id === m.id ? { ...x, status: next } : x)));
      toast.success(next === 'enabled' ? `已启用「${m.label}」` : `已停用「${m.label}」：停用后不再参与路由`);
    } catch (error: unknown) {
      toast.error(describeLogicalModelError(error));
    } finally {
      setTogglingId(null);
    }
  };

  const idInvalid = !editing && form.id.trim() !== '' && !isValidLogicalModelId(form.id.trim());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">逻辑模型管理</h1>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            逻辑模型是执行器对外的统一标识（ADR-003 §3.1）：调用方只认 <span className="font-mono text-foreground">id</span>
            （能力型 kebab-case，如 <span className="font-mono text-foreground">image-t2i-high</span>），候选目录模型按{' '}
            <span className="font-mono text-foreground">routePriority</span> 小者优先依次兜底。id 一经使用即是对外契约——
            <span className="text-foreground">不可改名、后端未提供删除</span>，下线请用「停用」。
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {catalogSource === 'server' && (
            <Badge variant="outline" className="font-mono text-[9px] text-success">目录已连接</Badge>
          )}
          {catalogSource === 'offline-fallback' && (
            <Badge variant="outline" className="font-mono text-[9px] text-amber-500">目录离线降级</Badge>
          )}
          <Button type="button" size="sm" className="h-8 gap-1 text-xs" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" />新建逻辑模型
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card p-1">
          {TYPE_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => changeTypeFilter(t.key)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs transition-colors',
                typeFilter === t.key ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Select value={statusFilter} onValueChange={(v) => changeStatusFilter(v as LogicalModelStatus | 'all')}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="enabled">仅启用</SelectItem>
            <SelectItem value="disabled">仅停用</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-[10px] text-muted-foreground">当前筛选 {logicalModels.length} 个</span>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="min-w-0 space-y-2.5">
          {loading && (
            <div className="space-y-2.5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="animate-pulse rounded-xl border border-border bg-card p-3">
                  <div className="flex items-start gap-2.5">
                    <div className="h-9 w-9 shrink-0 rounded-lg bg-muted" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-3 w-1/3 rounded bg-muted" />
                      <div className="h-3 w-1/2 rounded bg-muted" />
                    </div>
                  </div>
                </div>
              ))}
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />正在加载逻辑模型…
              </p>
            </div>
          )}

          {!loading && loadError && (
            <div className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/10 p-4">
              <p className="flex items-start gap-2 text-xs leading-relaxed text-destructive">
                <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
                <span className="min-w-0 break-words">{loadError}</span>
              </p>
              <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={reload}>
                <RefreshCw className="h-3.5 w-3.5" />重试
              </Button>
            </div>
          )}

          {!loading && !loadError && sorted.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center">
              <Boxes className="h-7 w-7 text-muted-foreground/50" />
              <p className="text-sm font-medium">{hasFilter ? '当前筛选没有逻辑模型' : '还没有逻辑模型'}</p>
              <p className="max-w-sm text-[11px] leading-relaxed text-muted-foreground">
                逻辑模型把「能力」与「具体模型」解耦：调用方只写逻辑模型 id，候选按 routePriority 小者优先依次兜底。
              </p>
              <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                {hasFilter && (
                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={clearFilters}>
                    清除筛选
                  </Button>
                )}
                <Button type="button" size="sm" className="h-8 gap-1 text-xs" onClick={openCreate}>
                  <Plus className="h-3.5 w-3.5" />新建逻辑模型
                </Button>
              </div>
            </div>
          )}

          {!loading && !loadError && sorted.map((m) => {
            const active = m.id === selectedId;
            const countOfModel = counts[m.id];
            return (
              <div
                key={m.id}
                className={cn(
                  'rounded-xl border bg-card p-3 transition-all',
                  active ? 'border-primary ring-1 ring-primary/40' : 'border-border hover:border-primary/30',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedId(m.id)}
                    className="group flex min-w-0 flex-1 items-start gap-2.5 text-left"
                    title="选择并管理候选路由"
                  >
                    <span
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
                        active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary',
                      )}
                    >
                      <Boxes className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-semibold">{m.label}</span>
                        <Badge variant="outline" className={cn('shrink-0 font-mono text-[9px]', TYPE_COLOR[m.type])}>
                          {LOGICAL_MODEL_TYPE_LABEL[m.type]}
                        </Badge>
                        <Badge variant={m.status === 'enabled' ? 'outline' : 'destructive'} className="shrink-0 font-mono text-[9px]">
                          {LOGICAL_MODEL_STATUS_LABEL[m.status]}
                        </Badge>
                        <Badge variant="secondary" className="shrink-0 font-mono text-[9px]">sort {m.sort}</Badge>
                      </span>
                      <span className="mt-1 block truncate font-mono text-[11px] text-muted-foreground" title={m.id}>{m.id}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Route className="h-3 w-3" />
                          候选 {countOfModel === undefined ? '读取中…' : countOfModel < 0 ? '读取失败' : countOfModel}
                        </span>
                        {m.capability && <span className="truncate font-mono" title={m.capability}>{m.capability}</span>}
                      </span>
                      {m.note && <span className="mt-1 block truncate text-[10px] text-muted-foreground" title={m.note}>{m.note}</span>}
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7"
                      onClick={() => void toggleStatus(m)}
                      disabled={togglingId === m.id}
                      title={m.status === 'enabled' ? '停用（停用后不再参与路由）' : '启用'}
                      aria-label={m.status === 'enabled' ? `停用「${m.label}」` : `启用「${m.label}」`}
                    >
                      {togglingId === m.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Power className={cn('h-3.5 w-3.5', m.status === 'enabled' ? 'text-primary' : 'text-muted-foreground')} />}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7"
                      onClick={() => openEdit(m)}
                      title="编辑（id 只读：对外契约不可改名）"
                      aria-label={`编辑「${m.label}」`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}

          <p className="pt-1 text-[10px] leading-relaxed text-muted-foreground">
            错误码如实透传：<span className="font-mono">400 ID_IMMUTABLE</span>（id 是对外契约）·{' '}
            <span className="font-mono">409 MODEL_ALREADY_BOUND</span>（含归属逻辑模型）·{' '}
            <span className="font-mono">404 LOGICAL_MODEL_NOT_FOUND / MODEL_NOT_FOUND / CANDIDATE_NOT_FOUND</span>。
          </p>
        </div>

        <div className="min-w-0 lg:sticky lg:top-4">
          {selected ? (
            <LogicalModelCandidatesPanel
              key={selected.id}
              model={selected}
              catalogModels={catalogModels}
              onCandidatesChanged={refreshCounts}
            />
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-10 text-center">
              <Route className="h-6 w-6 text-muted-foreground/50" />
              <p className="text-xs font-medium">尚未选择逻辑模型</p>
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                从左侧选择一个逻辑模型即可管理它的候选路由；列表中还没有逻辑模型时，先「新建逻辑模型」。
              </p>
            </div>
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditing(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑逻辑模型' : '新建逻辑模型'}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">逻辑模型 id（对外契约）</Label>
              {editing ? (
                <>
                  <Input value={form.id} readOnly disabled className="font-mono text-xs" />
                  <p className="text-[10px] leading-relaxed text-muted-foreground">
                    id 是对外契约（ADR-003 §3.1.2），创建后不可修改——服务端对改名请求返回{' '}
                    <span className="font-mono">400 ID_IMMUTABLE</span>。如需更换标识，请新建逻辑模型并把候选重新绑定过去。
                  </p>
                </>
              ) : (
                <>
                  <Input
                    value={form.id}
                    onChange={(e) => setForm({ ...form, id: e.target.value })}
                    placeholder="image-t2i-high"
                    className="font-mono text-xs"
                  />
                  <p className={cn('text-[10px] leading-relaxed', idInvalid ? 'text-destructive' : 'text-muted-foreground')}>
                    能力型 kebab-case：小写字母/数字、单连字符分隔、不能以连字符开头或结尾、最长 {LOGICAL_MODEL_MAX_ID_LENGTH}{' '}
                    字符；创建后不可改名。
                  </p>
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Sparkles className="h-3 w-3" />示例
                    </span>
                    {ID_SUGGESTIONS[form.type].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setForm({ ...form, id: s })}
                        className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs text-muted-foreground">显示名称</Label>
                <Input
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="如：高质文生图"
                />
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs text-muted-foreground">类型（决定可绑定的候选）</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as LogicalModelType })}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">文本</SelectItem>
                    <SelectItem value="image">图片</SelectItem>
                    <SelectItem value="video">视频</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">capability（能力标签，供调用方/编排识别）</Label>
              <Input
                value={form.capability}
                onChange={(e) => setForm({ ...form, capability: e.target.value })}
                placeholder="如 t2i / i2i / t2v / chat"
                className="font-mono text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs text-muted-foreground">状态</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as LogicalModelStatus })}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="enabled">启用（参与路由）</SelectItem>
                    <SelectItem value="disabled">停用（不参与路由）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs text-muted-foreground">sort（列表排序，小的在前）</Label>
                <Input
                  value={form.sort}
                  inputMode="numeric"
                  onChange={(e) => setForm({ ...form, sort: e.target.value })}
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">note（说明，如兜底策略与适用场景）</Label>
              <Input
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="如：高质优先，失败回落到 image-t2i-fast"
              />
            </div>

            {formError && (
              <p className="flex items-start gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-[10px] leading-relaxed text-destructive">
                <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                <span className="min-w-0 break-words">{formError}</span>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} disabled={submitting}>取消</Button>
            <Button size="sm" className="gap-1" onClick={() => void submit()} disabled={submitting}>
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {editing ? '保存修改' : '创建逻辑模型'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
