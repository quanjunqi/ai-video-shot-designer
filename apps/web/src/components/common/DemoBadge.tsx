// EXPORTS: default DemoBadge
// 演示模式标注（3.1/3.2：不能伪装成真实生产状态）
import { FlaskConical } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export default function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge variant="outline" className={cn('gap-1 border-dashed text-[10px] font-normal text-muted-foreground', className)}>
      <FlaskConical className="h-3 w-3" />
      演示模式
    </Badge>
  );
}
