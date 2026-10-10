// EXPORTS: pickKnown, isDraftExpired, countFilled, DRAFT_TTL_MS, type CreateDraft
//
// 智能创作草稿的纯逻辑（ADR-006 D6）：只做「能测的规则」，持久化本身在 useCreateDraftStore。
//
// 两条硬约束（ADR-006 §9 风险表）：
//   1. **参考图不入草稿**：参考图是 dataURL，写进 localStorage 会瞬间爆掉配额。
//      本模块只处理参数文本值，参考图由会话内状态持有（刷新即丢，UI 需如实说明）。
//   2. **只保存当前模型认识的参数**：换模型后旧草稿里的键对新模型无意义，
//      直接提交还会把无关参数发给上游 —— 因此提交前与恢复时都过一遍 pickKnown。
import type { CreateKind } from '@/config/create/control-schema';

/** 草稿保留期：超过即视为过期（避免用户几周后回来被旧输入惊到） */
export const DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface CreateDraft {
  /** 仅参数文本值（不含参考图） */
  values: Record<string, string>;
  /** 上次使用的模型档位；恢复时若已不可用则不切换 */
  modelId?: string;
  updatedAt: number;
}

/** 只保留 allowedKeys 中的键（丢弃换模型后残留的无关参数） */
export function pickKnown(
  values: Record<string, string>,
  allowedKeys: readonly string[],
): Record<string, string> {
  const allowed = new Set(allowedKeys);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (allowed.has(key) && typeof value === 'string') out[key] = value;
  }
  return out;
}

/** 草稿是否已过期（updatedAt 非法亦视为过期，避免坏数据长期滞留） */
export function isDraftExpired(draft: Pick<CreateDraft, 'updatedAt'>, now: number, ttlMs = DRAFT_TTL_MS): boolean {
  if (!Number.isFinite(draft.updatedAt) || draft.updatedAt <= 0) return true;
  // 时间戳来自未来（时钟回拨）时不判过期，避免误删用户正在写的内容
  if (draft.updatedAt > now) return false;
  return now - draft.updatedAt > ttlMs;
}

/** 已填写的字段数（用于「已恢复 N 项」提示，不含空串） */
export function countFilled(values: Record<string, string>): number {
  return Object.values(values).filter((value) => typeof value === 'string' && value.trim() !== '').length;
}

/** 草稿是否值得恢复（全空则没必要提示用户） */
export function hasRecoverableContent(draft: Pick<CreateDraft, 'values'> | undefined): boolean {
  return draft !== undefined && countFilled(draft.values) > 0;
}

/** 供 store 使用的按类型键（与路由 /create/{kind} 一致） */
export type CreateDraftMap = Partial<Record<CreateKind, CreateDraft>>;
