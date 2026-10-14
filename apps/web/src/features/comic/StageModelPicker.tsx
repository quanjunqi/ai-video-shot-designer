// 阶段级模型选择器（L6：每个阶段随时换模型）
// 生效顺序：阶段覆盖(episode.stageModels) → 项目默认(仅图片/视频) → 目录该类型首项
// 切换写入剧集级 stageModels（persist），换模型即影响该阶段真实执行与容量展示。
import { useMemo } from 'react';
import { Check, ChevronDown, Wand2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useEpisodeStore } from '@/stores/useEpisodeStore';
import { useProjectStore } from '@/stores/useProjectStore';
import type { EpisodeStage, StageModelSlot } from '@/types';
import type { ModelType } from '@/config/models/model-catalog';

const TYPE_KEY: Record<Exclude<ModelType, 'all'>, 'text' | 'image' | 'video'> = {
  text: 'text',
  image: 'image',
  video: 'video',
};

export default function StageModelPicker({
  stage,
  type,
  label,
  episodeId,
  onResolve,
  hint,
}: {
  stage: EpisodeStage;
  type: Exclude<ModelType, 'all'>;
  label: string;
  episodeId: string;
  /** 模型解析回调（如 analyze 阶段视频模型 → 容量重映射） */
  onResolve?: (model: { id: string; name: string; maxUnitSeconds: number }) => void;
  hint?: string;
}) {
  const models = useSettingsStore((s) => s.models);
  const episode = useEpisodeStore((s) => s.episodes.find((e) => e.id === episodeId));
  const project = useProjectStore((s) => s.projects.find((p) => p.id === episode?.projectId));

  // 目录候选：按类型过滤 + 启用 + 排序
  const options = useMemo(
    () =>
      models
        .filter((m) => m.type === type && m.status === 'enabled')
        .sort((a, b) => a.sort - b.sort),
    [models, type],
  );

  const slot = episode?.stageModels?.[stage] as StageModelSlot | undefined;

  // 生效模型 id：阶段覆盖 → 项目默认（name→id）→ 目录首项
  // 刻意不用 useMemo：options 本身已 memo，依赖数组无论写 options 还是 models 都会
  // 与 React Compiler 的推断冲突（preserve-manual-memoization / exhaustive-deps 二选一），
  // 列表规模小，直接计算即可。
  const effectiveId = (() => {
    if (slot?.[TYPE_KEY[type]]) return slot[TYPE_KEY[type]] as string;
    if (type === 'text' && project?.defaultTextModel) {
      const hit = options.find((m) => m.name === project.defaultTextModel);
      if (hit) return hit.id;
    }
    if (type === 'image' && project?.defaultImageModel) {
      const hit = options.find((m) => m.name === project.defaultImageModel);
      if (hit) return hit.id;
    }
    if (type === 'video' && project?.defaultVideoModel) {
      const hit = options.find((m) => m.name === project.defaultVideoModel);
      if (hit) return hit.id;
    }
    return options[0]?.id ?? '';
  })();

  const effective = options.find((m) => m.id === effectiveId) ?? null;

  // 来源标注：阶段覆盖 / 项目默认 / 目录默认
  const sourceTag = slot?.[TYPE_KEY[type]]
    ? '阶段覆盖'
    : project?.defaultTextModel && type === 'text' && options.find((m) => m.name === project.defaultTextModel)
      ? '项目默认'
      : project?.defaultImageModel && type === 'image' && options.find((m) => m.name === project.defaultImageModel)
        ? '项目默认'
        : project?.defaultVideoModel && type === 'video' && options.find((m) => m.name === project.defaultVideoModel)
          ? '项目默认'
          : '目录默认';

  const change = (id: string) => {
    const cur = { ...(episode?.stageModels ?? {}) };
    const next = { ...(cur[stage] as StageModelSlot | undefined) };
    next[TYPE_KEY[type]] = id;
    cur[stage] = next;
    useEpisodeStore.getState().updateEpisode(episodeId, { stageModels: cur });
    const hit = options.find((m) => m.id === id);
    if (hit && onResolve) {
      const cap = hit.capability as { maxUnitSeconds?: number };
      onResolve({ id: hit.id, name: hit.name, maxUnitSeconds: cap?.maxUnitSeconds ?? 15 });
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Wand2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="text-xs text-muted-foreground whitespace-nowrap">{label}</span>
      <Select value={effective?.id ?? ''} onValueChange={change}>
        <SelectTrigger className="h-7 w-auto min-w-[150px] text-xs gap-1">
          <SelectValue placeholder="选择模型" />
          <ChevronDown className="h-3 w-3 opacity-50" />
        </SelectTrigger>
        <SelectContent>
          {options.map((m) => (
            <SelectItem key={m.id} value={m.id} className="text-xs">
              <span className="flex items-center gap-2">
                <span>{m.name}</span>
                <span className="text-3xs text-muted-foreground">{m.family || m.channelId}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {effective && (
        <span
          className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-3xs leading-none ${
            sourceTag === '阶段覆盖' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
          }`}
        >
          <Check className="h-2.5 w-2.5" />
          {sourceTag}
        </span>
      )}
      {hint && <span className="text-3xs text-muted-foreground">{hint}</span>}
    </div>
  );
}
