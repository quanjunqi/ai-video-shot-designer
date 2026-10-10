// 项目状态元信息与下一步动作（可解释指标：done/总数 + 待审核 + 阻塞）
import type { Project, ProjectStatus } from '@/types';

export const STATUS_META: Record<ProjectStatus, { label: string; tone: 'default' | 'outline' | 'secondary' }> = {
  pending_parse: { label: '待解析', tone: 'secondary' },
  parsing: { label: '拆集中', tone: 'secondary' },
  awaiting_confirm: { label: '待核对分集', tone: 'outline' },
  in_production: { label: '制作中', tone: 'default' },
  review: { label: '待审核', tone: 'outline' },
  archived: { label: '归档', tone: 'outline' },
};

export function nextStep(p: Project): string {
  if (p.status === 'pending_parse' || p.status === 'parsing') return '等待拆集解析';
  if (p.status === 'awaiting_confirm') return `核对 ${p.episodeIds.length} 个分集候选`;
  if (p.progress.pendingReview > 0) return `${p.progress.pendingReview} 个产物待确认`;
  if (p.progress.doneEpisodes < p.progress.totalEpisodes) return `继续第 ${p.progress.doneEpisodes + 1} 集`;
  return '项目已完成';
}
