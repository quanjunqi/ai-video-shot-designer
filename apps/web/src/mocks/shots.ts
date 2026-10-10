// 生产阶段 mock：Shot（导演事实）→ Unit（执行单元）→ Take（实际结果，候选需人工采纳）
import type { Episode, Shot } from '@/types';

export function buildShots(episode: Episode): Shot[] {
  return (episode.executableUnits ?? []).map((unit, i) => ({
      id: unit.id,
      index: i + 1,
      sceneLabel: unit.coverage,
      shotType: `${unit.shotCount} 镜头 · ${unit.durationSeconds}s`,
      content: unit.prompt.text,
      unitPrompt: unit.prompt.text,
      takeStatus: 'none',
  }));
}
