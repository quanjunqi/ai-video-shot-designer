// 规则版本历史列表（拆集/环节规则共用）：v{n} + 保存时间 + 说明 + 字段摘要 + 恢复
// 恢复 = 把该版本快照写回当前并生成新版本（store.restoreVersion），历史链不中断
import { useState } from 'react';
import { History, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface VersionRow {
  version: number;
  savedAt: number;
  note?: string;
  snapshot: Record<string, unknown>;
}

export default function RuleVersionList({
  currentVersion,
  versions,
  onRestore,
  renderSummary,
}: {
  currentVersion: number;
  versions: VersionRow[];
  onRestore: (version: number) => void;
  renderSummary: (snapshot: Record<string, unknown>) => string;
}) {
  const [open, setOpen] = useState(false);
  if (!versions || versions.length === 0) return null;
  const fmt = (ts: number) =>
    new Date(ts).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="mt-2 border-t border-border pt-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
      >
        <History className="h-3 w-3" />
        版本历史（{versions.length}）
        <span className="text-primary">当前 v{currentVersion}</span>
        <span className="ml-auto">{open ? '收起' : '展开'}</span>
      </button>
      {open && (
        <div className="mt-1.5 space-y-1.5">
          {[...versions].reverse().map((v) => (
            <div key={v.version} className="flex items-start gap-2 rounded-md bg-muted/40 p-2">
              <Badge variant="outline" className="shrink-0 font-mono text-[10px]">v{v.version}</Badge>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>{fmt(v.savedAt)}</span>
                  {v.note && <span className="truncate text-primary">{v.note}</span>}
                </div>
                <div className="line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">
                  {renderSummary(v.snapshot)}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-5 shrink-0 gap-1 px-1.5 text-[10px]"
                onClick={() => {
                  onRestore(v.version);
                  setOpen(false);
                }}
                title={`恢复 v${v.version} 为当前内容（生成新版本）`}
              >
                <RotateCcw className="h-3 w-3" />
                恢复
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
