// 策展（O-1 Phase D）纯逻辑：哪些上游还没进目录、默认值怎么给、提交前怎么自查。
//
// 为什么单独成模块：与 T8 的 model-candidates 同一理由 —— 这段规则必须可单测，
// 而"默认值怎么给"直接决定用户会不会把错的东西写进产品目录（写进去就对外可见了）。
import type { CatalogModel } from '@/config/models/model-catalog';
import type { CurateModelRequest, SupplyItem } from '@/lib/api/client';

/** 产品面只允许这三类（与后端 model_catalog 的约束一致）。 */
export type ProductModelType = 'text' | 'image' | 'video';

/** 上游与产品面的对应键：同一 (渠道, 上游模型) 只应策展一次。 */
export function curatedKey(m: Pick<CatalogModel, 'channelId' | 'providerModel'>): string {
  return `${m.channelId}::${m.providerModel}`;
}

/** 已经进过目录的键集合。用于把供给池标成「已策展 / 未策展」。 */
export function curatedKeys(models: Pick<CatalogModel, 'channelId' | 'providerModel'>[]): Set<string> {
  return new Set(models.map(curatedKey));
}

export interface SupplyRow {
  item: SupplyItem;
  curated: boolean;
  /** 已下架（missingSince 非空）：仍可策展，但界面要显式提醒 */
  missing: boolean;
}

/**
 * 把供给池与目录对齐，按 providerModel 稳定排序。
 * 刻意**不隐藏**已策展与已下架的行 —— 隐藏会让人以为"上游没有它"。
 */
export function supplyRows(items: SupplyItem[], models: Pick<CatalogModel, 'channelId' | 'providerModel'>[]): SupplyRow[] {
  const done = curatedKeys(models);
  return items
    .map((item) => ({ item, curated: done.has(curatedKey(item)), missing: Boolean(item.missingSince) }))
    .sort((a, b) => a.item.providerModel.localeCompare(b.item.providerModel));
}

/**
 * 从上游标签**推测**产品面类型；认不出返回 ''（⇒ 界面必须让用户选）。
 *
 * ★ 明确不猜：实测真实中转站返回的标签是 `"model"` 这种粒度，它既可能是图像也可能是文本。
 * 猜错的后果是模型被写进错误的分类、在界面上以错误的能力出现（比报错更难发现）。
 */
export function inferModelType(upstreamType: string): ProductModelType | '' {
  const t = (upstreamType ?? '').trim().toLowerCase();
  if (t === 'text' || t === 'image' || t === 'video') return t;
  return '';
}

/** 生成候选 model id：稳定（同输入同结果）、只含安全字符、与既有 id 不冲突。 */
export function proposeModelId(channelId: string, providerModel: string, existingIds: Iterable<string>): string {
  const taken = new Set(existingIds);
  const slug = `${channelId}_${providerModel}`
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .slice(0, 48);
  const base = `mod_${slug || 'model'}`;
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** 名称默认值：上游展示名优先，退回上游模型标识（**不回退到空** —— 空会让用户提交失败）。 */
export function proposeName(item: SupplyItem): string {
  return (item.displayName || '').trim() || item.providerModel;
}

/** 家族默认值：用上游模型标识（跨渠道同款模型因此能自然聚成一组，正是 T8 分组键的输入）。 */
export function proposeFamily(item: SupplyItem): string {
  return item.providerModel;
}

export interface CurateDraft {
  id: string;
  name: string;
  family: string;
  type: ProductModelType | '';
  logicalModelId?: string;
  protocolTemplateId?: string;
  routePriority: string; // 表单里是字符串（Input 的值），提交前才转数字
  note?: string;
  priceAmount: string;
  priceUnit: string;
}

/** 由供给行生成表单默认值。 */
export function draftFromSupply(item: SupplyItem, existingIds: Iterable<string>): CurateDraft {
  return {
    id: proposeModelId(item.channelId, item.providerModel, existingIds),
    name: proposeName(item),
    family: proposeFamily(item),
    type: inferModelType(item.upstreamType),
    logicalModelId: undefined,
    protocolTemplateId: undefined,
    routePriority: '10',
    note: '',
    priceAmount: item.pricingAmount != null ? String(item.pricingAmount) : '',
    priceUnit: item.pricingUnit || '',
  };
}

/**
 * 提交前自查（把后端的 422 提前到界面上）。
 * 返回错误文案；通过返回 null。
 */
export function validateCurateDraft(d: CurateDraft): string | null {
  if (!d.id.trim()) return '需要模型 id';
  if (!d.family.trim()) return '需要家族（family）';
  if (!d.name.trim()) return '需要展示名';
  if (!d.type) return '必须选择产品面类型（上游标签无法确定它属于 text/image/video）';
  if (d.routePriority.trim() && !/^\d+$/.test(d.routePriority.trim())) return '优先级必须是非负整数';
  if (d.priceAmount.trim() && !/^\d+(\.\d+)?$/.test(d.priceAmount.trim())) return '售价必须是数字';
  if (d.priceAmount.trim() && !d.priceUnit.trim()) return '填了售价就必须填单位（如 次 / 千 token）';
  if (d.priceUnit.trim() && !d.priceAmount.trim()) return '填了单位就必须填售价';
  return null;
}

/** 把表单组装成请求体：**空的可选项一律不发送**（发送空串会覆盖后端语义）。 */
export function curateRequest(
  item: SupplyItem,
  d: CurateDraft,
  opts: { priceIsEstimate?: boolean } = {},
): CurateModelRequest {
  const out: CurateModelRequest = {
    id: d.id.trim(),
    family: d.family.trim(),
    name: d.name.trim(),
    type: d.type as ProductModelType,
    channelId: item.channelId,
    providerModel: item.providerModel,
  };
  if (d.logicalModelId) out.logicalModelId = d.logicalModelId;
  if (d.protocolTemplateId) out.protocolTemplateId = d.protocolTemplateId;
  const priority = d.routePriority.trim();
  if (priority) out.routePriority = Number(priority);
  if (d.note && d.note.trim()) out.note = d.note.trim();
  const price = d.priceAmount.trim();
  if (price) {
    out.priceAmount = Number(price);
    out.priceUnit = d.priceUnit.trim();
    // 价格来自上游且非人工估值 ⇒ 允许后端直接沿用 synced 来源（后端仍以供给池为准）
    void opts.priceIsEstimate;
  }
  return out;
}
