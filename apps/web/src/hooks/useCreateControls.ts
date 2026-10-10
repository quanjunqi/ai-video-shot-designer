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
import { useCallback, useMemo, useState } from 'react';
import { useSettingsStore, type CatalogSource } from '@/stores/useSettingsStore';
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
  model?: CatalogModel;
  channel?: ChannelConfig;
  selectModel(id: string): void;
  schema: ControlSchema;
  /** 当前生效值（schema 默认值 + 用户改动） */
  values: Record<string, string>;
  setValue(key: string, value: string): void;
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

  // 首选模型：用户显式选择 → 设置中心的默认模型 → 目录首个可运行模型
  const [selectedId, setSelectedId] = useState('');
  const preferred =
    kind === 'image' ? preferences.defaultImageModel : kind === 'video' ? preferences.defaultVideoModel : '';
  const model = useMemo(() => {
    const explicit = available.find((m) => m.id === selectedId);
    if (explicit) return explicit;
    const byPreference = available.find((m) => m.id === preferred);
    return byPreference ?? available[0];
  }, [available, selectedId, preferred]);

  const schema = useMemo(() => buildControlSchema(model, kind), [model, kind]);

  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const values = useMemo(() => ({ ...initialValues(schema), ...overrides }), [schema, overrides]);

  // 参考附件计数：按模型上限**派生**收紧，而不是用 effect 改 state。
  // 切到上限更低的模型时计数立即收敛（不会出现"已挂载但非法"的中间态），
  // 切回上限更高的模型时原始计数自然恢复。UI 应在达到上限时禁用添加入口。
  // 调用方需注意：引用条数组本身仍由 composer 依 schema.limits.maxRefImages 裁剪（TASK-CREATE-002）。
  const [rawRefCount, setRefCount] = useState(0);
  const [rawAudioRefCount, setAudioRefCount] = useState(0);
  const refCount = Math.min(rawRefCount, schema.limits.maxRefImages);
  const audioRefCount = Math.min(rawAudioRefCount, schema.limits.maxRefAudios);

  const setValue = useCallback((key: string, value: string) => {
    setOverrides((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetDraft = useCallback(() => {
    setOverrides({});
    setRefCount(0);
    setAudioRefCount(0);
  }, []);

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
    model,
    channel: channels.find((c) => c.id === model?.channelId),
    selectModel: setSelectedId,
    schema,
    values,
    setValue,
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
