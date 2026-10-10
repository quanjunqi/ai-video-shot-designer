// 资产与审核（三类状态之「内容产物」+ 追加式审核日志）
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ArtifactStatus, Asset, AssetVersion, AuditEntry } from '@/types';
import { INITIAL_ASSETS } from '@/mocks/assets';
import { mockHash } from '@/lib/hash';
import { api, type ServerAsset, type ServerEpisodeAsset } from '@/lib/api/client';

let seq = 0;
const nextAuditId = () => `audit-${Date.now().toString(36)}-${(seq += 1).toString(36)}`;

interface AssetState {
  assets: Asset[];
  auditLog: AuditEntry[];
  upsertAssets(list: Asset[]): void;
  syncServerAssets(list: ServerAsset[]): void;
  updateAsset(id: string, patch: Partial<Asset>): void;
  addAssetVersion(id: string, input: { prompt: string; negativePrompt: string; imageUrl?: string; userStatement?: string }): void;
  approveAsset(id: string, userStatement: string): void;
  rejectAsset(id: string, userStatement: string): void;
  regenerateAsset(id: string): void;
  markStale(id: string): void;
  toggleGlobal(id: string): void;
  getAssetsByEpisode(episodeId: string): Asset[];
  getProjectAssets(projectId: string): Asset[];
  removeAsset(id: string): void;
  removeByProject(projectId: string): void;
  removeByEpisode(episodeId: string): void;
  // 后端同步
  loadAssetsFromServer(projectId: string, episodeId: string): Promise<void>;
  saveAssetToServer(id: string): Promise<void>;
  createAssetOnServer(projectId: string, episodeId: string, id: string): Promise<void>;
  deleteAssetFromServer(projectId: string, episodeId: string, id: string): Promise<void>;
}

function syncFromVersion(a: Asset, version: Asset['versions'][number]): Asset {
  return {
    ...a,
    currentVersion: version.version,
    prompt: version.prompt,
    negativePrompt: version.negativePrompt,
    imageUrl: version.imageUrl,
    status: version.status,
  };
}

function fromServerAsset(input: ServerAsset): Asset {
  const kind = input.kind === 'character' || input.kind === 'prop' || input.kind === 'scene' ? input.kind : 'scene';
  const scope = input.scope === 'global' ? 'global' : 'episode';
  const createdAt = Date.parse(input.created_at) || Date.now();
  const version: Asset['versions'][number] = {
    version: 1,
    prompt: input.prompt,
    negativePrompt: '',
    sha256: input.sha256,
    status: 'DRAFT',
    createdAt,
  };
  return {
    id: input.id,
    projectId: input.project_id,
    episodeId: input.episode_id ?? '',
    kind,
    name: input.name,
    description: input.prompt || '服务端资产',
    scope,
    currentVersion: 1,
    versions: [version],
    prompt: input.prompt,
    negativePrompt: '',
    status: 'DRAFT',
    model: 'server-upload',
    stale: false,
    createdAt,
    source: 'server',
    objectKey: input.object_key,
    byteSize: input.byte_size,
    contentType: input.content_type,
  };
}

export const useAssetStore = create<AssetState>()(
  persist(
    (set, get) => ({
      assets: INITIAL_ASSETS,
      auditLog: [],

      upsertAssets(list) {
        set((s) => {
          const map = new Map(s.assets.map((a) => [a.id, a]));
          // 解读重试只补齐新对象，不能静默覆盖已有版本、审核状态或 stale 标记。
          list.forEach((a) => {
            if (!map.has(a.id)) map.set(a.id, a);
          });
          return { assets: [...map.values()] };
        });
        // 新资产自动创建到后端
        list.forEach((a) => {
          if (a.episodeId) {
            get().createAssetOnServer(a.projectId, a.episodeId, a.id).catch(() => {});
          }
        });
      },

      syncServerAssets(list) {
        set((s) => {
          const incoming = list.map(fromServerAsset);
          const byId = new Map(incoming.map((a) => [a.id, a]));
          const merged = s.assets.map((existing) => {
            const remote = byId.get(existing.id);
            if (!remote) return existing;
            // 保留本地审核、版本和 stale 状态，只更新服务端事实字段。
            return {
              ...existing,
              projectId: remote.projectId,
              episodeId: remote.episodeId,
              kind: remote.kind,
              name: remote.name,
              description: remote.description,
              scope: remote.scope,
              prompt: remote.prompt,
              objectKey: remote.objectKey,
              byteSize: remote.byteSize,
              contentType: remote.contentType,
              source: 'server' as const,
            };
          });
          const known = new Set(s.assets.map((a) => a.id));
          incoming.forEach((asset) => {
            if (!known.has(asset.id)) merged.push(asset);
          });
          return { assets: merged };
        });
      },

      updateAsset(id, patch) {
        set((s) => ({ assets: s.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
        debouncedSaveAsset(id);
      },

      // 保存新版本：旧版 SUPERSEDED，新版本 DRAFT，写审核日志
      addAssetVersion(id, input) {
        set((s) => {
          const a = s.assets.find((x) => x.id === id);
          if (!a) return {};
          const next = a.currentVersion + 1;
          const version = {
            version: next,
            prompt: input.prompt,
            negativePrompt: input.negativePrompt,
            imageUrl: input.imageUrl,
            sha256: mockHash(JSON.stringify({ id, version: next, ...input })),
            status: 'DRAFT' as ArtifactStatus,
            createdAt: Date.now(),
          };
          const versions = a.versions.map((v) => (v.version === a.currentVersion ? { ...v, status: 'SUPERSEDED' as ArtifactStatus } : v));
          const fresh = syncFromVersion({ ...a, versions: [...versions, version] }, version);
          set((s) => ({
            assets: s.assets.map((x) => (x.id === id ? fresh : x)),
            auditLog: [
              {
                id: nextAuditId(),
                artifactId: a.id,
                artifactName: a.name,
                version: next,
                sha256: version.sha256,
                action: 'EDIT',
                userStatement: input.userStatement ?? '保存新版本',
                createdAt: Date.now(),
              },
              ...s.auditLog,
            ],
          }));
          debouncedSaveAsset(id);
        });
      },

      // 候选选择：绑定版本+哈希+声明 → USER_APPROVED（canonical）
      approveAsset(id, userStatement) {
        set((s) => {
          const a = s.assets.find((x) => x.id === id);
          if (!a) return {};
          const cur = a.versions.find((v) => v.version === a.currentVersion);
          if (!cur || a.status !== 'AWAITING_USER' || !cur.imageUrl || !userStatement.trim()) return {};
          const approved = { ...cur, status: 'USER_APPROVED' as const };
          const fresh = syncFromVersion({ ...a, versions: a.versions.map((v) => v.version === cur.version ? approved : v) }, approved);
          set((s) => ({
            assets: s.assets.map((x) => (x.id === id ? { ...fresh, stale: false } : x)),
            auditLog: [
              {
                id: nextAuditId(),
                artifactId: a.id,
                artifactName: a.name,
                version: cur.version,
                sha256: cur.sha256,
                action: 'APPROVE',
                userStatement,
                createdAt: Date.now(),
              },
              ...s.auditLog,
            ],
          }));
          debouncedSaveAsset(id);
        });
      },

      rejectAsset(id, userStatement) {
        set((s) => {
          const a = s.assets.find((x) => x.id === id);
          if (!a) return {};
          const cur = a.versions.find((v) => v.version === a.currentVersion);
          if (!cur || a.status !== 'AWAITING_USER' || !userStatement.trim()) return {};
          const rejected = { ...cur, status: 'USER_REJECTED' as const };
          set((s) => ({
            assets: s.assets.map((x) => (x.id === id ? syncFromVersion({ ...a, versions: a.versions.map((v) => v.version === cur.version ? rejected : v) }, rejected) : x)),
            auditLog: [
              {
                id: nextAuditId(),
                artifactId: a.id,
                artifactName: a.name,
                version: cur.version,
                sha256: cur.sha256,
                action: 'REJECT',
                userStatement,
                createdAt: Date.now(),
              },
              ...s.auditLog,
            ],
          }));
          debouncedSaveAsset(id);
        });
      },

      // 重新生成：创建新候选（AWAITING_USER 由生成任务完成后置位）
      regenerateAsset(id) {
        set((s) => {
          const a = s.assets.find((x) => x.id === id);
          if (!a) return {};
          const next = a.currentVersion + 1;
          const version = {
            version: next,
            prompt: a.prompt,
            negativePrompt: a.negativePrompt,
            sha256: mockHash(`${id}-v${next}-regenerate`),
            status: 'DRAFT' as ArtifactStatus,
            createdAt: Date.now(),
          };
          const versions = a.versions.map((v) => (v.version === a.currentVersion ? { ...v, status: 'SUPERSEDED' as ArtifactStatus } : v));
          return {
            assets: s.assets.map((x) =>
              x.id === id ? syncFromVersion({ ...x, versions: [...versions, version] }, version) : x,
            ),
            auditLog: [
              {
                id: nextAuditId(),
                artifactId: a.id,
                artifactName: a.name,
                version: next,
                sha256: version.sha256,
                action: 'REGENERATE',
                userStatement: '重新生成',
                createdAt: Date.now(),
              },
              ...s.auditLog,
            ],
          };
        });
      },

      markStale(id) {
        set((s) => ({
          assets: s.assets.map((a) => (a.id === id ? { ...a, stale: true } : a)),
          auditLog: [
            {
              id: nextAuditId(),
              artifactId: id,
              artifactName: s.assets.find((a) => a.id === id)?.name ?? id,
              version: s.assets.find((a) => a.id === id)?.currentVersion ?? 0,
              sha256: s.assets.find((a) => a.id === id)?.versions.find((v) => v.version === (s.assets.find((x) => x.id === id)?.currentVersion ?? 0))?.sha256 ?? '',
              action: 'STALE',
              userStatement: '上游变化，下游标记失效',
              createdAt: Date.now(),
            },
            ...s.auditLog,
          ],
        }));
      },

      toggleGlobal(id) {
        const a = get().assets.find((x) => x.id === id);
        if (!a) return;
        const next = a.scope === 'global' ? 'episode' : 'global';
        set((s) => ({
          assets: s.assets.map((x) => (x.id === id ? { ...x, scope: next } : x)),
          auditLog: [
            {
              id: nextAuditId(),
              artifactId: a.id,
              artifactName: a.name,
              version: a.currentVersion,
              sha256: a.versions.find((v) => v.version === a.currentVersion)?.sha256 ?? '',
              action: 'GLOBALIZE',
              userStatement: next === 'global' ? '标记为项目全局资产' : '取消全局标记',
              createdAt: Date.now(),
            },
            ...s.auditLog,
          ],
        }));
      },

      getAssetsByEpisode(episodeId) {
        return get().assets.filter((a) => a.episodeId === episodeId);
      },

      getProjectAssets(projectId) {
        return get().assets.filter((a) => a.projectId === projectId);
      },

      removeAsset(id) {
        const a = get().assets.find((x) => x.id === id);
        set((s) => ({ assets: s.assets.filter((a) => a.id !== id) }));
        if (a && a.episodeId) {
          get().deleteAssetFromServer(a.projectId, a.episodeId, id).catch(() => {});
        }
      },

      removeByProject(projectId) {
        set((s) => ({ assets: s.assets.filter((a) => a.projectId !== projectId) }));
      },

      removeByEpisode(episodeId) {
        set((s) => ({ assets: s.assets.filter((a) => a.episodeId !== episodeId) }));
      },

      // 后端同步：从服务器加载剧集资产
      async loadAssetsFromServer(projectId, episodeId) {
        try {
          const { items } = await api.listEpisodeAssets(projectId, episodeId);
          if (items && items.length > 0) {
            const serverAssets = items.map(episodeAssetFromServer);
            set((s) => {
              const rest = s.assets.filter((a) => a.episodeId !== episodeId);
              return { assets: [...rest, ...serverAssets] };
            });
          } else {
            // 后端为空但 localStorage 有数据：自动迁移
            const localAssets = get().getAssetsByEpisode(episodeId);
            if (localAssets.length > 0) {
              localAssets.forEach((a) => {
                get().createAssetOnServer(projectId, episodeId, a.id).catch(() => {});
              });
            }
          }
        } catch (err) {
          console.warn('[assetStore] loadAssetsFromServer failed, using local cache:', err);
        }
      },

      // 后端同步：保存资产到服务器
      async saveAssetToServer(id) {
        const a = get().assets.find((x) => x.id === id);
        if (!a) return;
        try {
          const patch = episodeAssetToServerPatch(a);
          await api.updateEpisodeAsset(a.projectId, a.episodeId, id, patch);
        } catch (err) {
          console.warn('[assetStore] saveAssetToServer failed:', err);
        }
      },

      // 后端同步：在服务器创建资产
      async createAssetOnServer(projectId, episodeId, id) {
        const a = get().assets.find((x) => x.id === id);
        if (!a) return;
        try {
          await api.createEpisodeAsset(projectId, episodeId, {
            id: a.id,
            kind: a.kind,
            name: a.name,
            description: a.description,
            scope: a.scope,
            source_scene: a.sourceScene,
            holder: a.holder,
            current_version: a.currentVersion,
            versions: a.versions.map((v) => ({
              version: v.version,
              prompt: v.prompt,
              negative_prompt: v.negativePrompt,
              image_url: v.imageUrl,
              sha256: v.sha256,
              status: v.status,
              created_at: v.createdAt,
            })),
            prompt: a.prompt,
            negative_prompt: a.negativePrompt,
            image_url: a.imageUrl,
            status: a.status,
            model: a.model,
            stale: a.stale,
          });
        } catch (err) {
          console.warn('[assetStore] createAssetOnServer failed:', err);
        }
      },

      // 后端同步：从服务器删除资产
      async deleteAssetFromServer(projectId, episodeId, id) {
        try {
          await api.deleteEpisodeAsset(projectId, episodeId, id);
        } catch (err) {
          console.warn('[assetStore] deleteAssetFromServer failed:', err);
        }
      },
    }),
    {
      name: 'mdp:assets',
      version: 4,
      migrate(persisted, currentVersion) {
        const previous = persisted as Partial<AssetState>;
        // v4：清空所有旧 mock 数据，角色资产只从分镜真实派生
        if (currentVersion < 4) {
          return { assets: [], auditLog: [] };
        }
        const assets = (previous.assets ?? []).map((asset) => ({
          ...asset,
          versions: asset.versions.map((v) => v.version === asset.currentVersion ? { ...v, status: asset.status } : v),
        }));
        const existingIds = new Set(assets.map((asset) => asset.id));
        INITIAL_ASSETS.forEach((asset) => {
          if (!existingIds.has(asset.id)) assets.push(asset);
        });
        return { ...previous, assets, auditLog: previous.auditLog ?? [] };
      },
    },
  ),
);

// ==================== 防抖保存 ====================
const assetSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

function debouncedSaveAsset(id: string) {
  const existing = assetSaveTimers.get(id);
  if (existing) clearTimeout(existing);
  assetSaveTimers.set(
    id,
    setTimeout(() => {
      assetSaveTimers.delete(id);
      useAssetStore.getState().saveAssetToServer(id).catch(() => {});
    }, 800),
  );
}

// ==================== 类型转换（前端 Asset ↔ 后端 ServerEpisodeAsset）====================

function episodeAssetFromServer(server: ServerEpisodeAsset): Asset {
  const versions: AssetVersion[] = (server.versions ?? []).map((v) => ({
    version: v.version,
    prompt: v.prompt,
    negativePrompt: v.negative_prompt,
    imageUrl: v.image_url,
    sha256: v.sha256,
    status: v.status as ArtifactStatus,
    createdAt: v.created_at,
  }));
  const currentVersion = versions.find((v) => v.version === server.current_version) ?? versions[versions.length - 1];
  return {
    id: server.id,
    projectId: server.project_id,
    episodeId: server.episode_id,
    kind: server.kind,
    name: server.name,
    description: server.description,
    scope: server.scope,
    sourceScene: server.source_scene,
    holder: server.holder,
    projectCharacterId: server.project_character_id,
    currentVersion: server.current_version,
    versions,
    prompt: currentVersion?.prompt ?? server.prompt,
    negativePrompt: currentVersion?.negativePrompt ?? server.negative_prompt,
    imageUrl: currentVersion?.imageUrl ?? server.image_url,
    variantImageUrl: server.variant_image_url,
    variantImageStatus: server.variant_image_status as Asset['variantImageStatus'],
    episodeVariant: server.episode_variant,
    status: (currentVersion?.status ?? server.status) as ArtifactStatus,
    model: server.model,
    stale: server.stale,
    createdAt: server.created_at ? new Date(server.created_at).getTime() : Date.now(),
    source: 'server',
  };
}

function episodeAssetToServerPatch(a: Asset): Partial<ServerEpisodeAsset> {
  const patch: Partial<ServerEpisodeAsset> = {
    name: a.name,
    description: a.description,
    scope: a.scope,
    source_scene: a.sourceScene,
    holder: a.holder,
    current_version: a.currentVersion,
    versions: a.versions.map((v) => ({
      version: v.version,
      prompt: v.prompt,
      negative_prompt: v.negativePrompt,
      image_url: v.imageUrl,
      sha256: v.sha256,
      status: v.status,
      created_at: v.createdAt,
    })),
    prompt: a.prompt,
    negative_prompt: a.negativePrompt,
    image_url: a.imageUrl,
    status: a.status,
    model: a.model,
    stale: a.stale,
    // 关联项目级资产
    project_character_id: a.projectCharacterId,
    // 单集状态变体
    episode_variant: a.episodeVariant,
    // 单集变体立绘
    variant_image_url: a.variantImageUrl,
    variant_image_status: a.variantImageStatus,
  };
  return patch;
}
