// 剧集（剧集 ≠ 场次 ≠ Shot ≠ Unit；拆集候选可编辑，锁定后为正式）
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Episode, Interpretation } from '@/types';
import { INITIAL_EPISODES, buildSplitCandidates, buildEpisodesFromCandidates, type SplitCandidate } from '@/mocks/episodes';
import { useProjectStore } from '@/stores/useProjectStore';
import { useAssetStore } from '@/stores/useAssetStore';
import { mockHash } from '@/lib/hash';
import { api, type ServerEpisode } from '@/lib/api/client';

interface EpisodeState {
  episodes: Episode[];
  splitToCandidates(projectId: string, candidates: SplitCandidate[]): void;
  updateCandidate(id: string, patch: { title?: string; summary?: string; sourceSpan?: { start: number; end: number }; scriptDraft?: string }): void;
  confirmSplit(projectId: string): string[]; // 锁定候选为正式剧集，返回 episodeIds
  updateEpisode(id: string, patch: Partial<Episode>): void;
  /**
   * 插入剧集并并入源剧本（产生新版本留档）：
   * - 在「第 afterIndex 集之后」插入（0=最前，N=末尾追加）
   * - 内容并入源版本 → 新版本 v+1，插入点之后的剧集 sourceSpan 自动偏移 +insertLen
   * - 插入点之后的剧集 index 自动 +1 顺延（id 不变，稳定身份）
   * 返回新集 id
   */
  insertEpisode(projectId: string, input: { afterIndex: number; title: string; content: string }): string;
  /**
   * 删除剧集（与插入对称）：
   * - 本集内容从源剧本移除 → 新版本 v+1（含插入时的 \n\n 分隔）
   * - 被删集之后的剧集 sourceSpan 前移 -deletedLen、index -1 顺延
   * - 本集资产（角色/道具/场景）级联删除
   */
  deleteEpisode(episodeId: string): void;
  /**
   * 修订单集剧本（与插入/删除对称）：
   * - 用新内容替换源版本中该集 sourceSpan 区间 → 新版本 v+1
   * - 该集 span 更新为新长度，后续剧集 sourceSpan 自动偏移 delta
   * - 清空该集 scriptDraft（已合并入源版本）
   */
  reviseEpisodeScript(episodeId: string, newScript: string): void;
  setInterpretation(id: string, interpretation: Interpretation): void;
  getEpisodesByProject(projectId: string): Episode[];
  getEpisode(id: string): Episode | undefined;
  removeEpisodesByProject(projectId: string): void;
  // 后端同步
  loadFromServer(projectId: string): Promise<void>;
  saveToServer(id: string): Promise<void>;
  createOnServer(projectId: string, episodeId: string): Promise<void>;
  deleteFromServer(projectId: string, episodeId: string): Promise<void>;
}

export const useEpisodeStore = create<EpisodeState>()(
  persist(
    (set, get) => ({
      episodes: INITIAL_EPISODES,

      splitToCandidates(projectId, candidates) {
        const fresh = buildEpisodesFromCandidates(projectId, candidates);
        set((s) => {
          const rest = s.episodes.filter((e) => e.projectId !== projectId);
          return { episodes: [...rest, ...fresh] };
        });
      },

      updateCandidate(id, patch) {
        set((s) => ({
          episodes: s.episodes.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        }));
      },

      confirmSplit(projectId) {
        const eps = get().getEpisodesByProject(projectId);
        const ids = eps.map((e) => e.id);
        // 锁定拆集时，将剧集创建到后端（如果还不存在）
        eps.forEach((ep) => {
          get().createOnServer(projectId, ep.id).catch(() => {});
        });
        return ids;
      },

      updateEpisode(id, patch) {
        set((s) => ({
          episodes: s.episodes.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        }));
        // 自动同步到后端（防抖：避免频繁请求）
        const ep = get().getEpisode(id);
        if (ep) {
          debouncedSave(ep.projectId, id);
        }
      },

      insertEpisode(projectId, input) {
        const content = input.content.trim();
        if (!content) throw new Error('剧集内容不能为空');
        const eps = get().getEpisodesByProject(projectId);
        const p = useProjectStore.getState().getProject(projectId);
        if (!p) throw new Error('项目不存在');
        const sourceText = p.sourceVersions[p.currentSourceVersion - 1]?.text ?? '';
        const afterIndex = Math.max(0, Math.min(input.afterIndex, eps.length));

        // 1) 插入文本偏移：0=最前；N=末尾；否则 = 第 afterIndex 集的原文终点
        const offset =
          afterIndex === 0
            ? 0
            : afterIndex >= eps.length
              ? sourceText.length
              : (eps.find((e) => e.index === afterIndex)?.sourceSpan.end ?? sourceText.length);

        // 2) 新版本 = 原文在 offset 处插入内容（\n\n 分隔）；插入点之后的原文整体后移 insertLen
        const insertLen = content.length + 2; // '\n\n'
        const newText = sourceText.slice(0, offset) + '\n\n' + content + sourceText.slice(offset);
        const last = p.sourceVersions[p.sourceVersions.length - 1];
        const nextVersion = (last?.version ?? p.currentSourceVersion) + 1;

        // 3) 并入源剧本：新版本留档，旧版本可追溯
        useProjectStore.getState().updateProject(projectId, {
          sourceVersions: [
            ...p.sourceVersions,
            { version: nextVersion, text: newText, hash: mockHash(newText), uploadedAt: Date.now() },
          ],
          currentSourceVersion: nextVersion,
        });

        // 4) 重映射已有剧集：插入点（含 offset）之后 span 整体偏移；index > afterIndex 顺延
        // 最前插入：分隔符放在新集末尾，新集 span 从 0 开始；中间/末尾插入：分隔符在新集开头，span 从 offset+2 开始
        const newSpan =
          afterIndex === 0
            ? { start: 0, end: content.length }
            : { start: offset + 2, end: offset + 2 + content.length };
        const remapped: Episode[] = eps.map((e) => {
          const patch: Partial<Episode> = {};
          if (e.sourceSpan.start >= offset) {
            patch.sourceSpan = { start: e.sourceSpan.start + insertLen, end: e.sourceSpan.end + insertLen };
          }
          if (e.index > afterIndex) {
            patch.index = e.index + 1;
          }
          return { ...e, ...patch };
        });

        // 5) 新集：稳定 id（不与既有 id 冲突），index = afterIndex+1；内容已在源版本，scriptDraft 留空
        const scenes = (content.match(/(?:场次|场景)\s*[:：]?\s*\d+(?:-\d+)?/g) ?? []).length;
        const person = content.match(/人物\s*[:：]\s*[^\n]+/)?.[0] ?? '';
        const characters = person ? person.split(/[,，、]/).filter(Boolean).length : 0;
        const newId = `${projectId}-ep-ins-${Date.now().toString(36)}`;
        const episode: Episode = {
          id: newId,
          projectId,
          index: afterIndex + 1,
          title: input.title.trim() || `第 ${afterIndex + 1} 集`,
          summary: '',
          sourceSpan: newSpan,
          stage: 'analyze',
          status: 'pending',
          counts: { scenes, characters, pendingReview: 0 },
          createdAt: Date.now(),
        };

        set((s) => ({
          episodes: [...s.episodes.filter((e) => e.projectId !== projectId), ...remapped, episode],
        }));
        return newId;
      },

      deleteEpisode(episodeId) {
        const target = get().getEpisode(episodeId);
        if (!target) return;
        const projectId = target.projectId;
        const p = useProjectStore.getState().getProject(projectId);
        const eps = get().getEpisodesByProject(projectId).sort((a, b) => a.index - b.index);
        if (!p) return;
        const sourceText = p.sourceVersions[p.currentSourceVersion - 1]?.text ?? '';
        const span = target.sourceSpan;
        const spanValid = span.start >= 0 && span.end > span.start && span.end <= sourceText.length;

        if (spanValid) {
          // 被删内容在源文本中的区间：
          // - cutStart：含前导分隔符（插入时 '\n\n' 在 span.start-2 起）
          // - cutEnd：若下一集与本集之间有 ≤2 字符分隔符，连后导分隔符一起删（保证删除后剧集严格连续）
          const cutStart = Math.max(0, span.start - 2);
          const nextEp = eps.find((e) => e.index === target.index + 1);
          const hasTrailingSeparator = nextEp && nextEp.sourceSpan.start - span.end <= 2 && nextEp.sourceSpan.start - span.end > 0;
          const cutEnd = hasTrailingSeparator ? nextEp.sourceSpan.start : span.end;
          const deletedLen = cutEnd - cutStart;
          const newText = sourceText.slice(0, cutStart) + sourceText.slice(cutEnd);
          const last = p.sourceVersions[p.sourceVersions.length - 1];
          const nextVersion = (last?.version ?? p.currentSourceVersion) + 1;

          // 并入源剧本：移除内容 → 新版本留档
          useProjectStore.getState().updateProject(projectId, {
            sourceVersions: [
              ...p.sourceVersions,
              { version: nextVersion, text: newText, hash: mockHash(newText), uploadedAt: Date.now() },
            ],
            currentSourceVersion: nextVersion,
          });

          // 被删集之后：span 前移 deletedLen、index -1 顺延；被删集移除
          const remaining = eps
            .filter((e) => e.id !== episodeId)
            .map((e) => {
              const patch: Partial<Episode> = {};
              if (e.sourceSpan.start >= span.start) {
                patch.sourceSpan = { start: e.sourceSpan.start - deletedLen, end: e.sourceSpan.end - deletedLen };
              }
              if (e.index > target.index) {
                patch.index = e.index - 1;
              }
              return { ...e, ...patch };
            });

          set((s) => ({
            episodes: [...s.episodes.filter((e) => e.projectId !== projectId), ...remaining],
          }));
        } else {
          // 草稿集（未并入源版本，span 无效）：仅移除本集，不动源文本
          set((s) => ({
            episodes: s.episodes.filter((e) => e.id !== episodeId),
          }));
        }
        // 本集资产级联删除
        useAssetStore.getState().removeByEpisode(episodeId);
        // 后端删除
        get().deleteFromServer(projectId, episodeId).catch(() => {});
      },

      // 修订单集剧本：替换源版本中该集 span 区间 → 新版本 + 后续剧集 span 重映射
      reviseEpisodeScript(episodeId, newScript) {
        const target = get().getEpisode(episodeId);
        if (!target) return;
        const projectId = target.projectId;
        const p = useProjectStore.getState().getProject(projectId);
        if (!p) return;
        const sourceText = p.sourceVersions[p.currentSourceVersion - 1]?.text ?? '';
        const { start, end } = target.sourceSpan;
        if (start < 0 || end <= start || end > sourceText.length) return;

        const content = newScript.trim();
        if (!content) return;
        const delta = content.length - (end - start);
        const newText = sourceText.slice(0, start) + content + sourceText.slice(end);
        const last = p.sourceVersions[p.sourceVersions.length - 1];
        const nextVersion = (last?.version ?? p.currentSourceVersion) + 1;

        // 并入源剧本：新版本留档
        useProjectStore.getState().updateProject(projectId, {
          sourceVersions: [
            ...p.sourceVersions,
            { version: nextVersion, text: newText, hash: mockHash(newText), uploadedAt: Date.now() },
          ],
          currentSourceVersion: nextVersion,
        });

        // 该集 span 更新为新长度；后续剧集 span 偏移 delta；清空 scriptDraft
        const updated = get().getEpisodesByProject(projectId).map((e) => {
          if (e.id === episodeId) {
            return { ...e, sourceSpan: { start, end: start + content.length }, scriptDraft: undefined };
          }
          if (e.sourceSpan.start >= end) {
            return { ...e, sourceSpan: { start: e.sourceSpan.start + delta, end: e.sourceSpan.end + delta } };
          }
          return e;
        });
        set((s) => ({
          episodes: [...s.episodes.filter((e) => e.projectId !== projectId), ...updated],
        }));
      },

      setInterpretation(id, interpretation) {
        set((s) => ({
          episodes: s.episodes.map((e) => (e.id === id ? { ...e, interpretation } : e)),
        }));
        const ep = get().getEpisode(id);
        if (ep) {
          debouncedSave(ep.projectId, id);
        }
      },

      getEpisodesByProject(projectId) {
        return get().episodes.filter((e) => e.projectId === projectId);
      },

      getEpisode(id) {
        return get().episodes.find((e) => e.id === id);
      },

      removeEpisodesByProject(projectId) {
        set((s) => ({ episodes: s.episodes.filter((e) => e.projectId !== projectId) }));
      },

      // 后端同步：从服务器加载剧集
      async loadFromServer(projectId) {
        try {
          const { items } = await api.listEpisodes(projectId);
          if (items && items.length > 0) {
            const serverEpisodes = items.map(episodeFromServer);
            set((s) => {
              const rest = s.episodes.filter((e) => e.projectId !== projectId);
              return { episodes: [...rest, ...serverEpisodes] };
            });
          } else {
            // 后端为空但 localStorage 有数据：自动迁移到后端
            const localEps = get().getEpisodesByProject(projectId);
            if (localEps.length > 0) {
              localEps.forEach((ep) => {
                get().createOnServer(projectId, ep.id).catch(() => {});
              });
            }
          }
        } catch (err) {
          console.warn('[episodeStore] loadFromServer failed, using local cache:', err);
        }
      },

      // 后端同步：保存剧集到服务器
      async saveToServer(id) {
        const ep = get().getEpisode(id);
        if (!ep) return;
        try {
          const patch = episodeToServerPatch(ep);
          await api.updateEpisode(ep.projectId, id, patch);
        } catch (err) {
          console.warn('[episodeStore] saveToServer failed:', err);
        }
      },

      // 后端同步：在服务器创建剧集
      async createOnServer(projectId, episodeId) {
        const ep = get().getEpisode(episodeId);
        if (!ep) return;
        try {
          await api.createEpisode(projectId, {
            id: ep.id,
            index: ep.index,
            title: ep.title,
            summary: ep.summary,
            source_span_start: ep.sourceSpan?.start,
            source_span_end: ep.sourceSpan?.end,
          });
          // 创建后立即保存完整数据
          await get().saveToServer(episodeId);
        } catch (err) {
          console.warn('[episodeStore] createOnServer failed:', err);
        }
      },

      // 后端同步：从服务器删除剧集
      async deleteFromServer(projectId, episodeId) {
        try {
          await api.deleteEpisode(projectId, episodeId);
        } catch (err) {
          console.warn('[episodeStore] deleteFromServer failed:', err);
        }
      },
    }),
    {
      name: 'mdp:episodes',
      version: 3,
      migrate(persisted) {
        const previous = persisted as Partial<EpisodeState>;
        const episodes = [...(previous.episodes ?? [])];
        const existingIds = new Set(episodes.map((episode) => episode.id));
        INITIAL_EPISODES.forEach((episode) => {
          if (!existingIds.has(episode.id)) episodes.push(episode);
        });
        return { ...previous, episodes };
      },
    },
  ),
);

export { buildSplitCandidates };

// ==================== 防抖保存（避免频繁请求后端）====================
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

function debouncedSave(projectId: string, episodeId: string) {
  const key = `${projectId}:${episodeId}`;
  const existing = saveTimers.get(key);
  if (existing) clearTimeout(existing);
  saveTimers.set(
    key,
    setTimeout(() => {
      saveTimers.delete(key);
      useEpisodeStore.getState().saveToServer(episodeId).catch(() => {});
    }, 800),
  );
}

// ==================== 类型转换（前端 Episode ↔ 后端 ServerEpisode）====================

function episodeFromServer(server: ServerEpisode): Episode {
  return {
    id: server.id,
    projectId: server.project_id,
    index: server.index,
    title: server.title,
    summary: server.summary ?? '',
    sourceSpan: { start: server.source_span_start ?? 0, end: server.source_span_end ?? 0 },
    stage: (server.stage as Episode['stage']) ?? 'analyze',
    status: (server.status as Episode['status']) ?? 'draft',
    counts: (server.counts as Episode['counts']) ?? { scenes: 0, characters: 0, pendingReview: 0 },
    blockedBy: server.blocked_by,
    scriptChecked: server.script_checked,
    scriptDraft: server.script_draft,
    interpretation: server.interpretation as Episode['interpretation'],
    interpretationConfirmed: server.interpretation_confirmed,
    executionTarget: server.execution_target as Episode['executionTarget'],
    stageModels: server.stage_models as Episode['stageModels'],
    performance: server.performance as Episode['performance'],
    sceneVariants: server.scene_variants as Episode['sceneVariants'],
    directing: server.directing as Episode['directing'],
    directingStep: server.directing_step as Episode['directingStep'],
    executableUnits: server.executable_units as Episode['executableUnits'],
    production: server.production as Episode['production'],
    createdAt: server.created_at ? new Date(server.created_at).getTime() : Date.now(),
  };
}

function episodeToServerPatch(ep: Episode): Partial<ServerEpisode> {
  const patch: Partial<ServerEpisode> = {
    index: ep.index,
    title: ep.title,
    summary: ep.summary,
    source_span_start: ep.sourceSpan?.start,
    source_span_end: ep.sourceSpan?.end,
    stage: ep.stage,
    status: ep.status,
    counts: ep.counts as Record<string, unknown>,
    blocked_by: ep.blockedBy,
    script_checked: ep.scriptChecked,
    script_draft: ep.scriptDraft,
    interpretation_confirmed: ep.interpretationConfirmed,
    directing_step: ep.directingStep,
  };
  // 复杂 JSON 字段只在有值时发送
  if (ep.interpretation) patch.interpretation = ep.interpretation as Record<string, unknown>;
  if (ep.executionTarget) patch.execution_target = ep.executionTarget as Record<string, unknown>;
  if (ep.stageModels) patch.stage_models = ep.stageModels as Record<string, unknown>;
  if (ep.performance) patch.performance = ep.performance as Record<string, unknown>;
  if (ep.sceneVariants) patch.scene_variants = ep.sceneVariants as Record<string, unknown>;
  if (ep.directing) patch.directing = ep.directing as Record<string, unknown>;
  if (ep.executableUnits) patch.executable_units = ep.executableUnits as Record<string, unknown>;
  if (ep.production) patch.production = ep.production as Record<string, unknown>;
  return patch;
}
