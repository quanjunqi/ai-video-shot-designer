// EXPORTS: default BatchGenerateBar
// 批量生成（5.2：每对象前置需求批准且模型兼容时，独立任务一起提交；列表逐行费用预估）
import { Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function BatchGenerateBar({
  selectedCount,
  totalCost,
  disabled,
  onGenerate,
}: {
  selectedCount: number;
  totalCost: string;
  disabled: boolean;
  onGenerate: () => void;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border p-3 transition-colors',
        selectedCount > 0 ? 'border-primary/40 bg-card' : 'border-border bg-card',
      )}
    >
      <Layers className="h-4 w-4 shrink-0 text-primary" />
      <span className="text-xs">
        已选 <span className="font-semibold">{selectedCount}</span> 个资产
      </span>
      <span className="font-mono text-[10px] text-muted-foreground">预估费用 {totalCost}</span>
      <Button
        type="button"
        size="sm"
        className="ml-auto"
        disabled={disabled || selectedCount === 0}
        onClick={onGenerate}
      >
        批量生成
      </Button>
      <span className="text-[10px] text-muted-foreground">每个任务独立进度，完成后停在候选待选择</span>
    </div>
  );
}
