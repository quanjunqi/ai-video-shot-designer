// 智能创作草稿库（按 kind 分桶持久化，ADR-006 D6）
//
// 只存参数文本值 + 所选模型档位：
//   · **不存参考图**（dataURL 会爆 localStorage 配额，见 draft-utils 的约束说明）
//   · 不存提交中的任务（任务由 execution 持有，本 store 只负责"没提交完的输入"）
//
// 恢复策略：过期草稿在读取时即丢弃并清除（isDraftExpired），避免用户几周后被旧输入惊到。
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isDraftExpired, pickKnown, type CreateDraft, type CreateDraftMap } from '@/features/genworkbench/draft-utils';
import type { CreateKind } from '@/config/create/control-schema';

interface CreateDraftState {
  drafts: CreateDraftMap;
  /**
   * 读取未过期的原始草稿（**不做任何写操作**，因此可以安全地在渲染期调用）。
   * 过期判定放在 store 内，避免在组件渲染期直接调用 `Date.now()`（React 纯函数规则）。
   */
  readRawDraft(kind: CreateKind): CreateDraft | undefined;
  /** 写入草稿（values 会被 pickKnown 过滤后存储） */
  saveDraft(kind: CreateKind, input: { values: Record<string, string>; modelId?: string; allowedKeys: readonly string[] }): void;
  clearDraft(kind: CreateKind): void;
}

export const useCreateDraftStore = create<CreateDraftState>()(
  persist(
    (set, get) => ({
      drafts: {},

      readRawDraft(kind) {
        const draft = get().drafts[kind];
        if (!draft) return undefined;
        if (isDraftExpired(draft, Date.now())) return undefined;
        return draft;
      },

      saveDraft(kind, input) {
        const values = pickKnown(input.values, input.allowedKeys);
        // 全空且没有模型选择时不写入，避免留下无意义草稿
        if (Object.keys(values).length === 0 && input.modelId === undefined) return;
        set((s) => ({
          drafts: { ...s.drafts, [kind]: { values, modelId: input.modelId, updatedAt: Date.now() } },
        }));
      },

      clearDraft(kind) {
        set((s) => {
          const next = { ...s.drafts };
          delete next[kind];
          return { drafts: next };
        });
      },
    }),
    { name: 'mdp:create-drafts' },
  ),
);
