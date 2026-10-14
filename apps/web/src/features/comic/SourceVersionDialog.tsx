// EXPORTS: default SourceVersionDialog
// 源版本迭代（4.1 专业修订）：查看版本历史，编辑全文保存为新版本（旧版本留档可追溯），保存后重置拆集重新候选核对
// 打开即重建（调用方传 key），draft 以当前版本文本初始化，无需 effect 同步
import { useState } from 'react';
import { History, FileText, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useProjectStore } from '@/stores/useProjectStore';


export default function SourceVersionDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId));
  const reviseSourceText = useProjectStore((s) => s.reviseSourceText);
  const current = project?.sourceVersions[project.currentSourceVersion - 1];
  const [draft, setDraft] = useState(() => current?.text ?? '');
  const [submitting, setSubmitting] = useState(false);

  if (!project || !current) return null;

  const nextVersion = (project.sourceVersions[project.sourceVersions.length - 1]?.version ?? project.currentSourceVersion) + 1;
  const trimmed = draft.trim();
  const canSave = trimmed.length > 0;
  const dirty = trimmed !== current.text;

  const submit = () => {
    if (!canSave || !dirty) return;
    setSubmitting(true);
    // 模拟服务端版本入库 → 落盘
    window.setTimeout(() => {
      reviseSourceText(projectId, trimmed);
      setSubmitting(false);
      onOpenChange(false);
      toast.success(`已保存为新版本 v${nextVersion}，重新拆集候选核对`);
    }, 600);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            修订原文（源版本迭代）
          </DialogTitle>
        </DialogHeader>

        {/* 版本历史 */}
        <div className="shrink-0 space-y-1.5">
          <Label className="text-xs text-muted-foreground">版本历史（留档可追溯）</Label>
          <div className="flex flex-wrap gap-1.5">
            {project.sourceVersions.map((v) => (
              <div
                key={v.version}
                className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 font-mono text-3xs"
              >
                <span className={v.version === project.currentSourceVersion ? 'font-semibold text-primary' : 'text-muted-foreground'}>
                  v{v.version}
                </span>
                <span className="text-muted-foreground">· {v.text.length} 字</span>
                {v.version === project.currentSourceVersion && <Check className="h-3 w-3 text-primary" />}
              </div>
            ))}
          </div>
        </div>

        {/* 原文编辑区：超长内容在此滚动 */}
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              全文编辑（保存为 <span className="font-mono text-primary">v{nextVersion}</span>，旧版本原样保留）
            </Label>
            <textarea
              value={draft}
              rows={14}
              placeholder="粘贴修订后的完整剧本…"
              className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-2 font-mono text-xs leading-relaxed outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30"
              onChange={(e) => setDraft(e.target.value)}
            />
            <p className="text-2xs text-muted-foreground">
              当前 {draft.length} 字
              {!dirty && draft.length > 0 ? '（未修改）' : ''}
            </p>
            <p className="flex items-start gap-1.5 rounded-md bg-muted/40 p-2 text-2xs leading-relaxed text-muted-foreground">
              <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              保存后：当前源版本切换为 v{nextVersion}，旧版本剧集投影被清空，系统按新原文重新拆集并回到「候选待核对」；已确认的解读 / 资产 / 生产产物均属于旧版本，不会迁移。
            </p>
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 pt-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" disabled={!canSave || !dirty || submitting} onClick={submit}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
            {submitting ? '保存中…' : `保存为新版本 v${nextVersion}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
