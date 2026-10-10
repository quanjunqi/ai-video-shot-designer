// 智能创作显示偏好（与草稿内容分开存：偏好是"怎么看"，草稿是"写了什么"）
//
// - tier：参数披露档位（基础/进阶/专家，累积披露）。专业工具研究 E2 的做法：
//   默认只露基础，深度靠按需展开而不是把滑杆摊开。
// - view：参数区呈现方式（表单 / JSON）。同一份 schema 的两种投影，
//   JSON 视图服务于集成方与排障复现（研究 B1）。
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ControlTier, CreateKind } from '@/config/create/control-schema';

export type ParamView = 'form' | 'json';

interface CreatePrefsState {
  tiers: Partial<Record<CreateKind, ControlTier>>;
  views: Partial<Record<CreateKind, ParamView>>;
  setTier(kind: CreateKind, tier: ControlTier): void;
  setView(kind: CreateKind, view: ParamView): void;
}

export const useCreatePrefsStore = create<CreatePrefsState>()(
  persist(
    (set) => ({
      tiers: {},
      views: {},
      setTier(kind, tier) {
        set((state) => ({ tiers: { ...state.tiers, [kind]: tier } }));
      },
      setView(kind, view) {
        set((state) => ({ views: { ...state.views, [kind]: view } }));
      },
    }),
    { name: 'mdp:create-prefs' },
  ),
);
