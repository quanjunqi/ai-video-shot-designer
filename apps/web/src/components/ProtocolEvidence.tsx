import { AlertTriangle, FileText, Radar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { summarizeEvidence, hasEvidence, type EvidenceItem } from '@/lib/protocol-evidence';
import type { ProtocolTemplate } from '@/config/models/model-catalog';

function Column({
  title,
  hint,
  tone,
  icon,
  items,
}: {
  title: string;
  hint: string;
  tone: string;
  icon: React.ReactNode;
  items: EvidenceItem[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex items-center gap-1.5">
        <span className={tone}>{icon}</span>
        <span className="text-3xs font-medium">{title}</span>
        <span className="truncate text-4xs text-muted-foreground">{hint}</span>
      </div>
      <dl className="space-y-0.5">
        {items.map((it) => (
          <div key={`${it.label}:${it.value}`} className="flex gap-1.5 text-3xs">
            <dt className="shrink-0 text-muted-foreground">{it.label}</dt>
            <dd className="min-w-0 flex-1 truncate font-mono" title={it.value}>
              {it.href ? (
                <a href={it.href} target="_blank" rel="noreferrer" className="underline decoration-dotted">
                  {it.value}
                </a>
              ) : (
                it.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * ADR-008 §3 的界面呈现：**两类证据并列**，且**差异必须可见**。
 *
 * 刻意不做"合成一个值"的展示 —— 文档是外部输入、会过期或本身有误；
 * 实测才是事实。把两者摆在一起、并把冲突显式标出来，是这个组件存在的全部理由。
 */
export function ProtocolEvidence({ template }: { template: ProtocolTemplate }) {
  const s = summarizeEvidence(template.docRef, template.observedEvidence);
  if (!hasEvidence(s)) return null;
  return (
    <div className="space-y-1.5 rounded-md border border-border/60 bg-muted/20 px-2.5 py-2">
      {s.discrepancies.length > 0 && (
        <div className="flex items-start gap-1.5 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
          <div className="min-w-0 space-y-0.5">
            <div className="text-3xs font-medium text-amber-500">
              文档与实测不一致（以实测为准，差异保留可见）
            </div>
            {s.discrepancies.map((d) => (
              <div key={d} className="truncate font-mono text-3xs" title={d}>
                {d}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <Column
          title="文档依据"
          hint="外部输入，可能过期或本身有误"
          tone="text-muted-foreground"
          icon={<FileText className="h-3 w-3" />}
          items={s.doc}
        />
        <Column
          title="实测证据"
          hint="事实；冲突时以它为准"
          tone="text-emerald-500"
          icon={<Radar className="h-3 w-3" />}
          items={s.observed}
        />
      </div>
      {s.observed.length === 0 && (
        <Badge variant="outline" className="font-mono text-4xs">尚未实测</Badge>
      )}
    </div>
  );
}
