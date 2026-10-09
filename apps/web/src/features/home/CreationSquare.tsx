// EXPORTS: default CreationSquare
// 创作广场：分类 / 搜索 / 排序 + 内容卡片（类型/作者/适用模型/可复用；演示模式）
import { useState } from 'react';
import { Search, UserRound } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DemoBadge from '@/components/common/DemoBadge';
import { SQUARE_CATEGORIES, SQUARE_ITEMS } from '@/mocks/square';
import { cn } from '@/lib/utils';

const SORTS = [
  { label: '最新发布', value: 'new' },
  { label: '最受欢迎', value: 'hot' },
  { label: '可复用优先', value: 'reusable' },
];

export default function CreationSquare() {
  const [category, setCategory] = useState('推荐');
  const [keyword, setKeyword] = useState('');
  const [sort, setSort] = useState('new');

  const filtered = SQUARE_ITEMS.filter((it) => {
    const matchCat = category === '推荐' || it.category === category;
    const kw = keyword.trim().toLowerCase();
    const matchKw = kw === '' || it.title.toLowerCase().includes(kw) || it.author.toLowerCase().includes(kw);
    return matchCat && matchKw;
  }).sort((a, b) => {
    if (sort === 'reusable') return Number(b.reusable) - Number(a.reusable);
    if (sort === 'hot') return a.id.localeCompare(b.id);
    return b.id.localeCompare(a.id);
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">创作广场</h2>
        <DemoBadge />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {SQUARE_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={cn(
                'rounded-full px-3 py-1 text-xs transition-colors',
                category === c ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input type="search" placeholder="搜索作品…" value={keyword} onChange={(e) => setKeyword(e.target.value)} className="h-8 w-44 pl-8 text-xs" />
          </div>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="h-8 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {filtered.map((it) => (
          <div key={it.id} className="group overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md">
            <div className="relative aspect-[4/3] overflow-hidden bg-muted">
              <img src={it.cover} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
              <span className="!absolute left-2 top-2 z-20 rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-medium backdrop-blur">
                {it.kind}
              </span>
            </div>
            <div className="p-3">
              <div className="truncate text-sm font-medium">{it.title}</div>
              <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                <UserRound className="h-3 w-3" />
                {it.author}
              </div>
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">{it.model}</span>
                {it.reusable && (
                  <span className="shrink-0 rounded bg-success/15 px-1.5 py-0.5 text-[9px] text-success">可复用</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      {filtered.length === 0 && (
        <div className="py-10 text-center text-xs text-muted-foreground">没有匹配的作品，换个关键词试试</div>
      )}
    </div>
  );
}
