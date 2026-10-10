// 拆集策略（平台规则 · 可配置）
// 原型阶段为本地配置；正式版由服务端规则服务下发，前端只读引用 + 本地缓存快照
// 原则：拆集按剧本结构，不按字数——显式章节标记优先；场次为最小不可分单元，切点只落在场次边界；
//       每集按节拍分组（集内场次窗口）追求弧线闭合；字数只作单集时长软参考，不作切分依据

export interface SplitPolicy {
  /** 规则版本号（规则中心只读展示，变更可追踪） */
  version: string;
  /** 显式章节标记（"第X集/回/话"，支持 markdown # 前缀）——最高优先级切点 */
  explicitMarkers: RegExp;
  /** 场次标题识别（"场次：N-M / 场景N / 第N场"等，支持 # 前缀）——最小不可分单元 */
  sceneTitle: RegExp;
  /** 每集场次窗口（节拍分组：集内场次数下限/上限；切点只落在场次边界，不切中场次） */
  scenesPerEpisode: { min: number; max: number };
  /** 单剧集数硬上限 */
  maxEpisodes: number;
  /** 无章节/场次结构时是否允许按段落粗分组（fallback）；false → 提示补充场次标记 */
  allowParagraphFallback: boolean;
  /** 段落分隔（空行），fallback 分组依据 */
  paragraphBreak: RegExp;
  /** 候选标题词池（确定性伪随机选取） */
  titlePool: string[];
  /** 候选摘要词池 */
  summaryPool: string[];
}

export const SPLIT_POLICY: SplitPolicy = {
  version: '2.0',
  explicitMarkers: /(?:^|\n)\s*#{0,3}\s*第\s*([一二三四五六七八九十百\d]+)\s*[集回话]/g,
  sceneTitle: /(?:^|\n)\s*#{0,3}\s*(?:场次|场景)\s*[:：]?\s*[\d一二三四五六七八九十]+(?:[-\s][\d一二三四五六七八九十]+)?/g,
  scenesPerEpisode: { min: 1, max: 6 },
  maxEpisodes: 8,
  allowParagraphFallback: true,
  paragraphBreak: /\n\s*\n/g,
  titlePool: [
    '遗落的坐标',
    '灰港来客',
    '静默航线',
    '冰层之下',
    '镜像回廊',
    '父亲的答案',
    '拾遗号的真相',
    '最后的信号',
    '深空回声',
    '归航',
  ],
  summaryPool: [
    '主角收到异常信号，踏上寻找失踪者的旅程，第一层线索浮出水面。',
    '中途补给点发生意外冲突，核心道具易主，队伍被迫提前暴露意图。',
    '航行途中设备出现诡异故障，船员开始察觉航线上有"其他东西"。',
    '抵达目标地点，发现地下设施与失踪事件直接关联，危险升级。',
    '敌人设下陷阱，主角发现真相的一部分与自己身世相连。',
    '关键证人出现，揭示事件的真正动机，主角面临信任抉择。',
    '队伍内部分歧爆发，旧伤与新线索同时摊开，局势失控。',
    '决战前夜，所有线索汇合，主角下定决心并交代后事。',
    '高潮对抗，核心秘密揭晓，代价付出，故事迎来转折。',
    '尘埃落定，主角选择留下或离开，尾声留白为续作铺垫。',
  ],
};
