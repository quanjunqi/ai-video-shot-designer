// 容量策略（平台规则 · 可配置）
// 模型 ↔ 最大生成单元秒数映射 + 忠实呈现下限估算 + 容量说明文案
// 原则：容量只约束单元打包（平台层），不绑定创作粒度（节拍分段在创作层先行完成）
// 模型目录（model-catalog）优先：视频模型 maxDurationSeconds 派生；本文件为平台默认兜底
import type { ExecutionTarget } from '@/types';
import { maxUnitSecondsForModel, catalogCapacityNote } from '@/config/models/model-catalog';

/** 各视频模型的最大生成单元秒数 */
export const MODEL_CAPACITY: Record<string, number> = {
  'MiniMax H3': 15,
  'Seedance 2.5': 30,
  'Seedance 2.0': 15,
  'Kling 1.6': 15,
};

/** 容量无关的忠实呈现下限估算（秒）：按戏剧内容估计的最短完整呈现时长 */
export const FAITHFUL_MIN_SECONDS = 71;

/** 未知模型的安全默认（秒） */
export const DEFAULT_MAX_UNIT_SECONDS = 15;

export function resolveMaxUnitSeconds(model: string): number {
  // 目录派生优先（模型能力 maxDurationSeconds），未知模型回退平台默认映射
  return maxUnitSecondsForModel(model) !== 15 || MODEL_CAPACITY[model] === undefined
    ? maxUnitSecondsForModel(model)
    : MODEL_CAPACITY[model] ?? DEFAULT_MAX_UNIT_SECONDS;
}

/** 按执行目标生成容量说明（容量大 → 可容纳完整轮次、切点少；容量小 → 切点多、台账负担重） */
export function capacityNoteFor(target: ExecutionTarget): string {
  return catalogCapacityNote(target);
}
