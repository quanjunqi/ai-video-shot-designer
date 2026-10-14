// EXPORTS: default StyleLibraryPage
// 风格库管理（用户数据）：新增/编辑/启用停用/删除
// 停用风格不出现在项目风格选择器；项目存 styleId + styleVersion 快照，删除/停用不影响已使用项目
import { useState } from 'react';
import { Plus, Pencil, Trash2, Palette, Power } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useStyleStore } from '@/stores/useStyleStore';
import { placeholderUrl } from '@/lib/placeholder';
import { cn } from '@/lib/utils';

interface Form {
  name: string;
  version: string;
  description: string;
  prompt: string;
  cover: string;
}

const EMPTY: Form = { name: '', version: 'v1.0', description: '', prompt: '', cover: '' };

export default function StyleLibraryPage() {
  const styles = useStyleStore((s) => s.styles);
  const upsertStyle = useStyleStore((s) => s.upsertStyle);
  const removeStyle = useStyleStore((s) => s.removeStyle);
  const toggleEnabled = useStyleStore((s) => s.toggleEnabled);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);

  const startCreate = () => {
    setEditingId(null);
    setForm(EMPTY);
    setOpen(true);
  };

  const startEdit = (s: (typeof styles)[number]) => {
    setEditingId(s.id);
    setForm({ name: s.name, version: s.version, description: s.description, prompt: s.prompt ?? '', cover: s.cover });
    setOpen(true);
  };

  const save = () => {
    if (!form.name.trim()) return;
    upsertStyle({
      id: editingId ?? `s-${Date.now().toString(36)}`,
      name: form.name.trim(),
      version: form.version.trim() || 'v1.0',
      description: form.description.trim() || '未填写简介',
      prompt: form.prompt.trim() || undefined,
      cover: form.cover.trim() || placeholderUrl(`style-custom-${Date.now().toString(36)}`),
      enabled: true,
    });
    setOpen(false);
    toast.success(editingId ? '风格已更新' : '风格已新增');
  };

  const remove = (id: string, name: string) => {
    removeStyle(id);
    toast.info(`已删除「${name}」（使用该风格的项目保留版本快照，但无法再切回）`);
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Palette className="h-4 w-4 text-primary" />
            风格库
            <Badge variant="secondary" className="ml-1 font-mono text-3xs">{styles.length} 种</Badge>
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            全局视觉风格库（用户数据）：可新增、编辑、停用或删除风格；停用的风格不出现在项目风格选择器中，已使用项目的版本快照保留
          </p>
        </div>
        <Button size="sm" onClick={startCreate}>
          <Plus className="h-4 w-4" />
          新增风格
        </Button>
      </header>

      {styles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center text-xs text-muted-foreground">
          风格库为空，点击右上角「新增风格」创建第一个风格
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {styles.map((s) => (
            <div key={s.id} className={cn('overflow-hidden rounded-xl border bg-card transition-opacity', !s.enabled && 'opacity-60')}>
              <div className="relative aspect-video overflow-hidden bg-muted">
                <img src={s.cover} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                <Badge
                  variant={s.enabled ? 'default' : 'secondary'}
                  className="absolute right-1.5 top-1.5"
                >
                  {s.enabled ? '启用' : '已停用'}
                </Badge>
              </div>
              <div className="space-y-1 p-2.5">
                <div className="flex items-center gap-1">
                  <span className="truncate text-sm font-medium">{s.name}</span>
                  <span className="ml-auto shrink-0 font-mono text-3xs text-muted-foreground">{s.version}</span>
                </div>
                <p className="line-clamp-2 text-2xs text-muted-foreground">{s.description}</p>
                {s.prompt && (
                  <p className="line-clamp-2 text-3xs leading-relaxed text-primary/70">提示词：{s.prompt}</p>
                )}
                <div className="flex gap-1.5 pt-1.5">
                  <Button size="sm" variant="outline" className="h-7 flex-1 text-2xs" onClick={() => startEdit(s)}>
                    <Pencil className="h-3 w-3" />
                    编辑
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 flex-1 text-2xs"
                    onClick={() => {
                      toggleEnabled(s.id);
                      toast.info(s.enabled ? `已停用「${s.name}」` : `已启用「${s.name}」`);
                    }}
                  >
                    <Power className="h-3 w-3" />
                    {s.enabled ? '停用' : '启用'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 w-7 p-0 text-destructive"
                    onClick={() => remove(s.id, s.name)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">{editingId ? '编辑风格' : '新增风格'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0 space-y-1">
                <Label className="text-xs">风格名称</Label>
                <Input value={form.name} placeholder="例如：水墨国风" onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">版本</Label>
                <Input value={form.version} placeholder="v1.0" onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">简介描述</Label>
              <Input value={form.description} placeholder="一句话风格说明（卡片展示）" onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">画面风格提示词</Label>
              <Textarea rows={3} value={form.prompt} placeholder="风格完整提示词（用于生成，留空则用简介）" onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">封面图 URL（留空自动生成占位图）</Label>
              <Input value={form.cover} placeholder="https://…" onChange={(e) => setForm((f) => ({ ...f, cover: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="button" disabled={!form.name.trim()} onClick={save}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
