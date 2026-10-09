// EXPORTS: default ResourceList
// 通用列表容器：标题 + 数量 + 筛选/排序 + 网格/列表 + 创建按钮
import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import FilterBar from '@/components/common/FilterBar';
import EmptyState from '@/components/common/EmptyState';

interface ResourceListProps<T> {
  title: string;
  count: number;
  filters?: ReactNode;
  sortOptions?: Array<{ label: string; value: string }>;
  sortValue?: string;
  onSortChange?: (v: string) => void;
  view: 'grid' | 'list';
  onViewChange: (v: 'grid' | 'list') => void;
  items: T[];
  renderCard: (item: T) => ReactNode;
  renderRow: (item: T) => ReactNode;
  onCreate?: () => void;
  createLabel?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  headerExtra?: ReactNode;
}

export default function ResourceList<T>({
  title,
  count,
  filters,
  sortOptions,
  sortValue,
  onSortChange,
  view,
  onViewChange,
  items,
  renderCard,
  renderRow,
  onCreate,
  createLabel,
  emptyTitle,
  emptyDescription,
  headerExtra,
}: ResourceListProps<T>) {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-6 py-6">
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <h1 className="text-lg font-semibold">{title}</h1>
        <Badge variant="outline" className="font-mono text-xs">
          {count}
        </Badge>
        <div className="flex-1" />
        {headerExtra}
        {onCreate && createLabel && (
          <Button type="button" onClick={onCreate}>
            <Plus className="h-4 w-4" />
            {createLabel}
          </Button>
        )}
      </div>

      <div className="mb-4">
        <FilterBar
          filters={filters}
          sortOptions={sortOptions}
          sortValue={sortValue}
          onSortChange={onSortChange}
          view={view}
          onViewChange={onViewChange}
        />
      </div>

      {items.length === 0 ? (
        <EmptyState title={emptyTitle ?? '暂无内容'} description={emptyDescription} actionLabel={createLabel} onAction={onCreate} />
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-4">{items.map(renderCard)}</div>
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">{items.map(renderRow)}</div>
      )}
    </div>
  );
}
