// EXPORTS: default ModelCatalogPage
// 模型中心 > 模型目录（TASK-IA-001 v14 §2.3）：已接入模型的供应池与能力归属。
// 归属编辑（logicalModelId/优先级）= Admin+；浏览/启停状态=全员。
// 待归属模型 = 可显式直调、不进能力路由（v14）；上游下线保留行、标「已停用」（防破坏历史引用，清理=P3）。
// 数据源 = useSettingsStore.models（与广场/创作流同源）。
import { useMemo, useState } from 'react';
import { Boxes, Check, Pencil, Store } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useAuthStore, ROLE_RANK } from '@/stores/useAuthStore';
import type { CatalogModel } from '@/config/models/model-catalog';

type ModelType = 'text' | 'image' | 'video';
const TYPE_LABEL: Record<ModelType, string> = { text: '文本', image: '图片', video: '视频' };

export default function ModelCatalogPage() {
  const models = useSettingsStore((s) => s.models);
  const channels = useSettingsStore((s) => s.channels);
  const updateModel = useSettingsStore((s) => s.updateModel);
  const toggleModel = useSettingsStore((s) => s.toggleModel);
  const role = useAuthStore((s) => s.role);
  const canEdit = (ROLE_RANK[role] ?? 0) >= ROLE_RANK.admin;

  const [typeFilter, setTypeFilter] = useState<'all' | ModelType>('all');
  const [edit, setEdit] = useState<CatalogModel | null>(null);
  const [draftLogical, setDraftLogical] = useState('');
  const [draftPriority, setDraftPriority] = useState('');

  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? id;
  const channelDisabled = (id: string) => channels.some((c) => c.id === id && !c.enabled);

  const list = useMemo(
    () => models.filter((m) => (typeFilter === 'all' ? true : m.type === typeFilter)).sort((a, b) => a.sort - b.sort),
    [models, typeFilter],
  );

  // 归属候选 = 现有已归属 id 去重 + 自由输入
  const logicalCandidates = useMemo(() => {
    const set = new Set<string>();
    for (const m of models) if (m.logicalModelId) set.add(m.logicalModelId);
    return [...set];
  }, [models]);

  const openEdit = (m: CatalogModel) => {
    setEdit(m);
    setDraftLogical(m.logicalModelId ?? '');
    setDraftPriority(m.routePriority !== undefined ? String(m.routePriority) : '');
  };

  const saveAttribution = () => {
    if (!edit) return;
    const logical = draftLogical.trim();
    const priority = draftPriority.trim() === '' ? undefined : Number(draftPriority);
    if (draftPriority.trim() !== '' && Number.isNaN(priority)) {
      toast.error('优先级须为数字（越大越优先兜底）');
      return;
    }
    updateModel(edit.id, { logicalModelId: logical || undefined, routePriority: priority });
    toast.success(`已更新 ${edit.name} 的能力归属`);
    setEdit(null);
  };

  return (
    <div className="space-y-4">
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
        <span className="text-2xs text-muted-foreground">归属编辑=Admin+；待归属模型可显式直调、不进能力路由</span>
      </div>

      {list.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-10 text-center">
          <Store className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">目录为空</p>
          <p className="max-w-80 text-2xs text-muted-foreground">先去「渠道」同步并添加模型，模型会出现在目录里；添加时归属可后补。</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">模型</th>
                <th className="px-3 py-2 text-left font-medium">类型</th>
                <th className="px-3 py-2 text-left font-medium">渠道</th>
                <th className="px-3 py-2 text-left font-medium">能力归属</th>
                <th className="px-3 py-2 text-left font-medium">状态</th>
                {canEdit && <th className="px-3 py-2 text-right font-medium">操作</th>}
              </tr>
            </thead>
            <tbody>
              {list.map((m) => {
                const off = m.status !== 'enabled' || channelDisabled(m.channelId);
                return (
                  <tr key={m.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <p className="font-medium text-foreground">{m.name}</p>
                      <p className="font-mono text-2xs text-muted-foreground">{m.providerModel}</p>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="font-mono text-2xs">{TYPE_LABEL[m.type as ModelType] ?? m.type}</Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{channelName(m.channelId)}</td>
                    <td className="px-3 py-2">
                      {m.logicalModelId ? (
                        <Badge variant="outline" className="gap-1 text-2xs">
                          <Check className="h-3 w-3 text-primary" />
                          {m.logicalModelId}
                          {m.routePriority !== undefined && <span className="font-mono text-3xs text-muted-foreground">P{m.routePriority}</span>}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-2xs text-muted-foreground">待归属</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={off ? 'destructive' : 'outline'} className="text-2xs">
                        {channelDisabled(m.channelId) ? '渠道停用' : m.status === 'enabled' ? '启用' : '已停用'}
                      </Badge>
                    </td>
                    {canEdit && (
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-2xs" onClick={() => openEdit(m)}>
                            <Pencil className="h-3 w-3" />
                            归属
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-2xs"
                            onClick={() => toggleModel(m.id)}
                            disabled={channelDisabled(m.channelId)}
                          >
                            {m.status === 'enabled' ? '停用' : '启用'}
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-2xs text-muted-foreground">
        已停用/渠道停用的模型保留行（防破坏历史引用）；上游下线模型由同步投影保留并标记。目录停用即时影响创作可选列表（与广场/创作流同源）。
      </p>

      {/* 归属编辑抽屉（Admin+） */}
      <Sheet open={edit !== null} onOpenChange={(o) => !o && setEdit(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Boxes className="h-4 w-4 text-primary" />
              能力归属 · {edit?.name ?? ''}
            </SheetTitle>
            <SheetDescription>
              {edit ? `${TYPE_LABEL[edit.type as ModelType]}模型 · ${channelName(edit.channelId)}` : ''}
            </SheetDescription>
          </SheetHeader>
          {edit && (
            <div className="space-y-4 text-xs">
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs">归属能力（对外能力 id；待归属 = 可显式直调、不进能力路由）</Label>
                <Input value={draftLogical} onChange={(e) => setDraftLogical(e.target.value)} placeholder="如 text_gen / image_gen / video_gen" list="logical-candidates" />
                <datalist id="logical-candidates">
                  {logicalCandidates.map((id) => (
                    <option key={id} value={id} />
                  ))}
                </datalist>
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs">路由优先级（越大越优先兜底；留空=不参与能力路由）</Label>
                <Input type="number" value={draftPriority} onChange={(e) => setDraftPriority(e.target.value)} placeholder="如 10" />
              </div>
              <p className="text-2xs text-muted-foreground">
                归属决定该模型是否参与能力路由兜底；创作显式选模型始终直调，与归属无关。
              </p>
              <Button type="button" size="sm" className="w-full" onClick={saveAttribution}>
                保存归属
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
