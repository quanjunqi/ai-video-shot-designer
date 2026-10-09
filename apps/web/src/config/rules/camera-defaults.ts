/**
 * 自动镜头语言默认规则（A+ 步2 默认通道）
 *
 * 设计口径：系统按「节拍类型 → 景别基线」+「情绪强度 → 机位/运动修正」为每镜生成默认镜头语言，
 * 导演一键应用后只对重点镜头微调。这是平台内置默认策略，后续可进规则中心由用户覆盖。
 * 数据模型不变（仍写入 ShotCard.camera 6 字段），仅改变「谁先填」。
 */
import type { ShotCard } from '../../types';

// ---- 节拍类型 → 景别基线 ----
export interface CameraBeatRule {
  beat: string;
  shotSize: string;
  movement: string;
  composition: string;
  lens: string;
  movePurpose: string;
}

export const CAMERA_BEAT_RULES: CameraBeatRule[] = [
  {
    beat: '建立空间',
    shotSize: '全景',
    movement: '固定机位',
    composition: '中心构图',
    lens: '广角',
    movePurpose: '交代环境与人物空间关系',
  },
  {
    beat: '推进剧情',
    shotSize: '中景',
    movement: '固定机位',
    composition: '三分构图',
    lens: '标准',
    movePurpose: '稳定呈现剧情推进',
  },
  {
    beat: '情绪转折',
    shotSize: '特写',
    movement: '缓推',
    composition: '中心构图',
    lens: '长焦',
    movePurpose: '逼近人物内心变化',
  },
  {
    beat: '收尾钩子',
    shotSize: '特写',
    movement: '缓推',
    composition: '中心构图',
    lens: '长焦',
    movePurpose: '强调收尾信息与悬念',
  },
  {
    beat: '对白交锋',
    shotSize: '中景',
    movement: '固定机位',
    composition: '三分构图',
    lens: '标准',
    movePurpose: '保持对话双方空间关系稳定',
  },
  {
    beat: '动作冲突',
    shotSize: '中景',
    movement: '跟随',
    composition: '动势构图',
    lens: '广角',
    movePurpose: '捕捉动作张力与动态',
  },
];

// ---- 情绪强度 → 机位/运动修正 ----
export const EMOTION_MOVE_OVERRIDES: { emotion: string; movement: string; movePurpose: string }[] = [
  { emotion: '平静', movement: '固定机位', movePurpose: '稳定呈现' },
  { emotion: '压抑', movement: '缓推', movePurpose: '制造缓慢逼近的紧张感' },
  { emotion: '紧绷', movement: '缓推', movePurpose: '保持张力、缓慢压迫' },
  { emotion: '爆发', movement: '推', movePurpose: '快速逼近、强化冲击' },
  { emotion: '愤怒', movement: '推', movePurpose: '强化情绪冲击' },
  { emotion: '哀伤', movement: '缓拉', movePurpose: '拉开距离、留下余韵' },
];

// ---- 内置镜头语言条目（步2 引用入口；后续接镜头语言库） ----
export interface CannedCamera {
  id: string;
  name: string;
  desc: string;
  shotSize: string;
  movement: string;
  composition: string;
  lens: string;
  movePurpose: string;
}

export const CANNED_CAMERA_LANGUAGE: CannedCamera[] = [
  { id: 'cam-establish', name: '定场建立', desc: '交代环境与人物关系，剧情开篇常用', shotSize: '全景', movement: '缓慢横摇', composition: '中心构图', lens: '广角', movePurpose: '建立空间感' },
  { id: 'cam-dialogue', name: '对话正反打', desc: '对话场景双方交替，保持轴线稳定', shotSize: '中景', movement: '固定机位', composition: '三分构图', lens: '标准', movePurpose: '维持对话空间关系' },
  { id: 'cam-over-shoulder', name: '过肩对话', desc: '强调对话者视角与对手反应', shotSize: '近景', movement: '固定机位', composition: '过肩构图', lens: '中长焦', movePurpose: '带入听者视角' },
  { id: 'cam-action', name: '动作跟随', desc: '追逐/打斗等动态场景', shotSize: '中景', movement: '跟随', composition: '动势构图', lens: '广角', movePurpose: '捕捉动作张力' },
  { id: 'cam-emotion-push', name: '情绪逼近', desc: '内心转折/重大情绪节点', shotSize: '特写', movement: '缓推', composition: '中心构图', lens: '长焦', movePurpose: '逼近内心变化' },
  { id: 'cam-hook', name: '收尾强调', desc: '集尾钩子/悬念定格', shotSize: '特写', movement: '缓推', composition: '中心构图', lens: '长焦', movePurpose: '强调收尾信息' },
  { id: 'cam-ambient', name: '氛围空镜', desc: '环境氛围/时间流逝', shotSize: '远景', movement: '缓慢横摇', composition: '三分构图', lens: '广角', movePurpose: '营造氛围' },
  { id: 'cam-detail', name: '道具特写', desc: '关键道具/细节信息', shotSize: '特写', movement: '固定机位', composition: '中心构图', lens: '微距', movePurpose: '强调细节' },
];

const FALLBACK_CAMERA: CameraBeatRule = {
  beat: '推进剧情',
  shotSize: '中景',
  movement: '固定机位',
  composition: '三分构图',
  lens: '标准',
  movePurpose: '稳定呈现剧情推进',
};

/** 从主事件文本推断节拍类型（关键词命中，未命中回退「推进剧情」） */
export function inferBeat(main: string): string {
  const m = main ?? '';
  if (m.includes('建立空间') || m.includes('定场')) return '建立空间';
  if (m.includes('情绪') || m.includes('转折') || m.includes('内心')) return '情绪转折';
  if (m.includes('收尾') || m.includes('钩子')) return '收尾钩子';
  if (m.includes('对白') || m.includes('对话') || m.includes('交锋')) return '对白交锋';
  if (m.includes('推进剧情')) return '推进剧情';
  // 「动作」单字过宽（主事件常含「动作」字样），仅匹配明确的冲突/动作戏关键词
  if (m.includes('冲突') || m.includes('打斗') || m.includes('追逐') || m.includes('搏斗')) return '动作冲突';
  return '推进剧情';
}

/** 为单张镜头卡生成默认镜头语言（只填 camera 域，不触碰其他域） */
export function applyDefaultCamera(card: ShotCard): Partial<ShotCard> {
  const beat = inferBeat(card.event.main);
  const base = CAMERA_BEAT_RULES.find((r) => r.beat === beat) ?? FALLBACK_CAMERA;
  const emotion = card.world.characters[0]?.emotion ?? '';
  const moveOverride = EMOTION_MOVE_OVERRIDES.find((e) => e.emotion === emotion);
  return {
    camera: {
      shotSize: base.shotSize,
      composition: base.composition,
      lens: base.lens,
      movement: moveOverride?.movement ?? base.movement,
      movePurpose: moveOverride?.movePurpose ?? base.movePurpose,
      cameraZone: '被摄主体前方',
    },
  };
}

/** 步2 引用镜头语言条目：把 CANNED 条目填进 camera 域 */
export function applyCannedCamera(card: ShotCard, cannedId: string): Partial<ShotCard> {
  const c = CANNED_CAMERA_LANGUAGE.find((x) => x.id === cannedId);
  if (!c) return {};
  return {
    camera: {
      shotSize: c.shotSize,
      composition: c.composition,
      lens: c.lens,
      movement: c.movement,
      movePurpose: c.movePurpose,
      cameraZone: '被摄主体前方',
    },
  };
}
