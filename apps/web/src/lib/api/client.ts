import type { components } from '@/types/generated/api';

export interface ApiErrorShape {
  code: string;
  message: string;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, body: ApiErrorShape | undefined) {
    super(body?.message || `请求失败（${status}）`);
    this.name = 'ApiError';
    this.code = body?.code || 'UNKNOWN_ERROR';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      ...init?.headers,
    },
  });
  const text = await response.text();
  // 调试：打印tasks API的完整响应和响应头
  if (path.includes('/api/v1/tasks/') && !path.includes('/cancel') && !path.includes('/retry') && !path.includes('/run')) {
    console.log('[API DEBUG] getTask URL:', path);
    console.log('[API DEBUG] response headers:', JSON.stringify(Object.fromEntries(response.headers.entries())));
    console.log('[API DEBUG] getTask FULL response:', text);
  }
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  if (!response.ok) {
    throw new ApiError(response.status, body as ApiErrorShape | undefined);
  }
  return body as T;
}

export type ServerProject = components['schemas']['Project'];


export interface CreateProjectRequest {
  title: string;
  style_id: string;
  style_version: string;
  aspect_ratio: '16:9' | '9:16' | '1:1';
  default_text_model: string;
  default_image_model: string;
  default_video_model: string;
  source_text: string;
}

export type ServerEpisode = components['schemas']['Episode'];


export interface CreateEpisodeRequest {
  id: string;
  index: number;
  title: string;
  summary?: string;
  source_span_start?: number;
  source_span_end?: number;
}

export type ServerEpisodeAsset = components['schemas']['EpisodeAsset'];


export interface CreateEpisodeAssetRequest {
  id: string;
  kind: 'character' | 'prop' | 'scene' | 'other';
  name: string;
  description?: string;
  scope?: 'episode' | 'global';
  source_scene?: string;
  holder?: string;
  current_version?: number;
  versions?: ServerEpisodeAsset['versions'];
  prompt?: string;
  negative_prompt?: string;
  image_url?: string;
  status?: string;
  model?: string;
  stale?: boolean;
}

export type ServerProjectCharacter = components['schemas']['ProjectCharacter'];


export interface CreateProjectCharacterRequest {
  id: string;
  name: string;
  gender?: string;
  age?: string;
  identity?: string;
  hairstyle?: string;
  eye_color?: string;
  facial_features?: string;
  special_marks?: string;
  body_type?: string;
  skin_texture?: string;
  top?: string;
  bottom?: string;
  shoes?: string;
  clothing_style?: string;
  performance?: string;
  image_url?: string;
  image_status?: string;
  image_model?: string;
  image_prompt?: string;
  image_negative_prompt?: string;
  image_aspect_ratio?: string;
}

export type ServerRuleTemplate = components['schemas']['RuleTemplate'];


export interface CreateRuleTemplateRequest {
  id: string;
  kind: 'split' | 'prompt';
  name: string;
  description?: string;
  stage?: string;
  content?: string;
  config?: Record<string, unknown>;
  builtin?: boolean;
  enabled?: boolean;
}

export type ServerAsset = components['schemas']['Asset'];


export interface CreateAssetUploadRequest {
  project_id: string;
  episode_id?: string;
  kind: ServerAsset['kind'];
  scope: ServerAsset['scope'];
  name: string;
  prompt?: string;
  sha256?: string;
}

export interface AssetUploadSession {
  id: string;
  project_id: string;
  object_key: string;
  status: string;
  created_at: string;
}

export type ServerTask = components['schemas']['Task'];


export interface CreateTaskRequest {
  kind: ServerTask['kind'];
  label: string;
  project_id?: string;
  episode_id?: string;
  asset_id?: string;
  shot_id?: string;
  steps?: { label: string; done: boolean }[];
  cost_estimate?: string;
  context_path?: string;
  payload?: Record<string, unknown>;
}

export type ServerGenerationIntent = components['schemas']['GenerationIntent'];


export interface CreateGenerationIntentRequest {
  project_id: string;
  episode_id?: string;
  asset_id?: string;
  kind: ServerTask['kind'];
  label: string;
  payload: Record<string, unknown>;
  scope_epoch: number;
}


// ---- Model catalog (production service: platform-shared default directory) ----
export type ServerCatalogChannel = components['schemas']['CatalogChannel'];


export type ServerCatalogModel = components['schemas']['CatalogModel'];


export interface UserChannelItem {
  id: string;
  name: string;
  kind: 'official' | 'aggregator' | 'local';
  protocol?: string;
  baseUrl: string;
  authType: string;
  enabled: boolean;
  note: string;
  sort?: number;
  updatedAt?: string;
  // 同步配置（ADR-009 决定 2：**跟着渠道走**）。工作区渠道的配置只存在于工作区域，
  // 因此这四个字段必须随用户渠道一起读到 —— 否则界面会把"已配同步"的渠道显示成"未配置"。
  syncKind?: 'none' | 'openai_compatible';
  syncModelsPath?: string;
  syncPricingPath?: string;
  trustNote?: string;
}

export type ServerCatalogDirectory = components['schemas']['CatalogDirectory'];


export type ServerProtocolTemplate = components['schemas']['ProtocolTemplate'];


export type ServerCatalogModelPatch = components['schemas']['CatalogModelPatch'];


/** 一次上游同步的结果计数（与 production 的 SyncResult 一一对应）。 */
export interface ChannelSyncResult {
  channel_id: string;
  raw_count: number;
  added: number;
  updated: number;
  missing: number;
  price_changed: number;
}

export type ServerCatalogChannelPatch = components['schemas']['CatalogChannelPatch'];


// ---- Execution sync model test (real dispatch via engine) ----
export interface RunModelTestResponse {
  ok: boolean;
  run: {
    status: number;
    extracted?: Record<string, unknown> | null;
    rawBody?: string;
    duration: string;
    error?: string;
  };
}

// Unified model gateway types
export interface GenerateRequest {
  modelId: string;
  modality?: 'text' | 'image' | 'video' | 'audio';
  mode?: string;
  input?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface AuditLog {
  id: number;
  request_id: string;
  workspace_id: string;
  project_id?: string;
  episode_id?: string;
  asset_id?: string;
  // T1 业务归因（迁移 013）：钱花在哪个分镜 / 功能；缺失为空串
  shot_id?: string;
  feature?: string;
  user_id?: string;
  product: string;
  model_id: string;
  channel_id?: string;
  provider_model?: string;
  mode: string;
  request_payload: Record<string, unknown>;
  response_payload?: Record<string, unknown>;
  error_message?: string;
  status: string;
  latency_ms: number;
  token_input: number;
  token_output: number;
  token_cached: number;
  cost_amount: number;
  cost_currency: string;
  job_id?: string;
  provider_task_id?: string;
  created_at: string;
}

/** T2-1 四维排行单项（口径与 /internal/v1/audit/stats 一致） */
export interface AuditStat {
  key: string;
  calls: number;
  success_calls: number;
  failed_calls: number;
  /** 0-100，服务端算（仅成功行计入分母的 P95 独立） */
  success_rate: number;
  p95_latency_ms: number;
  /** 已校准口径：cost_amount>0 且有 cost_unit 的合计 */
  cost_calibrated: number;
  /** 预估口径：其余行的调用计数（金额不可知） */
  cost_estimated_calls: number;
}

/** T2-1 时间序列点（granularity=day|week|month） */
export interface AuditTrendPoint {
  bucket: string;
  calls: number;
  success_calls: number;
  p95_latency_ms: number;
  cost_calibrated: number;
  cost_estimated_calls: number;
}

export interface GenerateResponse {
  ok?: boolean;
  task_id?: string;
  status?: string;
  output?: Record<string, unknown>;
  poll_url?: string;
  error?: string;
  run?: {
    status: number;
    extracted?: Record<string, unknown> | null;
    duration: string;
    error?: string;
  };
}


// ---- Channel probe & workspace credentials (formal connectivity) ----
export interface ProbeResult {
  channelId: string;
  reachable: boolean;
  authConfigured: boolean;
  authOk?: boolean;
  statusCode?: number;
  detail: string;
  probedAt: string;
}

export interface CredentialStatus {
  channelId: string;
  baseUrl: string;
  authType: string;
  hasKey: boolean;
  enabled: boolean;
  updatedAt: string;
}

// ---- Logical models & candidate bindings (production, ADR-003 §3.1) ----
// 逻辑模型是对外统一标识（能力型 kebab-case，id 一经使用即不可改名）；
// 其候选行是 model_catalog 的一行，按 routePriority **小者优先**依次尝试。
// 列表接口与其它端点不同：上游返回裸数组（不是 {items: [...]}）。
export type LogicalModelType = 'text' | 'image' | 'video';
export type LogicalModelStatus = 'enabled' | 'disabled';

// ── 策展（O-1 Phase D）─────────────────────────────────────────────────
// 上游供给池里的一行。UpstreamType 是上游**原样标签**（如 "model"），
// 它可能无法映射到产品面的 text|image|video —— 所以界面必须让用户选，而不是猜。
export interface SupplyItem {
  channelId: string;
  providerModel: string;
  displayName: string;
  upstreamType: string;
  tags: string;
  endpointTypes: unknown;
  pricing: unknown;
  pricingAmount: number | null;
  pricingUnit: string;
  lastSeenAt: string;
  missingSince: string | null;
  priceIsEstimate: boolean;
}

export interface CurateModelRequest {
  id: string;
  family: string;
  name: string;
  type: 'text' | 'image' | 'video';
  channelId: string;
  providerModel: string;
  logicalModelId?: string;
  protocolTemplateId?: string;
  routePriority?: number;
  note?: string;
  costAmount?: number;
  costUnit?: string;
  priceAmount?: number;
  priceUnit?: string;
}

export interface CuratedModelResponse {
  id: string;
  channelId: string;
  family: string;
  name: string;
  providerModel: string;
  type: string;
  status: string;
  sort: number;
  note: string;
  protocolTemplateId?: string;
  logicalModelId?: string;
  routePriority: number;
  costAmount?: number | null;
  costUnit?: string;
  priceAmount?: number | null;
  priceUnit?: string;
  priceSource?: string;
  version: number;
}

export type ServerLogicalModel = components['schemas']['LogicalModel'];


/**
 * `POST /api/v1/logical-models` 请求体。
 * 上游以 `DisallowUnknownFields` 解码，字段必须与契约完全一致。
 */
export interface CreateLogicalModelRequest {
  id: string;
  label: string;
  type: LogicalModelType;
  capability?: string;
  status?: LogicalModelStatus;
  sort?: number;
  note?: string;
}

/**
 * `PATCH /api/v1/logical-models/{id}` 请求体。
 * `id` 只用于表达「改名意图」：与路径 id 不一致时服务端返回 `400 ID_IMMUTABLE`；
 * 省略字段表示保持原值（`sort` 可显式传 0）。**不接受** `createdBy`/`createdAt` 等只读字段。
 */
export interface UpdateLogicalModelRequest {
  id?: string;
  label?: string;
  type?: LogicalModelType;
  capability?: string;
  status?: LogicalModelStatus;
  sort?: number;
  note?: string;
}

export type ServerLogicalModelCandidate = components['schemas']['LogicalModelCandidate'];


export interface BindLogicalModelCandidatesRequest {
  modelIds: string[];
  routePriority?: number;
}

export const api = {
  listProjects: () => request<{ items: ServerProject[] }>('/api/v1/comic-projects'),
  getProject: (id: string) => request<ServerProject>(`/api/v1/comic-projects/${encodeURIComponent(id)}`),
  deleteProject: (id: string) =>
    request<void>(`/api/v1/comic-projects/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  updateProject: (id: string, patch: Partial<CreateProjectRequest>) =>
    request<ServerProject>(`/api/v1/comic-projects/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  createProject: (input: CreateProjectRequest, idempotencyKey = createIdempotencyKey()) =>
    request<ServerProject>('/api/v1/comic-projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(input),
    }),
  listAssets: (projectId?: string) => {
    const query = projectId ? `?project_id=${encodeURIComponent(projectId)}` : '';
    return request<{ items: ServerAsset[] }>(`/api/v1/assets${query}`);
  },
  createAssetUpload: (input: CreateAssetUploadRequest) =>
    request<AssetUploadSession>('/api/v1/assets/uploads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  uploadAssetContent: (uploadId: string, file: Blob) =>
    request<void>(`/api/v1/assets/uploads/${encodeURIComponent(uploadId)}/content`, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    }),
  commitAssetUpload: (uploadId: string) =>
    request<ServerAsset>(`/api/v1/assets/uploads/${encodeURIComponent(uploadId)}/commit`, {
      method: 'POST',
    }),
  listTasks: (status?: ServerTask['status'], kind?: ServerTask['kind']) => {
    const query = new URLSearchParams();
    if (status) query.set('status', status);
    if (kind) query.set('kind', kind);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return request<{ items: ServerTask[] }>(`/api/v1/tasks${suffix}`);
  },
  getTask: (id: string) => request<ServerTask>(`/api/v1/tasks/${encodeURIComponent(id)}?_t=${Date.now()}`),
  createTask: (input: CreateTaskRequest, idempotencyKey = createIdempotencyKey()) =>
    request<ServerTask>('/api/v1/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(input),
    }),
  createGenerationIntent: (input: CreateGenerationIntentRequest, idempotencyKey = createIdempotencyKey()) =>
    request<ServerGenerationIntent>('/api/v1/generation-intents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(input),
    }),
  /**
   * 同步上游模型目录（① 的第①步）。
   *
   * 语义：让后端**真的去**上游拉一次模型清单（与价格，若该渠道配了价格路径），
   * 落进供给池并留下同步记录。**失败语义刻意不折叠**：
   * 400 = 该渠道没配同步 · 404 = 渠道不存在 · 502 = 上游抓取失败 · 503 = 服务端未装配同步器
   * —— 界面据此能告诉运营"是没配"还是"是上游坏了"。
   */
  syncChannel: (channelId: string) =>
    request<ChannelSyncResult>(`/api/v1/channels/${encodeURIComponent(channelId)}/sync`, { method: 'POST' }),

  probeChannel: (channelId: string, opts?: { baseUrl?: string; authType?: string }) =>
    request<ProbeResult>(`/api/v1/channels/${encodeURIComponent(channelId)}/probe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl: opts?.baseUrl ?? '', authType: opts?.authType ?? '' }),
    }),
  putChannelCredential: (channelId: string, input: { baseUrl: string; authType: string; apiKey?: string }) =>
    request<{ channelId: string; stored: boolean }>(`/api/v1/workspace/credentials/${encodeURIComponent(channelId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId, ...input }),
    }),
  listChannelCredentials: () => request<{ items: CredentialStatus[] }>('/api/v1/workspace/credentials'),
  revealChannelCredential: (channelId: string) =>
    request<{ channelId: string; baseUrl: string; authType: string; apiKey: string }>(`/api/v1/workspace/credentials/${encodeURIComponent(channelId)}/reveal`),
  deleteChannelCredential: (channelId: string) =>
    request<void>(`/api/v1/workspace/credentials/${encodeURIComponent(channelId)}`, { method: 'DELETE' }),
  listUserChannels: () => request<{ items: UserChannelItem[] }>('/api/v1/workspace/channels'),
  putUserChannel: (
    channelId: string,
    input: {
      name: string;
      kind: string;
      protocol?: string;
      baseUrl: string;
      authType: string;
      enabled: boolean;
      note: string;
      // 同步配置（可空；空 = 不配置/清除）
      syncKind?: string;
      syncModelsPath?: string;
      syncPricingPath?: string;
      trustNote?: string;
    },
  ) =>
    request<{ channel: UserChannelItem }>(`/api/v1/workspace/channels/${encodeURIComponent(channelId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  deleteUserChannel: (channelId: string) =>
    request<void>(`/api/v1/workspace/channels/${encodeURIComponent(channelId)}`, { method: 'DELETE' }),
  getCatalog: () => request<ServerCatalogDirectory>('/api/v1/catalog'),
  // 策展（O-1 Phase D）：列出某渠道的上游供给 + 把其中一条加入产品目录。
  // 注意 query 必须经 BFF 透传 —— catalogProxy 曾漏掉 RawQuery（已在 #157 修好并加护栏）。
  listSupply: (channelId: string, includeMissing = false) => {
    const query = new URLSearchParams({ channel_id: channelId });
    if (includeMissing) query.set('include_missing', '1');
    return request<{ items: SupplyItem[] }>(`/api/v1/catalog/supply?${query.toString()}`);
  },
  curateModel: (input: CurateModelRequest) =>
    request<{ model: CuratedModelResponse }>('/api/v1/catalog/curate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  createProtocolTemplate: (input: { label: string; desc: string; requestPath: string; method: 'POST' | 'GET'; params: { key: string; value: string }[]; responseParams: { key: string; value: string; type?: string }[]; async?: { enabled: boolean; taskIdField: string; statusField: string; doneValue: string; failValue: string; pollPath?: string } }) =>
    request<ServerProtocolTemplate>('/api/v1/catalog/protocol-templates', { method: 'POST', body: JSON.stringify(input) }),
  updateProtocolTemplate: (id: string, patch: Partial<{ label: string; desc: string; requestPath: string; method: 'POST' | 'GET'; params: { key: string; value: string }[]; responseParams: { key: string; value: string; type?: string }[]; async?: { enabled: boolean; taskIdField: string; statusField: string; doneValue: string; failValue: string; pollPath?: string }; enabled: boolean }>) =>
    request<ServerProtocolTemplate>(`/api/v1/catalog/protocol-templates/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(patch) }),
  deleteProtocolTemplate: (id: string) => request<void>(`/api/v1/catalog/protocol-templates/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  createCatalogModel: (input: Omit<ServerCatalogModel, 'id' | 'version'>) =>
    request<ServerCatalogModel>('/api/v1/catalog/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  updateCatalogModel: (id: string, patch: ServerCatalogModelPatch) =>
    request<ServerCatalogModel>(`/api/v1/catalog/models/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  updateCatalogChannel: (id: string, patch: ServerCatalogChannelPatch) =>
    request<ServerCatalogChannel>(`/api/v1/catalog/channels/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  cancelTask: (id: string) =>
    request<ServerTask>(`/api/v1/tasks/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
  retryTask: (id: string) =>
    request<ServerTask>(`/api/v1/tasks/${encodeURIComponent(id)}/retry`, { method: 'POST' }),
  runModelTest: (modelId: string, runtime: Record<string, unknown>) =>
    request<RunModelTestResponse>('/api/v1/tasks/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId, runtime }),
    }),
  // Unified model gateway: modality-agnostic generation entry
  generate: (params: GenerateRequest) =>
    request<GenerateResponse>('/api/v1/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    }),
  // Gateway audit logs

  /**
   * D8c：审计导出 URL。
   *
   * 为什么直接返回 URL 而不用 request() 取 Blob：
   *   ① 导出是【浏览器原生下载】，交给浏览器才能正确使用服务端的
   *      Content-Disposition 文件名（D8b 修的那个头正是为此）；
   *   ② BFF 的身份是服务端自带的（它用自己的 token 与 devWorkspace 调 workspace），
   *      前端无需附加身份头 —— 实测 request() 也只发 Accept/Cache-Control/Pragma。
   */
  auditExportUrl: (params?: {
    status?: string;
    model_id?: string;
    channel_id?: string;
    since?: string;
    until?: string;
    // 任务卡 §2.1：按人/项目的操作清单（导出与列表共用同一套筛选口径）
    user_id?: string;
    project_id?: string;
    // T1 业务归因（迁移 013）：按功能过滤
    feature?: string;
  }) =>
    `/api/v1/audit/export?${new URLSearchParams({
      ...(params?.status ? { status: params.status } : {}),
      ...(params?.model_id ? { model_id: params.model_id } : {}),
      ...(params?.channel_id ? { channel_id: params.channel_id } : {}),
      ...(params?.user_id ? { user_id: params.user_id } : {}),
      ...(params?.project_id ? { project_id: params.project_id } : {}),
      ...(params?.feature ? { feature: params.feature } : {}),
      ...(params?.since ? { since: params.since } : {}),
      ...(params?.until ? { until: params.until } : {}),
    }).toString()}`,
  listAuditLogs: (params?: {
    limit?: number;
    offset?: number;
    status?: string;
    model_id?: string;
    channel_id?: string;
    since?: string;
    until?: string;
    user_id?: string;
    project_id?: string;
    // T1 业务归因（迁移 013）：按功能过滤
    feature?: string;
  }) =>
    request<{
      items: AuditLog[];
      total: number;
      limit: number;
      offset: number;
      // D7a/D7b：统计由【服务端】在【筛选后全集】上算。
      // 此前前端在"当前页"(limit:100) 上算 success/failed/avgLatency ⇒ 翻页或筛选后"统计"会变，是假统计。
      stats?: {
        byStatus: Record<string, number>;
        success: number;
        successRate: number;
        avgLatencyMs: number;
        // ④ §2.3 故障定位的聚合：耗时中位数与 P95（服务端算，排除 latency_ms=0 的行）
        p50LatencyMs: number;
        p95LatencyMs: number;
        // ④ §2.3「按错误文本聚类」：cluster key + 代表样本 + 计数（服务端算）
        topErrors: { key: string; sample: string; count: number }[];
        // ④ §2.2「成本归因」的 SUM 维度：token 用量（服务端算；金额 SUM 待 D4b）
        tokensByModel: { key: string; input: number; output: number; cached: number; calls: number }[];
        tokensByChannel: { key: string; input: number; output: number; cached: number; calls: number }[];
        aggregateOn: string;
      };
    }>(
      `/api/v1/audit/logs?${new URLSearchParams({
        limit: String(params?.limit ?? 50),
        offset: String(params?.offset ?? 0),
        ...(params?.status ? { status: params.status } : {}),
        ...(params?.model_id ? { model_id: params.model_id } : {}),
        ...(params?.channel_id ? { channel_id: params.channel_id } : {}),
      ...(params?.user_id ? { user_id: params.user_id } : {}),
      ...(params?.project_id ? { project_id: params.project_id } : {}),
      ...(params?.feature ? { feature: params.feature } : {}),
        ...(params?.since ? { since: params.since } : {}),
        ...(params?.until ? { until: params.until } : {}),
      }).toString()}`,
    ),
  // T2 运营报表聚合（成本看板数据源）
  listAuditStats: (params: {
    dimension: 'channel' | 'model' | 'project' | 'member';
    status?: string;
    model_id?: string;
    channel_id?: string;
    user_id?: string;
    project_id?: string;
    feature?: string;
    since?: string;
    until?: string;
    limit?: number;
  }) =>
    request<{ dimension: string; items: AuditStat[] }>(
      `/api/v1/audit/stats?${new URLSearchParams({
        dimension: params.dimension,
        limit: String(params.limit ?? 20),
        ...(params?.status ? { status: params.status } : {}),
        ...(params?.model_id ? { model_id: params.model_id } : {}),
        ...(params?.channel_id ? { channel_id: params.channel_id } : {}),
        ...(params?.user_id ? { user_id: params.user_id } : {}),
        ...(params?.project_id ? { project_id: params.project_id } : {}),
        ...(params?.feature ? { feature: params.feature } : {}),
        ...(params?.since ? { since: params.since } : {}),
        ...(params?.until ? { until: params.until } : {}),
      }).toString()}`,
    ),
  listAuditTrend: (params: {
    granularity: 'day' | 'week' | 'month';
    dimension?: string;
    dimension_value?: string;
    status?: string;
    model_id?: string;
    channel_id?: string;
    user_id?: string;
    project_id?: string;
    feature?: string;
    since?: string;
    until?: string;
  }) =>
    request<{ granularity: string; items: AuditTrendPoint[] }>(
      `/api/v1/audit/stats/trend?${new URLSearchParams({
        granularity: params.granularity,
        ...(params?.dimension ? { dimension: params.dimension } : {}),
        ...(params?.dimension_value ? { dimension_value: params.dimension_value } : {}),
        ...(params?.status ? { status: params.status } : {}),
        ...(params?.model_id ? { model_id: params.model_id } : {}),
        ...(params?.channel_id ? { channel_id: params.channel_id } : {}),
        ...(params?.user_id ? { user_id: params.user_id } : {}),
        ...(params?.project_id ? { project_id: params.project_id } : {}),
        ...(params?.feature ? { feature: params.feature } : {}),
        ...(params?.since ? { since: params.since } : {}),
        ...(params?.until ? { until: params.until } : {}),
      }).toString()}`,
    ),
  // Episodes
  listEpisodes: (projectId: string) =>
    request<{ items: ServerEpisode[] }>(`/api/v1/comic-projects/${encodeURIComponent(projectId)}/episodes`),
  getEpisode: (projectId: string, episodeId: string) =>
    request<ServerEpisode>(`/api/v1/comic-projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episodeId)}`),
  createEpisode: (projectId: string, input: CreateEpisodeRequest) =>
    request<ServerEpisode>(`/api/v1/comic-projects/${encodeURIComponent(projectId)}/episodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  updateEpisode: (projectId: string, episodeId: string, patch: Partial<ServerEpisode>) =>
    request<ServerEpisode>(`/api/v1/comic-projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episodeId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  deleteEpisode: (projectId: string, episodeId: string) =>
    request<void>(`/api/v1/comic-projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episodeId)}`, { method: 'DELETE' }),
  // Episode Assets (描述性资产：角色/道具/场景的 prompt 与版本历史)
  listEpisodeAssets: (projectId: string, episodeId: string) =>
    request<{ items: ServerEpisodeAsset[] }>(`/api/v1/comic-projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episodeId)}/assets`),
  getEpisodeAsset: (projectId: string, episodeId: string, assetId: string) =>
    request<ServerEpisodeAsset>(`/api/v1/comic-projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episodeId)}/assets/${encodeURIComponent(assetId)}`),
  createEpisodeAsset: (projectId: string, episodeId: string, input: CreateEpisodeAssetRequest) =>
    request<ServerEpisodeAsset>(`/api/v1/comic-projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episodeId)}/assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  updateEpisodeAsset: (projectId: string, episodeId: string, assetId: string, patch: Partial<ServerEpisodeAsset>) =>
    request<ServerEpisodeAsset>(`/api/v1/comic-projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episodeId)}/assets/${encodeURIComponent(assetId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  deleteEpisodeAsset: (projectId: string, episodeId: string, assetId: string) =>
    request<void>(`/api/v1/comic-projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episodeId)}/assets/${encodeURIComponent(assetId)}`, { method: 'DELETE' }),
  // Project Characters (项目级角色库：全剧通用角色设定与标准立绘)
  listProjectCharacters: (projectId: string) =>
    request<{ items: ServerProjectCharacter[] }>(`/api/v1/comic-projects/${encodeURIComponent(projectId)}/characters`),
  getProjectCharacter: (projectId: string, characterId: string) =>
    request<ServerProjectCharacter>(`/api/v1/comic-projects/${encodeURIComponent(projectId)}/characters/${encodeURIComponent(characterId)}`),
  createProjectCharacter: (projectId: string, input: CreateProjectCharacterRequest) =>
    request<ServerProjectCharacter>(`/api/v1/comic-projects/${encodeURIComponent(projectId)}/characters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  updateProjectCharacter: (projectId: string, characterId: string, patch: Partial<ServerProjectCharacter>) =>
    request<ServerProjectCharacter>(`/api/v1/comic-projects/${encodeURIComponent(projectId)}/characters/${encodeURIComponent(characterId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  deleteProjectCharacter: (projectId: string, characterId: string) =>
    request<void>(`/api/v1/comic-projects/${encodeURIComponent(projectId)}/characters/${encodeURIComponent(characterId)}`, { method: 'DELETE' }),
  // Rule Templates
  listRuleTemplates: (kind?: string) =>
    request<{ items: ServerRuleTemplate[] }>(`/api/v1/rule-templates${kind ? `?kind=${encodeURIComponent(kind)}` : ''}`),
  getRuleTemplate: (templateId: string) =>
    request<ServerRuleTemplate>(`/api/v1/rule-templates/${encodeURIComponent(templateId)}`),
  createRuleTemplate: (input: CreateRuleTemplateRequest) =>
    request<ServerRuleTemplate>('/api/v1/rule-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  updateRuleTemplate: (templateId: string, patch: Partial<ServerRuleTemplate>) =>
    request<ServerRuleTemplate>(`/api/v1/rule-templates/${encodeURIComponent(templateId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  deleteRuleTemplate: (templateId: string) =>
    request<void>(`/api/v1/rule-templates/${encodeURIComponent(templateId)}`, { method: 'DELETE' }),
  // Logical models & candidate bindings
  // BFF 原样透传上游状态码与错误码：400 ID_IMMUTABLE / 409 MODEL_ALREADY_BOUND /
  // 404 MODEL_NOT_FOUND / 404 CANDIDATE_NOT_FOUND 由调用方按 ApiError.code 分支处理。
  listLogicalModels: (filters?: { status?: LogicalModelStatus; type?: LogicalModelType }) => {
    const query = new URLSearchParams();
    if (filters?.status) query.set('status', filters.status);
    if (filters?.type) query.set('type', filters.type);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return request<ServerLogicalModel[]>(`/api/v1/logical-models${suffix}`);
  },
  createLogicalModel: (input: CreateLogicalModelRequest) =>
    request<ServerLogicalModel>('/api/v1/logical-models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  getLogicalModel: (modelId: string) =>
    request<ServerLogicalModel>(`/api/v1/logical-models/${encodeURIComponent(modelId)}`),
  updateLogicalModel: (modelId: string, patch: UpdateLogicalModelRequest) =>
    request<ServerLogicalModel>(`/api/v1/logical-models/${encodeURIComponent(modelId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  listLogicalModelCandidates: (modelId: string) =>
    request<ServerLogicalModelCandidate[]>(`/api/v1/logical-models/${encodeURIComponent(modelId)}/candidates`),
  bindLogicalModelCandidates: (modelId: string, input: BindLogicalModelCandidatesRequest) =>
    request<ServerLogicalModelCandidate[]>(`/api/v1/logical-models/${encodeURIComponent(modelId)}/candidates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  unbindLogicalModelCandidate: (modelId: string, candidateModelId: string) =>
    request<void>(
      `/api/v1/logical-models/${encodeURIComponent(modelId)}/candidates/${encodeURIComponent(candidateModelId)}`,
      { method: 'DELETE' },
    ),
};

function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `web_${crypto.randomUUID()}`;
  }
  return `web_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
