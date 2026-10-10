// 用户规则模板库（可管理）：mdp:rule-templates 持久化
// 定位：规则先在规则中心「定义」（平台默认规则只读 + 用户模板 CRUD），项目侧「选择生效」
// 未启用/已删除模板不影响已引用它的项目（项目回退平台默认）
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { RuleTemplate } from '@/types';
import { api } from '@/lib/api/client';

const now = Date.now();
const BUILTIN_TEMPLATES: RuleTemplate[] = [
  {
    id: 'tpl-scene-standard',
    version: 1,
    name: '场次制 · 标准模板',
    desc: '剧本按「场次：N-M / 场景N」组织，每集 2-6 场戏的节拍窗口，切点只落场次边界',
    scenePattern: '^(?:场次|场景)[:：]?\\s*\\d+(?:-\\d+)?',
    maxScenesPerEpisode: 6,
    enabled: true,
    builtin: true,
    createdAt: now - 2000,
    updatedAt: now - 2000,
  },
  {
    id: 'tpl-md-chapter',
    version: 1,
    name: 'Markdown 章节制模板',
    desc: '剧本为 Markdown：## 第X集 + ### 场次：N-M，按显式章节优先、场次节拍分组',
    episodePattern: '^#{1,3}\\s*第\\s*\\d+[集回话]',
    scenePattern: '^#{1,3}\\s*(?:场次|场景)[:：]?\\s*\\d+(?:-\\d+)?',
    maxScenesPerEpisode: 4,
    enabled: true,
    builtin: true,
    createdAt: now - 1000,
    updatedAt: now - 1000,
  },
];

interface RuleTemplateState {
  templates: RuleTemplate[];
  upsertTemplate(input: Omit<RuleTemplate, 'createdAt' | 'updatedAt' | 'version'> & { createdAt?: number }, opts?: { note?: string }): void;
  /** 恢复历史版本：把该版本快照写回当前模板并生成新版本（历史保留，链不中断） */
  restoreVersion(id: string, version: number): void;
  removeTemplate(id: string): void;
  toggleEnabled(id: string): void;
  // 后端同步
  loadFromServer(): Promise<void>;
}

export const useRuleTemplateStore = create<RuleTemplateState>()(
  persist(
    (set, get) => ({
      templates: BUILTIN_TEMPLATES,
      upsertTemplate(input, opts) {
        const exists = get().templates.some((t) => t.id === input.id);
        set((s) => {
          if (exists) {
            return {
              templates: s.templates.map((t) => {
                if (t.id !== input.id) return t;
                const now = Date.now();
                const version = (t.version ?? 1) + 1;
                const history = t.versionHistory ?? [];
                history.push({
                  version: version - 1,
                  savedAt: t.updatedAt || now,
                  note: opts?.note,
                  snapshot: {
                    name: t.name,
                    desc: t.desc,
                    episodePattern: t.episodePattern,
                    scenePattern: t.scenePattern,
                    targetEpisodes: t.targetEpisodes,
                    maxScenesPerEpisode: t.maxScenesPerEpisode,
                    maxUnitSeconds: t.maxUnitSeconds,
                  },
                });
                return {
                  ...t,
                  ...input,
                  version,
                  versionHistory: history,
                  createdAt: t.createdAt,
                  updatedAt: now,
                };
              }),
            };
          }
          return {
            templates: [
              { ...input, version: 1, enabled: input.enabled ?? true, createdAt: input.createdAt ?? Date.now(), updatedAt: Date.now() },
              ...s.templates,
            ],
          };
        });
        // 同步到后端（内置模板不同步）
        if (!input.builtin) {
          const t = get().templates.find((x) => x.id === input.id);
          if (t) {
            if (exists) {
              api.updateRuleTemplate(input.id, splitTemplateToServerPatch(t)).catch(() => {});
            } else {
              api.createRuleTemplate(splitTemplateToServer(t)).catch(() => {});
            }
          }
        }
      },
      restoreVersion(id, version) {
        set((s) => ({
          templates: s.templates.map((t) => {
            if (t.id !== id) return t;
            const v = (t.versionHistory ?? []).find((h) => h.version === version);
            if (!v) return t;
            const now = Date.now();
            const nextVersion = (t.version ?? 1) + 1;
            const history = [...(t.versionHistory ?? [])];
            history.push({
              version: (t.version ?? 1),
              savedAt: t.updatedAt || now,
              note: `恢复至 v${version}`,
              snapshot: {
                name: t.name,
                desc: t.desc,
                episodePattern: t.episodePattern,
                scenePattern: t.scenePattern,
                targetEpisodes: t.targetEpisodes,
                maxScenesPerEpisode: t.maxScenesPerEpisode,
                maxUnitSeconds: t.maxUnitSeconds,
              },
            });
            return {
              ...t,
              ...v.snapshot,
              version: nextVersion,
              versionHistory: history,
              updatedAt: now,
            };
          }),
        }));
        // 同步到后端
        const t = get().templates.find((x) => x.id === id);
        if (t && !t.builtin) {
          api.updateRuleTemplate(id, splitTemplateToServerPatch(t)).catch(() => {});
        }
      },
      removeTemplate(id) {
        set((s) => ({ templates: s.templates.filter((t) => t.id !== id) }));
        // 同步到后端（内置模板不同步）
        const t = get().templates.find((x) => x.id === id);
        if (!t?.builtin) {
          api.deleteRuleTemplate(id).catch(() => {});
        }
      },
      toggleEnabled(id) {
        set((s) => ({ templates: s.templates.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t)) }));
        // 同步到后端
        const t = get().templates.find((x) => x.id === id);
        if (t && !t.builtin) {
          api.updateRuleTemplate(id, { enabled: t.enabled }).catch(() => {});
        }
      },
      // 后端同步：从服务器加载用户模板（内置模板保留在前端）
      async loadFromServer() {
        try {
          const { items } = await api.listRuleTemplates('split');
          if (items && items.length > 0) {
            const serverTemplates = items.map(splitTemplateFromServer);
            set((s) => {
              // 保留内置模板，合并后端用户模板
              const builtin = s.templates.filter((t) => t.builtin);
              const userIds = new Set(serverTemplates.map((t) => t.id));
              const localUser = s.templates.filter((t) => !t.builtin && !userIds.has(t.id));
              return { templates: [...builtin, ...serverTemplates, ...localUser] };
            });
          } else {
            // 后端为空但 localStorage 有用户模板：自动迁移
            const userTemplates = get().templates.filter((t) => !t.builtin);
            userTemplates.forEach((t) => {
              api.createRuleTemplate(splitTemplateToServer(t)).catch(() => {});
            });
          }
        } catch (err) {
          console.warn('[ruleTemplateStore] loadFromServer failed:', err);
        }
      },
    }),
    { name: 'mdp:rule-templates' },
  ),
);

// ==================== 类型转换（前端 RuleTemplate ↔ 后端 ServerRuleTemplate）====================

function splitTemplateFromServer(server: import('@/lib/api/client').ServerRuleTemplate): RuleTemplate {
  const config = server.config || {};
  return {
    id: server.id,
    version: server.version,
    name: server.name,
    desc: server.description,
    episodePattern: config.episodePattern as string | undefined,
    scenePattern: config.scenePattern as string | undefined,
    targetEpisodes: config.targetEpisodes as number | undefined,
    maxScenesPerEpisode: config.maxScenesPerEpisode as number | undefined,
    maxUnitSeconds: config.maxUnitSeconds as number | undefined,
    enabled: server.enabled,
    builtin: server.builtin,
    createdAt: server.created_at ? new Date(server.created_at).getTime() : Date.now(),
    updatedAt: server.updated_at ? new Date(server.updated_at).getTime() : Date.now(),
    versionHistory: (server.version_history || []).map((h) => ({
      version: h.version,
      savedAt: h.savedAt,
      note: h.note,
      snapshot: h.snapshot as RuleTemplate['versionHistory'][number]['snapshot'],
    })),
  };
}

function splitTemplateToServer(t: RuleTemplate): import('@/lib/api/client').CreateRuleTemplateRequest {
  return {
    id: t.id,
    kind: 'split',
    name: t.name,
    description: t.desc,
    config: {
      episodePattern: t.episodePattern,
      scenePattern: t.scenePattern,
      targetEpisodes: t.targetEpisodes,
      maxScenesPerEpisode: t.maxScenesPerEpisode,
      maxUnitSeconds: t.maxUnitSeconds,
    },
    builtin: t.builtin,
    enabled: t.enabled,
  };
}

function splitTemplateToServerPatch(t: RuleTemplate): Partial<import('@/lib/api/client').ServerRuleTemplate> {
  return {
    name: t.name,
    description: t.desc,
    config: {
      episodePattern: t.episodePattern,
      scenePattern: t.scenePattern,
      targetEpisodes: t.targetEpisodes,
      maxScenesPerEpisode: t.maxScenesPerEpisode,
      maxUnitSeconds: t.maxUnitSeconds,
    },
    version: t.version,
    enabled: t.enabled,
    version_history: (t.versionHistory || []).map((h) => ({
      version: h.version,
      savedAt: h.savedAt,
      note: h.note,
      snapshot: h.snapshot,
    })),
  };
}
