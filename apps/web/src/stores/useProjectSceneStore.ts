// 项目级场景设定库（Scene Bible）：全剧通用场景设定，单集引用 + 状态覆盖
// 定位：项目详情页「场景库」Tab 管理，单集场景资产引用项目级设定
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ProjectScene, ProjectSceneForm } from '@/types';

interface State {
  scenes: ProjectScene[];
  // 按项目获取场景列表
  getByProject: (projectId: string) => ProjectScene[];
  // 获取单个场景
  getById: (id: string) => ProjectScene | undefined;
  // 按名称获取（项目内）
  getByName: (projectId: string, name: string) => ProjectScene | undefined;
  // 新增场景
  addScene: (projectId: string, form: ProjectSceneForm) => ProjectScene;
  // 更新场景
  updateScene: (id: string, form: Partial<ProjectSceneForm>) => void;
  // 删除场景
  removeScene: (id: string) => void;
  // 批量导入场景
  importScenes: (projectId: string, scenes: ProjectSceneForm[]) => void;
}

const generateId = () => `proj-scene-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const useProjectSceneStore = create<State>()(
  persist(
    (set, get) => ({
      scenes: [],

      getByProject: (projectId) =>
        get().scenes.filter((s) => s.projectId === projectId),

      getById: (id) =>
        get().scenes.find((s) => s.id === id),

      getByName: (projectId, name) =>
        get().scenes.find((s) => s.projectId === projectId && s.name === name),

      addScene: (projectId, form) => {
        const now = Date.now();
        const scene: ProjectScene = {
          id: generateId(),
          projectId,
          ...form,
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({ scenes: [...s.scenes, scene] }));
        return scene;
      },

      updateScene: (id, form) => {
        set((s) => ({
          scenes: s.scenes.map((sc) =>
            sc.id === id ? { ...sc, ...form, updatedAt: Date.now() } : sc
          ),
        }));
      },

      removeScene: (id) => {
        set((s) => ({
          scenes: s.scenes.filter((sc) => sc.id !== id),
        }));
      },

      importScenes: (projectId, scenes) => {
        const now = Date.now();
        const newScenes: ProjectScene[] = scenes.map((form) => ({
          id: generateId(),
          projectId,
          ...form,
          createdAt: now,
          updatedAt: now,
        }));
        set((s) => ({ scenes: [...s.scenes, ...newScenes] }));
      },
    }),
    {
      name: 'mdp:project-scenes',
    }
  )
);
