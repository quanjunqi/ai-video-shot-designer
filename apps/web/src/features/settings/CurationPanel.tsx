import { useEffect, useMemo, useState } from 'react';
import { Boxes, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { api } from '@/lib/api/client';
import type { ServerLogicalModel } from '@/lib/api/client';
import type { ChannelConfig } from '@/config/models/model-catalog';
import {
  curateRequest,
  draftFromSupply,
  supplyRows,
  validateCurateDraft,
  type CurateDraft,
  type SupplyRow,
} from '@/features/settings/curation';

/**
 * 策展面板（O-1 Phase D2）：把一个渠道的**上游供给**变成**产品目录里的模型**。
 *
 * 设计取舍（都来自本项目踩过的坑）：
 * · 上游标签认不出类型时**不给默认值**，必须用户显式选 —— 猜错会写出"能力错误的模型"；
 * · 已策展/已下架的行**照样列出**（只打标），隐藏会让人误以为上游没有它；
 * · 提交前用同一套纯函数自查（把后端 422 提前），成功后 `syncCatalog()` 让界面立刻反映事实。
 */
export default function CurationPanel({
  channel,
  open,
  onOpenChange,
}: {
  channel: ChannelConfig | null;
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const models = useSettingsStore((s) => s.models);
  const templates = useSettingsStore((s) => s.templates);
  const syncCatalog = useSettingsStore((s) => s.syncCatalog);

  // 用「为哪个渠道取到的数据」一个状态表达：这样 loading/error 都是**派生**的，
  // effect 里只做异步写入 —— 仓库规则禁止在 effect 内同步 setState（会触发级联渲染）。
  const [data, setData] = useState<{ forChannel: string; rows: SupplyRow[]; error: string } | null>(null);
  const [logicalModels, setLogicalModels] = useState<ServerLogicalModel[]>([]);
  const [target, setTarget] = useState<SupplyRow | null>(null);
  const [draft, setDraft] = useState<CurateDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const channelId = channel?.id ?? '';
  useEffect(() => {
    if (!open || !channelId) return;
    let cancelled = false;
    // 逻辑模型列表失败不该拦住策展（它是可选项）—— 但失败必须可见
    void Promise.all([
      api.listSupply(channelId),
      api.listLogicalModels().catch(() => [] as ServerLogicalModel[]),
    ])
      .then(([supply, lms]) => {
        if (cancelled) return;
        setData({ forChannel: channelId, rows: supplyRows(supply.items, models), error: '' });
        setLogicalModels(lms);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setData({ forChannel: channelId, rows: [], error: error instanceof Error ? error.message : '加载上游模型失败' });
      });
    return () => {
      cancelled = true;
    };
  }, [open, channelId, models]);

  const existingIds = useMemo(() => models.map((m) => m.id), [models]);
  const current = data && data.forChannel === channelId ? data : null;
  const rows = current?.rows ?? [];
  const loadError = current?.error ?? '';
  const loading = open && Boolean(channelId) && !current;
  const uncurated = rows.filter((row) => !row.curated);
  const enabledTemplates = templates.filter((t) => t.enabled);
  const validationError = draft ? validateCurateDraft(draft) : null;

  const startCurate = (row: SupplyRow) => {
    setTarget(row);
    setDraft(draftFromSupply(row.item, existingIds));
  };

  const submit = async () => {
    if (!target || !draft) return;
    const invalid = validateCurateDraft(draft);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setSaving(true);
    try {
      await api.curateModel(curateRequest(target.item, draft, { priceIsEstimate: target.item.priceIsEstimate }));
      toast.success(`已加入模型目录：${draft.name.trim()}`);
      setTarget(null);
      setDraft(null);
      // 先让服务端成为事实源，再刷新本地视图（顺序错了界面会与后端不一致）
      await syncCatalog();
      const supply = await api.listSupply(channelId);
      setData({ forChannel: channelId, rows: supplyRows(supply.items, useSettingsStore.getState().models), error: '' });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '加入目录失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Boxes className="h-4 w-4 text-primary" />
            策展上游模型 · {channel?.name ?? ''}
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          这里列出该渠道**同步进来的上游模型**。加入目录后它才可能对外可见；未加入的只是"供给"，不参与路由。
        </p>

        {loading && (
          <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> 正在读取上游供给…
          </div>
        )}
        {loadError && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            读取失败：{loadError}
          </p>
        )}

        {!loading && !loadError && (
          <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
            <div className="flex items-center gap-2 pb-1 text-2xs text-muted-foreground">
              <Badge variant="secondary" className="font-mono text-4xs">
                未策展 {uncurated.length}
              </Badge>
              <span>共 {rows.length} 条上游供给</span>
              {rows.length === 0 && <span>· 该渠道还没有同步过的上游模型，请先在渠道卡片上执行「同步上游模型目录」</span>}
            </div>
            {rows.map((row) => (
              <div key={row.item.providerModel} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2.5">
                <span className="font-mono text-xs">{row.item.providerModel}</span>
                {row.item.displayName && <span className="text-xs text-muted-foreground">{row.item.displayName}</span>}
                <Badge variant="outline" className="font-mono text-4xs">
                  上游标签 {row.item.upstreamType || '—'}
                </Badge>
                {row.item.pricingAmount != null && (
                  <Badge variant="outline" className="font-mono text-4xs">
                    {row.item.pricingAmount} {row.item.pricingUnit}
                  </Badge>
                )}
                {row.missing && (
                  <Badge className="bg-destructive/15 font-mono text-4xs text-destructive">上游已下架</Badge>
                )}
                <Badge
                  className={
                    row.curated
                      ? 'ml-auto bg-success/15 font-mono text-4xs text-success'
                      : 'ml-auto bg-muted font-mono text-4xs text-muted-foreground'
                  }
                >
                  {row.curated ? '已策展' : '未策展'}
                </Badge>
                <Button
                  type="button"
                  size="sm"
                  variant={row.curated ? 'ghost' : 'default'}
                  className="h-7 px-2 text-2xs"
                  onClick={() => startCurate(row)}
                  title={row.curated ? '它会覆盖目录里同一 (渠道, 上游模型) 的那条' : '把这条上游模型加入产品目录'}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span className="ml-1">{row.curated ? '重新策展' : '加入目录'}</span>
                </Button>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>

        {/* 策展表单：目标行 + 草稿都在时才有意义 */}
        <Dialog open={Boolean(target && draft)} onOpenChange={(v) => { if (!v) { setTarget(null); setDraft(null); } }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>加入模型目录 · {target?.item.providerModel ?? ''}</DialogTitle>
            </DialogHeader>
            {draft && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    产品面类型 <span className="text-destructive">*</span>
                  </Label>
                  <Select value={draft.type} onValueChange={(v) => setDraft({ ...draft, type: v as CurateDraft['type'] })}>
                    <SelectTrigger>
                      <SelectValue placeholder="必须选择（上游标签无法确定它属于哪一类）" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">文本 text</SelectItem>
                      <SelectItem value="image">图像 image</SelectItem>
                      <SelectItem value="video">视频 video</SelectItem>
                    </SelectContent>
                  </Select>
                  {!draft.type && (
                    <p className="text-2xs text-muted-foreground">
                      上游标签是「{target?.item.upstreamType || '—'}」，无法判断类型 ⇒ 必须人工选择（猜错会写出能力错误的模型）。
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="min-w-0 space-y-1.5">
                    <Label className="text-xs">展示名 *</Label>
                    <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">家族（family）*</Label>
                    <Input value={draft.family} onChange={(e) => setDraft({ ...draft, family: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">模型 id *</Label>
                    <Input value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value })} className="font-mono text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">路由优先级（小者优先）</Label>
                    <Input value={draft.routePriority} onChange={(e) => setDraft({ ...draft, routePriority: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">对外能力（逻辑模型，可选）</Label>
                    <Select
                      value={draft.logicalModelId ?? '__none__'}
                      onValueChange={(v) => setDraft({ ...draft, logicalModelId: v === '__none__' ? undefined : v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="不挂载" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">不挂载</SelectItem>
                        {logicalModels.map((lm) => (
                          <SelectItem key={lm.id} value={lm.id}>
                            {lm.label}（{lm.type}）
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">协议模板（可选）</Label>
                    <Select
                      value={draft.protocolTemplateId ?? '__none__'}
                      onValueChange={(v) => setDraft({ ...draft, protocolTemplateId: v === '__none__' ? undefined : v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="不指定" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">不指定</SelectItem>
                        {enabledTemplates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">售价</Label>
                    <Input value={draft.priceAmount} onChange={(e) => setDraft({ ...draft, priceAmount: e.target.value })} placeholder="留空=未定价" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">售价单位</Label>
                    <Input value={draft.priceUnit} onChange={(e) => setDraft({ ...draft, priceUnit: e.target.value })} placeholder="次 / 千 token" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">说明</Label>
                  <Input value={draft.note ?? ''} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
                </div>
                {validationError && <p className="text-2xs text-destructive">{validationError}</p>}
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setTarget(null); setDraft(null); }}>
                取消
              </Button>
              <Button type="button" disabled={saving || Boolean(validationError)} onClick={() => void submit()}>
                {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
                加入目录
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
