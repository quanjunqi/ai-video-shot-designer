// 项目经营状态（三类状态之「项目经营」：草稿/解析/制作中/待审核/归档）
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Project, ProjectStatus } from '@/types';
import { INITIAL_PROJECTS } from '@/mocks/projects';
import { mockHash } from '@/lib/hash';
import { useEpisodeStore } from '@/stores/useEpisodeStore';
import { useAssetStore } from '@/stores/useAssetStore';
import type { ServerProject } from '@/lib/api/client';
import { api } from '@/lib/api/client';

interface CreateProjectInput {
  title: string;
  styleId: string;
  styleVersion: string;
  scriptText: string;
  aspectRatio: Project['aspectRatio'];
  textModel: string;
  imageModel: string;
  videoModel: string;
  /** 创建时选择的生效规则（规则中心先定义，创建即生效） */
  ruleOverrides?: Project['ruleOverrides'];
}

interface ProjectState {
  projects: Project[];
  dataSource: 'demo' | 'server' | 'offline-fallback';
  setServerProjects(items: Array<{
    id: string;
    title: string;
    style_id: string;
    style_version: string;
    aspect_ratio: Project['aspectRatio'];
    default_image_model: string;
    default_video_model: string;
    default_text_model?: string;
    status: string;
    current_source_version: number;
    source_version: { version: number; sha256: string; created_at: string };
    created_at: string;
    updated_at: string;
  }>): void;
  upsertServerProject(item: ServerProject, sourceText?: string): void;
  markOfflineFallback(): void;
  createProject(input: CreateProjectInput): string;
  updateProject(id: string, patch: Partial<Project>): void;
  getProject(id: string): Project | undefined;
  removeProject(id: string): void;
  // 源版本迭代（4.1 专业修订）：追加新版本留档、推进当前版本、重置拆集状态（重新候选核对）
  reviseSourceText(id: string, newText: string): void;
  /** 解锁分集：回到候选核对态，剧集结构可重新编辑/插入/删除/重拆；已制作产物保留 */
  unlockSplit(id: string): void;
  startSplit(id: string): string | null; // 幂等：projectId + sourceVersion
  failSplit(id: string, error: string): void;
  recomputeProgress(id: string): void;
}

let seq = 0;
const nextId = () => `proj-${Date.now().toString(36)}-${(seq += 1).toString(36)}`;

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projects: INITIAL_PROJECTS,
      dataSource: 'demo',

      setServerProjects(items) {
        set((state) => {
          const localById = new Map(state.projects.map((project) => [project.id, project]));
          const projects = items.map((item) => mergeServerProject(localById.get(item.id), item));
          return { projects, dataSource: 'server' as const };
        });
      },

      upsertServerProject(item, sourceText = '') {
        set((state) => {
          const existing = state.projects.find((project) => project.id === item.id);
          const project = mergeServerProject(existing, item, sourceText);
          return {
            projects: [project, ...state.projects.filter((candidate) => candidate.id !== item.id)],
            dataSource: 'server' as const,
          };
        });
      },

      markOfflineFallback() {
        set({ dataSource: 'offline-fallback' });
      },

      createProject(input) {
        const id = nextId();
        const now = Date.now();
        const text = input.scriptText.trim();
        const project: Project = {
          id,
          title: input.title.trim(),
          styleId: input.styleId,
          styleVersion: input.styleVersion,
          aspectRatio: input.aspectRatio,
          defaultTextModel: input.textModel,
          defaultImageModel: input.imageModel,
          defaultVideoModel: input.videoModel,
          status: 'pending_parse',
          sourceVersions: [{ version: 1, text, hash: mockHash(text), uploadedAt: now }],
          currentSourceVersion: 1,
          split: null,
          episodeIds: [],
          ruleOverrides: input.ruleOverrides,
          progress: { doneEpisodes: 0, totalEpisodes: 0, pendingReview: 0, blocked: 0 },
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({ projects: [project, ...s.projects] }));
        return id;
      },

      updateProject(id, patch) {
        const previous = get().projects.find((p) => p.id === id);
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p,
          ),
        }));
        // 设置字段同步服务端（彻底解决切换页面/刷新丢失）
        const SETTING_KEYS = ['title', 'styleId', 'styleVersion', 'aspectRatio', 'defaultTextModel', 'defaultImageModel', 'defaultVideoModel'] as const;
        const hasSetting = SETTING_KEYS.some((k) => k in patch);
        if (hasSetting && previous) {
          const serverPatch: Record<string, string> = {};
          if (patch.title !== undefined) serverPatch.title = patch.title;
          if (patch.styleId !== undefined) serverPatch.style_id = patch.styleId;
          if (patch.styleVersion !== undefined) serverPatch.style_version = patch.styleVersion;
          if (patch.aspectRatio !== undefined) serverPatch.aspect_ratio = patch.aspectRatio;
          if (patch.defaultTextModel !== undefined) serverPatch.default_text_model = patch.defaultTextModel;
          if (patch.defaultImageModel !== undefined) serverPatch.default_image_model = patch.defaultImageModel;
          if (patch.defaultVideoModel !== undefined) serverPatch.default_video_model = patch.defaultVideoModel;
          api.updateProject(id, serverPatch).catch(() => {
            // 同步失败回滚本地
            set((s) => ({
              projects: s.projects.map((p) => (p.id === id ? previous : p)),
            }));
          });
        }
      },

      getProject(id) {
        return get().projects.find((p) => p.id === id);
      },

      removeProject(id) {
        set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
        // 级联清理：该项目的剧集与资产（保持各 store 持久化一致）
        useEpisodeStore.getState().removeEpisodesByProject(id);
        useAssetStore.getState().removeByProject(id);
      },

      // 源版本迭代：新文本追加为下一版本（旧版本留档可追溯），当前版本切换后重置拆集与进度
      reviseSourceText(id, newText) {
        const p = get().getProject(id);
        if (!p) return;
        const text = newText.trim();
        if (text.length < 100) return;
        const last = p.sourceVersions[p.sourceVersions.length - 1];
        const nextVersion = (last?.version ?? p.currentSourceVersion) + 1;
        const now = Date.now();
        get().updateProject(id, {
          sourceVersions: [
            ...p.sourceVersions,
            { version: nextVersion, text, hash: mockHash(text), uploadedAt: now },
          ],
          currentSourceVersion: nextVersion,
          status: 'pending_parse',
          split: null,
          episodeIds: [],
          progress: { doneEpisodes: 0, totalEpisodes: 0, pendingReview: 0, blocked: 0 },
        });
        // 旧版本产生的剧集投影全部清空，等待新版本重新拆集
        useEpisodeStore.getState().removeEpisodesByProject(id);
      },

      // 解锁分集：回到候选核对态，剧集结构可重新编辑/插入/删除/重拆；已制作产物保留
      unlockSplit(id) {
        const p = get().getProject(id);
        if (!p || !p.split?.locked) return;
        get().updateProject(id, {
          status: 'awaiting_confirm',
          split: { ...p.split, locked: false },
        });
      },

      // 幂等键：projectId + 当前源版本；已存在任务则不重复提交
      startSplit(id) {
        const p = get().getProject(id);
        if (!p || !p.sourceVersions[p.currentSourceVersion - 1]) return null;
        if (p.split && (p.split.locked || (p.split.jobId && p.status === 'parsing'))) return p.split.jobId;
        const jobId = `split-${id}-v${p.currentSourceVersion}`;
        get().updateProject(id, {
          status: 'parsing',
          split: { jobId, step: 0, totalSteps: 4, locked: false },
        });
        return jobId;
      },

      failSplit(id, error) {
        const p = get().getProject(id);
        if (!p) return;
        get().updateProject(id, {
          split: p.split ? { ...p.split, error } : null,
        });
      },

      // 进度投影（6.2：按已通过 Gate 的数量与待审核数，不凭访问次数增长）
      recomputeProgress(id) {
        const p = get().getProject(id);
        if (!p) return;
        const eps = useEpisodeStore.getState().episodes.filter((e) => e.projectId === id);
        const totalEpisodes = eps.length || p.episodeIds.length;
        const doneEpisodes = eps.filter((e) => e.status === 'done').length;
        const pendingReview = eps.reduce((n, e) => n + e.counts.pendingReview, 0);
        const blocked = eps.filter((e) => e.status === 'blocked').length;
        let status: ProjectStatus = p.status;
        if (p.status === 'in_production' && pendingReview > 0) status = 'review';
        if (p.status === 'review' && pendingReview === 0) status = 'in_production';
        get().updateProject(id, {
          progress: { doneEpisodes, totalEpisodes, pendingReview, blocked },
          status,
        });
      },
    }),
    {
      name: 'mdp:projects',
      version: 2,
      migrate(persisted) {
        const previous = persisted as Partial<ProjectState>;
        const seeds = new Map(INITIAL_PROJECTS.map((project) => [project.id, project]));
        const projects = (previous.projects ?? []).map((project) => {
          const seed = seeds.get(project.id);
          if (!seed) return project;
          return {
            ...project,
            episodeIds: seed.episodeIds,
            progress: seed.progress,
          };
        });
        return { ...previous, projects };
      },
    },
  ),
);

/** 项目状态推进序：用于服务端同步时防止本地已推进的状态被旧数据回退 */
const STATUS_ORDER: Record<Project['status'], number> = {
  pending_parse: 0,
  parsing: 1,
  awaiting_confirm: 2,
  in_production: 3,
  review: 4,
  archived: 5,
};

function mergeServerProject(local: Project | undefined, item: ServerProject, sourceText?: string): Project {
	const existingSource = local?.sourceVersions.find((source) => source.version === item.current_source_version);
	const hydratedText = sourceText || item.source_text || '';
	const sourceVersion = existingSource ?? {
		version: item.source_version.version,
		text: hydratedText,
    hash: item.source_version.sha256,
    uploadedAt: Date.parse(item.source_version.created_at),
  };
	// status 合并：本地 split.locked ⇒ 强制 in_production（一致性修正，防刷新回退）；
	// 否则本地推进更深时保留本地状态，避免服务端旧数据覆盖前端已完成的拆分/制作进度
	const serverStatus = item.status as Project['status'];
	const mergedStatus = (() => {
		if (local?.split?.locked) return 'in_production' as const;
		// 候选态（已解锁）：保留本地 awaiting_confirm，不被服务端 in_production 覆盖
		if (local && local.split && !local.split.locked) return local.status;
		if (!local) return serverStatus;
		return (STATUS_ORDER[local.status] ?? 0) >= (STATUS_ORDER[serverStatus] ?? 0) ? local.status : serverStatus;
	})();
	// 项目设置字段：前端 updateProject 暂未同步服务端，本地 updatedAt 晚于服务端时保留本地修改
	const localNewer = Boolean(local?.updatedAt && local.updatedAt > Date.parse(item.updated_at));
	const settings = localNewer && local
		? {
				styleId: local.styleId,
				styleVersion: local.styleVersion,
				aspectRatio: local.aspectRatio,
				defaultTextModel: local.defaultTextModel,
				defaultImageModel: local.defaultImageModel,
				defaultVideoModel: local.defaultVideoModel,
			}
		: {
				styleId: item.style_id,
				styleVersion: item.style_version,
				aspectRatio: item.aspect_ratio,
				defaultTextModel: item.default_text_model ?? '',
				defaultImageModel: item.default_image_model,
				defaultVideoModel: item.default_video_model,
			};
	return {
    id: item.id,
    title: item.title,
    ...settings,
    status: mergedStatus,
		sourceVersions: local?.sourceVersions
			? (existingSource
				? local.sourceVersions.map((source) => source.version === item.current_source_version && !source.text && hydratedText
					? { ...source, text: hydratedText }
					: source)
				: [...local.sourceVersions, sourceVersion])
      : [sourceVersion],
    // currentSourceVersion 取本地源版本最高号与服务端的最大值：本地插入/删除产生的更新版本不被覆盖
    currentSourceVersion: Math.max(
      local?.sourceVersions?.reduce((m, v) => Math.max(m, v.version), 0) ?? 1,
      item.current_source_version,
    ),
    split: local?.split ?? null,
    episodeIds: local?.episodeIds ?? [],
    progress: local?.progress ?? { doneEpisodes: 0, totalEpisodes: 0, pendingReview: 0, blocked: 0 },
    ruleOverrides: local?.ruleOverrides,
    promptRuleOverrides: local?.promptRuleOverrides,
    createdAt: Date.parse(item.created_at),
    updatedAt: Date.parse(item.updated_at),
  };
}
