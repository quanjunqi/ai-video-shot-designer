// 模型起步单价/展示文本（TASK-MARKET-M6 拆分共享；卡片排序与详情抽屉共用）
// TASK-MARKET-M7：价格口径升级 —— 独立价格列（price_amount/price_unit/price_source，
// 来自 model_catalog 独立列，manual 录入或 synced 同步）**优先**；无则回退 capability.billing（能力示例价）；再无则「—」。
import type { CatalogModel } from '@/config/models/model-catalog';

interface BillingShape {
  perSecondStart?: number;
  perImage?: number;
  inputPerMTok?: number;
}

/** 起步单价（同类型排序用；跨类型不可比；独立价格列优先，回退 billing，计费缺失按正无穷垫底） */
export function startPrice(m: CatalogModel): number {
  if (m.priceAmount !== undefined) return m.priceAmount;
  const b = m.capability?.billing as BillingShape | undefined;
  if (!b) return Number.POSITIVE_INFINITY;
  if (m.type === 'video') return b.perSecondStart ?? Number.POSITIVE_INFINITY;
  if (m.type === 'image') return b.perImage ?? Number.POSITIVE_INFINITY;
  return b.inputPerMTok ?? Number.POSITIVE_INFINITY;
}

/** 起步单价展示（独立价格列优先；回退 billing；计费为空对象时「—」） */
export function priceText(m: CatalogModel): string {
  if (m.priceAmount !== undefined && m.priceUnit !== undefined && m.priceUnit.trim() !== '') {
    return `¥${m.priceAmount}/${m.priceUnit}起`;
  }
  if (m.priceAmount !== undefined) {
    return `¥${m.priceAmount}起`;
  }
  const b = m.capability?.billing as Record<string, number> | undefined;
  if (!b) return '—';
  if (m.type === 'video') return b.perSecondStart !== undefined ? `¥${b.perSecondStart}/秒起` : '—';
  if (m.type === 'image') return b.perImage !== undefined ? `¥${b.perImage}/张` : '—';
  return b.inputPerMTok !== undefined ? `¥${b.inputPerMTok}/百万Token起` : '—';
}

/** 价格来源溯源（M7：详情抽屉计费明细行展示）；无价/仅 billing 示例 → null */
export function priceSourceLabel(m: CatalogModel): string | null {
  if (m.priceAmount === undefined) return null;
  return m.priceSource === 'synced' ? '上游同步' : '人工录入';
}
