// 逻辑模型（ADR-003 §3.1）前端纯函数：id 契约校验 / 表单校验 / 候选排序 / 错误码文案。
// 规则与后端 services/production/internal/catalog/logicalmodel.go 的 ValidLogicalModelID 一致：
// 小写字母或数字，单连字符分隔，不得以连字符开头或结尾，不得连续连字符，最长 64 字符。
// 本文件不依赖任何运行时模块（仅 type import），便于 node:test 直接加载。
import type { LogicalModelStatus, LogicalModelType, ServerLogicalModelCandidate } from '@/lib/api/client';

/** 与后端 maxLogicalModelIDLength 一致 */
export const LOGICAL_MODEL_MAX_ID_LENGTH = 64;
/** 与后端 DefaultRoutePriority / 026 迁移的 route_priority 默认值一致 */
export const DEFAULT_ROUTE_PRIORITY = 100;
/** 建议的优先级间隔：留出空位便于后续插入 */
export const ROUTE_PRIORITY_STEP = 10;

export const LOGICAL_MODEL_TYPE_LABEL: Record<LogicalModelType, string> = {
  text: '文本',
  image: '图片',
  video: '视频',
};

export const LOGICAL_MODEL_STATUS_LABEL: Record<LogicalModelStatus, string> = {
  enabled: '启用',
  disabled: '停用',
};

const KEBAB_CASE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** 能力型 kebab-case 校验（前端预检，服务端仍是唯一权威）。 */
export function isValidLogicalModelId(id: string): boolean {
  if (!id || id.length > LOGICAL_MODEL_MAX_ID_LENGTH) return false;
  return KEBAB_CASE_PATTERN.test(id);
}

/**
 * 列表接口兜底：Go 的 nil slice 会编码成 JSON `null`（空集合也可能不是 `[]`），
 * 直接 `.map` 会让整个页面白屏。统一在这里归一化为数组。
 */
export function asArray<T>(value: readonly T[] | null | undefined): T[] {
  return Array.isArray(value) ? [...value] : [];
}

export function isValidLogicalModelType(value: string): value is LogicalModelType {
  return value === 'text' || value === 'image' || value === 'video';
}

export function isValidLogicalModelStatus(value: string): value is LogicalModelStatus {
  return value === 'enabled' || value === 'disabled';
}

/** 表单草稿：`sort` / `routePriority` 保持字符串以保留用户的非法输入并给出反馈。 */
export interface LogicalModelDraft {
  id: string;
  label: string;
  type: LogicalModelType;
  capability: string;
  status: LogicalModelStatus;
  sort: string;
  note: string;
}

/** 校验逻辑模型表单；返回错误文案（可直接展示），合法时返回 null。 */
export function validateLogicalModelDraft(draft: LogicalModelDraft, mode: 'create' | 'edit'): string | null {
  if (mode === 'create') {
    const id = draft.id.trim();
    if (!id) return '逻辑模型 id 必填，例如 image-t2i-high';
    if (!isValidLogicalModelId(id)) {
      return `id 必须是能力型 kebab-case：小写字母/数字、单连字符分隔、不能以连字符开头或结尾、最长 ${LOGICAL_MODEL_MAX_ID_LENGTH} 字符`;
    }
  }
  const label = draft.label.trim();
  if (!label) return '显示名称必填（给运营/调用方看的人类可读名）';
  if (label.length > 200) return '显示名称最长 200 字符';
  if (!isValidLogicalModelType(draft.type)) return '类型必须是 text / image / video 之一';
  if (!isValidLogicalModelStatus(draft.status)) return '状态必须是 enabled / disabled 之一';
  if (!/^\d+$/.test(draft.sort.trim())) return '排序必须是不小于 0 的整数';
  return null;
}

/** 解析路由优先级输入；非法（空、负数、小数、超范围）返回 null。 */
export function parseRoutePriority(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

/** 建议的下一个优先级：空列表用默认值 100，否则最大优先级 + 10，便于后续插入。 */
export function suggestRoutePriority(existing: readonly number[]): number {
  if (existing.length === 0) return DEFAULT_ROUTE_PRIORITY;
  return Math.max(...existing) + ROUTE_PRIORITY_STEP;
}

/** 按 routePriority 升序（小者优先）排序；同优先级时按名称/ id 稳定排序，不修改入参。 */
export function sortCandidatesByRoutePriority(
  candidates: readonly ServerLogicalModelCandidate[],
): ServerLogicalModelCandidate[] {
  return [...candidates].sort(
    (a, b) => a.routePriority - b.routePriority || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
}

/** 业务错误码 → 用户可读文案。服务端仍是唯一权威，但每个码都要有明确解释，禁止吞成通用错误。 */
const ERROR_CODE_MESSAGE: Record<string, string> = {
  ID_IMMUTABLE: '逻辑模型 id 是对外接口名，创建后不可修改。如需更换标识，请新建逻辑模型并重新绑定候选。',
  MODEL_ALREADY_BOUND: '该模型已被另一个逻辑模型占用，不能静默抢占：请先在其归属逻辑模型中解绑，再绑定到这里。',
  LOGICAL_MODEL_NOT_FOUND: '逻辑模型不存在：可能已被移除或 id 有误，请刷新列表后重试。',
  MODEL_NOT_FOUND: '模型目录中找不到该模型：可能已下架，请刷新模型目录后重试。',
  CANDIDATE_NOT_FOUND: '该模型不是此逻辑模型的候选：绑定关系已不存在，请刷新候选列表。',
  DUPLICATE_LOGICAL_MODEL: '已存在同 id 的逻辑模型，请更换 id（id 一经使用即不可改名）。',
  INVALID_ID: `id 不符合能力型 kebab-case 规范：小写字母/数字、单连字符分隔、最长 ${LOGICAL_MODEL_MAX_ID_LENGTH} 字符。`,
  INVALID_TYPE: '类型不合法，必须是 text / image / video 之一。',
  INVALID_LABEL: '显示名称不能为空。',
  INVALID_STATUS: '状态不合法，必须是 enabled / disabled 之一。',
  INVALID_INPUT: '请求参数不合法：请检查候选列表与路由优先级（需为不小于 0 的整数）。',
  LOGICAL_MODEL_UNAVAILABLE: '逻辑模型服务暂不可用（生产目录服务未就绪或数据库不可达），请稍后重试。',
  UNAUTHORIZED: '未授权：当前工作区身份无效或缺失，请重新登录后重试。',
  UNKNOWN_ERROR: '请求失败：服务端未返回可识别的错误码，请稍后重试。',
};

interface ErrorLike {
  code?: unknown;
  message?: unknown;
}

function readErrorLike(error: unknown): { code?: string; message?: string } {
  if (typeof error === 'string') return { message: error };
  if (typeof error !== 'object' || error === null) return {};
  const candidate = error as ErrorLike;
  return {
    code: typeof candidate.code === 'string' && candidate.code ? candidate.code : undefined,
    message: typeof candidate.message === 'string' && candidate.message ? candidate.message : undefined,
  };
}

/**
 * 把 ApiError（或任意异常）转换为用户可读文案：
 * 已知业务码 → 明确解释；同时追加服务端原始说明（如 409 的归属逻辑模型 id），不吞根因。
 */
export function describeLogicalModelError(error: unknown): string {
  const { code, message } = readErrorLike(error);
  if (!code) {
    // 浏览器 fetch 失败（BFF/后端未启动）不是业务错误码，必须区分「服务挂了」与「业务失败」
    if (message && !/failed to fetch|load failed|networkerror|network request failed|fetch failed/i.test(message)) return message;
    return '请求失败：无法连接服务端（网络异常或服务未启动），请稍后重试。';
  }
  const base = ERROR_CODE_MESSAGE[code];
  if (!base) {
    return message ? `${message}（${code}）` : `请求失败（${code}）`;
  }
  if (message && message !== base) return `${base} 服务端说明：${message}`;
  return base;
}
