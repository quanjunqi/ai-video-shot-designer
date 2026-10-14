// 尺度统计（生成物字段 UI_CATALOG.scales，由 scripts/ui-inventory.mjs 从代码统计）。
// 设计规范视图要把「标准档位」与「待收敛的离散步长」并列展示，所以这里负责：
//   1) 防御式读取（字段缺席 / 形状不符时退化为空数组，不让页面崩）；
//   2) 把统计值翻译成可读标签（xs → text-xs，10px → text-[10px]，DEFAULT → rounded）。
export type ScaleEntry = { value: string; count: number };

export const SCALE_BUCKETS = [
  'text',
  'textArbitrary',
  'spacing',
  'spacingArbitrary',
  'radius',
  'radiusArbitrary',
  'shadow',
  'shadowArbitrary',
  'leading',
  'tracking',
] as const;

export type ScaleBucket = (typeof SCALE_BUCKETS)[number];

export type ScalesReport = {
  scannedFiles: number | null;
  buckets: Record<ScaleBucket, ScaleEntry[]>;
};

function asRecord(source: unknown): Record<string, unknown> | null {
  return source && typeof source === 'object' ? (source as Record<string, unknown>) : null;
}

export function sumCounts(entries: ScaleEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.count, 0);
}

export function readScaleEntries(source: unknown, key: string): ScaleEntry[] {
  const bucket = asRecord(source)?.[key];
  if (!Array.isArray(bucket)) return [];
  const entries: ScaleEntry[] = [];
  for (const item of bucket) {
    const record = asRecord(item);
    if (!record) continue;
    if (typeof record.value !== 'string' || typeof record.count !== 'number') continue;
    entries.push({ value: record.value, count: record.count });
  }
  return entries.sort((a, b) => b.count - a.count);
}

export function readScales(catalog: unknown): ScalesReport {
  const scales = asRecord(catalog)?.['scales'];
  const buckets = {} as Record<ScaleBucket, ScaleEntry[]>;
  for (const bucket of SCALE_BUCKETS) buckets[bucket] = readScaleEntries(scales, bucket);
  const scannedFiles = asRecord(scales)?.['scannedFiles'];
  return {
    scannedFiles: typeof scannedFiles === 'number' ? scannedFiles : null,
    buckets,
  };
}

// 离散步长（任意值写法）：不是尺度 token，规范视图里单独一列提示收敛（V-001 / V-003）。
export function isDiscreteBucket(bucket: ScaleBucket): boolean {
  return bucket.endsWith('Arbitrary');
}

export function scaleLabel(bucket: ScaleBucket, value: string): string {
  switch (bucket) {
    case 'text':
      return `text-${value}`;
    case 'textArbitrary':
      return `text-[${value}]`;
    case 'spacing':
      return value;
    case 'spacingArbitrary':
      return `[${value}]`;
    case 'radius':
      return value === 'DEFAULT' ? 'rounded' : `rounded-${value}`;
    case 'radiusArbitrary':
      return `rounded-[${value}]`;
    case 'shadow':
      return value === 'DEFAULT' ? 'shadow' : `shadow-${value}`;
    case 'shadowArbitrary':
      return `shadow-[${value}]`;
    case 'leading':
      return `leading-${value}`;
    case 'tracking':
      return `tracking-${value}`;
    default:
      return value;
  }
}

// 间距档位 → 像素：默认间距尺度 1 档 = 0.25rem = 4px（0.5 → 2px，1.5 → 6px）。
export function spacingPx(value: string): string | null {
  const step = Number(value);
  if (!Number.isFinite(step) || value.trim() === '') return null;
  return `${step * 4}px`;
}
