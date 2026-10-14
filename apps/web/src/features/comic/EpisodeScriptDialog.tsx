// EXPORTS: default EpisodeScriptDialog
// 单集剧本查看/编辑弹窗：展示该集完整剧本原文，支持直接编辑
// 保存时由父组件调用 reviseEpisodeScript → 同步到源剧本（产生新版本 v+1，后续剧集 span 自动重映射）
// 注意：父组件需以 key 控制每次打开时重置草稿（如 key={episode.id + open}）
import { useState } from 'react';
import { BookOpen, Save } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Episode } from '@/types';

export default function EpisodeScriptDialog({
  episode,
  sourceText,
  open,
  onOpenChange,
  onSave,
}: {
  episode: Episode;
  sourceText: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (newScript: string) => void;
}) {
  const sliced = sourceText.slice(episode.sourceSpan.start, episode.sourceSpan.end);
  const initial = episode.scriptDraft ?? sliced;
  const [draft, setDraft] = useState(initial);
  const isEdited = draft !== (episode.scriptDraft ?? sliced);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            {episode.title.replace(/^第 \d+ 集：/, '') || `第 ${episode.index} 集`} · 单集剧本
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <span>原文 {episode.sourceSpan.start}–{episode.sourceSpan.end} · {sliced.length} 字符</span>
            {isEdited && <Badge variant="secondary" className="text-3xs">已编辑（保存后同步源剧本）</Badge>}
          </DialogDescription>
        </DialogHeader>
        <textarea
          value={draft}
          rows={18}
          placeholder="该集剧本原文，可直接修改（保存后同步到源剧本，自动产生新版本并映射后续剧集）"
          className="w-full flex-1 resize-y rounded-lg border border-border bg-background p-3 font-mono text-xs leading-relaxed outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30"
          onChange={(e) => setDraft(e.target.value)}
        />
        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              onSave(draft.trim());
              onOpenChange(false);
            }}
          >
            <Save className="h-3.5 w-3.5" />
            保存剧本
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
