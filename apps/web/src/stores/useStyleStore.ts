// 用户风格库（可管理）：mdp:style-library 持久化
// 首次初始化内置默认风格；旧 mdp:style-overrides 提示词覆盖迁移到 prompt 字段
// 停用风格不出现在项目风格选择器；项目存 styleId + styleVersion 快照，删除/停用不影响已使用项目
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StyleEntry } from '@/types';
import { DEFAULT_STYLE_OPTIONS } from '@/mocks/styles';

const OVERRIDE_KEY = 'mdp:style-overrides';

function readOverrides(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(OVERRIDE_KEY) || '{}');
  } catch {
    return {};
  }
}

function initialStyles(): StyleEntry[] {
  const overrides = readOverrides();
  return DEFAULT_STYLE_OPTIONS.map((s, i) => ({
    ...s,
    prompt: overrides[s.id] ?? undefined,
    enabled: true,
    createdAt: Date.now() - (DEFAULT_STYLE_OPTIONS.length - i) * 1000,
  }));
}

interface StyleState {
  styles: StyleEntry[];
  upsertStyle(input: Omit<StyleEntry, 'createdAt'> & { createdAt?: number }): void;
  removeStyle(id: string): void;
  toggleEnabled(id: string): void;
  updatePrompt(id: string, prompt: string): void;
}

export const useStyleStore = create<StyleState>()(
  persist(
    (set) => ({
      styles: initialStyles(),
      upsertStyle(input) {
        set((s) => {
          const exists = s.styles.some((x) => x.id === input.id);
          if (exists) {
            return {
              styles: s.styles.map((x) =>
                x.id === input.id ? { ...x, ...input, enabled: input.enabled ?? x.enabled, createdAt: x.createdAt } : x,
              ),
            };
          }
          return { styles: [{ ...input, enabled: input.enabled ?? true, createdAt: input.createdAt ?? Date.now() }, ...s.styles] };
        });
      },
      removeStyle(id) {
        set((s) => ({ styles: s.styles.filter((x) => x.id !== id) }));
      },
      toggleEnabled(id) {
        set((s) => ({ styles: s.styles.map((x) => (x.id === id ? { ...x, enabled: !x.enabled } : x)) }));
      },
      updatePrompt(id, prompt) {
        set((s) => ({ styles: s.styles.map((x) => (x.id === id ? { ...x, prompt } : x)) }));
      },
    }),
    { name: 'mdp:style-library' },
  ),
);
