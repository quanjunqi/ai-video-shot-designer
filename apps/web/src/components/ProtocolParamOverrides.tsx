import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import type { ModelParam } from '@/config/models/model-catalog';
import { cn } from '@/lib/utils';

/** 协议参数覆盖视图：以协议模板参数为基线，模型只记录「覆盖默认值」或「新增参数」。
 * 行布局：左侧字段列（key + 类型/来源徽标 + 说明 + 协议默认），右侧覆盖输入（静态可覆盖，
 * model/runtime 只读）。未覆盖时输入框为「幽灵态」，hover 浮现；覆盖后主题色描边 + 恢复按钮。 */
function SourceMark({ role }: { role?: string }) {
  const map: Record<string, { label: string; cls: string; dot: string }> = {
    model: { label: '模型注入', cls: 'text-primary bg-primary/10 border-primary/20', dot: 'bg-primary' },
    runtime: { label: '执行器构造', cls: 'text-violet-400 bg-violet-500/10 border-violet-500/20', dot: 'bg-violet-400' },
    static: { label: '静态', cls: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20', dot: 'bg-zinc-400' },
  };
  const m = map[role ?? 'static'] ?? map.static;
  return (
    <span className={cn('inline-flex h-[18px] items-center gap-1 rounded-full border px-1.5 text-4xs font-medium', m.cls)}>
      <span className={cn('h-1 w-1 rounded-full', m.dot)} />
      {m.label}
    </span>
  );
}

export function ProtocolParamOverrides({
  base,
  overrides,
  onChange,
}: {
  base: ModelParam[];
  overrides: ModelParam[];
  onChange: (v: ModelParam[]) => void;
}) {
  const baseByKey = new Map(base.filter((p) => p.key.trim()).map((p) => [p.key, p]));
  const overrideByKey = new Map(overrides.filter((p) => p.key.trim()).map((p) => [p.key, p]));
  const newParams = overrides.filter((p) => p.key.trim() && !baseByKey.has(p.key));

  const setOverrideValue = (key: string, value: string) => {
    const rest = overrides.filter((p) => p.key !== key);
    if (value.trim() === '') onChange(rest); // 清空 = 恢复跟随协议默认
    else {
      const existing = overrideByKey.get(key);
      onChange([...rest, { key, value: value.trim(), role: 'static', type: existing?.type }]);
    }
  };
  const addNew = () => onChange([...overrides, { key: '', value: '', role: 'static' }]);
  const updateNew = (idx: number, patch: Partial<ModelParam>) =>
    onChange(newParams.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  const removeNew = (idx: number) => onChange(overrides.filter((p) => p !== newParams[idx]));

  const hasBase = base.length > 0;

  return (
    <div className="space-y-3">
      {/* 区域标题：说明「引用+覆盖」语义 */}
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-2xs font-medium text-foreground/90">请求参数</p>
        <p className="text-right text-4xs leading-4 text-muted-foreground">
          {hasBase ? '未覆盖的参数跟随协议模板 · 改模板全局生效' : '模型独有请求字段，透传执行器'}
        </p>
      </div>

      {hasBase ? (
        <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
          {/* 表头 */}
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,auto)] items-center gap-x-3 border-b border-border/70 bg-muted/40 px-3 py-1.5 text-4xs font-medium uppercase tracking-wider text-muted-foreground">
            <span>协议预置参数</span>
            <span className="w-[150px] text-right">本模型覆盖</span>
          </div>
          {/* 参数行 */}
          {base.map((p, idx) => {
            const ov = overrideByKey.get(p.key);
            const role = p.role ?? 'static';
            const overridden = !!ov;
            const lockable = role === 'static';
            return (
              <div
                key={p.key}
                className={cn(
                  'group grid grid-cols-[minmax(0,1fr)_minmax(0,auto)] items-center gap-x-3 px-3 py-2 transition-colors hover:bg-muted/40',
                  idx !== base.length - 1 && 'border-b border-border/50',
                  overridden && 'bg-primary/[0.03]',
                )}
              >
                {/* 字段列 */}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span className={cn('font-mono text-2xs', overridden ? 'text-primary' : 'text-foreground/90')}>{p.key}</span>
                    {p.required && <span className="text-3xs text-destructive">*</span>}
                    {p.type && (
                      <span className="rounded bg-zinc-500/10 px-1 font-mono text-4xs uppercase text-zinc-400">{p.type}</span>
                    )}
                    <SourceMark role={role} />
                    {overridden && (
                      <span className="rounded-full bg-primary/15 px-1.5 py-px text-4xs font-medium text-primary">已覆盖</span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-4xs text-muted-foreground/80" title={p.desc}>{p.desc}</p>
                  {role === 'static' && p.value !== '' && (
                    <p className="mt-px text-4xs text-muted-foreground/50">
                      协议默认 <span className="font-mono text-muted-foreground/70">{p.value}</span>
                    </p>
                  )}
                </div>
                {/* 覆盖列 */}
                <div className="w-[150px]">
                  {lockable ? (
                    <div className={cn('flex items-center gap-1 transition-all', overridden ? 'opacity-100' : 'opacity-60 group-hover:opacity-100')}>
                      <div className="relative w-full">
                        <Input
                          value={ov?.value ?? ''}
                          onChange={(e) => setOverrideValue(p.key, e.target.value)}
                          placeholder={role === 'static' ? '跟随协议' : '—'}
                          className={cn(
                            'h-6 w-full pr-5 text-3xs font-mono transition-all',
                            overridden
                              ? 'border-primary/40 bg-primary/[0.06] text-primary ring-1 ring-primary/20'
                              : 'border-transparent bg-transparent placeholder:text-muted-foreground/40 hover:border-border/60 hover:bg-background/60 focus-visible:border-primary/50 focus-visible:bg-background',
                          )}
                        />
                        {overridden && (
                          <button
                            type="button"
                            onClick={() => setOverrideValue(p.key, '')}
                            className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-primary/70 transition-colors hover:text-primary"
                            title="恢复跟随协议默认"
                          >
                            <RotateCcw className="h-2.5 w-2.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <span className="block text-right text-4xs text-muted-foreground/50">由执行器决定</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border/70 bg-card/40 px-3 py-2.5 text-3xs leading-5 text-muted-foreground">
          未关联协议模板：下方参数为本模型独有请求字段，执行时随请求体透传。
        </div>
      )}

      {/* 模型独有参数 */}
      <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-2.5">
        <div className="flex items-center justify-between">
          <p className="text-3xs font-medium text-foreground/80">{hasBase ? '本模型新增参数' : '模型独有参数'}</p>
          {hasBase && <span className="text-4xs text-muted-foreground/70">协议无此字段 · 仅本模型生效</span>}
        </div>
        {newParams.length === 0 ? (
          <p className="py-0.5 text-4xs text-muted-foreground/60">暂无，可添加厂商特有字段（如 quality、resolution、top_p）</p>
        ) : (
          <div className="space-y-1.5">
            {newParams.map((p, idx) => (
              <div key={idx} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2">
                <Input
                  value={p.key}
                  onChange={(e) => updateNew(idx, { key: e.target.value })}
                  placeholder="字段名（如 quality）"
                  className="h-7 bg-background/70 font-mono text-2xs"
                />
                <Input
                  value={p.value}
                  onChange={(e) => updateNew(idx, { value: e.target.value })}
                  placeholder="值（如 high）"
                  className="h-7 bg-background/70 font-mono text-2xs"
                />
                <Button type="button" size="sm" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeNew(idx)} title="删除参数">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <Button type="button" size="sm" variant="outline" className="h-7 text-3xs text-muted-foreground hover:text-foreground" onClick={addNew}>
          <Plus className="mr-1 h-3 w-3" />
          添加新参数
        </Button>
      </div>
    </div>
  );
}
