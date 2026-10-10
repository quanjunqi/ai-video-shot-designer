import type { ModelParam } from '@/config/models/model-catalog';

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

export interface ServerProject {
  id: string;
  title: string;
  style_id: string;
  style_version: string;
  aspect_ratio: '16:9' | '9:16' | '1:1';
  default_text_model?: string;
  default_image_model: string;
  default_video_model: string;
  status: string;
  current_source_version: number;
  source_version: { version: number; sha256: string; created_at: string };
  /** Returned by the detail endpoint; omitted from list responses. */
  source_text?: string;
  created_at: string;
  updated_at: string;
}

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

export interface ServerEpisode {
  workspace_id: string;
  project_id: string;
  id: string;
  index: number;
  title: string;
  summary: string;
  source_span_start: number;
  source_span_end: number;
  stage: string;
  status: string;
  counts: Record<string, unknown>;
  blocked_by?: string;
  script_checked: boolean;
  script_draft?: string;
  interpretation?: Record<string, unknown>;
  interpretation_confirmed: boolean;
  execution_target?: Record<string, unknown>;
  stage_models?: Record<string, unknown>;
  performance?: Record<string, unknown>;
  scene_variants?: Record<string, unknown>;
  directing?: Record<string, unknown>;
  directing_step?: number;
  executable_units?: Record<string, unknown>;
  production?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateEpisodeRequest {
  id: string;
  index: number;
  title: string;
  summary?: string;
  source_span_start?: number;
  source_span_end?: number;
}

export interface ServerEpisodeAsset {
  workspace_id: string;
  project_id: string;
  episode_id: string;
  id: string;
  kind: 'character' | 'prop' | 'scene' | 'other';
  name: string;
  description: string;
  scope: 'episode' | 'global';
  source_scene?: string;
  holder?: string;
  current_version: number;
  versions: Array<{ version: number; prompt: string; negative_prompt: string; image_url?: string; sha256?: string; status: string; created_at: number }>;
  prompt: string;
  negative_prompt: string;
  image_url?: string;
  status: string;
  model: string;
  stale: boolean;
  // 关联项目级资产
  project_character_id?: string;
  project_prop_id?: string;
  project_scene_id?: string;
  // 单集状态变体
  episode_variant?: Record<string, string>;
  // 单集变体立绘
  variant_image_url?: string;
  variant_image_status?: string;
  variant_image_model?: string;
  variant_image_generated_at?: string;
  created_at: string;
  updated_at: string;
}

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

export interface ServerProjectCharacter {
  id: string;
  workspace_id: string;
  project_id: string;
  name: string;
  gender: string;
  age: string;
  identity: string;
  hairstyle: string;
  eye_color: string;
  facial_features: string;
  special_marks: string;
  body_type: string;
  skin_texture: string;
  top: string;
  bottom: string;
  shoes: string;
  clothing_style: string;
  performance: string;
  image_url?: string;
  image_status: string;
  image_model?: string;
  image_prompt?: string;
  image_negative_prompt?: string;
  image_generated_at: number;
  image_job_id?: string;
  image_error?: string;
  image_aspect_ratio: string;
  created_at: string;
  updated_at: string;
}

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

export interface ServerRuleTemplate {
  workspace_id: string;
  id: string;
  kind: 'split' | 'prompt';
  name: string;
  description: string;
  stage?: string;
  content: string;
  config: Record<string, unknown>;
  version: number;
  version_history: Array<{ version: number; savedAt: number; note?: string; snapshot: Record<string, unknown> }>;
  builtin: boolean;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

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

export interface ServerAsset {
  id: string;
  upload_id: string;
  project_id: string;
  episode_id?: string;
  kind: 'character' | 'prop' | 'scene' | 'other' | 'script';
  scope: 'project' | 'global' | 'episode';
  name: string;
  prompt: string;
  object_key: string;
  sha256: string;
  byte_size: number;
  content_type: string;
  status: string;
  created_at: string;
}

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

export interface ServerTask {
  id: string;
  kind: 'split' | 'interpret' | 'image' | 'video' | 'audio' | 'canvas_export';
  label: string;
  project_id?: string;
  episode_id?: string;
  asset_id?: string;
  shot_id?: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  progress: number;
  attempt: number;
  steps?: { label: string; done: boolean }[];
  intent_payload?: Record<string, unknown> | string | null;
  /**
   * 任务结果（execution 010 起与意图分离存放，服务端 jsonb，可能返回对象或 JSON 字符串）。
   * 010 之前的历史任务结果被覆盖写在 `intent_payload.result` 里，读取时须回退（见 result-utils.ts）。
   */
  result_payload?: Record<string, unknown> | string | null;
  cost_estimate?: string;
  error?: string;
  context_path?: string;
  created_at: string;
  updated_at: string;
}

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

export interface ServerGenerationIntent {
  id: string;
  project_id: string;
  episode_id?: string;
  asset_id?: string;
  kind: ServerTask['kind'];
  label: string;
  payload: Record<string, unknown>;
  scope_epoch: number;
  status: 'pending' | 'dispatched' | 'failed';
  created_at: string;
  updated_at: string;
}

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
export interface ServerCatalogChannel {
  id: string;
  name: string;
  kind: 'official' | 'aggregator' | 'local';
  baseUrl: string;
  authType: 'bearer' | 'none';
  enabled: boolean;
  note: string;
  sort: number;
}

export interface ServerCatalogModel {
  id: string;
  channelId: string;
  family: string;
  name: string;
  providerModel?: string;
  type: 'text' | 'image' | 'video';
  status: 'enabled' | 'disabled';
  sort: number;
  note: string;
  protocolTemplateId?: string;
  requestPath?: string;
  method?: 'POST' | 'GET';
  params?: { key: string; value: string }[];
  responseParams?: { key: string; value: string; type?: string }[];
  capability: Record<string, unknown>;
  version: number;
}

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
}

export interface ServerCatalogDirectory {
  channels: ServerCatalogChannel[];
  models: ServerCatalogModel[];
  templates: ServerProtocolTemplate[];
}

export interface ServerProtocolTemplate {
  id: string;
  label: string;
  desc: string;
  method: 'POST' | 'GET';
  requestPath: string;
  params: { key: string; value: string }[];
  responseParams: { key: string; value: string; type?: string }[];
  async?: { enabled: boolean; taskIdField: string; statusField: string; doneValue: string; failValue: string; pollPath?: string };
  builtin: boolean;
  enabled: boolean;
  refCount: number;
  version: number;
  // ADR-008 §3 两类证据并列：docRef 是【外部输入/线索】，observedEvidence 是【实测/事实】。
  // 服务端为 NULL 时字段缺席（omitempty）⇒ 两者都是可选。
  docRef?: Record<string, unknown>;
  observedEvidence?: Record<string, unknown>;
}

export interface ServerCatalogModelPatch {
  channelId?: string;
  family?: string;
  name?: string;
  providerModel?: string;
  type?: 'text' | 'image' | 'video';
  status?: 'enabled' | 'disabled';
  sort?: number;
  note?: string;
  protocolTemplateId?: string;
  requestPath?: string;
  method?: 'POST' | 'GET';
  params?: ModelParam[];
  responseParams?: ModelParam[];
  capability?: Record<string, unknown>;
}

export interface ServerCatalogChannelPatch {
  name?: string;
  baseUrl?: string;
  authType?: 'bearer' | 'none';
  enabled?: boolean;
  note?: string;
  sort?: number;
}

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

export interface ServerLogicalModel {
  id: string;
  label: string;
  type: LogicalModelType;
  capability: string;
  status: LogicalModelStatus;
  sort: number;
  note: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

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

export interface ServerLogicalModelCandidate {
  id: string;
  logicalModelId: string;
  name: string;
  family: string;
  channelId: string;
  providerModel: string;
  type: LogicalModelType;
  status: LogicalModelStatus;
  /** 路由尝试顺序，小者优先；未提供时上游使用默认值 100。 */
  routePriority: number;
}

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
  putUserChannel: (channelId: string, input: { name: string; kind: string; protocol?: string; baseUrl: string; authType: string; enabled: boolean; note: string }) =>
    request<{ channel: UserChannelItem }>(`/api/v1/workspace/channels/${encodeURIComponent(channelId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  deleteUserChannel: (channelId: string) =>
    request<void>(`/api/v1/workspace/channels/${encodeURIComponent(channelId)}`, { method: 'DELETE' }),
  getCatalog: () => request<ServerCatalogDirectory>('/api/v1/catalog'),
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
  }) =>
    `/api/v1/audit/export?${new URLSearchParams({
      ...(params?.status ? { status: params.status } : {}),
      ...(params?.model_id ? { model_id: params.model_id } : {}),
      ...(params?.channel_id ? { channel_id: params.channel_id } : {}),
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
        aggregateOn: string;
      };
    }>(
      `/api/v1/audit/logs?${new URLSearchParams({
        limit: String(params?.limit ?? 50),
        offset: String(params?.offset ?? 0),
        ...(params?.status ? { status: params.status } : {}),
        ...(params?.model_id ? { model_id: params.model_id } : {}),
        ...(params?.channel_id ? { channel_id: params.channel_id } : {}),
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
