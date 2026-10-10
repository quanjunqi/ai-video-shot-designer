// 画布文档（版本化；保存为版本化画布文档，执行另编译为统一任务）
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Node, Edge } from '@xyflow/react';

interface CanvasState {
  version: number;
  nodes: Node[];
  edges: Edge[];
  savedAt?: number;
  save(nodes: Node[], edges: Edge[]): void;
  reset(): void;
}

export const useCanvasStore = create<CanvasState>()(
  persist(
    (set, get) => ({
      version: 1,
      nodes: [],
      edges: [],
      savedAt: undefined,
      save(nodes, edges) {
        set({ nodes, edges, version: get().version + 1, savedAt: Date.now() });
      },
      reset() {
        set({ nodes: [], edges: [], version: 1, savedAt: undefined });
      },
    }),
    { name: 'mdp:canvas' },
  ),
);
