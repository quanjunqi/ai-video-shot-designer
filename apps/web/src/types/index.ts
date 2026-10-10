// 镜序 Studio 领域类型
// 三类状态分离：执行任务(JobStatus) / 内容产物(ArtifactStatus) / 项目经营状态(ProjectStatus)

export type AspectRatio = '16:9' | '9:16' | '1:1';

// ---- 项目经营状态（6.2：草稿 / 制作中 / 待审核 / 归档等）----
export type ProjectStatus =
  | 'pending_parse' // 待解析（新项目，待启动拆集）
  | 'parsing' // 拆集任务运行中
  | 'awaiting_confirm' // 拆集候选待用户核对
  | 'in_production' // 制作中（剧集已锁定）
  | 'review' // 待审核（有剧集待确认产物）
  | 'archived'; // 归档

// ---- 执行任务状态（6.2）----
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

// ---- 内容产物状态（6.2）----
export type ArtifactStatus =
  | 'DRAFT' // 草稿
  | 'AWAITING_USER' // 候选生成成功，停在待选择
  | 'USER_APPROVED' // 用户批准（绑定版本+哈希+声明）
  | 'USER_REJECTED'
  | 'STALE' // 上游变化导致失效
  | 'SUPERSEDED'; // 被新版本取代

// 单集工坊阶段（7 导航阶段 + 完成态）：解读含执行目标/视觉基调/场次/覆盖；
// directing=分镜设计（镜头卡 8 域，在资产前：先声明资产需求再生成），units=单元规划（镜头→单元映射+连续性台账）
export type EpisodeStage = 'analyze' | 'characters' | 'props' | 'scenes' | 'directing' | 'units' | 'production' | 'done';
export type EpisodeStatus =
  | 'pending' // 已锁定，待解读
  | 'analyzing' // 解读任务运行中
  | 'needs_review' // 解读完成，待确认产物
  | 'in_work' // 资产阶段进行中
  | 'blocked' // 被阻塞
  | 'done';

export type AssetKind = 'character' | 'prop' | 'scene' | 'other';
export type AssetScope = 'episode' | 'global';
export type JobKind = 'split' | 'interpret' | 'image' | 'video' | 'audio' | 'canvas_export';

// ---- 源剧本版本（不可变源，4.1：上传原文作为不可变源版本）----
export interface SourceVersion {
  version: number;
  text: string;
  hash: string; // 上传后计算原文哈希
  uploadedAt: number;
}

// ---- 拆集任务状态（4.2：projectId + sourceVersion 幂等键）----
export interface SplitState {
  jobId: string;
  step: number; // 当前步骤 0..totalSteps
  totalSteps: number;
  locked: boolean; // 用户已确认边界
  error?: string;
}

// ---- 项目（4.1 / 4.2）----
export interface Project {
  id: string;
  title: string;
  styleId: string;
  styleVersion: string; // 视觉风格库版本记录
  aspectRatio: AspectRatio;
  defaultTextModel: string; // 默认文本模型（导演解读/单元 Prompt 兜底；阶段覆盖优先）
  defaultImageModel: string;
  defaultVideoModel: string;
  status: ProjectStatus;
  sourceVersions: SourceVersion[]; // 不可变源版本列表
  currentSourceVersion: number; // 当前使用的源版本号
  split: SplitState | null; // 拆集任务（幂等）
  episodeIds: string[];
  progress: {
    doneEpisodes: number;
    totalEpisodes: number;
    pendingReview: number;
    blocked: number;
  };
  createdAt: number;
  updatedAt: number;
  /** 导演覆盖（全局规则打底，项目覆盖优先；拆集覆盖保存后未锁定剧集重新拆分） */
  ruleOverrides?: RuleOverrides;
  /** 环节提示词规则生效选择（环节 → 模板 id；未设置 = 该环节平台默认模板） */
  promptRuleOverrides?: Partial<Record<PromptStage, string>>;
  /** 视频衔接默认（生成单元参考图组合方式；未设置 = 平台默认） */
  defaultTransitionMode?: TransitionMode;
}

/** 用户规则模板（在规则中心先定义，项目选择后生效；可序列化） */
export interface RuleTemplate {
  id: string;
  /** 当前版本号（编辑保存自动 +1；历史快照存 versionHistory） */
  version: number;
  name: string;
  desc?: string;
  /** 自定义章节标记正则（适配不同剧本格式） */
  episodePattern?: string;
  /** 自定义场次标记正则（适配不同剧本格式） */
  scenePattern?: string;
  /** 目标集数（缺省按场次结构自动推导） */
  targetEpisodes?: number;
  /** 单集场次上限（缺省用平台默认窗口上限） */
  maxScenesPerEpisode?: number;
  /** 容量 · 最大单元秒数（缺省按模型映射） */
  maxUnitSeconds?: number;
  enabled: boolean;
  /** 平台内置模板（只读，不可删除；用户模板为 false） */
  builtin?: boolean;
  createdAt: number;
  updatedAt: number;
  /** 版本历史（每次保存追加一条快照；恢复历史版本 = 生成新版本写回） */
  versionHistory?: SplitRuleVersion[];
}

/** 拆集规则模板版本快照（字段 = RuleTemplate 去掉 id/enabled/时间戳/版本元数据） */
export interface SplitRuleVersion {
  version: number;
  savedAt: number;
  note?: string;
  snapshot: {
    name: string;
    desc?: string;
    episodePattern?: string;
    scenePattern?: string;
    targetEpisodes?: number;
    maxScenesPerEpisode?: number;
    maxUnitSeconds?: number;
  };
}

export interface RuleOverrides {
  /** 生效规则模板引用（规则在规则中心先定义，项目选择后生效；未设置 = 平台默认规则） */
  ruleTemplateId?: string;
  /** 项目级容量微调（覆盖模板/平台容量映射） */
  capacity?: { maxUnitSeconds?: number };
}

// ---- 视频衔接（生成单元参考图组合方式；平台默认/项目默认/执行目标锁定/单元覆盖 四层）----
export type TransitionMode = 'none' | 'first_last_frame';

// ---- 环节提示词规则（对齐竞品环节级规则：平台默认模板 + 用户可覆盖；输出字段与结构平台固定）----
export const PROMPT_STAGES = [
  { id: 'interpretation', label: '导演解读' },
  { id: 'character', label: '角色与表演' },
  { id: 'scene', label: '场景' },
  { id: 'prop', label: '道具' },
  { id: 'directing', label: '分镜设计' },
  { id: 'unit_prompt', label: '视频提示词' },
] as const;
export type PromptStage = (typeof PROMPT_STAGES)[number]['id'];

/** 环节提示词规则模板：规则中心定义（平台默认只读 + 用户模板 CRUD），项目按环节选择生效 */
export interface PromptRuleTemplate {
  id: string;
  /** 当前版本号（编辑保存自动 +1；历史快照存 versionHistory） */
  version: number;
  stage: PromptStage;
  name: string;
  desc?: string;
  /** 提示词/规则内容（用户可覆盖平台默认；输出字段与画布结构由平台固定） */
  content: string;
  /** 平台内置默认模板（只读，不可删除） */
  builtin?: boolean;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  /** 版本历史（每次保存追加一条快照；恢复历史版本 = 生成新版本写回） */
  versionHistory?: PromptRuleVersion[];
}

/** 环节提示词规则模板版本快照（字段 = PromptRuleTemplate 去掉 id/stage/enabled/时间戳/版本元数据） */
export interface PromptRuleVersion {
  version: number;
  savedAt: number;
  note?: string;
  snapshot: {
    name: string;
    desc?: string;
    content: string;
  };
}

// ---- 角色提取规则（规则中心定义 → 项目选择生效；控制从分镜提取角色资产的过滤与聚合逻辑）----
/** 角色提取规则模板 */
export interface CharacterExtractionRule {
  id: string;
  version: number;
  name: string;
  desc?: string;
  /** 群体角色关键词（每行一个；名字包含任一关键词即视为群体角色，不生成独立资产） */
  groupKeywords: string[];
  /** 是否过滤无台词角色（缺省 false） */
  filterNoDialog?: boolean;
  /** 平台内置默认模板（只读，不可删除） */
  builtin?: boolean;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  versionHistory?: CharacterExtractionRuleVersion[];
}

/** 角色提取规则版本快照 */
export interface CharacterExtractionRuleVersion {
  version: number;
  savedAt: number;
  note?: string;
  snapshot: {
    name: string;
    desc?: string;
    groupKeywords: string[];
    filterNoDialog?: boolean;
  };
}

/** 默认群体角色关键词（平台默认规则使用） */
export const DEFAULT_GROUP_CHARACTER_KEYWORDS = [
  '若干', '群', '众', '们', '路人', '观众', '士兵',
  '队友', '对手', '敌人', '敌方', '我方', '群众', '行人',
  '背景', 'NPC', 'npc', '路人甲', '路人乙', '配角',
  '其他', '其余', '剩下', '旁边', '周围',
];

// ---- 项目级角色档案（Character Bible：全剧通用角色设定，单集引用 + 状态覆盖）----
/** 项目级角色设定档案 */
export interface ProjectCharacter {
  id: string;
  projectId: string;
  name: string;
  // 基本信息（4）
  gender: string; // 男/女/其他
  age: string; // 如：25岁
  identity: string; // 身份/职业
  // 外貌特征（6）
  hairstyle: string; // 发型+发色（合并描述，如：黑色短发，微卷）
  /** 发色（AI 提取细分字段，与 hairstyle 并存） */
  hairColor?: string;
  eyeColor: string; // 瞳色（独立，非所有角色需要详细描述）
  facialFeatures: string; // 面部特征/妆造
  specialMarks: string; // 特殊标记（独立，非所有角色都有）
  bodyType: string; // 体型+身高（合并描述，如：身高180cm，肩宽腰窄）
  /** 身高（AI 提取细分字段，与 bodyType 并存） */
  height?: string;
  skinTexture: string; // 皮肤质感（如：小麦色粗糙有光泽）
  // 服装描述（4）
  top: string; // 上装
  bottom: string; // 下装
  shoes: string; // 鞋子
  clothingStyle: string; // 服装风格+配饰（合并描述）
  /** 配饰（AI 提取细分字段，与 clothingStyle 并存） */
  accessories?: string;
  // 表演设定（1）
  performance: string; // 性格+典型表情+行为习惯（合并描述）
  /** 性格关键词（AI 提取细分字段，与 performance 并存） */
  personality?: string;
  // 标准立绘（Canonical Reference）
  imageUrl?: string; // 标准立绘图片URL
  imageStatus?: 'not_generated' | 'generating' | 'loading' | 'generated' | 'failed'; // 生成状态：generating=生成中, loading=加载图片中, generated=已生成, failed=失败
  imageModel?: string; // 生成使用的模型
  imagePrompt?: string; // 生成使用的提示词（自动生成）
  imageNegativePrompt?: string; // 负面提示词
  imageGeneratedAt?: number; // 生成时间
  imageJobId?: string; // 生成任务ID（用于轮询）
  imageError?: string; // 生成失败原因
  imageAspectRatio?: string; // 立绘尺寸比例（如 9:16、2:3）
  // 元数据
  createdAt: number;
  updatedAt: number;
}

/** 项目级角色档案（用于创建/编辑的表单值） */
export type ProjectCharacterForm = Omit<ProjectCharacter, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>;

// ---- 项目级道具设定（Prop Bible：全剧通用道具设定）----
export interface ProjectProp {
  id: string;
  projectId: string;
  name: string;
  // 基本信息
  propType: string; // 道具类型：武器/工具/饰品/食物/文书/电子设备/其他
  category: string; // 分类：手持/穿戴/放置/消耗
  defaultHolder: string; // 默认持有者（角色名，空表示无固定持有者）
  // 外观描述
  material: string; // 材质（金属/木质/塑料/布料等）
  color: string; // 主色调
  size: string; // 尺寸（相对人体的大小）
  shape: string; // 形状描述
  decoration: string; // 装饰细节（花纹/雕刻/宝石等）
  // 功能描述
  usage: string; // 用途/功能
  specialAbility: string; // 特殊能力/效果（如无则留空）
  // 状态描述
  condition: string; // 完好程度（全新/轻微磨损/严重破损等）
  wearMarks: string; // 使用痕迹（划痕/污渍/修补等）
  // 其他
  specialMarks: string; // 特殊标记（徽记/符文/编号等）
  background: string; // 背景故事/来源
  // 元数据
  createdAt: number;
  updatedAt: number;
}

/** 项目级道具设定（用于创建/编辑的表单值） */
export type ProjectPropForm = Omit<ProjectProp, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>;

// ---- 项目级场景设定（Scene Bible：全剧通用场景设定）----
export interface ProjectScene {
  id: string;
  projectId: string;
  name: string;
  // 基本信息
  sceneType: string; // 场景类型：室内/室外/自然/建筑/虚拟
  location: string; // 地点/地理位置
  timePeriod: string; // 故事时间（白天/黄昏/夜晚/凌晨等）
  // 空间描述
  layout: string; // 空间布局（开放式/隔断式/多层等）
  size: string; // 空间尺寸（相对人物的大小）
  structure: string; // 建筑结构（墙壁/柱子/门窗/楼梯等）
  // 环境描述
  weather: string; // 天气（晴/雨/雪/雾等）
  lighting: string; // 光线描述（自然光/人工光/烛光/月光等）
  atmosphere: string; // 氛围（温馨/压抑/神秘/庄严等）
  // 物品描述
  furniture: string; // 家具/固定装置（桌椅/床/柜子/壁炉等）
  includedProps: string; // 包含的道具（场景中固定存在的道具）
  // 其他
  specialMarks: string; // 特殊标记（壁画/图腾/机关等）
  background: string; // 背景故事/场景历史
  // 元数据
  createdAt: number;
  updatedAt: number;
}

/** 项目级场景设定（用于创建/编辑的表单值） */
export type ProjectSceneForm = Omit<ProjectScene, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>;

// ---- 剧集（4.2 / 4.3：剧集 ≠ 场次 ≠ Shot ≠ Unit）----
export interface Episode {
  id: string;
  projectId: string;
  index: number;
  title: string;
  summary: string;
  sourceSpan: { start: number; end: number }; // 映射到原文范围
  stage: EpisodeStage;
  status: EpisodeStatus;
  counts: { scenes: number; characters: number; pendingReview: number };
  blockedBy?: string; // 阻塞原因（Gate 未通过）
  scriptChecked?: boolean; // 本集剧本是否已核对（analyze 第 1 步；编辑后需重新核对）
  scriptDraft?: string; // 本集剧本草稿（编辑保存 = 新版本，未锁版；空则用源版本切片）
  interpretation?: Interpretation; // 导演解读产物
  interpretationConfirmed?: boolean; // 解读产物是否已获用户确认（≠ 自动跳转）
  executionTarget?: ExecutionTarget; // 执行目标（解读前置：模型/容量/交付方式）
  stageModels?: Partial<Record<EpisodeStage, StageModelSlot>>; // 阶段级模型覆盖（随时换模型；缺省回退项目默认/目录首项）
  performance?: ConfirmedItem[]; // 角色表演基调（声音/肢体/情绪基线/人物弧线）
  sceneVariants?: ConfirmedItem[]; // 场次状态变体（时间/天气/光线/氛围）
  directing?: ShotCard[]; // 分镜设计产物（镜头卡 8 域：基础信息/参考资产/世界状态/事件动作/表演对白/摄影构图/光影物理声音/因果收尾）
  directingStep?: 1 | 2 | 3; // 分镜设计子步骤（1 镜头拆分 / 2 镜头语言 / 3 细节与连续性；缺省按数据推断）
  executableUnits?: UnitItem[]; // 可执行单元与资产（EXECUTABLE）
  production?: Shot[]; // 生产阶段（Shot → Unit → Take）
  createdAt: number;
}

// ---- 阶段级模型槽（每个阶段可随时换模型；按消耗类型划分槽位）----
export interface StageModelSlot {
  /** 文本模型（解读/拆解/Prompt 生成） */
  text?: string;
  /** 图片模型（角色/道具/场景资产生成） */
  image?: string;
  /** 视频模型（成片生产；真实调用暂缓验收） */
  video?: string;
}

// ---- 执行目标（解读前置：未确认执行目标不得进入生成；容量决定单元粒度）----
export interface ExecutionTarget {
  model: string; // minimax-h3 / seedance-2.5 / seedance-2.0 ...
  maxUnitSeconds: number; // 15 / 30
  deliveryMethod: 'model' | 'api';
  apiPlatform?: string;
  /** 视频衔接模式（随执行目标锁定：模型 + 容量 + 衔接一起作为本集执行契约） */
  transitionMode: TransitionMode;
  confirmed: boolean;
}

// ---- 通用确认项（表演基调/场次状态变体/调度镜头方案等非图片产物）----
export interface ConfirmedItem {
  id: string;
  label: string;
  detail: string;
  status: ArtifactStatus;
  model?: string;
}

// ---- 可执行单元（EXECUTABLE：镜头卡批准后按模型容量编译，绑定镜头映射与连续性）----
export interface UnitItem {
  id: string;
  label: string;
  durationSeconds: number;
  coverage: string; // 覆盖的 beat/场次
  shotCount: number;
  /** 镜头→单元映射：本单元打包的镜头卡 id（三种映射：1镜=1单元 / 多镜=1单元 / 1镜=多单元） */
  shotIds: string[];
  /** 连续性台账：in=进入本单元前的世界状态（首单元=剧本开篇，后续=上一单元 out），out=本单元收尾快照（来自尾镜 causal.endState，驱动下一单元） */
  continuity: { in: string; out: string };
  exitState: string; // planned exit state（兼容保留，= continuity.out）
  assets: ConfirmedItem[]; // 单元资产（角色四视图/场景母版/道具等引用）
  prompt: { text: string; status: ArtifactStatus }; // target_prompt（绑定版本，用户确认）
  /** 视频衔接覆盖（单元级；未设置 = 跟随执行目标） */
  transitionMode?: TransitionMode;
}

// ---- 生产阶段（5.5：Shot 是导演事实，Unit 是执行单元，Take 是实际结果）----
export interface Shot {
  id: string;
  index: number;
  sceneLabel: string;
  shotType: string; // 景别 / 运镜
  content: string; // 导演事实（镜头内容）
  unitPrompt: string; // 目标模型执行单元 Prompt
  takeStatus: 'none' | 'running' | 'candidate' | 'accepted' | 'rejected';
  takeImageUrl?: string;
}

// ---- 分镜设计镜头卡（吸收 AI 标准化单镜头分镜模板 23 模块 → 归并 8 域）----
// 核心思想：一个镜头一份完整世界快照，所有画面/动作/因果/约束写进当前镜头，不依赖 AI 跨镜头记忆。
// 字段分层：auto=自动派生（解读/资产/基调绑定，只读）、director=导演必填（可编辑）、inherit=默认继承（折叠，可覆盖）。
export interface ShotCardRefs {
  characters: string[]; // 角色资产引用（立绘/三视图）
  scene: string; // 场景资产引用（底图）
  props: string[]; // 道具资产引用
  style: string; // 风格参考
  other: string[]; // 其余辅助素材
}
export interface ShotCard {
  id: string;
  index: number; // 镜头编号（剪辑排序）
  sceneId: string;
  sceneLabel: string; // 场次
  // 域 1 · 基础信息（auto）
  base: {
    storyTime: string; // 故事时间（黄昏/凌晨，非现实时间）
    location: string; // 故事地点
    weather: string; // 天气
    ratio: string; // 画面比例（9:16 等）
    estSeconds: number; // 预计时长（导演估算，供单元打包参考）
  };
  // 域 2 · 参考资产（auto：绑定 canonical 资产，保证跨镜画风/人物/服装统一）
  refs: ShotCardRefs;
  // 域 3 · 镜头内世界状态（director：开拍瞬间快照，防瞬移/崩道具的关键）
  world: {
    characters: { id: string; name: string; position: string; facing: string; headFacing: string; gaze: string; emotion: string; bodyState: string; costumeState: string }[];
    props: { name: string; holder: string; position: string; state: string; intact: string }[];
    sceneState: string; // 场景空间状态（门是否开）
    timeState: string; // 时间状态
    weatherState: string; // 天气状态
    lightingState: string; // 光照状态
    priorCause: string; // 前置因果（必填：进入本镜前发生了什么）
  };
  // 域 4 · 核心视觉事件与动作链路（director：一镜只承载一件主线事件）
  event: {
    main: string; // 本镜头唯一主视觉事件
    trigger: string; // 事件触发条件
    steps: string[]; // 动作步骤 01/02/03
    complete: string; // 事件完成标志
    endPose: string; // 事件收尾最终状态
  };
  // 域 5 · 人物表演与对白（director）
  acting: {
    characterId: string;
    emotion: string;
    intensity: string; // 轻微/强烈/爆发
    expression: string; // 面部神态
    breathing: string;
    gaze: string;
    dialog: { speaker: string; line: string; tone: string }[]; // 对白原文（不可增删改写）
  };
  // 域 6 · 摄影与构图（director）
  camera: {
    shotSize: string; // 标准景别（特写/近景/中景/全景/远景）
    composition: string; // 构图方案
    lens: string; // 镜头焦段
    movement: string; // 相机运动（固定/推/拉/摇/移）
    movePurpose: string; // 运镜目的
    cameraZone: string; // 摄影机所在区域
  };
  // 域 7 · 光影·物理·声音（inherit：默认继承解读基调，可覆盖）
  visual: {
    keyLight: string; // 主光方向
    quality: string; // 硬光/柔光
    colorTemp: string; // 色温
    overallTone: string; // 整体色调
    weatherFx: string; // 雨雪雾等环境特效
    groundState?: string; // 地面状态（潮湿/积雪/灰尘）
    windEffect?: string; // 风力效果
  };
  audio: {
    ambient: string; // 环境底噪
    sfx: string; // 动作/道具/天气音效
    sync: string; // 音画同步规则
    reverb?: string; // 空间混响
    sourcePosition?: string; // 声源位置
  };
  // 域 8 · 剧情因果链与镜头收尾（director：收尾状态是下一镜前置因果的数据源）
  causal: {
    priorNeeded: string; // 镜头前置必要状态
    outcome: string; // 镜头产生结果
    nextAffect: string; // 后续状态走向
    irreversible: string[]; // 不可逆变（永久保留改动）
    endState: string; // 镜头收尾快照（下镜继承源）
  };
  // 域 9 · 实体数量锁定（防AI随机多/少生成人物道具）
  entityCount?: {
    mainCharacters: number; // 主要人物数量
    backgroundCharacters: number; // 背景人物数量
    mainProps: number; // 主要道具数量
    otherEntities: number; // 其余实体数量
  };
  // 域 10 · 画面构图分层（前景/中景/背景）
  compositionLayers?: {
    subject: string; // 画面主体
    subjectPosition: string; // 主体位置
    foreground: string; // 前景遮挡物
    midground: string; // 中景核心动作区
    background: string; // 背景环境
    visualFocus: string; // 视觉焦点
  };
  // 域 11 · 生成提示词汇总（自动汇总，可编辑）
  prompt?: {
    coreScene: string; // 核心画面
    characters: string; // 人物与状态
    action: string; // 动作
    space: string; // 空间
    camera: string; // 摄影机与景别
    lighting: string; // 光线与色彩
    physics: string; // 物理表现
    audio: string; // 对白与声音
    continuity: string; // 连续性状态
    finalPrompt: string; // 最终完整提示词
  };
  // 域 12 · 生成硬性约束（强制规则，规避漫剧常见bug）
  constraints?: string[];
  // 自检清单（导演逐镜勾选，防崩脸/瞬移/道具乱变/剧情断裂）
  checklist: { label: string; ok: boolean }[];
  status: ArtifactStatus;
}

// ---- 导演解读产物（5.1：保留事实/约束/建议/未决项/决定边界 + 基调/场次/覆盖）----
export interface Interpretation {
  facts: string[]; // 原文事实
  constraints: string[]; // 连续性约束
  suggestions: string[]; // 导演建议
  openItems: OpenItem[]; // 未决项（可用户确认）
  decisions: string[]; // 用户决定
  /** 真实文本模型解读原文（阶段文本模型调用返回；结构化草案为制片脚手架，质量由用户评审） */
  directorNote?: string;
  rawFacts: { label: string; text: string }[]; // EV/DLG/LOCK 提取
  lookAndFeel: { tone: string; moodArc: string; rhythmCurve: string; references: string[] }; // 视觉基调与情绪弧线
  breakdown: { id: string; label: string; span: string; duration: string }[]; // 场次清单
  // 覆盖与初步单元：两段式 = 节拍分段（创作层，容量无关）+ 容量映射（平台层，受模型上限约束）
  coverage: {
    beats: { id: string; label: string; span: string; beatSeconds: number; boundaryReason: string }[]; // 创作层：叙事节拍（导演决定，容量无关）
    units: { id: string; label: string; beats: string; duration: number; boundaryReason: string; exitState: string }[]; // 平台层：节拍打包进单元（≤ maxUnitSeconds）
    totalSeconds: number; // 映射后单元总时长
    faithfulMinSeconds: number; // 忠实呈现下限（容量无关的戏剧估计）
  }; // 覆盖与初步单元（PLANNED：创作层/平台层分离，换模型只重映射平台层）
  capacityNote: string; // 容量说明（模型上限 → 单元粒度）
  /** 结构化导演解读（Schema 驱动，8 个专业板块；后端 LLM 按 Schema 输出 JSON，前端按板块渲染） */
  directorInterpretation?: DirectorInterpretation;
}

/** 剧本待确认项：LLM 提出的模糊点 + 用户确认结果 */
export interface OpenItem {
  question: string; // 待确认问题
  resolution?: string; // 用户补充/确认结果
  confirmed: boolean; // 是否已确认
}

/** 导演解读结构化 Schema：固定 9 个专业板块，用户自定义规则影响内容深度而非结构 */
export interface DirectorInterpretation {
  /** 1. 主题与核心冲突：这集讲什么故事，核心矛盾是什么 */
  themeAndConflict?: {
    theme: string; // 核心主题
    coreConflict: string; // 核心冲突
    subtext?: string; // 潜台词/隐喻
  };
  /** 2. 人物弧光与动机：人物在本集的变化、行为动机 */
  characterArc?: {
    character: string; // 主要人物
    startingState: string; // 开场状态
    endingState: string; // 结尾状态
    motivation: string; // 核心动机
    keyDecision?: string; // 关键决策/转变点
  }[];
  /** 3. 情绪弧线：情绪起伏节点、高潮位置 */
  emotionalArc?: {
    overallMood: string; // 整体情绪基调
    beats: { label: string; emotion: string; intensity: number }[]; // 情绪节点
    climax?: string; // 高潮位置
  };
  /** 4. 视觉基调：影调、色彩、光线、氛围 + 色彩/光线叙事（随剧情变化） */
  visualTone?: {
    colorPalette: string; // 色彩方案
    lighting: string; // 光线风格
    atmosphere: string; // 氛围
    keyVisualMotif?: string; // 核心视觉母题
    colorNarrative?: string; // 色彩叙事：本集色彩如何随情绪/剧情转变
    lightingNarrative?: string; // 光线叙事：关键场景的光线设计变化
  };
  /** 5. 节奏设计：哪些场快/慢、停顿点、张力控制 */
  rhythmDesign?: {
    overallPace: string; // 整体节奏
    fastScenes: string[]; // 快节奏场次
    slowScenes: string[]; // 慢节奏/停顿场次
    tensionPoints?: string[]; // 张力控制点
  };
  /** 6. 关键场景处理重点：重点场次的导演意图、表演要求 */
  keySceneFocus?: {
    scene: string; // 场次
    directorIntent: string; // 导演意图
    performanceNote?: string; // 表演要求
    cameraSuggestion?: string; // 镜头建议
  }[];
  /** 7. 叙事结构与关键节点：起承转合划分、关键剧情节点位置（指导分镜镜头量分配） */
  narrativeStructure?: {
    actBreakdown: { act: string; scenes: string; description: string }[]; // 起承转合/三幕划分
    keyNodes: { type: string; location: string; description: string }[]; // 激励事件/转折/高潮等关键节点
    storylines?: { name: string; progression: string }[]; // 各故事线进展
  };
  /** 8. 场景优先级与转场策略：哪些场景精心设计、哪些简化，场景之间如何衔接 */
  scenePriorityAndTransitions?: {
    keyScenes: { scene: string; reason: string }[]; // 关键场景（必须精心设计）
    transitionScenes?: string[]; // 过渡场景（可简化处理）
    transitions: { from: string; to: string; method: string }[]; // 转场策略（硬切/叠化/声音桥/匹配剪辑）
  };
  /** 9. 表演指导要点：每个角色的表演基调、关键表演时刻、对手戏张力方向 */
  performanceDirection?: {
    characterTone: { character: string; tone: string; keyMoment?: string }[]; // 角色表演基调 + 关键表演时刻
    interactionNotes?: string[]; // 角色之间的互动方式/对手戏张力方向
  };
  /** 声音设计建议：环境声、音效、音乐情绪（视频生产阶段细化，解读阶段给方向） */
  soundDesign?: {
    ambient: string; // 环境声
    keySoundEffects?: string[]; // 关键音效
    musicMood?: string; // 音乐情绪
    silenceMoments?: string[]; // 静默时刻
  };
}

// ---- 资产版本（6.1 / 6.2：候选→选择→canonical）----
export interface AssetVersion {
  version: number;
  prompt: string;
  negativePrompt: string;
  imageUrl?: string;
  sha256: string; // mock 哈希（正式为服务端校验）
  status: ArtifactStatus;
  createdAt: number;
}

export interface Asset {
  id: string;
  projectId: string;
  episodeId: string;
  kind: AssetKind;
  name: string;
  description: string;
  scope: AssetScope; // episode / global
  sourceScene?: string; // 来源场次
  holder?: string; // 道具持有者（道具专有）
  projectCharacterId?: string; // 引用的项目角色库档案ID（角色专有，保证一致性）
  currentVersion: number;
  versions: AssetVersion[];
  // 当前版本快捷字段
  prompt: string;
  negativePrompt: string;
  imageUrl?: string;
  variantImageUrl?: string; // 单集变体立绘图片URL（基于标准立绘+状态变体生成）
  variantImageStatus?: 'not_generated' | 'generating' | 'generated' | 'failed'; // 变体立绘生成状态
  episodeVariant?: Record<string, string>; // 单集状态变体：{emotionState, appearanceChange, temporaryOutfit, specialProp}
  status: ArtifactStatus;
  model: string;
  stale: boolean;
  createdAt: number;
  /** 服务端资产的对象信息；前端审核状态和版本日志仍由本地领域状态维护。 */
  source?: 'local' | 'server';
  objectKey?: string;
  byteSize?: number;
  contentType?: string;
}

// ---- 执行任务（全局任务中心，7：Job + SSE 恢复）----
export interface GenJob {
  id: string;
  kind: JobKind;
  label: string;
  projectId?: string;
  episodeId?: string;
  assetId?: string;
  shotId?: string; // 生产阶段：该任务对应的 Shot（完成回调据此回写 Take）
  status: JobStatus;
  progress: number; // 0-100
  attempt: number; // 重试次数
  steps?: { label: string; done: boolean }[];
  costEstimate?: string; // 费用预估
  error?: string;
  contextPath?: string; // 点击跳转上下文
  createdAt: number;
  updatedAt: number;
}

// ---- 追加式审核日志（6.2：artifact_id + version + sha256 + user_statement）----
export type AuditAction = 'APPROVE' | 'REJECT' | 'REGENERATE' | 'EDIT' | 'STALE' | 'IMPORT' | 'GLOBALIZE';

export interface AuditEntry {
  id: string;
  artifactId: string;
  artifactName: string;
  version: number;
  sha256: string;
  action: AuditAction;
  userStatement: string;
  createdAt: number;
}

// ---- 风格 / 广场 / 镜头 ----
export interface StyleOption {
  id: string;
  name: string;
  version: string; // 风格库版本
  description: string;
  cover: string;
  prompt?: string; // 画面风格提示词（可编辑覆盖；缺省用 description）
}

export interface StyleEntry extends StyleOption {
  enabled: boolean; // 停用后不出现在项目风格选择器
  createdAt: number;
}

export interface SquareItem {
  id: string;
  title: string;
  category: string;
  cover: string;
  author: string;
  kind: string; // 类型：漫剧/短片/广告/MV/教育
  model: string; // 适用模型/线路
  reusable: boolean; // 可复用条件
}

export interface LensItem {
  id: string;
  name: string;
  category: string;
  cover: string;
  prompt: string;
  shotParams: string; // 镜头/调度参数
  usage: string; // 适用场景
}
