// EXPORTS: default FilterBar
import type { ReactNode } from 'react';
import { LayoutGrid, List } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface FilterBarProps {
  filters?: ReactNode;
  sortOptions?: Array<{ label: string; value: string }>;
  sortValue?: string;
  onSortChange?: (v: string) => void;
  view: 'grid' | 'list';
  onViewChange: (v: 'grid' | 'list') => void;
}

export default function FilterBar({
  filters,
  sortOptions,
  sortValue,
  onSortChange,
  view,
  onViewChange,
}: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters}
      <div className="flex-1" />
      {sortOptions && sortOptions.length > 0 && (
        <Select value={sortValue} onValueChange={(v) => onSortChange?.(v)}>
          <SelectTrigger className="h-9 w-36">
            <SelectValue placeholder="排序" />
          </SelectTrigger>
          <SelectContent>
            {sortOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <div className="flex items-center rounded-md border border-border p-0.5">
        <button
          type="button"
          onClick={() => onViewChange('grid')}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded transition-colors',
            view === 'grid' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
          aria-label="网格视图"
        >
          <LayoutGrid className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onViewChange('list')}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded transition-colors',
            view === 'list' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
          aria-label="列表视图"
        >
          <List className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
