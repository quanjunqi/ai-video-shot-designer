// EXPORTS: useCreateControls, type UseCreateControls
//
// 智能创作的控件接线层（ADR-006 D2）：把「设置中心的模型目录」接到「能力驱动控件 schema」上。
// 本 hook 只做接线与草稿状态，不含任何协议字段映射（那是服务端协议模板的职责）。
//
// 目录三态（server / offline-fallback / demo）由 useSettingsStore 维护，本 hook 原样透出，
// 由 UI 如实展示数据源徽标 —— 不把演示目录伪装成服务端事实。
//
// 草稿值的设计：`values` 是「用户改动过的覆盖值」，不是全量表单值。
// 读取时以 schema 默认值为底、覆盖值为顶（见 values 的 useMemo）。
// 这样做的原因：目录会在挂载后异步 hydrate（syncCatalog），若把全量表单值放进 state 并在
// schema 变化时重建，用户在 hydrate 期间正在输入的提示词会被清空。覆盖值方案下，
// 未改动的字段自动跟随新模型默认值，已输入的内容始终保留。
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSettingsStore, type CatalogSource } from '@/stores/useSettingsStore';
import { useCreateDraftStore } from '@/stores/useCreateDraftStore';
import { hasRecoverableContent, pickKnown } from '@/features/genworkbench/draft-utils';
import {
  buildControlSchema,
  estimateCost,
  initialValues,
  runnableModels,
  validateDraft,
  type ControlSchema,
  type CostEstimate,
  type CreateKind,
  type ValidationIssue,
} from '@/config/create/control-schema';
import type { CatalogModel, ChannelConfig } from '@/config/models/model-catalog';

export interface UseCreateControls {
  kind: CreateKind;
  /** 目录数据源三态，供 UI 如实标注 */
  catalogSource: CatalogSource;
  /** 当前工作台可运行的模型（已排除停用模型与停用渠道） */
  models: CatalogModel[];
  /** 全部渠道（用于在模型档位列表里标注渠道名） */
  channels: ChannelConfig[];
  model?: CatalogModel;
  channel?: ChannelConfig;
  selectModel(id: string): void;
  schema: ControlSchema;
  /** 当前生效值（schema 默认值 + 用户改动）；含草稿恢复的键，渲染用 */
  values: Record<string, string>;
  /** 提交用值：只保留当前 schema 认识的键（草稿里换模型残留的键不会发给上游） */
  submitValues: Record<string, string>;
  /** 本次挂载是否从本地草稿恢复了内容（供 UI 如实提示，可一键清空） */
  draftRestored: boolean;
  setValue(key: string, value: string): void;
  /**
   * 批量套用一份草稿（用于「复用历史任务的参数」）。
   * 只接受 schema 认识的键；modelId 在当前可运行模型里才会切换。
   * 返回被忽略的键，供 UI 如实告知用户。
   */
  applyDraft(input: { prompt?: string; parameters?: Record<string, string>; modelId?: string }): { skippedKeys: string[] };
  /** 已挂载的参考图 / 参考音频数量（由引用条维护，用于前置校验） */
  refCount: number;
  setRefCount(count: number): void;
  audioRefCount: number;
  setAudioRefCount(count: number): void;
  issues: ValidationIssue[];
  /** 取某字段的校验原因（无则为 undefined），供控件就地提示 */
  issueFor(key: string): string | undefined;
  canSubmit: boolean;
  cost?: CostEstimate;
  resetDraft(): void;
}

export function useCreateControls(kind: CreateKind): UseCreateControls {
  const models = useSettingsStore((s) => s.models);
  const channels = useSettingsStore((s) => s.channels);
  const catalogSource = useSettingsStore((s) => s.catalogSource);
  const preferences = useSettingsStore((s) => s.preferences);

  const available = useMemo(() => runnableModels(models, channels, kind), [models, channels, kind]);

  // ---- 草稿恢复（ADR-006 D6）：只恢复参数文本与模型档位，不恢复参考图 ----
  // 这里读的是原始持久化数据（此时还不知道 schema 的键集合），
  // 因此**在提交时统一用 pickKnown 过滤**，而不是在恢复时猜。
  // 过期判定在 store 内完成（渲染期不得直接调用 Date.now，React 纯函数规则）。
  const initialDraft = useMemo(() => useCreateDraftStore.getState().readRawDraft(kind), [kind]);

  // 首选模型：用户显式选择 → 设置中心的默认模型 → 目录首个可运行模型
  const [selectedId, setSelectedId] = useState(() => initialDraft?.modelId ?? '');
  const preferred =
    kind === 'image' ? preferences.defaultImageModel : kind === 'video' ? preferences.defaultVideoModel : '';
  const model = useMemo(() => {
    const explicit = available.find((m) => m.id === selectedId);
    if (explicit) return explicit;
    const byPreference = available.find((m) => m.id === preferred);
    return byPreference ?? available[0];
  }, [available, selectedId, preferred]);

  const schema = useMemo(() => buildControlSchema(model, kind), [model, kind]);

  const [overrides, setOverrides] = useState<Record<string, string>>(() => initialDraft?.values ?? {});
  const values = useMemo(() => ({ ...initialValues(schema), ...overrides }), [schema, overrides]);
  const submitValues = useMemo(
    () => pickKnown(values, schema.controls.map((c) => c.key)),
    [values, schema.controls],
  );

  // 草稿落盘：输入是高频事件，用 400ms 防抖，避免每次按键都写 localStorage
  const allowedKeys = useMemo(() => schema.controls.map((c) => c.key), [schema.controls]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      useCreateDraftStore.getState().saveDraft(kind, {
        values: overrides,
        modelId: selectedId === '' ? undefined : selectedId,
        allowedKeys,
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [kind, overrides, selectedId, allowedKeys]);

  // 参考附件计数：按模型上限**派生**收紧，而不是用 effect 改 state。
  // 切到上限更低的模型时计数立即收敛（不会出现"已挂载但非法"的中间态），
  // 切回上限更高的模型时原始计数自然恢复。UI 应在达到上限时禁用添加入口。
  // 调用方需注意：引用条数组本身仍由 composer 依 schema.limits.maxRefImages 裁剪（TASK-CREATE-002）。
  const [rawRefCount, setRefCount] = useState(0);
  const [rawAudioRefCount, setAudioRefCount] = useState(0);
  const [draftRestored, setDraftRestored] = useState(() => hasRecoverableContent(initialDraft));
  const refCount = Math.min(rawRefCount, schema.limits.maxRefImages);
  const audioRefCount = Math.min(rawAudioRefCount, schema.limits.maxRefAudios);

  const setValue = useCallback((key: string, value: string) => {
    setOverrides((prev) => ({ ...prev, [key]: value }));
  }, []);

  const applyDraft = useCallback(
    (input: { prompt?: string; parameters?: Record<string, string>; modelId?: string }) => {
      const known = new Set(schema.controls.map((c) => c.key));
      const accepted: Record<string, string> = {};
      const skippedKeys: string[] = [];
      for (const [key, value] of Object.entries(input.parameters ?? {})) {
        if (known.has(key)) accepted[key] = value;
        else skippedKeys.push(key);
      }
      if (input.prompt !== undefined) {
        if (known.has('prompt')) accepted.prompt = input.prompt;
        else skippedKeys.push('prompt');
      }
      setOverrides((prev) => ({ ...prev, ...accepted }));
      // 只有在当前可运行模型里存在时才切换，避免切到一个已停用/已删除的模型
      if (input.modelId !== undefined && available.some((m) => m.id === input.modelId)) {
        setSelectedId(input.modelId);
      }
      return { skippedKeys };
    },
    [schema.controls, available],
  );

  const resetDraft = useCallback(() => {
    setOverrides({});
    setRefCount(0);
    setAudioRefCount(0);
    useCreateDraftStore.getState().clearDraft(kind);
    setDraftRestored(false);
  }, [kind]);

  const issues = useMemo(
    () => validateDraft(schema, values, { refCount, audioRefCount }),
    [schema, values, refCount, audioRefCount],
  );

  const issueMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const issue of issues) {
      if (!map.has(issue.field)) map.set(issue.field, issue.message);
    }
    return map;
  }, [issues]);

  const issueFor = useCallback((key: string) => issueMap.get(key), [issueMap]);

  const cost = useMemo(() => estimateCost(schema, values), [schema, values]);

  const canSubmit = schema.catalogBacked && schema.modes.length > 0 && issues.length === 0;

  return {
    kind,
    catalogSource,
    models: available,
    channels,
    model,
    channel: channels.find((c) => c.id === model?.channelId),
    selectModel: setSelectedId,
    schema,
    values,
    submitValues,
    draftRestored,
    setValue,
    applyDraft,
    refCount,
    setRefCount,
    audioRefCount,
    setAudioRefCount,
    issues,
    issueFor,
    canSubmit,
    cost,
    resetDraft,
  };
}
