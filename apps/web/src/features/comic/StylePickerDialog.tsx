// EXPORTS: default StylePickerDialog
// 风格库选择弹窗（图文卡片 + 已选标签 + 当前风格提示词区（可编辑）+ 确认使用）
// 交互：点击卡片仅选中（高亮 + 已选标签），点「确认使用」才应用；取消或确认后关闭
// 双模式：编辑模式（projectId：切换落库 + 旧风格资产 markStale）/ 选择模式（value+onChange：仅回调，用于新建项目等）
// 风格库数据源：useStyleStore（用户可管理，停用风格不展示）；提示词编辑保存到 style.prompt
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useStyleStore } from '@/stores/useStyleStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useAssetStore } from '@/stores/useAssetStore';
import { cn } from '@/lib/utils';

export default function StylePickerDialog({
  projectId,
  value,
  onChange,
  open,
  onOpenChange,
}: {
  projectId?: string;
  value?: string;
  onChange?: (id: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const allStyles = useStyleStore((s) => s.styles);
  const updatePrompt = useStyleStore((s) => s.updatePrompt);
  const project = useProjectStore((s) => (projectId ? s.projects.find((p) => p.id === projectId) : undefined));
  const updateProject = useProjectStore((s) => s.updateProject);
  const markStale = useAssetStore((s) => s.markStale);
  const getProjectAssets = useAssetStore((s) => s.getProjectAssets);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  // 打开即重建（调用方传 key），selected 以当前风格初始化；仅选中不生效，确认使用才应用
  const activeId = project ? project.styleId : (value ?? '');
  const [selected, setSelected] = useState(activeId);

  const enabled = allStyles.filter((s) => s.enabled);
  const filtered = enabled.filter(
    (s) => s.name.includes(query.trim()) || s.id.includes(query.trim()),
  );
  // active 从全量找（项目当前风格可能被停用，仍可查看提示词），网格只列启用风格
  const active = allStyles.find((s) => s.id === selected);
  const activePrompt = active ? (active.prompt ?? active.description) : '';

  const startEdit = () => {
    if (!active) return;
    setDraft(activePrompt);
    setEditing(true);
  };

  const saveEdit = () => {
    if (!active || !draft.trim()) return;
    updatePrompt(active.id, draft.trim());
    if (projectId && project && project.styleId === active.id) {
      const affected = getProjectAssets(projectId).filter((a) => !a.stale);
      affected.forEach((a) => markStale(a.id));
      toast.info(
        affected.length > 0
          ? `「${active.name}」风格提示词已更新，${affected.length} 个相关资产已标记待复核（重新生成）`
          : `「${active.name}」风格提示词已更新`,
      );
    } else {
      toast.success(`「${active.name}」风格提示词已更新`);
    }
    setEditing(false);
  };

  const confirm = () => {
    if (!selected || selected === activeId) {
      onOpenChange(false);
      return;
    }
    const next = enabled.find((s) => s.id === selected);
    if (!next) return;
    if (projectId && project) {
      // 编辑模式：切换落库 + 旧风格资产标记待复核
      const prev = enabled.find((s) => s.id === project.styleId)?.name ?? '未选择';
      updateProject(projectId, { styleId: selected, styleVersion: next.version });
      const affected = getProjectAssets(projectId).filter((a) => !a.stale);
      affected.forEach((a) => markStale(a.id));
      toast.info(
        affected.length > 0
          ? `视觉风格已切换：${prev} → ${next.name}（${next.version}），${affected.length} 个旧风格资产已标记待复核，可在资产库重新生成`
          : `视觉风格已切换为 ${next.name}（${next.version}）`,
      );
    } else {
      // 选择模式（新建等）：仅回调
      onChange?.(selected);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">切换视觉风格</DialogTitle>
        </DialogHeader>

        {/* 当前风格提示词区：只读预览 + 编辑按钮；编辑态内联 textarea */}
        <div className="shrink-0 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              画面风格提示词（{active?.name ?? '未选择'}
              {active && !active.enabled ? ' · 已停用' : ''}）
            </span>
            {active && !editing && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-[10px] text-primary hover:text-primary"
                onClick={startEdit}
              >
                编辑
              </Button>
            )}
          </div>
          {editing ? (
            <div className="space-y-1">
              <Textarea
                value={draft}
                rows={3}
                className="text-[11px] leading-relaxed"
                onChange={(e) => setDraft(e.target.value)}
              />
              <div className="flex justify-end gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => setEditing(false)}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  disabled={!draft.trim()}
                  onClick={saveEdit}
                >
                  保存
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-border bg-muted/40 px-2.5 py-2 text-[11px] leading-relaxed text-foreground/80">
              {activePrompt || '选择一个风格查看其画面风格提示词'}
            </div>
          )}
        </div>

        {/* 搜索（固定） */}
        <div className="relative shrink-0">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索风格名称…"
            className="h-9 pl-8 text-xs"
          />
        </div>

        {/* 风格库网格：图文卡片 + 已选标签（滚动，可容纳任意数量） */}
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              没有匹配的风格
              <div className="mt-1 text-[10px]">可到风格库中新增或启用风格</div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {filtered.map((s) => {
                const prompt = s.prompt ?? s.description;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelected(s.id)}
                    className={cn(
                      'group overflow-hidden rounded-lg border text-left transition-all',
                      selected === s.id ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary/50',
                    )}
                  >
                    <div className="relative aspect-video overflow-hidden bg-muted">
                      <img src={s.cover} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                      {selected === s.id && (
                        <span className="absolute left-1.5 top-1.5 z-20 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-medium text-primary-foreground">
                          已选
                        </span>
                      )}
                    </div>
                    <div className="p-2">
                      <div className="flex items-center gap-1">
                        <span className="truncate text-xs font-medium">{s.name}</span>
                        <span className="ml-auto shrink-0 font-mono text-[9px] text-muted-foreground">{s.version}</span>
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">{prompt}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 pt-3">
          <Link
            to="/comic/styles"
            className="mr-auto flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-primary"
          >
            <Settings2 className="h-3 w-3" />
            管理风格库
          </Link>
          <p className="mr-auto text-[10px] leading-relaxed text-muted-foreground">
            {projectId ? '确认后旧风格资产将标记待复核（重新生成）' : '确认后用于该项目的全局视觉风格'}
          </p>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" disabled={!selected || selected === activeId} onClick={confirm}>
            确认使用
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
