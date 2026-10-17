// EXPORTS: ModelMarketCard
// 模型广场卡片（TASK-IA-001 v14 §2.2 落地补全 / TASK-MARKET-M6）：
// 名称/providerModel + 类型/渠道/价格/状态 + 关键能力行（文本=maxTokens、图片=参考图/比例、视频=时长/模式），
// 扫卡片即可判断「这个模型能干什么」。设默认=Admin+（个人默认 defaultPrefs）。
import { Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CatalogModel } from '@/config/models/model-catalog';
import { priceText } from './modelPrice';

type ModelType = 'text' | 'image' | 'video';
const TYPE_LABEL: Record<ModelType, string> = { text: '文本', image: '图片', video: '视频' };

/** 关键能力行（按类型展示决策信息；capability 为空对象时显示「—」兜底） */
function keyCapabilityText(m: CatalogModel): string[] {
  const c = m.capability as unknown as Record<string, unknown>;
  if (m.type === 'text') {
    const maxTokens = c.maxTokens as number | undefined;
    const parts: string[] = [];
    if (typeof maxTokens === 'number') parts.push(`最大 ${maxTokens} Tokens`);
    if (c.isReasoning) parts.push('推理');
    if (c.streaming) parts.push('流式');
    return parts.length > 0 ? parts : ['能力未校准'];
  }
  if (m.type === 'image') {
    const parts: string[] = [];
    if (c.refImage) parts.push('参考图生图');
    const ratios = c.aspectRatioCount as number | undefined;
    if (typeof ratios === 'number') parts.push(`${ratios} 比例`);
    const tiers = c.qualityTiers as number | undefined;
    if (typeof tiers === 'number') parts.push(`${tiers} 档清晰度`);
    return parts.length > 0 ? parts : ['能力未校准'];
  }
  const parts: string[] = [];
  const min = c.minDurationSeconds as number | undefined;
  const max = c.maxDurationSeconds as number | undefined;
  if (typeof min === 'number' && typeof max === 'number') parts.push(`${min}–${max}s`);
  const modes = c.modes as unknown[] | undefined;
  if (Array.isArray(modes) && modes.length > 0) parts.push(`${modes.length} 种模式`);
  return parts.length > 0 ? parts : ['能力未校准'];
}

export default function ModelMarketCard({
  m,
  channelName,
  isDefault,
  disabled,
  catalogIsDemo,
  canDefault,
  onOpen,
  onDefault,
}: {
  m: CatalogModel;
  channelName: (id: string) => string;
  isDefault: boolean;
  disabled: boolean;
  catalogIsDemo: boolean;
  canDefault: boolean;
  onOpen: () => void;
  onDefault: () => void;
}) {
  const caps = keyCapabilityText(m);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className={cn(
        'group flex cursor-pointer flex-col gap-2 rounded-xl border border-border bg-card p-4 text-left transition-colors',
        'hover:border-primary/40 hover:bg-accent/40',
        disabled && 'opacity-70',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{m.name}</p>
          <p className="truncate text-2xs text-muted-foreground">{m.providerModel}</p>
        </div>
        {isDefault && (
          <Badge variant="default" className="gap-1 shrink-0">
            <Check className="h-3 w-3" />
            默认
          </Badge>
        )}
        {catalogIsDemo && (
          <Badge variant="outline" className="shrink-0 text-2xs text-amber-600">演示</Badge>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className="font-mono text-2xs">{TYPE_LABEL[m.type]}</Badge>
        <Badge variant="outline" className="text-2xs">{channelName(m.channelId)}</Badge>
        {disabled ? (
          <Badge variant="destructive" className="text-2xs">已停用</Badge>
        ) : (
          <Badge variant="outline" className="text-2xs font-mono">{priceText(m)}</Badge>
        )}
      </div>
      {/* TASK-MARKET-M6：关键能力行（扫卡片即知能力） */}
      {caps.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {caps.map((c) => (
            <span key={c} className="rounded bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground">{c}</span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1 text-2xs text-muted-foreground">
        查看详情
        {canDefault && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto h-6 px-2 text-2xs"
            disabled={disabled || !canDefault}
            onClick={(e) => {
              e.stopPropagation();
              onDefault();
            }}
          >
            设为默认
          </Button>
        )}
      </div>
    </div>
  );
}
