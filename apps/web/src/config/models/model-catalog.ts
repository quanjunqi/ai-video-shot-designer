// 模型目录（设置中心 · 单一事实源）
// 三层结构：渠道（来源）→ 模型（挂渠道 + 类型）→ 能力/计费（按类型分化）
// 排序规则：同类型内按起步单价低到高（对照竞品「青椒」风格目录）
// 平台默认容量策略（capacity-policy）保留为兜底；目录派生优先（视频模型 maxDurationSeconds）
import type { ExecutionTarget } from '@/types';

export type ModelType = 'text' | 'image' | 'video';
export type ChannelKind = 'official' | 'aggregator' | 'local';

// 接入协议：api = HTTP API 渠道（云服务/聚合网关，BaseURL + 鉴权 + Key）；
// local = 本地端口服务（自托管如 ComfyUI/Ollama，host:port 可达，通常无鉴权）
export type ChannelProtocol = 'api' | 'local';

export interface ChannelConfig {
  id: string;
  name: string;
  kind: ChannelKind; // 官方 / 聚合代理 / 本地（业务来源属性）
  protocol?: ChannelProtocol; // 接入协议：HTTP API 渠道 vs 本地端口服务（如 ComfyUI/Ollama）
  baseUrl: string;
  authType: 'bearer' | 'none';
  enabled: boolean;
  note: string;
  sort?: number; // 渠道排序（服务端目录 hydrate 后按 sort 排列）
  /** 同步上游模型目录的状态（只读，来自平台目录投影）。同步配置本身是平台级的，前端不写。 */
  syncKind?: string;
  syncModelsPath?: string;
  syncPricingPath?: string;
  lastSyncAt?: string | null;
  lastTestAt?: number;
  lastTestOk?: boolean;
  testNote?: string;
}

// ---- L3 能力/计费（按类型分化，对齐竞品卡片标签）----
/** 能力证据溯源（服务端证据结构透传；本卡起展示层读取）：
 *  source=official/manual/…；confidence=high/medium/low；evidenceFile 为仓库内证据路径 */
export interface CapabilityEvidence {
  source?: string;
  confidence?: string;
  verifiedAt?: string;
  evidenceFile?: string;
  note?: string;
  productName?: string;
  snapshotId?: string;
  vocabulary?: string;
}

export interface TextCapability {
  isReasoning: boolean; // 推理模型标记（如 gemini-3.1-flash-lite「推理模型 短文本推理」）
  streaming: boolean; // 支持流式输出
  systemPrompt: boolean; // 支持系统提示词
  maxTokens: number;
  temperature: number;
  billing: { inputPerMTok: number; outputPerMTok: number; minCharge: number }; // 积分/百万Token
}

export interface ImageCapability {
  refImage: boolean; // 支持参考图生图
  aspectRatioCount: number; // 比例数量
  /**
   * ADR 分片 6（D3-B）：目录**显式声明**支持的画面比例（如 ['16:9','1:1']）。
   * 声明后前端走 `source='declared'`，取值与声明逐字一致；未声明则退回 `aspectRatioCount` 推断。
   * 为什么需要它：只声明"数量"时前端只能拿通用表前 N 项去猜，**可能给出该模型不支持的比例**。
   */
  aspectRatios?: string[];
  qualityTiers: number; // 清晰度档位
  billing: { perImage: number }; // 积分/张
  /** 服务端证据结构透传（TASK-MARKET-M6）：单次最多生成张数、任意尺寸约束、档位选项、依据 */
  maxN?: number;
  arbitrarySize?: { ratioMax: string; ratioMin: string; maxPixels: string; divisibleBy: number; experimentalAbove?: string };
  qualityOptions?: string[];
  tiersSource?: CapabilityEvidence;
}

export interface VideoCapability {
  modes: ('t2v' | 'i2v' | 'first_last_frame' | 'multi_ref' | 'audio_ref')[]; // 生成方式
  minDurationSeconds: number;
  maxDurationSeconds: number; // 单元上限（容量派生来源）
  maxRefImages: number;
  maxRefAudios: number;
  qualityTiers: number; // 清晰度档位
  /** ADR 分片 6（D3-B）：同 ImageCapability.aspectRatios —— 显式声明则走 declared，未声明退回推断 */
  aspectRatios?: string[];
  billing: { perSecondStart: number }; // 积分/秒起
  /** 服务端证据结构透传（TASK-MARKET-M6） */
  maxRefVideos?: number;
  resolutionOptions?: string[];
  modesSource?: CapabilityEvidence;
  tiersSource?: CapabilityEvidence;
}

// 参数来源：static = 模板存静态默认值，执行器直传；
// model = 执行器从模型身份注入（如 model → providerModel）；
// runtime = 执行器按业务输入构造（如 messages / tools / 参考图）。
export type ParamSource = 'static' | 'model' | 'runtime';

// provider 特有参数模板（执行器透传，解决不同厂商请求参数不一致）
export interface ModelParam {
  key: string;
  value: string;
  /** 请求/响应共用：字段类型（array/object 等多级结构由此表达） */
  type?: 'string' | 'number' | 'bool' | 'object' | 'array';
  /** 请求参数专用：来源分类（静态默认 / 模型注入 / 运行时注入）；缺省 = static */
  role?: ParamSource;
  /** 是否必填（对应文档「必填」标注） */
  required?: boolean;
  /** 字段说明（对应文档「描述/取值范围」） */
  desc?: string;
  /** 模型级覆盖标记：该值为模型配置覆盖的默认值（区别于协议模板基线） */
  overridden?: boolean;
}

/** 异步任务协议声明：解决「提交 → 轮询 → 完成/失败」这一类多级联合场景。
 *  模板只声明字段与判定值，轮询间隔/超时/分支逻辑由执行器状态机内置。 */
export interface ProtocolAsync {
  enabled: boolean;
  taskIdField: string; // 提交响应中任务 ID 字段（如 task_id）
  statusField: string; // 轮询响应中状态字段（如 status）
  doneValue: string; // 完成判定值（如 SUCCESS / completed / succeeded）
  failValue: string; // 失败判定值（如 FAILED / failed / error）
  pollPath?: string; // 轮询路径模板，必须含 {task_id} 占位符（执行器用 ReplaceAll 替换）。未声明时执行器会退化到**硬编码**默认值 /v1/images/tasks/{task_id}（并非按提交端点推导）—— 对多数渠道是错的，务必显式声明
}

/** 模型协议模板：平台预置的请求协议描述（端点/方法/请求参数/响应映射），
 *  添加模型时选模板自动带出，用户无需（通常也不应）手动定义协议细节；
 *  仅自定义/异构渠道可在「高级配置」中覆盖。 */
export interface ProtocolTemplate {
  id: string;
  label: string;
  desc: string;
  type: 'text' | 'image' | 'video' | 'all'; // 适用模型类型（all 全类型通用，如聚合网关）
  requestPath: string;
  method: 'POST' | 'GET';
  params: ModelParam[];
  responseParams: ModelParam[];
  builtin: boolean; // 内置模板：平台预置，禁止删除
  enabled: boolean;
  refCount: number; // 引用该模板的模型数
  version: number; // 版本号（每次编辑 +1）
  async?: ProtocolAsync; // 异步任务模式（默认不启用）
  // ADR-008 §3：两类证据并列 —— docRef 是【外部输入/线索】，observedEvidence 是【实测/事实】。
  // 冲突时以实测为准，且差异必须保留可见（客户端不做"取其一"的合并）。
  docRef?: Record<string, unknown>;
  observedEvidence?: Record<string, unknown>;
}

export const PROTOCOL_TEMPLATES: ProtocolTemplate[] = [
  {
    id: 'openai-compatible',
    type: 'text',
    label: 'OpenAI 兼容 Chat（Chat Completions）',
    desc: '标准 chat/completions；model 由模型身份注入，messages/tools 由执行器按业务构造，静态采样参数存模板默认。图片模型走独立的 Images API 模板。',
    requestPath: '/v1/chat/completions',
    builtin: true, enabled: true, refCount: 0, version: 1,
    method: 'POST',
    params: [
      { key: 'model', value: '', type: 'string', role: 'model', required: true, desc: '对话模型 ID（执行器注入模型标识 providerModel）' },
      { key: 'messages', value: '', type: 'array', role: 'runtime', required: true, desc: '对话消息数组，按时间顺序排列（执行器按会话/剧本构造）' },
      { key: 'temperature', value: '0.7', type: 'number', role: 'static', desc: '采样温度，>= 0 <= 2，默认 1' },
      { key: 'top_p', value: '1', type: 'number', role: 'static', desc: '核采样，>= 0 <= 1，默认 1' },
      { key: 'max_tokens', value: '1024', type: 'number', role: 'static', desc: '最大输出 token 数，>= 1' },
      { key: 'n', value: '1', type: 'number', role: 'static', desc: '生成候选数，>= 1，默认 1' },
      { key: 'stream', value: 'false', type: 'bool', role: 'static', desc: '是否 SSE 流式返回，默认 false' },
      { key: 'presence_penalty', value: '0', type: 'number', role: 'static', desc: '话题新鲜度惩罚，>= -2 <= 2，默认 0' },
      { key: 'frequency_penalty', value: '0', type: 'number', role: 'static', desc: '频率惩罚，>= -2 <= 2，默认 0' },
      { key: 'stop', value: '["\\n"]', type: 'array', role: 'static', desc: '停止序列数组（JSON 字符串）' },
      { key: 'tools', value: '', type: 'array', role: 'runtime', desc: 'Function Calling 工具列表（OpenAI 格式，平台按需注入）' },
      { key: 'tool_choice', value: 'auto', type: 'string', role: 'static', desc: '工具选择策略：auto / none / 指定函数' },
      { key: 'response_format', value: '{"type":"json_object"}', type: 'object', role: 'static', desc: '强制输出格式（JSON 字符串），如 {"type":"json_object"}' },
      { key: 'user', value: '', type: 'string', role: 'runtime', desc: '终端用户标识，用于审计与风控' },
    ],
    responseParams: [
      { key: 'choices.0.message.content', type: 'string', value: '文本正文（无工具调用时）' },
      { key: 'choices.0.message.tool_calls', type: 'array', value: '工具调用列表（函数名/参数）' },
      { key: 'choices.0.finish_reason', type: 'string', value: '结束原因（stop / tool_calls / length）' },
      { key: 'usage.prompt_tokens', type: 'number', value: '输入 Token 数' },
      { key: 'usage.completion_tokens', type: 'number', value: '输出 Token 数' },
      { key: 'usage.total_tokens', type: 'number', value: '总 Token 数' },
      { key: 'id', type: 'string', value: '会话 ID' },
      { key: 'model', type: 'string', value: '实际使用的模型' },
      { key: 'created', type: 'number', value: '生成时间戳' },
    ],
  },
  {
    id: 'openai-compatible-images',
    type: 'image',
    label: 'OpenAI 兼容图片（Images API）',
    desc: 'images/generations 形态，响应取 data[].url 提取图片地址。支持 task_type=async 异步任务模式。',
    requestPath: '/v1/images/generations',
    builtin: true, enabled: true, refCount: 0, version: 1,
    method: 'POST',
    params: [{ key: 'n', value: '1' }, { key: 'task_type', value: 'async' }],
    responseParams: [{ key: 'data.0.url', type: 'string', value: '图片地址' }],
    async: { enabled: true, taskIdField: 'task_id', statusField: 'status', doneValue: 'SUCCESS', failValue: 'FAILED', pollPath: '/v1/images/tasks/{task_id}' },
  },
  {
    id: 'minimax-video',
    type: 'video',
    label: 'MiniMax 视频（异步任务）',
    desc: '视频生成走异步任务：提交返回 task_id，轮询查询进度与成品。',
    requestPath: '/v1/video_generation',
    builtin: true, enabled: true, refCount: 0, version: 1,
    method: 'POST',
    params: [],
    responseParams: [
      { key: 'task_id', type: 'string', value: '任务 ID（轮询查询进度）' },
      { key: 'status', type: 'string', value: '任务状态（轮询判断完成/失败）' },
      { key: 'file_id', type: 'string', value: '成品文件 ID' },
    ],
    async: { enabled: true, taskIdField: 'task_id', statusField: 'status', doneValue: 'Success', failValue: 'Failed', pollPath: '/v1/video_generation/{task_id}' },
  },
  {
    id: 'minimax-text',
    type: 'text',
    label: 'MiniMax 文本',
    desc: 'MiniMax 文本对话（chatcompletion_v2），响应结构与 OpenAI 兼容。',
    requestPath: '/v1/text/chatcompletion_v2',
    builtin: true, enabled: true, refCount: 0, version: 1,
    method: 'POST',
    params: [{ key: 'stream', value: 'false' }],
    responseParams: [{ key: 'choices.0.message.content', type: 'string', value: '文本正文' }],
  },
  {
    id: 'jimeng-image',
    type: 'image',
    label: '即梦图片',
    desc: '即梦图片生成（images/generations 兼容形态），响应取 data[].url。',
    requestPath: '/v1/images/generations',
    builtin: true, enabled: true, refCount: 0, version: 1,
    method: 'POST',
    params: [],
    responseParams: [{ key: 'data.0.url', type: 'string', value: '图片地址' }],
  },
  {
    id: 'jimeng-video',
    type: 'video',
    label: '即梦视频（异步任务）',
    desc: '即梦视频生成走异步任务，提交返回任务 ID，完成后取成品地址。',
    requestPath: '/v1/videos/generations',
    builtin: true, enabled: true, refCount: 0, version: 1,
    method: 'POST',
    params: [],
    responseParams: [
      { key: 'task_id', type: 'string', value: '任务 ID（轮询查询进度）' },
      { key: 'status', type: 'string', value: '任务状态（轮询判断完成/失败）' },
      { key: 'data.0.url', type: 'string', value: '视频地址' },
    ],
    async: { enabled: true, taskIdField: 'task_id', statusField: 'status', doneValue: 'SUCCESS', failValue: 'FAILED', pollPath: '' },
  },
  {
    id: 'grsai-forward',
    type: 'all',
    label: '聚合网关转发（OpenAI 兼容）',
    desc: 'Grsai 等聚合渠道统一 OpenAI 兼容协议，按厂商转发；响应取 choices[0].message.content。',
    requestPath: '/v1/chat/completions',
    builtin: true, enabled: true, refCount: 0, version: 1,
    method: 'POST',
    params: [],
    responseParams: [{ key: 'choices.0.message.content', type: 'string', value: '文本正文' }],
  },
  {
    id: 'comfyui-local',
    type: 'image',
    label: 'ComfyUI 本地工作流（端口直连）',
    desc: '本地端口直连（无需鉴权）：提交 /prompt 返回 prompt_id，轮询 /history 取成品。',
    requestPath: '/prompt',
    builtin: true, enabled: true, refCount: 0, version: 1,
    method: 'POST',
    params: [{ key: 'client_id', value: '漫剧工坊' }],
    responseParams: [{ key: 'prompt_id', type: 'string', value: '工作流执行 ID（轮询 /history）' }],
  },
];

export interface CatalogModel {
  id: string;
  channelId: string;
  family: string; // 模型家族（跨渠道同家族：MiniMax H3 / Seedance 2.0）
  name: string; // 展示名（视频模型名与历史 mock/执行目标兼容：MiniMax H3 / Seedance 2.5 / Seedance 2.0）
  providerModel: string; // provider 侧真实模型标识（如 minimax.h3-20250707），与展示名分离
  type: ModelType;
  status: 'enabled' | 'disabled';
  sort: number; // 同类型内按起步单价低到高
  note: string; // 模型介绍一行
  protocolTemplateId?: string; // 引用协议模板；模型级字段为覆盖层（模板默认值 → 模型覆盖值）
  requestPath: string; // 模型级请求端点（相对渠道 baseUrl，如 /video_generation）
  method: 'POST' | 'GET';
  params: ModelParam[]; // provider 特有请求参数模板（key-value）
  responseParams?: ModelParam[]; // 响应字段映射模板（可选；执行器解析 provider 输出，空=适配器内置解析）
  capability: TextCapability | ImageCapability | VideoCapability;
  /**
   * 路由归属（来自平台目录投影，只读）。
   * logicalModelId：所属「对外能力」（同一 id 的多行 = 候选渠道）
   * routePriority ：优先级，小者优先；未纳入路由的行没有该字段
   */
  logicalModelId?: string;
  routePriority?: number;
}

// ---- L1 渠道（六渠道全内置）----
export const MODEL_CHANNELS: ChannelConfig[] = [
  { id: 'jimeng', name: '即梦', kind: 'official', protocol: 'api', baseUrl: 'https://open.volcengine.com/api/v1', authType: 'bearer', enabled: true, note: '字节官方：Seedream 图片 / Seedance 视频（真实鉴权待接入）' },
  { id: 'minimax', name: 'MiniMax', kind: 'official', protocol: 'api', baseUrl: 'https://api.minimax.chat/v1', authType: 'bearer', enabled: true, note: 'MiniMax 官方：H3 视频 / Text-01 文本（真实鉴权待接入）' },
  { id: 'grsai', name: 'Grsai 聚合', kind: 'aggregator', protocol: 'api', baseUrl: 'https://api.grsai.com/v1', authType: 'bearer', enabled: true, note: '聚合渠道：特价版模型（MiniMax H3 特价 / Seedance 2.0 特价 / deepseek-v4-pro 等）' },
  { id: 'google', name: 'Google Gemini', kind: 'official', protocol: 'api', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', authType: 'bearer', enabled: true, note: 'Gemini 文本与图片（nano-banana 系列）' },
  { id: 'openai', name: 'OpenAI', kind: 'official', protocol: 'api', baseUrl: 'https://api.openai.com/v1', authType: 'bearer', enabled: true, note: 'OpenAI：gpt-image-2 图片 / GPT 文本' },
  { id: 'comfy', name: 'ComfyUI 本地/云端', kind: 'local', protocol: 'local', baseUrl: 'http://127.0.0.1:8188', authType: 'none', enabled: true, note: '本地工作流：SDXL / Flux 图片' },
];

// ---- L2 模型目录（内置默认；可增删改，排序按起步单价低到高）----
// 计费数值为示例定价（对照竞品目录），真实定价随渠道接入后校准
export const MODEL_CATALOG: CatalogModel[] = [
  // ===== 视频（sort = 起步单价低到高）=====
  { id: 'minimax-h3', channelId: 'minimax', family: 'MiniMax H3', name: 'MiniMax H3', providerModel: 'MiniMax H3', requestPath: '', method: 'POST', params: [], type: 'video', status: 'enabled', sort: 1,
    note: 'MiniMax 官方 H3：需同时提供 1 张参考图和 1 条参考音频，单次视频时长 1-15 秒。',
    capability: { modes: ['i2v', 'multi_ref', 'audio_ref'], minDurationSeconds: 1, maxDurationSeconds: 15, maxRefImages: 1, maxRefAudios: 1, qualityTiers: 2, aspectRatios: ['16:9', '9:16'], billing: { perSecondStart: 0.5 } } },
  { id: 'minimax-h3-grsai', channelId: 'grsai', family: 'MiniMax H3', name: 'MiniMax H3（特价版）', providerModel: 'MiniMax H3（特价版）', requestPath: '', method: 'POST', params: [], type: 'video', status: 'enabled', sort: 2,
    note: 'Grsai 平台 MiniMax H3 视频模型，支持文生视频、图生视频、首尾帧、图片和音频参考，不支持视频参考。',
    capability: { modes: ['t2v', 'i2v', 'first_last_frame', 'multi_ref'], minDurationSeconds: 1, maxDurationSeconds: 15, maxRefImages: 1, maxRefAudios: 0, qualityTiers: 3, billing: { perSecondStart: 1 } } },
  { id: 'seedance-2.0', channelId: 'jimeng', family: 'Seedance 2.0', name: 'Seedance 2.0', providerModel: 'Seedance 2.0', requestPath: '', method: 'POST', params: [], type: 'video', status: 'enabled', sort: 3,
    note: '即梦官方 Seedance 2.0，支持文生视频、参考图、首尾帧及多模态参考，时长 4-15 秒。',
    capability: { modes: ['t2v', 'i2v', 'first_last_frame', 'multi_ref'], minDurationSeconds: 4, maxDurationSeconds: 15, maxRefImages: 9, maxRefAudios: 0, qualityTiers: 3, billing: { perSecondStart: 0 } } },
  { id: 'seedance-2.0-grsai', channelId: 'grsai', family: 'Seedance 2.0', name: 'Seedance 2.0（特价版）', providerModel: 'Seedance 2.0（特价版）', requestPath: '', method: 'POST', params: [], type: 'video', status: 'enabled', sort: 4,
    note: 'Seedance 2.0 特价版视频生成，支持文生视频、参考图、首尾帧及多模态参考，时长 4-15 秒。',
    capability: { modes: ['t2v', 'i2v', 'first_last_frame', 'multi_ref'], minDurationSeconds: 4, maxDurationSeconds: 15, maxRefImages: 9, maxRefAudios: 0, qualityTiers: 3, billing: { perSecondStart: 2 } } },
  { id: 'seedance-2.5', channelId: 'jimeng', family: 'Seedance 2.5', name: 'Seedance 2.5', providerModel: 'Seedance 2.5', requestPath: '', method: 'POST', params: [], type: 'video', status: 'enabled', sort: 5,
    note: '即梦官方 Seedance 2.5，支持 4-30 秒生成，可容纳完整对话轮次与动作链。',
    capability: { modes: ['t2v', 'i2v', 'first_last_frame', 'multi_ref'], minDurationSeconds: 4, maxDurationSeconds: 30, maxRefImages: 9, maxRefAudios: 0, qualityTiers: 3, billing: { perSecondStart: 0 } } },
  { id: 'kling-1.6', channelId: 'grsai', family: 'Kling 1.6', name: 'Kling 1.6', providerModel: 'Kling 1.6', requestPath: '', method: 'POST', params: [], type: 'video', status: 'enabled', sort: 6,
    note: '快手可灵经 Grsai 聚合接入，文生/图生视频，上限 15 秒。',
    capability: { modes: ['t2v', 'i2v'], minDurationSeconds: 5, maxDurationSeconds: 15, maxRefImages: 1, maxRefAudios: 0, qualityTiers: 2, billing: { perSecondStart: 0 } } },

  // ===== 图片（sort = 起步单价低到高）=====
  { id: 'nano-banana-2-lite', channelId: 'google', family: 'nano-banana-lite', name: 'nano-banana-2-lite', providerModel: 'nano-banana-2-lite', requestPath: '', method: 'POST', params: [], type: 'image', status: 'enabled', sort: 1,
    note: '谷歌香蕉高清出图，支持参考图生图与 4 种比例。',
    capability: { refImage: true, aspectRatioCount: 4, qualityTiers: 2, billing: { perImage: 2 } } },
  { id: 'gpt-image-2', channelId: 'openai', family: 'gpt-image', name: 'gpt-image-2', providerModel: 'gpt-image-2', requestPath: '', method: 'POST', params: [], type: 'image', status: 'enabled', sort: 2,
    note: 'openai 最强图片模型 gpt-image-2，支持参考图生图与 6 种比例。',
    capability: { refImage: true, aspectRatioCount: 6, qualityTiers: 2, billing: { perImage: 2 } } },
  { id: 'nano-banana', channelId: 'google', family: 'nano-banana', name: 'nano-banana', providerModel: 'nano-banana', requestPath: '', method: 'POST', params: [], type: 'image', status: 'enabled', sort: 3,
    note: '谷歌香蕉高清出图，支持参考图生图与 3 种比例。',
    capability: { refImage: true, aspectRatioCount: 3, qualityTiers: 2, billing: { perImage: 3 } } },
  { id: 'seedream-5.0', channelId: 'jimeng', family: 'Seedream 5.0', name: 'Seedream 5.0', providerModel: 'Seedream 5.0', requestPath: '', method: 'POST', params: [], type: 'image', status: 'enabled', sort: 4,
    note: '即梦官方 Seedream 5.0 图片模型（定价待渠道接入后校准）。',
    capability: { refImage: true, aspectRatioCount: 4, qualityTiers: 2, billing: { perImage: 0 } } },
  { id: 'sdxl-comfy', channelId: 'comfy', family: 'SDXL', name: 'SDXL', providerModel: 'SDXL', requestPath: '', method: 'POST', params: [], type: 'image', status: 'enabled', sort: 5,
    note: 'ComfyUI 本地 SDXL 工作流（0 积分）。',
    capability: { refImage: true, aspectRatioCount: 3, qualityTiers: 1, billing: { perImage: 0 } } },
  { id: 'flux-comfy', channelId: 'comfy', family: 'Flux', name: 'Flux.1', providerModel: 'Flux.1', requestPath: '', method: 'POST', params: [], type: 'image', status: 'enabled', sort: 6,
    note: 'ComfyUI 本地 Flux.1 工作流（0 积分）。',
    capability: { refImage: true, aspectRatioCount: 3, qualityTiers: 1, billing: { perImage: 0 } } },

  // ===== 文本（sort = 输入单价低到高）=====
  { id: 'gemini-3.1-flash-lite', channelId: 'google', family: 'Gemini 3.1', name: 'gemini-3.1-flash-lite', providerModel: 'gemini-3.1-flash-lite', requestPath: '', method: 'POST', params: [], type: 'text', status: 'enabled', sort: 1,
    note: 'gemini-3.1-flash-lite 推理模型 · 短文本推理',
    capability: { isReasoning: true, streaming: true, systemPrompt: true, maxTokens: 8000, temperature: 0.7, billing: { inputPerMTok: 3.75, outputPerMTok: 22.5, minCharge: 1 } } },
  { id: 'gemini-2.5-flash', channelId: 'google', family: 'Gemini 2.5', name: 'gemini-2.5-flash', providerModel: 'gemini-2.5-flash', requestPath: '', method: 'POST', params: [], type: 'text', status: 'enabled', sort: 2,
    note: 'gemini-2.5-flash 通用文本',
    capability: { isReasoning: false, streaming: true, systemPrompt: true, maxTokens: 10000, temperature: 0.7, billing: { inputPerMTok: 4.5, outputPerMTok: 30, minCharge: 1 } } },
  { id: 'minimax-text-01', channelId: 'minimax', family: 'MiniMax-Text', name: 'MiniMax-Text-01', providerModel: 'MiniMax-Text-01', requestPath: '', method: 'POST', params: [], type: 'text', status: 'enabled', sort: 3,
    note: 'MiniMax 官方文本模型（定价待渠道接入后校准）。',
    capability: { isReasoning: false, streaming: true, systemPrompt: true, maxTokens: 12000, temperature: 0.7, billing: { inputPerMTok: 0, outputPerMTok: 0, minCharge: 0 } } },
  { id: 'deepseek-v4-pro', channelId: 'grsai', family: 'DeepSeek V4', name: 'deepseek-v4-pro', providerModel: 'deepseek-v4-pro', requestPath: '', method: 'POST', params: [], type: 'text', status: 'enabled', sort: 4,
    note: '后台暂未补充描述',
    capability: { isReasoning: true, streaming: false, systemPrompt: true, maxTokens: 16000, temperature: 0.7, billing: { inputPerMTok: 133.65, outputPerMTok: 400.95, minCharge: 1 } } },
];

// ---- 查询辅助（组件与规则共用）----
export function channelById(id: string): ChannelConfig | undefined {
  return MODEL_CHANNELS.find((c) => c.id === id);
}

export function catalogModelById(id: string): CatalogModel | undefined {
  return MODEL_CATALOG.find((m) => m.id === id);
}

/** 按展示名查目录（视频模型名与历史执行目标兼容） */
export function catalogModelByName(name: string): CatalogModel | undefined {
  return MODEL_CATALOG.find((m) => m.name === name);
}

export function enabledModels(type: ModelType): CatalogModel[] {
  return MODEL_CATALOG.filter((m) => m.type === type && m.status === 'enabled').sort((a, b) => a.sort - b.sort);
}

export function enabledVideoModels(): CatalogModel[] {
  return enabledModels('video');
}

export function enabledImageModels(): CatalogModel[] {
  return enabledModels('image');
}

export function enabledTextModels(): CatalogModel[] {
  return enabledModels('text');
}

/** 视频模型单元上限：目录 maxDurationSeconds 优先，fallback 平台容量策略 */
export function maxUnitSecondsForModel(name: string): number {
  const m = catalogModelByName(name);
  if (m?.type === 'video') {
    const cap = m.capability as VideoCapability;
    if (cap.maxDurationSeconds > 0) return cap.maxDurationSeconds;
  }
  return 15; // 安全默认（与 capacity-policy DEFAULT_MAX_UNIT_SECONDS 一致）
}

/** 生成容量说明（对齐历史容量文案；目录能力信息补充） */
export function catalogCapacityNote(target: ExecutionTarget): string {
  const m = catalogModelByName(target.model);
  const cap = m?.type === 'video' ? (m.capability as VideoCapability) : undefined;
  const refInfo = cap && cap.maxRefImages > 0 ? `最多 ${cap.maxRefImages} 张参考图` : '';
  return target.maxUnitSeconds >= 30
    ? `执行目标 ${target.model}（单元上限 ${target.maxUnitSeconds}s）：可容纳完整对话轮次与动作链，切点少、连续性负担低${refInfo ? '；' + refInfo : ''}；多人/手部/道具交接等高风险信号出现时仍主动缩短单元。`
    : `执行目标 ${target.model}（单元上限 ${target.maxUnitSeconds}s）：按戏剧节拍切分，切点多、台账负担重但控制精细${refInfo ? '；' + refInfo : ''}；容量不足时增加单元，不压缩剧情。`;
}
