import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Code2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ModelParam, ParamSource } from '@/config/models/model-catalog';

const RESPONSE_TYPES = ['string', 'number', 'bool', 'object', 'array'] as const;
const SOURCE_OPTIONS: { value: ParamSource; label: string }[] = [
  { value: 'static', label: '静态默认' },
  { value: 'model', label: '模型注入' },
  { value: 'runtime', label: '运行时注入' },
];
const TYPE_BADGE_COLOR: Record<string, string> = {
  string: 'bg-zinc-500/10 text-zinc-400',
  number: 'bg-amber-500/10 text-amber-400',
  bool: 'bg-sky-500/10 text-sky-400',
  array: 'bg-fuchsia-500/10 text-fuchsia-400',
  object: 'bg-emerald-500/10 text-emerald-400',
};
const ROLE_BADGE: Record<string, { label: string; cls: string }> = {
  static: { label: '静态', cls: 'bg-zinc-500/10 text-zinc-400' },
  model: { label: '模型', cls: 'bg-primary/10 text-primary' },
  runtime: { label: '运行时', cls: 'bg-violet-500/10 text-violet-400' },
};

interface JsonRow { key?: unknown; value?: unknown; role?: unknown; type?: unknown; required?: unknown; desc?: unknown }

/** 参数编辑器：key + 来源分类 + 值/说明 + 类型徽标，支持 JSON 批量导入。
 *  request 模式：参数名 + 来源（static 静态默认 / model 模型注入 / runtime 运行时注入）+ 值；
 *  response 模式：字段路径（data.0.url 等点路径）+ 提取类型 Select + 说明。 */
export function ParamEditor({
  title,
  desc,
  params,
  onChange,
  mode = 'request',
  keyPlaceholder = '参数名（如 quality）',
  valuePlaceholder = '参数值（如 high）',
}: {
  title: string;
  desc: string;
  params: ModelParam[];
  onChange: (next: ModelParam[]) => void;
  mode?: 'request' | 'response';
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}) {
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const applyJson = () => {
    try {
      const parsed: unknown = JSON.parse(jsonText);
      const arr: JsonRow[] = Array.isArray(parsed)
        ? (parsed as JsonRow[])
        : Object.entries(parsed as Record<string, unknown>).map(([key, value]) => ({ key, value: typeof value === 'object' ? JSON.stringify(value) : String(value) }));
      if (arr.some((x) => !x || typeof x.key !== 'string')) throw new Error('bad shape');
      const rows: ModelParam[] = arr
        .filter((x) => (x.key as string).trim())
        .map((x) => ({
          key: (x.key as string).trim(),
          value: x.value === undefined || x.value === null ? '' : String(x.value),
          role: (mode === 'request' && (x.role === 'model' || x.role === 'runtime')) ? (x.role as ParamSource) : undefined,
          type: (RESPONSE_TYPES as readonly string[]).includes(x.type as string) ? (x.type as ModelParam['type']) : undefined,
          required: x.required === true ? true : undefined,
          desc: typeof x.desc === 'string' && x.desc ? x.desc : undefined,
        }));
      onChange(rows);
      setJsonOpen(false);
      setJsonText('');
      toast.success(`已导入 ${rows.length} 个参数`);
    } catch {
      toast.error('JSON 解析失败：需为对象 {"key":"value"} 或数组 [{"key":"value","role":"static|model|runtime","type":"string|number|bool|object|array","required":true,"desc":"说明"}]');
    }
  };
  const setRole = (i: number, role: ParamSource) => {
    onChange(params.map((x, j) => (j === i ? { ...x, role } : x)));
  };
  const setType = (i: number, type: string) => {
    onChange(params.map((x, j) => (j === i ? { ...x, type: type as ModelParam['type'] } : x)));
  };
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-muted-foreground">{title}</p>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => setJsonOpen((v) => !v)}>
            <Code2 className="h-3 w-3" />
            {jsonOpen ? '收起' : '粘贴 JSON'}
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => onChange([...params, mode === 'response' ? { key: '', value: '', type: 'string' } : { key: '', value: '', role: 'static' }])}>
            <Plus className="h-3 w-3" />
            添加{mode === 'response' ? '字段' : '参数'}
          </Button>
        </div>
      </div>
      {jsonOpen && (
        <div className="space-y-1.5">
          <Input
            className="h-16 whitespace-pre font-mono text-[11px] leading-4"
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            placeholder={mode === 'response'
              ? '[{"key":"choices.0.message.content","type":"string","value":"文本正文"}]'
              : '[{"key":"temperature","value":"0.7","type":"number","role":"static","desc":"采样温度"}]'}
          />
          <div className="flex items-center justify-end gap-1.5">
            <Button type="button" size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => { setJsonOpen(false); setJsonText(''); }}>取消</Button>
            <Button type="button" size="sm" className="h-6 text-[11px]" onClick={applyJson}>导入（替换）</Button>
          </div>
        </div>
      )}
      {params.length === 0 && !jsonOpen && <p className="text-[10px] text-muted-foreground">{desc}</p>}
      {params.length > 0 && (
        <div className="space-y-1.5">
          {params.map((p, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto_1.3fr_auto_auto] items-center gap-1.5">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-1">
                  <Input
                    className="h-8 text-xs"
                    value={p.key}
                    onChange={(e) => onChange(params.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))}
                    placeholder={keyPlaceholder}
                  />
                  {p.required && <span className="shrink-0 text-[11px] font-semibold leading-none text-destructive" title="必填">*</span>}
                </div>
              </div>
              {mode === 'request' ? (
                <Select value={p.role ?? 'static'} onValueChange={(v) => setRole(i, v as ParamSource)}>
                  <SelectTrigger className="h-8 w-[76px] px-2 text-[10px]" title="参数来源：静态默认 / 模型注入（providerModel）/ 运行时注入（执行器按业务构造）">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={p.type ?? 'string'} onValueChange={(v) => setType(i, v)}>
                  <SelectTrigger className="h-8 w-[86px] px-2 text-[10px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RESPONSE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Input
                className="h-8 text-xs"
                value={p.value}
                onChange={(e) => onChange(params.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                placeholder={valuePlaceholder}
                title={p.desc}
              />
              <div className="flex shrink-0 items-center gap-1">
                {mode === 'request' ? (
                  <>
                    {p.type && <Badge className={`h-4 px-1 font-mono text-[9px] ${TYPE_BADGE_COLOR[p.type] ?? TYPE_BADGE_COLOR.string}`}>{p.type}</Badge>}
                    <Badge className={`h-4 px-1 text-[9px] ${ROLE_BADGE[p.role ?? 'static'].cls}`}>{ROLE_BADGE[p.role ?? 'static'].label}</Badge>
                  </>
                ) : (
                  <span className="max-w-[120px] truncate text-[9px] text-muted-foreground" title={p.desc}>{p.desc ?? '—'}</span>
                )}
              </div>
              <Button type="button" size="sm" variant="ghost" className="h-8 w-7" onClick={() => onChange(params.filter((_, j) => j !== i))} title="删除该参数">
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
