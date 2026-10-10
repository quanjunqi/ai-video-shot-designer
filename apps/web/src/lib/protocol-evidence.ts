/**
 * ADR-008 §3：协议模板的**两类证据并列**。
 *
 *   docRef           —— 文档依据（**外部输入**，可能过期或本身有误）⇒ 是线索
 *   observedEvidence —— 实测证据（我们实际探测/调用观察到的）      ⇒ 是事实
 *
 * 硬约束：**冲突时以实测为准，且差异必须保留可见**。
 * 因此本模块只做「取出来、摆清楚」，**不做"取其一"的合并** ——
 * 任何把两者合成一个值的做法都会把差异抹掉，那正是 ADR 要防的事。
 *
 * 刻意做成纯函数：两个字段都是服务端 jsonb，形状会随上游文档演进，
 * 所以这里对未知/缺字段一律**优雅降级**，并由单测锁住。
 */

export interface EvidenceItem {
  label: string;
  value: string;
  href?: string;
}

export interface EvidenceSummary {
  doc: EvidenceItem[];
  observed: EvidenceItem[];
  /** 实测与文档的差异。**非空即必须在界面上可见**（ADR-008）。 */
  discrepancies: string[];
}

function str(v: unknown): string | undefined {
  if (typeof v === 'string') return v.trim() || undefined;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return undefined;
}

function list(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => str(x) ?? (x && typeof x === 'object' ? JSON.stringify(x) : '')).filter(Boolean);
  const one = str(v);
  return one ? [one] : [];
}

const SOURCE_LABEL: Record<string, string> = {
  official: '官方文档',
  cloud: '云厂商文档',
  relay: '中转站文档',
};

export function summarizeEvidence(
  docRef?: Record<string, unknown>,
  observedEvidence?: Record<string, unknown>,
): EvidenceSummary {
  const out: EvidenceSummary = { doc: [], observed: [], discrepancies: [] };
  const d = docRef ?? {};
  const o = observedEvidence ?? {};

  const source = str(d.source);
  if (source) out.doc.push({ label: '来源', value: SOURCE_LABEL[source] ?? source });
  const url = str(d.url);
  if (url) out.doc.push({ label: '地址', value: url, href: url });
  const docVersion = str(d.docVersion);
  if (docVersion) out.doc.push({ label: '文档版本', value: docVersion });
  const verifiedAt = str(d.verifiedAt);
  if (verifiedAt) out.doc.push({ label: '对齐时间', value: verifiedAt });
  const sections = d.sections;
  if (sections && typeof sections === 'object' && !Array.isArray(sections)) {
    // sections：提交与查询端点各对应文档哪一节
    for (const [k, v] of Object.entries(sections as Record<string, unknown>)) {
      const s = str(v);
      if (s) out.doc.push({ label: `章节·${k}`, value: s });
    }
  }
  const authDoc = str(d.authDoc);
  if (authDoc) out.doc.push({ label: '鉴权说明', value: authDoc });

  const lastProbedAt = str(o.lastProbedAt);
  if (lastProbedAt) out.observed.push({ label: '最近实测', value: lastProbedAt });
  const codes = list(o.observedStatusCodes);
  if (codes.length) out.observed.push({ label: '实测状态码', value: codes.join('、') });
  const statusEnum = list(o.observedStatusEnum);
  if (statusEnum.length) out.observed.push({ label: '实测状态枚举', value: statusEnum.join('、') });
  const endpoints = list(o.observedEndpoints);
  if (endpoints.length) out.observed.push({ label: '实测端点', value: endpoints.join('、') });

  // ★ 差异必须可见：未知形状也要能显示出来，不能因为"看不懂"就丢掉
  for (const item of Array.isArray(o.discrepancies) ? o.discrepancies : []) {
    if (typeof item === 'string') {
      if (item.trim()) out.discrepancies.push(item.trim());
    } else if (item && typeof item === 'object') {
      const rec = item as Record<string, unknown>;
      const field = str(rec.field) ?? str(rec.key) ?? '(未知字段)';
      const doc = str(rec.doc) ?? str(rec.docValue) ?? str(rec.expected);
      const obs = str(rec.observed) ?? str(rec.observedValue) ?? str(rec.actual);
      const parts = [field];
      if (doc) parts.push(`文档=${doc}`);
      if (obs) parts.push(`实测=${obs}`);
      out.discrepancies.push(parts.join('：'));
    }
  }

  return out;
}

export function hasEvidence(s: EvidenceSummary): boolean {
  return s.doc.length > 0 || s.observed.length > 0;
}
