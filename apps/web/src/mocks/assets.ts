// 资产 mock：导演解读产物 + 角色/场景/道具提取（事实层由剧本解析器真实提取；创作层脚手架 + 真实解读原文注入）
import type { Asset, Episode, ExecutionTarget, Interpretation } from '@/types';
import { FAITHFUL_MIN_SECONDS, capacityNoteFor } from '@/config/rules/capacity-policy';
import { getEpisodeScriptText, parseScript } from '@/config/script/script-parser';

const FACTS_POOL = [
  '主角在开场收到一封指向失踪事件的信件，决定独自调查。',
  '核心场景为雾都钟楼与旧巴士站，均为事件第一现场。',
  '反派以"信使"身份多次出现，与主角父亲旧识。',
  '关键道具是一枚刻有桥名的铜制怀表，可追溯二十年前。',
  '故事时间线为冬季雾夜，能见度低影响所有室外镜头。',
  '主角随身携带旧剪报，记录了官方公布的"失足"结论。',
  '第二幕出现监控盲区，为关键证据缺失留下解释空间。',
];

const CONSTRAINTS_POOL = [
  '主角服装以深色长款外套为准，全片不更换主造型。',
  '钟楼指针始终停在 23:47，不允许出现可读的其它时间。',
  '怀表链长固定，动作戏中不得脱离手腕超过 30 厘米。',
  '雾效密度与镜头景别联动：近景可看清五官，远景轮廓模糊。',
  '巴士站站牌文字保持"雾都·大桥线"，不得改写。',
];

const SUGGESTIONS_POOL = [
  '开场采用跟拍长镜头建立雾夜氛围，再切信箱特写揭示信件。',
  '反派首次露面只给半身剪影，用怀表反光强化神秘感。',
  '关键对白安排在钟楼下 23:47，利用整点钟声压住情绪。',
  '监控画面使用低分辨率噪点处理，暗示设备老旧与证据局限。',
];

const OPEN_ITEMS_POOL = [
  '主角父亲坠江当晚的行程是否与"信使"存在重叠，待定。',
  '旧剪报来源（谁寄给主角）未在原文说明，需用户决定。',
  '怀表背面刻字内容原文留白，建议补充但需用户确认。',
  '第二幕监控盲区的持续时间未限定，影响镜头调度假设。',
];

const CHARACTER_NAMES = ['沈墨', '信使', '调度员', '钢琴师', '钟楼管理员'];
const CHARACTER_DESC = [
  '雾都侦探，深色大衣，习惯把怀表揣在左胸口袋',
  '身份不明的传递者，只在雾夜出现，声线低沉',
  '巴士公司调度员，中年，制服略旧，神情疲惫',
  '失眠的钢琴师，消瘦，指尖有长期练习的老茧',
  '钟楼管理员，年迈，动作迟缓但眼神锐利',
];

const SCENE_NAMES = ['雾夜钟楼', '旧巴士站', '深夜琴房', '事务所办公室'];
const SCENE_DESC = [
  '雾都地标，指针停在 23:47，四周雾浓',
  '大桥线终点站，站牌锈蚀，末班车 23:47 到站',
  '狭小琴房，一台老式钢琴，墙上挂满乐谱',
  '主角的事务所，暖黄灯光，满墙案件资料',
];

const PROP_NAMES = ['铜制怀表', '旧车票', '故障节拍器'];
const PROP_DESC = [
  '刻有桥名的铜制怀表，链长固定，表盖有划痕',
  '二十年前的旧车票，日期正是父亲出事那天',
  '被调过速度的节拍器，对应一首残缺曲子',
];

type AssetContext = {
  facts: string[];
  constraints: string[];
  suggestions: string[];
  openItems: string[];
  characters: string[];
  characterDesc: string[];
  scenes: string[];
  sceneDesc: string[];
  props: string[];
  propDesc: string[];
  dialogueFact: string;
  lookAndFeel: Interpretation['lookAndFeel'];
  breakdown: Interpretation['breakdown'];
};

const STAR_CONTEXT: AssetContext = {
  facts: [
    '林澈在观测站捕捉到一组指向无名行星的异常引力波纹。',
    '失踪三十年的殖民船“拾遗号”仍在发送父亲留下的日志。',
    '灰港取得的黑曜石板与拾遗号信号频率完全吻合。',
    '导航仪自动指向南极冰盖下的旧采矿站，设备出现随机故障。',
  ],
  constraints: ['林澈保持深色观测服与左腕终端的一致性。', '黑曜石板的星图刻痕和警告文字不可改写。', '太空场景以冷白舱光与星域黑场为主，避免雾都元素。'],
  suggestions: ['用扫描界面与角色反应交替建立异常信号，再切入父亲日志。', '黑曜石板首次出现只给局部刻痕，后续再揭示完整星图。'],
  openItems: ['父亲日志中的“答案”具体指向仍待用户确认。', '影子延迟是一种物理现象还是模仿者行为，需导演决定。'],
  characters: ['林澈', '顾北辰', '阿澈', '叶知秋', '拾遗号船员影像'],
  characterDesc: ['观测站研究员，深色观测服，左腕佩戴数据终端', '林澈的导师，银发，习惯盯着实时数据流', '机械师，短发工装，随身携带便携焊枪', '灰港情报贩子，灰色风衣，右耳有通讯器', '父亲留下的日志影像，面部被故障噪点遮挡'],
  scenes: ['深空观测站', '灰港补给站', '拾遗号船舱', '南极旧采矿站'],
  sceneDesc: ['环绕行星运行的观测站，冷白舱光与全息数据墙', '边境星域中转站，霓虹补给牌与拥挤的货运平台', '失踪殖民船内部，金属走廊与断续应急灯', '冰盖下的废弃设施，旧终端持续发出蓝光'],
  props: ['黑曜石星图板', '父亲的航行日志', '左腕数据终端'],
  propDesc: ['刻有半幅星图和警告文字的黑曜石板', '三十年前的航行记录，最后一页被人为撕去', '可读取引力波纹的便携终端，屏幕偶发雪花'],
  dialogueFact: '本集对白围绕异常信号与父亲日志展开，关键回应集中在观测站与灰港交接处',
  lookAndFeel: {
    tone: '冷白舱光与深空黑场对比，局部以蓝色终端光作为叙事提示',
    moodArc: '异常发现 → 线索确认 → 进入未知区域（前段克制，中段加速，结尾留悬念）',
    rhythmCurve: '扫描信息慢速累积 → 日志揭示后加速 → 航行决定处短暂停顿',
    references: ['深空科幻写实', '冷白与电光蓝', '固定观测机位 + 低幅手持反应'],
  },
  breakdown: [
    { id: 'star-s1', label: '场次 1：观测站异常信号', span: 'L1–L72', duration: '约 50s' },
    { id: 'star-s2', label: '场次 2：父亲日志回放', span: 'L73–L156', duration: '约 65s' },
    { id: 'star-s3', label: '场次 3：灰港交接', span: 'L157–L243', duration: '约 60s' },
  ],
};

const WAIMAI_CONTEXT: AssetContext = {
  facts: ['老周接到十倍配送费的异常订单，取餐人是一只苍白的手。', '铜钱背面刻着百年面馆招牌，连续出现在不同订单中。', '苏小满透露深夜配送线连接阴阳两界，不接单的骑手会消失。'],
  constraints: ['老周保持旧头盔与电瓶车红色尾灯的一致性。', '铜钱正反面的刻字必须在特写中保持一致。', '夜间街景以湿路反光和外卖箱暖光为主，避免太空或钟楼元素。'],
  suggestions: ['先用倒计时与导航提示制造配送压力，再让异常取餐动作打破日常。', '铜钱每次出现都保留同一声轻响，作为跨集声音线索。'],
  openItems: ['面馆老板与苍白取餐人的真实关系待确认。', '老周是否主动加入骑手公会，留给用户决定。'],
  characters: ['老周', '苏小满', '面馆老板', '旗袍女士', '无瞳孔取餐人'],
  characterDesc: ['中年外卖骑手，旧头盔，眼下有熬夜疲惫感', '年轻女骑手，车头挂着一串铜钱，目光坚定', '百年面馆老板，围着深色围裙，手上有油烟痕迹', '拆楼大门口的神秘主顾，旗袍袖口遮住旧伤疤', '只露出手与轮廓的异常取餐人，皮肤苍白'],
  scenes: ['城南废弃地铁站', '拆除中的旧戏院', '配送点与面馆旧址', '深夜城市街巷'],
  sceneDesc: ['铁门与旧信箱，站内只有应急灯和回声', '围挡后的拆楼现场，残留戏院门头与灰尘', '连锁奶茶店覆盖的百年面馆旧址，招牌若隐若现', '湿漉街道、便利店灯箱与电瓶车尾灯交错'],
  props: ['刻字铜钱', '外卖餐盒', '忘忧乌龙'],
  propDesc: ['背面刻有面馆招牌、月光下泛青的铜钱', '老周配送的保温餐盒，盖沿留有异常水汽', '杯底沉着半枚铜钱的奶茶，颜色偏深'],
  dialogueFact: '本集对白围绕异常订单与骑手公会展开，关键回应发生在取餐点和旧戏院门口',
  lookAndFeel: {
    tone: '湿路反光与外卖箱暖光构成冷暖对照，夜景保留真实城市噪声和局部阴影',
    moodArc: '日常接单 → 异常取餐 → 被迫追查（前段轻快，中段惊疑，结尾压迫）',
    rhythmCurve: '导航与倒计时快速交替 → 取餐动作突然停顿 → 巷口追逐收紧节奏',
    references: ['都市灵异写实', '湿地反光 + 暖色箱灯', '电瓶车跟拍 + 近距离手持'],
  },
  breakdown: [
    { id: 'waimai-s1', label: '场次 1：异常订单', span: 'L1–L54', duration: '约 40s' },
    { id: 'waimai-s2', label: '场次 2：旧戏院取餐', span: 'L55–L139', duration: '约 65s' },
    { id: 'waimai-s3', label: '场次 3：骑手公会线索', span: 'L140–L243', duration: '约 70s' },
  ],
};

const WUDU_CONTEXT: AssetContext = {
  facts: FACTS_POOL,
  constraints: CONSTRAINTS_POOL,
  suggestions: SUGGESTIONS_POOL,
  openItems: OPEN_ITEMS_POOL,
  characters: CHARACTER_NAMES,
  characterDesc: CHARACTER_DESC,
  scenes: SCENE_NAMES,
  sceneDesc: SCENE_DESC,
  props: PROP_NAMES,
  propDesc: PROP_DESC,
  dialogueFact: '第 1 集共 12 段对白，核心冲突集中在第 3、7 段',
  lookAndFeel: {
    tone: '低照度冷调，雾夜蓝灰为主，高反差，高光仅来自钟楼与站牌',
    moodArc: '悬疑蓄力 → 揭示动摇 → 收束回响（前 1/3 压抑，中段紧张，收尾留钩）',
    rhythmCurve: '开场慢热建立氛围 → 中段事件推进加速 → 收尾留钩回落',
    references: ['雾夜城市 noir', '低饱和青蓝 + 高光暖点', '手持跟拍 + 固定机位交替'],
  },
  breakdown: [
    { id: 'wudu-s1', label: '场次 1：来信与出发', span: 'L1–L48', duration: '约 45s' },
    { id: 'wudu-s2', label: '场次 2：钟楼 23:47', span: 'L49–L120', duration: '约 70s' },
    { id: 'wudu-s3', label: '场次 3：旧巴士站', span: 'L121–L180', duration: '约 55s' },
  ],
};

export function contextFor(projectId: string): AssetContext {
  if (projectId === 'proj-star') return STAR_CONTEXT;
  if (projectId === 'proj-waimai') return WAIMAI_CONTEXT;
  if (projectId === 'proj-wudu') return WUDU_CONTEXT;
  return {
    facts: ['待接入剧本解析服务，当前不提供自动提取的原文事实。'],
    constraints: ['角色、场景与道具的一致性约束需根据本集原文补充。'],
    suggestions: ['以下为通用演示草稿，请按本集剧本编辑后再确认。'],
    openItems: ['角色身份、空间位置与道具用途尚未核实。'],
    characters: ['待定义角色 A', '待定义角色 B', '待定义角色 C', '待定义角色 D', '待定义角色 E'],
    characterDesc: Array(5).fill('通用演示占位，需按原文编辑人物造型'),
    scenes: ['待定义场景 A', '待定义场景 B', '待定义场景 C', '待定义场景 D'],
    sceneDesc: Array(4).fill('通用演示占位，需按原文编辑空间与光线'),
    props: ['待定义道具 A', '待定义道具 B', '待定义道具 C'],
    propDesc: Array(3).fill('通用演示占位，需按原文编辑道具状态'),
    dialogueFact: '尚未执行真实对白提取，请对照原文核对。',
    lookAndFeel: { tone: '待根据剧本确定', moodArc: '待根据剧情确定', rhythmCurve: '待根据对白与动作确定', references: ['通用演示草稿'] },
    breakdown: [{ id: 'draft-s1', label: '待核实场次', span: '待核实', duration: '待核实' }],
  };
}

/** 容量无关的叙事节拍（创作层）：导演按戏剧需要决定，不随模型变化 */
function buildBeats(i: number) {
  const reasons = [
    '一轮对话与因果落地，声音可自然桥接',
    '道具交接形成可验证状态，下一单元从该状态承接',
    '情绪方向转折，摄影机到达稳定落点',
  ];
  return Array.from({ length: 5 }, (_, b) => ({
    id: `bt-${i}-b${b + 1}`,
    label: `节拍 ${b + 1}`,
    span: `B${b * 2 + 1}–B${b * 2 + 2}`,
    beatSeconds: 13 - (b % 2), // 13/12 交替，合计 63s（戏剧估计，容量无关）
    boundaryReason: reasons[b % 3],
  }));
}

/** 容量映射（平台层）：节拍打包进单元，受 maxUnitSeconds 约束；换模型只重跑本函数 */
function buildUnitMapping(i: number, maxUnit: number) {
  const unitCount = maxUnit >= 30 ? 3 : 5;
  const unitDuration = Math.min(maxUnit, maxUnit >= 30 ? 26 : 13);
  return Array.from({ length: unitCount }, (_, u) => ({
    id: `cov-${i}-u${u + 1}`,
    label: `单元 ${u + 1}`,
    beats: `B${u * 2 + 1}–B${u * 2 + 2}`,
    duration: unitDuration - (u % 2),
    boundaryReason:
      u % 3 === 0
        ? '一轮对话与因果落地，声音可自然桥接'
        : u % 3 === 1
          ? '道具交接形成可验证状态，下一单元从该状态承接'
          : '情绪方向转折，摄影机到达稳定落点',
    exitState: u % 2 === 0 ? '角色位于场景左侧，道具已易手' : '角色位于门边，情绪完成转折',
  }));
}

/** 覆盖重映射（修改执行目标时调用：只重建平台层，创作层节拍保持不变） */
export function buildCoverageRemap(episode: Episode, target: ExecutionTarget, override?: { maxUnitSeconds?: number }) {
  const i = episode.index;
  const maxUnit = override?.maxUnitSeconds ?? target.maxUnitSeconds;
  const units = buildUnitMapping(i, maxUnit);
  return {
    coverage: {
      beats: buildBeats(i),
      units,
      totalSeconds: units.reduce((n, u) => n + u.duration, 0),
      faithfulMinSeconds: FAITHFUL_MIN_SECONDS, // 忠实呈现下限：容量无关的戏剧估计（来自容量策略）
    },
    capacityNote: capacityNoteFor(target),
  };
}

/** 导演解读产物（5.1：事实/约束/建议/未决项/决定 + 视觉基调/场次清单/覆盖与容量）
 * 事实层（EV/DLG/LOCK/场次）由剧本解析器从本集原文确定性提取，100% 可追溯供用户核对；
 * 创作层（视觉基调/节拍/覆盖）为制片脚手架，真实导演解读原文（directorNote）由解读阶段文本模型注入，质量交用户评审。 */
export function buildInterpretation(
  episode: Episode,
  project?: { sourceVersions: { version: number; text: string }[]; currentSourceVersion?: number },
  target?: ExecutionTarget,
  override?: { maxUnitSeconds?: number },
): Interpretation {
  const i = episode.index;
  const context = contextFor(episode.projectId);
  const pick = (pool: string[], n: number) => {
    const out: string[] = [];
    for (let k = 0; k < n; k++) out.push(pool[(i + k * 3) % pool.length]);
    return out;
  };
  const { coverage, capacityNote } = buildCoverageRemap(episode, target ?? { model: 'MiniMax H3', maxUnitSeconds: 15, deliveryMethod: 'model', transitionMode: 'first_last_frame', confirmed: true }, override);
  // 剧本解析层：从本集原文确定性提取 EV/DLG/LOCK/场次（草稿优先，否则源版本切片）
  const scriptText = getEpisodeScriptText(episode, project?.sourceVersions, project?.currentSourceVersion);
  const ir = scriptText.trim() ? parseScript(scriptText) : null;
  const hasIR = !!ir && ir.scenes.length > 0 && (ir.evs.length > 0 || ir.dlg.length > 0);
  return {
    facts: hasIR && ir ? ir.evs.slice(0, 3) : pick(context.facts, 3),
    constraints: hasIR && ir ? ir.locks.map((l) => l.text) : pick(context.constraints, 3),
    suggestions: pick(context.suggestions, 2),
    openItems: hasIR && ir && ir.unparsed.length ? [...pick(context.openItems, 1), `规则层未能解析 ${ir.unparsed.length} 行（已如实标注，解读层补充语义）`] : pick(context.openItems, 2),
    decisions: [],
    rawFacts: hasIR && ir
      ? [
          { label: 'EV 事件', text: ir.evs.slice(0, 6).join('；') || '（本场以对白推进，无动作事件行）' },
          { label: 'DLG 对白', text: ir.dlg.slice(0, 6).join('；') || '（无对白行）' },
          { label: 'LOCK 锁定', text: ir.locks.length ? ir.locks.map((l) => l.text).join('；') : '（未发现跨场次状态线索）' },
        ]
      : [
          { label: 'EV 提取', text: pick(context.facts, 3).join('；') },
          { label: 'DLG 对白', text: context.dialogueFact },
          { label: 'LOCK 锁定', text: `场景连续性锁定 ${i + 1} 处，道具状态锁定 2 处` },
        ],
    lookAndFeel: context.lookAndFeel,
    breakdown: hasIR && ir
      ? ir.scenes.map((s, n) => ({
          id: `${episode.id}-s${n + 1}`,
          label: `${s.label}${s.location ? ` · ${s.location}` : ''}`,
          span: `${s.lines.length} 行`,
          duration: '待解读核算',
        }))
      : context.breakdown.map((item, n) => ({ ...item, id: `ep${i}-s${n + 1}` })),
    coverage,
    capacityNote,
  };
}

/** 由解读结果生成资产记录：清空 mock，角色资产只从分镜真实派生 */
export function buildAssetsFromInterpret(_episode: Episode): Asset[] {
  return [];
}

/** 初始资产：清空 mock 数据，角色资产只从分镜真实派生 */
export const INITIAL_ASSETS: Asset[] = [];
