// 模型起步单价/展示文本（TASK-MARKET-M6 拆分共享；卡片排序与详情抽屉共用）
import type { CatalogModel } from '@/config/models/model-catalog';

/** 起步单价（同类型排序用；跨类型不可比；计费缺失按正无穷垫底、展示「—」） */
export function startPrice(m: CatalogModel): number {
  const b = m.capability?.billing as { perSecondStart?: number; perImage?: number; inputPerMTok?: number } | undefined;
  if (!b) return Number.POSITIVE_INFINITY;
  if (m.type === 'video') return b.perSecondStart ?? Number.POSITIVE_INFINITY;
  if (m.type === 'image') return b.perImage ?? Number.POSITIVE_INFINITY;
  return b.inputPerMTok ?? Number.POSITIVE_INFINITY;
}

/** 起步单价展示（计费为空对象时「—」） */
export function priceText(m: CatalogModel): string {
  const b = m.capability?.billing as Record<string, number> | undefined;
  if (!b) return '—';
  if (m.type === 'video') return b.perSecondStart !== undefined ? `¥${b.perSecondStart}/秒起` : '—';
  if (m.type === 'image') return b.perImage !== undefined ? `¥${b.perImage}/张` : '—';
  return b.inputPerMTok !== undefined ? `¥${b.inputPerMTok}/百万Token起` : '—';
}
