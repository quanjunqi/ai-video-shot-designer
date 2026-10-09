// 全局 UI 状态（侧栏折叠 + 动画播放标记）
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
  sidebarCollapsed: boolean;
  toggleSidebar(): void;
  playedFlags: Record<string, boolean>;
  markPlayed(key: string): void;
  hasPlayed(key: string): boolean;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      toggleSidebar() {
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed }));
      },
      playedFlags: {},
      markPlayed(key) {
        set((s) => ({ playedFlags: { ...s.playedFlags, [key]: true } }));
      },
      hasPlayed(key) {
        return Boolean(get().playedFlags[key]);
      },
    }),
    { name: 'mdp:ui' },
  ),
);
