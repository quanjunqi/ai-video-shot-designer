// 渠道同步配置的**生效规则**（ADR-009 决定 2：同步配置跟着渠道走）。
//
// 这条规则在前后端必须一致 —— 后端 `SyncChannel` 的实现是：
//   「工作区渠道自己配了同步 ⇒ 用它；否则退回平台渠道」
// 所以前端显示也必须按同一优先级，否则会出现"界面显示未配置、实际在用平台配置"
// 这种最坏情况：用户以为没配，点击同步却真的去调上游。
import type { ChannelConfig } from '@/config/models/model-catalog';
import type { UserChannelItem } from '@/lib/api/client';

/** 视为"没配置"的取值：空串与 'none'。 */
export function isSyncConfigured(kind: string | undefined | null): boolean {
  return Boolean(kind) && kind !== 'none';
}

export interface EffectiveSync {
  syncKind: ChannelConfig['syncKind'];
  syncModelsPath?: string;
  syncPricingPath?: string;
  /** 配置来自哪一侧 —— 界面要如实告诉用户，不能含糊 */
  source: 'workspace' | 'platform' | 'none';
}

/**
 * 计算某渠道**实际生效**的同步配置。
 *
 * @param userChannel 工作区自己的渠道行（没有则为 undefined）
 * @param platform    平台目录里的同名行（作为退回）
 */
export function effectiveSync(
  userChannel: Pick<UserChannelItem, 'syncKind' | 'syncModelsPath' | 'syncPricingPath'> | undefined,
  platform: Pick<ChannelConfig, 'syncKind' | 'syncModelsPath' | 'syncPricingPath'> | undefined,
): EffectiveSync {
  if (isSyncConfigured(userChannel?.syncKind)) {
    return {
      syncKind: userChannel?.syncKind as ChannelConfig['syncKind'],
      syncModelsPath: userChannel?.syncModelsPath,
      syncPricingPath: userChannel?.syncPricingPath,
      source: 'workspace',
    };
  }
  if (isSyncConfigured(platform?.syncKind)) {
    return {
      syncKind: platform?.syncKind,
      syncModelsPath: platform?.syncModelsPath,
      syncPricingPath: platform?.syncPricingPath,
      source: 'platform',
    };
  }
  return { syncKind: 'none', source: 'none' };
}

/** 同步配置来源的中文说明（界面直接显示，避免"看起来没配其实在用"）。 */
export function describeSyncSource(source: EffectiveSync['source']): string {
  switch (source) {
    case 'workspace':
      return '来自本工作区配置（可在渠道编辑里修改）';
    case 'platform':
      return '来自平台配置（工作区不可改；如需覆盖，请在本渠道配置同步）';
    default:
      return '未配置同步';
  }
}
