// 剧集 mock：拆集候选（确定性）+ 初始剧集
import type { Episode } from '@/types';
import { buildInterpretation } from './assets';
import { SCRIPT_TEXTS } from './projects';
import { SPLIT_POLICY } from '@/config/rules/split-policy';

const TITLES = SPLIT_POLICY.titlePool;

// 确定性伪随机（按 seed 生成稳定 5-8 集）
function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SplitCandidate {
  index: number; // 1-based
  title: string;
  summary: string;
  span: { start: number; end: number };
}

/** 按剧本长度确定性生成拆集候选（演示模式：正式为解析服务输出） */
export interface SplitOverrides {
  /** 导演期望集数（节拍分组目标；缺省按场次结构自动推导） */
  targetEpisodes?: number;
  /** 单集场次上限（缺省用平台默认窗口上限） */
  maxScenesPerEpisode?: number;
  /** 自定义章节标记正则（字符串形式，可序列化；适配不同剧本格式） */
  episodePattern?: string;
  /** 自定义场次标记正则（字符串形式，可序列化；适配不同剧本格式） */
  scenePattern?: string;
}

/** 用户自定义正则（字符串 → RegExp；非法时回退平台默认）
 *  统一加 'm' 多行标志：用户写 "^场次" 即按行首匹配，符合直觉；
 *  平台默认正则的 (?:^|\n) 边界在 'm' 下同样正确。
 */
function safeRegex(pattern: string | undefined): RegExp | undefined {
  if (!pattern) return undefined;
  try {
    return new RegExp(pattern, 'gm');
  } catch {
    return undefined;
  }
}

/** 按段落（空行分隔）识别非空块起点（fallback 分组依据） */
function splitBlocks(text: string): number[] {
  const starts: number[] = [];
  const re = SPLIT_POLICY.paragraphBreak;
  re.lastIndex = 0;
  let prev = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (text.slice(prev, m.index).trim().length > 0) starts.push(prev);
    prev = m.index + m[0].length;
  }
  if (text.slice(prev).trim().length > 0) starts.push(prev);
  return starts;
}

/** 由边界数组生成候选（标题/跨度；摘要字段留空——剧集卡不展示摘要） */
function buildSegments(text: string, boundaries: number[], rand: () => number): SplitCandidate[] {
  const candidates: SplitCandidate[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    const preview = text.slice(start, end).trim();
    const firstLine = preview.split('\n').find((line) => line.trim())?.trim() ?? '';
    const title = /^#{0,3}\s*第\s*[一二三四五六七八九十百\d]+\s*[集回话]/.test(firstLine)
      ? firstLine.replace(/^#{0,3}\s*/, '').slice(0, 50)
      : `第 ${i + 1} 集：${TITLES[Math.floor(rand() * TITLES.length)]}`;
    candidates.push({
      index: i + 1,
      title,
      summary: '',
      span: { start, end },
    });
  }
  return candidates;
}

/**
 * 拆集按剧本结构，不按字数：
 * 1) 显式章节标记（平台默认或用户自定义）命中 → 直接切
 * 2) 场次结构（平台默认或用户自定义）→ 场次为最小不可分单元，节拍分组，切点只落场次边界
 * 3) 无结构时按段落粗分组（fallback）
 * 4) 无任何结构 → 单集候选
 */
export function buildSplitCandidates(text: string, seedBase: number, override?: SplitOverrides): SplitCandidate[] {
  const rand = mulberry32(seedBase + text.length);
  const total = text.length;
  const sceneRe = safeRegex(override?.scenePattern) ?? SPLIT_POLICY.sceneTitle;
  const episodeRe = safeRegex(override?.episodePattern) ?? SPLIT_POLICY.explicitMarkers;
  const maxScenesPer = override?.maxScenesPerEpisode ?? SPLIT_POLICY.scenesPerEpisode.max;
  const countTarget = override?.targetEpisodes ? Math.min(SPLIT_POLICY.maxEpisodes, Math.max(1, override.targetEpisodes)) : undefined;

  // 1) 显式章节标记
  const explicit = [...text.matchAll(episodeRe)].map((m) => m.index! + (m[0].startsWith('\n') ? 1 : 0));
  if (explicit.length > 1) {
    return buildSegments(text, [0, ...explicit.slice(1), total], rand);
  }

  // 2) 场次结构：节拍分组，切点只落场次边界
  const sceneStarts = [...text.matchAll(sceneRe)].map((m) => m.index! + (m[0].startsWith('\n') ? 1 : 0));
  if (sceneStarts.length > 1) {
    const sceneCount = sceneStarts.length;
    const mid = Math.min(maxScenesPer, Math.max(1, Math.ceil(sceneCount / 2)));
    const count = countTarget ?? Math.max(1, Math.ceil(sceneCount / mid));
    const per = Math.ceil(sceneCount / count);
    const boundaries = [0];
    for (let k = per; k < sceneCount; k += per) boundaries.push(sceneStarts[k]);
    boundaries.push(total);
    return buildSegments(text, boundaries, rand);
  }

  // 3) 段落 fallback
  if (SPLIT_POLICY.allowParagraphFallback) {
    const blocks = splitBlocks(text);
    if (blocks.length > 1) {
      const mid = Math.ceil(blocks.length / 2);
      const count = countTarget ?? Math.max(1, Math.ceil(blocks.length / mid));
      const per = Math.ceil(blocks.length / count);
      const boundaries = [0];
      for (let k = per; k < blocks.length; k += per) boundaries.push(blocks[k]);
      boundaries.push(total);
      return buildSegments(text, boundaries, rand);
    }
  }

  // 4) 无结构 → 单集
  return buildSegments(text, [0, total], rand);
}

/** 由拆集候选转正式剧集（锁定后生成稳定 id） */
export function buildEpisodesFromCandidates(projectId: string, candidates: SplitCandidate[]): Episode[] {
  return candidates.map((c) => ({
    id: `${projectId}-ep-${c.index}`,
    projectId,
    index: c.index,
    title: c.title,
    summary: c.summary,
    sourceSpan: c.span,
    stage: 'analyze',
    status: 'pending',
    counts: { scenes: 0, characters: 0, pendingReview: 0 },
    createdAt: Date.now(),
  }));
}

const base = Date.now() - 86400000 * 7;

// 预置导演解读产物（已进入解读/资产阶段的示例剧集）
function withInterpretation(ep: Episode): Episode {
  return { ...ep, interpretation: buildInterpretation(ep) };
}

function spansFor(text: string, markers: string[]): Array<{ start: number; end: number }> {
  const starts = markers.map((marker) => text.indexOf(marker)).filter((start) => start > 0).sort((a, b) => a - b);
  return [0, ...starts, text.length].slice(0, starts.length + 2).map((start, index, all) => ({ start, end: all[index + 1] ?? text.length }));
}

function makeEpisode(
  id: string,
  projectId: string,
  index: number,
  title: string,
  summary: string,
  sourceSpan: { start: number; end: number },
  stage: Episode['stage'],
  status: Episode['status'],
  counts: Episode['counts'],
  interpreted = false,
): Episode {
  const episode: Episode = { id, projectId, index, title, summary, sourceSpan, stage, status, counts, createdAt: base + index * 3600000 };
  return interpreted ? withInterpretation(episode) : episode;
}

const starSpans = spansFor(SCRIPT_TEXTS['proj-star'], ['第二章 灰港', '第三章 静默航线']);
const waimaiSpans = spansFor(SCRIPT_TEXTS['proj-waimai'], ['第二话 夜宵主顾', '第三话 骑手公会']);
const wuduSpans = spansFor(SCRIPT_TEXTS['proj-wudu'], ['第一案 不存在的乘客', '第二案 失眠的钢琴师']);

export const INITIAL_EPISODES: Episode[] = [
  // 预置剧集必须连续覆盖真实源文本；仅展示 3 个有明确章节结构的候选。
  makeEpisode('xh-1', 'proj-star', 1, '第 1 集：遗落坐标', '林澈捕捉到异常引力波纹，发现信号来自失踪三十年的殖民船“拾遗号”。', starSpans[0], 'characters', 'in_work', { scenes: 3, characters: 4, pendingReview: 2 }, true),
  makeEpisode('xh-2', 'proj-star', 2, '第 2 集：灰港来客', '林澈在灰港招募队员并取回黑曜石星图板，却在当夜遭遇带有父亲徽记的袭击者。', starSpans[1], 'characters', 'in_work', { scenes: 3, characters: 4, pendingReview: 2 }, true),
  makeEpisode('xh-3', 'proj-star', 3, '第 3 集：静默航线', '无名行星轨道上的设备接连故障，旧采矿站的日志揭示有人正在模仿船员。', starSpans[2], 'analyze', 'needs_review', { scenes: 2, characters: 3, pendingReview: 1 }, true),
  makeEpisode('wm-1', 'proj-waimai', 1, '第 1 集：超时订单', '老周接到十倍配送费的怪单，苍白的手取走餐盒，并留下刻有面馆招牌的铜钱。', waimaiSpans[0], 'analyze', 'pending', { scenes: 0, characters: 0, pendingReview: 0 }),
  makeEpisode('wm-2', 'proj-waimai', 2, '第 2 集：夜宵主顾', '无主订单把老周引向拆除中的旧戏院，旗袍女士与铜钱牵出一场四十年前的火灾。', waimaiSpans[1], 'analyze', 'pending', { scenes: 0, characters: 0, pendingReview: 0 }),
  makeEpisode('wm-3', 'proj-waimai', 3, '第 3 集：骑手公会', '苏小满揭开阴阳配送线的秘密，老周在面馆旧址找到另一半铜钱。', waimaiSpans[2], 'analyze', 'pending', { scenes: 0, characters: 0, pendingReview: 0 }),
  makeEpisode('wd-1', 'proj-wudu', 1, '第 1 集：雾中来信', '沈墨收到指向父亲死因的匿名信，按约来到钟楼，发现信件已持续出现二十年。', wuduSpans[0], 'done', 'done', { scenes: 3, characters: 3, pendingReview: 0 }, true),
  makeEpisode('wd-2', 'proj-wudu', 2, '第 2 集：不存在的乘客', '巴士监控出现一名没有售票记录的乘客，旧车票把案件引回沈墨父亲坠江当晚。', wuduSpans[1], 'characters', 'in_work', { scenes: 2, characters: 3, pendingReview: 1 }, true),
  makeEpisode('wd-3', 'proj-wudu', 3, '第 3 集：失眠的钢琴师', '每晚三点三十三分响起的琴声把沈墨引向被调过的节拍器和父亲的残曲。', wuduSpans[2], 'characters', 'in_work', { scenes: 2, characters: 3, pendingReview: 1 }, true),
];
