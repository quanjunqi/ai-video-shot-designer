// 项目级道具设定库（Prop Bible）：全剧通用道具设定，单集引用 + 状态覆盖
// 定位：项目详情页「道具库」Tab 管理，单集道具资产引用项目级设定
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ProjectProp, ProjectPropForm } from '@/types';

interface State {
  props: ProjectProp[];
  // 按项目获取道具列表
  getByProject: (projectId: string) => ProjectProp[];
  // 获取单个道具
  getById: (id: string) => ProjectProp | undefined;
  // 按名称获取（项目内）
  getByName: (projectId: string, name: string) => ProjectProp | undefined;
  // 按持有者获取（项目内）
  getByHolder: (projectId: string, holder: string) => ProjectProp[];
  // 新增道具
  addProp: (projectId: string, form: ProjectPropForm) => ProjectProp;
  // 更新道具
  updateProp: (id: string, form: Partial<ProjectPropForm>) => void;
  // 删除道具
  removeProp: (id: string) => void;
  // 批量导入道具
  importProps: (projectId: string, props: ProjectPropForm[]) => void;
}

const generateId = () => `proj-prop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const useProjectPropStore = create<State>()(
  persist(
    (set, get) => ({
      props: [],

      getByProject: (projectId) =>
        get().props.filter((p) => p.projectId === projectId),

      getById: (id) =>
        get().props.find((p) => p.id === id),

      getByName: (projectId, name) =>
        get().props.find((p) => p.projectId === projectId && p.name === name),

      getByHolder: (projectId, holder) =>
        get().props.filter((p) => p.projectId === projectId && p.defaultHolder === holder),

      addProp: (projectId, form) => {
        const now = Date.now();
        const prop: ProjectProp = {
          id: generateId(),
          projectId,
          ...form,
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({ props: [...s.props, prop] }));
        return prop;
      },

      updateProp: (id, form) => {
        set((s) => ({
          props: s.props.map((p) =>
            p.id === id ? { ...p, ...form, updatedAt: Date.now() } : p
          ),
        }));
      },

      removeProp: (id) => {
        set((s) => ({
          props: s.props.filter((p) => p.id !== id),
        }));
      },

      importProps: (projectId, props) => {
        const now = Date.now();
        const newProps: ProjectProp[] = props.map((form) => ({
          id: generateId(),
          projectId,
          ...form,
          createdAt: now,
          updatedAt: now,
        }));
        set((s) => ({ props: [...s.props, ...newProps] }));
      },
    }),
    {
      name: 'mdp:project-props',
    }
  )
);
