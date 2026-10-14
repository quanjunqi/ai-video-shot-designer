// 设计规范稿的原子块：编号小节标题、细线样本板、尺度统计列表。
// 组件文件只导出组件（react-refresh only-export-components）。
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { scaleLabel, spacingPx, sumCounts, type ScaleBucket, type ScaleEntry } from './uiKitScales';

export function SpecSectionHeader({
  number,
  title,
  description,
  meta,
}: {
  number: string;
  title: string;
  description: string;
  meta?: string;
}) {
  return (
    <header className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="text-muted-foreground font-mono text-sm tabular-nums">{number}</span>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <span className="text-muted-foreground text-sm">· {description}</span>
      {meta ? (
        <span className="text-muted-foreground ml-auto text-xs tabular-nums">{meta}</span>
      ) : null}
    </header>
  );
}

// 样本板：格子之间只有 1px 细线（gap-px + 底板色），不用卡片边框与阴影。
export function SpecPlate({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'bg-border/60 border-border/60 grid grid-cols-1 gap-px overflow-hidden rounded-lg border',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PlateCell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('bg-background flex min-w-0 flex-col gap-3 p-4', className)}>{children}</div>
  );
}

// 一条「样本 + 等宽小字标签」：规范稿里的最小单元。
export function SampleLabel({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <code className="min-w-0 truncate font-mono text-xs">{children}</code>
      {hint ? <span className="text-muted-foreground text-xs">{hint}</span> : null}
    </div>
  );
}

export function ScaleList({
  title,
  bucket,
  entries,
  emptyHint,
  note,
  tone = 'standard',
}: {
  title: string;
  bucket: ScaleBucket;
  entries: ScaleEntry[];
  emptyHint: string;
  note?: string;
  tone?: 'standard' | 'discrete';
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <h4 className="text-sm font-medium">{title}</h4>
        <span className="text-muted-foreground text-xs tabular-nums">
          {entries.length} 档 · {sumCounts(entries)} 处
        </span>
      </div>
      {entries.length > 0 ? (
        <ul className="flex min-w-0 flex-wrap gap-2">
          {entries.map((entry) => {
            const px = bucket === 'spacing' ? spacingPx(entry.value) : null;
            return (
              <li
                key={entry.value}
                className={cn(
                  'flex min-w-0 items-baseline gap-2 rounded-md px-2 py-1',
                  tone === 'discrete' ? 'bg-destructive/10' : 'bg-muted/50',
                )}
              >
                <code className="font-mono text-xs">{scaleLabel(bucket, entry.value)}</code>
                {px ? <span className="text-muted-foreground text-xs tabular-nums">{px}</span> : null}
                <span className="text-muted-foreground text-xs tabular-nums">
                  {entry.count} 处
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{emptyHint}</p>
      )}
      {note ? <p className="text-muted-foreground text-xs">{note}</p> : null}
    </div>
  );
}
