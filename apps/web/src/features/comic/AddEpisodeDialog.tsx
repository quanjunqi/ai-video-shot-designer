// EXPORTS: default AddEpisodeDialog
// 新增/插入剧集弹窗：选择插入位置 + 标题 + 内容 → 内容并入源剧本（新版本留档），
// 插入点之后的剧集 index 自动顺延、sourceSpan 自动重映射
import { useState } from 'react';
import { ChevronDown, GitBranch, Plus, Scissors } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export default function AddEpisodeDialog({
  open,
  onOpenChange,
  sourceText,
  episodeLabels,
  defaultTitle,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceText: string;
  /** 已有剧集标签（用于插入位置下拉）：[index, title][]，按下标顺序 */
  episodeLabels: Array<{ index: number; title: string }>;
  defaultTitle: string;
  onSave: (input: { afterIndex: number; title: string; content: string }) => void;
}) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [showSlice, setShowSlice] = useState(false);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [afterIndex, setAfterIndex] = useState(episodeLabels.length); // 默认追加末尾
  const len = sourceText.length;
  const clamp = (v: number) => Math.max(0, Math.min(len, Number(v) || 0));
  const canSave = title.trim().length > 0 && content.trim().length > 0;

  const fillFromSlice = () => {
    const s = clamp(start);
    const e = clamp(end);
    if (e <= s) return;
    setContent(sourceText.slice(s, e));
  };

  const insertLabel = afterIndex === 0 ? '最前面（第 1 集之前）' : afterIndex >= episodeLabels.length ? '末尾（追加为新一集）' : `第 ${afterIndex} 集之后`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-primary" />
            新增剧集
          </DialogTitle>
          <DialogDescription>
            内容将<strong>并入源剧本</strong>（自动生成新版本留档）；插入点之后的剧集序号自动顺延、原文区间自动重映射，已有剧集的解读/分镜产物保留。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto pr-1">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">插入位置</label>
            <div className="flex items-center gap-2">
              <select
                value={afterIndex}
                onChange={(e) => setAfterIndex(Number(e.target.value))}
                className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary/60"
              >
                {episodeLabels.length === 0 && <option value={0}>最前面（第 1 集之前）</option>}
                {episodeLabels.map((ep) => (
                  <option key={ep.index} value={ep.index}>
                    {ep.title.replace(/^第 \d+ 集：/, '')}（第 {ep.index} 集）之后
                  </option>
                ))}
                <option value={episodeLabels.length}>末尾（追加为新一集）</option>
              </select>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{insertLabel}</span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">剧集标题</label>
            <Input
              value={title}
              placeholder={defaultTitle}
              className="h-8 text-xs"
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">本集剧本内容（将并入源剧本）</label>
              <button
                type="button"
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                onClick={() => setShowSlice((v) => !v)}
              >
                <Scissors className="h-3 w-3" />
                从源版本填入区间
                <ChevronDown className={cn('h-3 w-3 transition-transform', showSlice && 'rotate-180')} />
              </button>
            </div>
            {showSlice && (
              <div className="rounded-md border border-border p-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <span className="text-[9px] text-muted-foreground">起点（0–{len}）</span>
                    <Input type="number" min={0} max={len} value={start} className="h-7 text-[10px]" onChange={(e) => setStart(Number(e.target.value))} />
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <span className="text-[9px] text-muted-foreground">终点（0–{len}）</span>
                    <Input type="number" min={0} max={len} value={end} className="h-7 text-[10px]" onChange={(e) => setEnd(Number(e.target.value))} />
                  </div>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <Button type="button" size="sm" variant="outline" className="h-6 text-[10px]" onClick={fillFromSlice}>
                    填入内容
                  </Button>
                  <span className="font-mono text-[9px] text-muted-foreground">填入后仍可编辑</span>
                </div>
              </div>
            )}
            <textarea
              value={content}
              rows={10}
              placeholder="粘贴或撰写本集剧本（含场次/对白/动作均可）"
              className="w-full resize-y rounded-md border border-border bg-background p-2 font-mono text-xs leading-relaxed outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30"
              onChange={(e) => setContent(e.target.value)}
            />
            {content.trim() && (
              <p className="font-mono text-[9px] text-muted-foreground">{content.length} 字符</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={!canSave}
            onClick={() => {
              if (!canSave) return;
              onSave({
                afterIndex,
                title: title.trim(),
                content: content.trim(),
              });
              onOpenChange(false);
              setTitle('');
              setContent('');
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            插入剧集
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
