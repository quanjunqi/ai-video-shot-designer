// 多渠道可视化（T8）：把"同一个模型名出现在几个渠道上、谁优先、谁启用"算清楚。
//
// 为什么单独成模块而不是写在 JSX 里：这是**纯函数**，可以真单测；
// 而本项目已经四次栽在"逻辑埋在流程里、改一处漏一处"上（接线漏改 ×2、合并丢字段 ×2）。
// 这里的分组规则只保留一份实现。
//
// 分组键的取法（顺序有意义）：
//   1. logicalModelId —— 有它才是"同一个对外能力"，这是最可信的聚合依据
//   2. providerModel  —— 没有逻辑模型时，退而用上游模型标识（同款不同渠道）
//   3. id             —— 都没有就自己一组（不会误聚）
import type { CatalogModel } from '@/config/models/model-catalog';

export interface CandidatePeer {
  id: string;
  /** 渠道展示名（取不到就回落到渠道 id —— 不隐藏事实） */
  channelName: string;
  channelId: string;
  /** 路由优先级：小者优先。缺失时用 Number.MAX_SAFE_INTEGER 排在最后（而不是当 0 抢首位） */
  routePriority: number;
  status: 'enabled' | 'disabled';
  logicalModelId?: string;
}

/** groupKey 决定"哪些行算同款"。 */
export function groupKey(m: Pick<CatalogModel, 'id' | 'providerModel' | 'logicalModelId'>): string {
  return m.logicalModelId || m.providerModel || m.id;
}

/**
 * candidatesByKey 把模型列表按同款聚合；只返回**多于一行**的组（单行没有可视化的必要）。
 * peers 已按优先级升序排好（同优先级按渠道名升序，保证确定性）。
 */
export function candidatesByKey(models: CatalogModel[], channelName: (id: string) => string): Map<string, CandidatePeer[]> {
  const byKey = new Map<string, CandidatePeer[]>();
  for (const m of models) {
    const key = groupKey(m);
    const peer: CandidatePeer = {
      id: m.id,
      channelId: m.channelId,
      channelName: channelName(m.channelId) || m.channelId,
      routePriority: typeof m.routePriority === 'number' ? m.routePriority : Number.MAX_SAFE_INTEGER,
      status: m.status,
      logicalModelId: m.logicalModelId,
    };
    const list = byKey.get(key);
    if (list) list.push(peer);
    else byKey.set(key, [peer]);
  }
  const out = new Map<string, CandidatePeer[]>();
  for (const [key, peers] of byKey) {
    if (peers.length < 2) continue;
    peers.sort((a, b) => (a.routePriority - b.routePriority) || a.channelName.localeCompare(b.channelName));
    out.set(key, peers);
  }
  return out;
}

/**
 * candidateSummary 生成一行可读摘要，例如：
 *   「同款模型 2 个渠道 · 优先级 10/20 · 1 启用 / 1 停用」
 * 刻意把"停用"也写出来 —— 停用的候选**不会被路由到**（Resolve 跳过），
 * 不写出来会让人以为它还在参与轮换。
 */
export function candidateSummary(peers: CandidatePeer[]): string {
  if (peers.length === 0) return '';
  const parts = [`同款模型 ${peers.length} 个渠道`];
  const priorities = peers.map((p) => (p.routePriority === Number.MAX_SAFE_INTEGER ? '未设' : String(p.routePriority)));
  parts.push(`优先级 ${priorities.join('/')}`);
  const enabled = peers.filter((p) => p.status === 'enabled').length;
  parts.push(enabled === peers.length ? `全部启用` : `${enabled} 启用 / ${peers.length - enabled} 停用`);
  return parts.join(' · ');
}

/** candidateTooltip 供 title 使用：逐条列出渠道、优先级与启用状态。 */
export function candidateTooltip(peers: CandidatePeer[]): string {
  return peers
    .map((p, i) => `${i + 1}. ${p.channelName}（优先级 ${p.routePriority === Number.MAX_SAFE_INTEGER ? '未设' : p.routePriority}，${p.status === 'enabled' ? '启用' : '停用'}）`)
    .join('\n');
}
