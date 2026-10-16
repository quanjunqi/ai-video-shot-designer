// 设置（渠道 / 模型目录 / 偏好；演示环境不接收或持久化 Secret）
// 模型目录三层结构：渠道（来源）→ 模型（挂渠道 + 类型）→ 能力/计费（按类型分化）
// 数据源三态：server（后端目录）→ offline-fallback（后端不可达，本地缓存）→ demo（内置默认）
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { toast } from 'sonner';
import { MODEL_CHANNELS, MODEL_CATALOG, PROTOCOL_TEMPLATES, type ChannelConfig, type CatalogModel, type ModelParam, type ProtocolTemplate } from '@/config/models/model-catalog';
import { effectiveSync } from '@/features/settings/channel-sync';
import { api, type ServerCatalogDirectory, type CredentialStatus, type UserChannelItem } from '@/lib/api/client';

export type ThemeMode = 'light' | 'dark' | 'system';
export type CatalogSource = 'demo' | 'server' | 'offline-fallback';

interface SettingsState {
  theme: ThemeMode;
  language: string;
  channels: ChannelConfig[]; // L1 渠道（内置 + 自定义）
  models: CatalogModel[]; // L2+L3 模型目录（挂渠道 + 类型 + 能力/计费）
  templates: ProtocolTemplate[]; // 协议模板（内置预置 + 用户自定义；模型引用，改一处全局生效）
  credentials: CredentialStatus[];
  hiddenBuiltinIds: string[]; // 用户隐藏的内置渠道 id（本地持久化） // 租户凭据状态（脱敏：hasKey/baseUrl，不返回明文）
  catalogSource: CatalogSource;
  preferences: {
    defaultTextModel: string;
    defaultImageModel: string;
    defaultVideoModel: string;
    defaultRoute: string;
  };
  update(patch: Partial<SettingsState>): void;
  // ---- 凭据（正式：workspace 加密存储，只写不读明文）----
  syncCredentials(): Promise<void>;
  saveCredential(channelId: string, input: { baseUrl: string; authType: string; apiKey?: string }): Promise<void>;
  clearCredential(channelId: string): Promise<void>;
  // ---- 三态数据源 ----
  hydrateCatalog(dir: ServerCatalogDirectory): void;
  markOfflineFallback(): void;
  syncCatalog(): Promise<void>; // server 态刷新：拉平台目录 + 用户渠道合并
  // ---- L1/L2/L3 写操作（server 态乐观同步后端，失败降级 offline）----
  upsertChannel(id: string, patch: Partial<ChannelConfig>): void;
  duplicateChannel(id: string): void; // 克隆渠道（含其下模型），用户级本地操作
  removeChannel(id: string): void; // 自定义删除走后端；内置删除=本地隐藏（hiddenBuiltinIds）
  testChannel(id: string): void; // 演示：假调通（诊断 + 最后检测时间），真实鉴权待接入
  addModel(input: Omit<CatalogModel, 'id'>): void;
  duplicateModel(id: string): void; // 克隆模型，用户级本地操作
  updateModel(id: string, patch: Partial<CatalogModel>): void;
  removeModel(id: string): void; // server 态软停用（目录不物理删除），本地移除
  toggleModel(id: string): void;
  // ---- 协议模板（独立实体，改一处生效于全部引用模型）----
  upsertTemplate(template: ProtocolTemplate): void;
  removeTemplate(id: string): void;
}

function serverChannelToLocal(c: ServerCatalogDirectory['channels'][number]): ChannelConfig {
  return { id: c.id, name: c.name, kind: c.kind, protocol: (c as { protocol?: string }).protocol === 'local' ? 'local' : 'api', baseUrl: c.baseUrl, authType: c.authType, enabled: c.enabled, note: c.note, sort: c.sort, syncKind: c.syncKind, syncModelsPath: c.syncModelsPath, syncPricingPath: c.syncPricingPath, lastSyncAt: c.lastSyncAt };
}
// ★ 同步状态（syncKind/lastSyncAt…）是【平台侧】拥有的字段，工作区用户渠道域里没有它。
// 而合并时"用户渠道覆盖同名 id"⇒ 若这里不带过来，卡片就会永远显示"未配置 / 从未同步"
// —— 这正是 T1 的真实缺陷（同形合并只改了一处）。故由调用方把平台行作为 fallback 传进来。
function userChannelToLocal(c: UserChannelItem, platform?: ChannelConfig): ChannelConfig {
  const effective = effectiveSync(c, platform);
  return {
    id: c.id,
    name: c.name,
    kind: c.kind,
    protocol: c.protocol === 'local' ? 'local' : 'api',
    baseUrl: c.baseUrl,
    authType: c.authType as ChannelConfig['authType'],
    enabled: c.enabled,
    note: c.note,
    sort: c.sort ?? 0,
    // 同步配置的生效规则由纯函数给出（与后端 SyncChannel 同一优先级）：
    // 工作区自己的渠道**配了**同步 ⇒ 用它；否则退回平台行。
    // ★ 这里曾经一律取平台行 ⇒ 用户渠道自己的配置被丢掉（界面显示"未配置"，实际却可能已配）。
    syncKind: effective.syncKind,
    syncModelsPath: effective.syncModelsPath,
    syncPricingPath: effective.syncPricingPath,
    lastSyncAt: platform?.lastSyncAt,
  };
}
function serverTemplateToLocal(t: ServerCatalogDirectory['templates'][number]): ProtocolTemplate {
  return { id: t.id, label: t.label, desc: t.desc, type: (t as { type?: ProtocolTemplate['type'] }).type ?? 'all', method: t.method, requestPath: t.requestPath, params: (t.params ?? []).map((p) => ({ ...p, type: (p as { type?: ModelParam['type'] }).type })), responseParams: (t.responseParams ?? []).map((p) => ({ ...p, type: (p as { type?: ModelParam['type'] }).type })), async: t.async ? { ...t.async } : undefined, builtin: t.builtin, enabled: t.enabled, refCount: t.refCount, version: t.version, docRef: t.docRef, observedEvidence: t.observedEvidence };
}
function serverModelToLocal(m: ServerCatalogDirectory['models'][number]): CatalogModel {
  return {
    id: m.id, channelId: m.channelId, family: m.family, name: m.name,
    providerModel: (m as { providerModel?: string }).providerModel ?? m.name,
    type: m.type, status: m.status, sort: m.sort, note: m.note,
    // ★ 映射必须携带路由字段：T1 的教训是"两处同形映射只改一处 + 覆盖时丢字段"。
    //   本文件只有一个 model 映射函数（两个调用点共用），所以改这里即覆盖全部路径。
    logicalModelId: (m as { logicalModelId?: string }).logicalModelId,
    routePriority: (m as { routePriority?: number }).routePriority,
    protocolTemplateId: (m as { protocolTemplateId?: string }).protocolTemplateId,
    requestPath: (m as { requestPath?: string }).requestPath ?? '',
    method: (m as { method?: 'POST' | 'GET' }).method ?? 'POST',
    params: (m as { params?: { key: string; value: string }[] }).params ?? [],
    responseParams: (m as { responseParams?: { key: string; value: string }[] }).responseParams ?? [],
    capability: m.capability as unknown as CatalogModel['capability'],
  };
}

const defaultChannels = () => MODEL_CHANNELS.map((c) => ({ ...c }));
const defaultModels = () => MODEL_CATALOG.map((m) => ({ ...m, capability: { ...m.capability } as CatalogModel['capability'] }));
const defaultPrefs = () => ({ defaultTextModel: '', defaultImageModel: 'gpt-image-2', defaultVideoModel: 'MiniMax H3', defaultRoute: '/comic/projects' });

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      language: '简体中文',
      channels: defaultChannels(),
      models: defaultModels(),
      templates: PROTOCOL_TEMPLATES.map((t) => ({ ...t })),
      credentials: [],
      hiddenBuiltinIds: [],
      catalogSource: 'demo',
      preferences: defaultPrefs(),
      update: (patch) => set(patch),

      hydrateCatalog(dir) {
        // 平台目录合并本地用户渠道（自定义渠道不因目录拉取而丢失）
        const builtin = dir.channels.map(serverChannelToLocal);
        const byId = new Map<string, ChannelConfig>();
        for (const c of builtin) byId.set(c.id, c);
        for (const c of get().channels.filter((c) => !builtin.some((b) => b.id === c.id))) byId.set(c.id, c);
        const dirModelIds = new Set(dir.models.map((m) => m.id));
        set({
          channels: [...byId.values()].filter((c) => !get().hiddenBuiltinIds.includes(c.id)),
          models: [...dir.models.map(serverModelToLocal), ...get().models.filter((m) => !dirModelIds.has(m.id))],
          templates: dir.templates.map(serverTemplateToLocal),
          catalogSource: 'server',
        });
      },
      markOfflineFallback() {
        if (get().catalogSource !== 'offline-fallback') set({ catalogSource: 'offline-fallback' });
      },
      async syncCatalog() {
        try {
          const [dir, user] = await Promise.all([api.getCatalog(), api.listUserChannels()]);
          const builtin = dir.channels.map(serverChannelToLocal);
          const builtinById = new Map(builtin.map((c) => [c.id, c] as const));
          // 平台行作为 fallback：用户渠道覆盖同名 id 时，仍保留平台拥有的同步状态（T1）
          const userCh = user.items.map((c) => userChannelToLocal(c, builtinById.get(c.id)));
          // 合并：用户渠道优先（覆盖内置同名 id），再过滤本地隐藏的内置渠道
          const byId = new Map<string, ChannelConfig>();
          for (const c of builtin) byId.set(c.id, c);
          for (const c of userCh) byId.set(c.id, c);
          const channels = [...byId.values()].filter((c) => !get().hiddenBuiltinIds.includes(c.id)).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
          // 模型：目录为准，保留本地非目录来源（克隆副本/自定义渠道模型）
          const dirModelIds = new Set(dir.models.map((m) => m.id));
          const localExtra = get().models.filter((m) => !dirModelIds.has(m.id));
          set({
            channels,
            models: [...dir.models.map(serverModelToLocal), ...localExtra],
            templates: dir.templates.map(serverTemplateToLocal),
            catalogSource: 'server',
          });
        } catch (err) {
          // ★ 不得裸 `catch {}`（TASK-MODEL-006 实测教训）：
          //   061 迁移把协议模板的 params 写成对象 `{}` 而契约要求数组 ⇒ 上面 :81 的
          //   `(t.params ?? []).map` 抛 TypeError ⇒ 被这里吞掉 ⇒ UI 显示"服务端不可达·本地缓存"，
          //   **而服务端其实是好的**（10 个请求全 200）。一条数据形状 bug 被伪装成网络故障，
          //   直接把排查引向错误方向。
          //   ⇒ 保留原行为（降级 offline），但让真实原因**可见**。写法同 useEpisodeStore.ts:309。
          console.warn('[settingsStore] syncCatalog failed, using local cache:', err);
          get().markOfflineFallback();
        }
      },

      upsertChannel: (id, patch) => {
        set((s) => ({
          channels: s.channels.some((c) => c.id === id)
            ? s.channels.map((c) => (c.id === id ? { ...c, ...patch } : c))
            : [...s.channels, { id, name: id, kind: 'aggregator', baseUrl: '', authType: 'bearer', enabled: true, note: '', ...patch }],
        }));
        if (get().catalogSource === 'server') {
          // 用户对渠道的任何修改（内置/自定义）都写入 workspace 用户渠道域，
          // 合并时用户渠道覆盖平台目录；不写 production（平台共享目录只读，防污染）。
          const current = get().channels.find((c) => c.id === id);
          if (current) {
            api.putUserChannel(id, {
              name: patch.name ?? current.name,
              kind: patch.kind ?? current.kind,
              protocol: patch.protocol ?? current.protocol ?? 'api',
              baseUrl: patch.baseUrl ?? current.baseUrl,
              authType: patch.authType ?? current.authType,
              enabled: patch.enabled ?? current.enabled,
              note: patch.note ?? current.note,
            }).catch(() => {
              get().markOfflineFallback();
              toast.warning('渠道变更未同步到服务端，已降级为本地演示态');
            });
          }
        }
      },
      duplicateChannel: (id) => {
        const src = get().channels.find((c) => c.id === id);
        if (!src) return;
        const now = Date.now().toString(36);
        const newId = `chan-${now}`;
        const childModels = get().models.filter((m) => m.channelId === id);
        set((s) => ({
          channels: [...s.channels, { ...src, id: newId, name: `${src.name} 副本`, enabled: true, lastTestAt: undefined, lastTestOk: undefined, testNote: undefined }],
          models: [...s.models, ...childModels.map((m, i) => ({ ...m, id: `m-${now}-${i}`, channelId: newId, name: `${m.name} 副本` }))],
        }));
        toast.success(`已克隆渠道「${src.name}」${childModels.length ? `及其 ${childModels.length} 个模型` : ''}`);
        if (get().catalogSource === 'server') {
          api.putUserChannel(newId, {
            name: `${src.name} 副本`, kind: src.kind, protocol: src.protocol ?? 'api', baseUrl: src.baseUrl,
            authType: src.authType, enabled: true, note: src.note,
          }).catch(() => {
            get().markOfflineFallback();
            toast.warning('克隆渠道未同步到服务端，已降级为本地演示态');
          });
        }
      },
      removeChannel: (id) => {
        const builtinIds = new Set(defaultChannels().map((c) => c.id));
        set((s) => ({
          channels: s.channels.filter((c) => c.id !== id),
          models: s.models.filter((m) => m.channelId !== id),
          hiddenBuiltinIds: builtinIds.has(id) ? [...s.hiddenBuiltinIds, id] : s.hiddenBuiltinIds,
        }));
        // 自定义渠道：物理删除后端用户渠道；内置渠道：本地隐藏（平台目录只读）
        if (get().catalogSource === 'server' && !builtinIds.has(id)) {
          api.deleteUserChannel(id).catch(() => {
            get().markOfflineFallback();
            toast.warning('渠道删除未同步到服务端，已降级为本地演示态');
          });
        }
      },
      testChannel: async (id) => {
        // 正式连通性检测：BFF 编排真实 HTTP 探测（网络层 + 鉴权层），结果如实上报，不模拟通过
        const ch = get().channels.find((c) => c.id === id);
        try {
          const r = await api.probeChannel(id, { baseUrl: ch?.baseUrl, authType: ch?.authType });
          set((s) => ({
            channels: s.channels.map((c) =>
              c.id === id
                ? { ...c, lastTestAt: Date.now(), lastTestOk: r.reachable && r.authOk !== false, testNote: r.detail }
                : c,
            ),
          }));
        } catch (err) {
          const reason = err instanceof Error ? err.message : '未知错误';
          set((s) => ({
            channels: s.channels.map((c) =>
              c.id === id ? { ...c, lastTestAt: Date.now(), lastTestOk: false, testNote: `连通性检测失败：${reason}` } : c,
            ),
          }));
        }
      },
      async syncCredentials() {
        try {
          const res = await api.listChannelCredentials();
          set({ credentials: res.items });
        } catch {
          // 后端未就绪：保持现状，不伪造凭据状态
        }
      },
      async saveCredential(channelId, input) {
        try {
          await api.putChannelCredential(channelId, input);
          await get().syncCredentials();
        } catch (err) {
          throw new Error(err instanceof Error ? err.message : '凭据保存失败');
        }
      },
      async clearCredential(channelId) {
        try {
          await api.deleteChannelCredential(channelId);
          await get().syncCredentials();
        } catch (err) {
          throw new Error(err instanceof Error ? err.message : '凭据清除失败');
        }
      },
      duplicateModel: (id) => {
        const src = get().models.find((m) => m.id === id);
        if (!src) return;
        set((s) => ({
          models: [...s.models, { ...src, id: `m-${Date.now().toString(36)}`, name: `${src.name} 副本`, capability: { ...src.capability }, params: (src.params ?? []).map((p) => ({ ...p })) }],
        }));
        toast.success(`已克隆模型「${src.name}」`);
      },
      addModel: (input) => {
        // 服务端 id 规范：mod_ 前缀 + 24 字符（与 production catalog PUT/DELETE 一致）
        const local: CatalogModel = { ...input, id: `mod_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`.slice(0, 24), capability: { ...input.capability } };
        set((s) => ({ models: [...s.models, local] }));
        if (get().catalogSource === 'server') {
          api.createCatalogModel({ channelId: input.channelId, family: input.family, name: input.name, providerModel: input.providerModel, type: input.type, status: input.status, sort: input.sort, note: input.note, protocolTemplateId: input.protocolTemplateId, requestPath: input.requestPath, method: input.method, params: input.params, responseParams: input.responseParams, capability: input.capability as unknown as Record<string, unknown> })
            .then((created) => {
              // 服务端已确认：以服务端目录行为准（含 id/version）
              set((s) => ({ models: s.models.map((m) => (m.id === local.id ? serverModelToLocal(created) : m)) }));
            })
            .catch(() => {
              get().markOfflineFallback();
              toast.warning('模型新增未同步到服务端，已降级为本地演示态');
            });
        }
      },
      updateModel: (id, patch) => {
        set((s) => ({ models: s.models.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
        if (get().catalogSource === 'server') {
          api.updateCatalogModel(id, {
            channelId: patch.channelId,
            family: patch.family,
            name: patch.name,
            providerModel: patch.providerModel,
            type: patch.type,
            status: patch.status,
            sort: patch.sort,
            note: patch.note,
            protocolTemplateId: patch.protocolTemplateId,
            requestPath: patch.requestPath,
            method: patch.method,
            params: patch.params,
            responseParams: patch.responseParams,
            capability: patch.capability as unknown as Record<string, unknown> | undefined,
          }).catch(() => {
            get().markOfflineFallback();
            toast.warning('模型能力变更未同步到服务端，已降级为本地演示态');
          });
        }
      },
      removeModel: (id) => {
        const removed = get().models.find((m) => m.id === id);
        set((s) => ({ models: s.models.filter((m) => m.id !== id) }));
        if (get().catalogSource === 'server' && removed) {
          // 平台目录不物理删除：软停用留档（版本化历史已由服务端 trigger 记录）
          api.updateCatalogModel(id, { status: 'disabled' }).catch(() => {
            get().markOfflineFallback();
            toast.warning('模型停用未同步到服务端，已降级为本地演示态');
          });
        }
      },
      toggleModel: (id) => {
        const target = get().models.find((m) => m.id === id);
        const next = target?.status === 'enabled' ? 'disabled' : 'enabled';
        set((s) => ({ models: s.models.map((m) => (m.id === id ? { ...m, status: next } : m)) }));
        if (get().catalogSource === 'server') {
          api.updateCatalogModel(id, { status: next }).catch(() => {
            get().markOfflineFallback();
            toast.warning('模型启停未同步到服务端，已降级为本地演示态');
          });
        }
      },
      upsertTemplate: (template) => {
        // 先判存在性（旧状态），避免 set 后新模板误判为已存在而走 PUT
        const exist = get().templates.some((t) => t.id === template.id);
        set((s) => ({
          templates: s.templates.some((t) => t.id === template.id)
            ? s.templates.map((t) => (t.id === template.id ? template : t))
            : [...s.templates, template],
        }));
        if (get().catalogSource === 'server') {
          const payload = { label: template.label, desc: template.desc, type: template.type, requestPath: template.requestPath, method: template.method, params: template.params, responseParams: template.responseParams, async: template.async ?? undefined, enabled: template.enabled };
          const req = exist ? api.updateProtocolTemplate(template.id, payload) : api.createProtocolTemplate(payload);
          req.then(() => get().syncCatalog()).catch(() => {
            get().markOfflineFallback();
            toast.warning('协议模板变更未同步到服务端，已降级为本地演示态');
          });
        }
      },
      removeTemplate: (id) => {
        set((s) => ({ templates: s.templates.filter((t) => t.id !== id) }));
        if (get().catalogSource === 'server') {
          api.deleteProtocolTemplate(id).catch(() => {
            get().markOfflineFallback();
            toast.warning('协议模板删除未同步到服务端，已降级为本地演示态');
          });
        }
      },
    }),
    {
      name: 'mdp:settings',
      version: 3,
      migrate: () => ({ theme: 'dark', language: '简体中文', channels: defaultChannels(), models: defaultModels(), templates: PROTOCOL_TEMPLATES.map((t) => ({ ...t })), credentials: [], hiddenBuiltinIds: [], catalogSource: 'demo', preferences: defaultPrefs() }),
      // 结构防御 merge：历史/脏缓存中 channels/models 非数组或 catalogSource 非法时回退默认，
      // 避免 channels.map is not a function 一类运行时崩溃；自定义渠道/模型数据仍保留（数组时原样合并）。
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        return {
          ...current,
          ...p,
          theme: p.theme === 'light' || p.theme === 'dark' || p.theme === 'system' ? p.theme : current.theme,
          language: typeof p.language === 'string' && p.language ? p.language : current.language,
          channels: Array.isArray(p.channels)
            ? (p.channels as Array<Record<string, unknown> & ChannelConfig>).map((c) => ({ ...c, authType: (String(c.authType) === 'apikey' || String(c.authType) === 'sign' ? 'bearer' : c.authType) as ChannelConfig['authType'] }))
            : current.channels,
          models: Array.isArray(p.models) ? (p.models as CatalogModel[]) : current.models,
          templates: Array.isArray(p.templates) ? (p.templates as ProtocolTemplate[]) : current.templates,
          catalogSource: p.catalogSource === 'server' || p.catalogSource === 'offline-fallback' ? p.catalogSource : 'demo',
          hiddenBuiltinIds: Array.isArray(p.hiddenBuiltinIds) ? p.hiddenBuiltinIds : current.hiddenBuiltinIds,
          preferences: p.preferences && typeof p.preferences === 'object' && !Array.isArray(p.preferences)
            ? { ...current.preferences, ...p.preferences }
            : current.preferences,
        };
      },
    },
  ),
);
