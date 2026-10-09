import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { LENS_ITEMS } from '@/mocks/lens';
import type { LensItem } from '@/types';

interface LensState {
  items: LensItem[];
  add(item: LensItem): void;
}

export const useLensStore = create<LensState>()(persist((set) => ({
  items: LENS_ITEMS,
  add(item) { set((state) => ({ items: [item, ...state.items] })); },
}), {
  name: 'mdp:lens',
  version: 1,
}));
