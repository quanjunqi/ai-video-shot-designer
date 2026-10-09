// EXPORTS: default ShotLanguagePage
// 镜头语言库（3.4）：分类/搜索/筛选/排序/网格列表；新增条目含名称/适用场景/镜头参数/示例；可复制或引用到 Shot 草案
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Copy, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ResourceList from '@/components/common/ResourceList';
import DemoBadge from '@/components/common/DemoBadge';
import { LENS_CATEGORIES } from '@/mocks/lens';
import { useLensStore } from '@/stores/useLensStore';
import { placeholderUrl } from '@/lib/placeholder';
import type { LensItem } from '@/types';

export default function ShotLanguagePage() {
  const items = useLensStore((s) => s.items);
  const addItem = useLensStore((s) => s.add);
  const [params, setParams] = useSearchParams();
  const [category, setCategory] = useState('all');
  const search = params.get('q') ?? '';
  const [sort, setSort] = useState('name');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState({ name: '', category: '景别', usage: '', shotParams: '', prompt: '' });

  const categories = useMemo(() => [...new Set(items.map((i) => i.category))], [items]);

  const filtered = useMemo(() => {
    let list = items.filter(
      (i) =>
        (category === 'all' || i.category === category) &&
        (i.name.includes(search) || i.prompt.includes(search)),
    );
    if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'zh'));
    if (sort === 'category') list = [...list].sort((a, b) => a.category.localeCompare(b.category, 'zh'));
    return list;
  }, [items, category, search, sort]);

  const createItem = () => {
    if (!form.name.trim() || !form.prompt.trim()) return;
    const item: LensItem = {
      id: `lens-${Date.now().toString(36)}`,
      name: form.name.trim(),
      category: form.category,
      cover: placeholderUrl(`lens-new-${Date.now().toString(36)}`),
      usage: form.usage.trim() || '通用',
      shotParams: form.shotParams.trim() || '景别：中景',
      prompt: form.prompt.trim(),
    };
    addItem(item);
    setOpen(false);
    setForm({ name: '', category: '景别', usage: '', shotParams: '', prompt: '' });
    toast.success('已新增镜头模板');
  };

  const quote = async (item: LensItem) => {
    try {
      await navigator.clipboard.writeText(`${item.name} | ${item.shotParams}\n${item.prompt}`);
      toast.success(`已复制「${item.name}」参数与提示词`);
    } catch {
      toast.error('复制失败，请检查浏览器剪贴板权限');
    }
  };

  return (
    <>
      <ResourceList
        title="镜头语言库"
        count={filtered.length}
        view={view}
        onViewChange={setView}
        sortOptions={[
          { label: '名称', value: 'name' },
          { label: '分类', value: 'category' },
        ]}
        sortValue={sort}
        onSortChange={setSort}
        onCreate={() => setOpen(true)}
        createLabel="新建镜头模板"
        emptyTitle="没有匹配的镜头模板"
        emptyDescription="调整筛选条件或新建模板"
        filters={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={category} onValueChange={(v) => setCategory(v as string)}>
              <SelectTrigger className="h-9 w-32">
                <SelectValue placeholder="全部分类" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部分类</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <Input
                value={search}
                onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })}
                placeholder="搜索镜头模板"
                className="h-9 w-56 text-xs"
              />
            </div>
            <DemoBadge />
          </div>
        }
        items={filtered}
        renderCard={(item) => (
          <div key={item.id} className="group overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md">
            <div className="relative aspect-[16/10] overflow-hidden bg-muted">
              <img src={item.cover} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
              <Badge className="!absolute left-2 top-2 z-20 bg-background/80 text-foreground backdrop-blur">{item.category}</Badge>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="!absolute bottom-2 right-2 z-20 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                onClick={() => quote(item)}
              >
                <Copy className="h-3 w-3" />
                复制
              </Button>
            </div>
            <div className="space-y-1 p-3">
              <div className="text-sm font-medium">{item.name}</div>
              <div className="text-[11px] text-muted-foreground">{item.usage}</div>
              <div className="font-mono text-[10px] text-primary">{item.shotParams}</div>
              <div className="line-clamp-2 text-[11px] text-muted-foreground">{item.prompt}</div>
            </div>
          </div>
        )}
        renderRow={(item) => (
          <div key={item.id} className="flex items-center gap-3 px-4 py-3">
            <img src={item.cover} alt="" loading="lazy" decoding="async" className="h-12 w-16 rounded object-cover" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{item.name}</div>
              <div className="truncate font-mono text-[10px] text-muted-foreground">{item.prompt}</div>
            </div>
            <Badge variant="outline">{item.category}</Badge>
            <Button type="button" size="sm" variant="outline" onClick={() => quote(item)}>
              <Copy className="h-3 w-3" />
              复制
            </Button>
          </div>
        )}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>新建镜头模板</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">名称</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：雾夜长焦推近" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">分类</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LENS_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">适用场景</Label>
              <Input value={form.usage} onChange={(e) => setForm({ ...form, usage: e.target.value })} placeholder="如：悬疑氛围建立" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">镜头/调度参数</Label>
              <Input value={form.shotParams} onChange={(e) => setForm({ ...form, shotParams: e.target.value })} placeholder="景别：中景 · 运动：缓慢前推" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">提示词模板</Label>
              <Textarea value={form.prompt} rows={3} onChange={(e) => setForm({ ...form, prompt: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="button" disabled={!form.name.trim() || !form.prompt.trim()} onClick={createItem}>
              <Plus className="h-3.5 w-3.5" />
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
