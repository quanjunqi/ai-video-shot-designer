// 视频衔接策略（平台规则 · 可配置）
// 定义生成当前单元时参考图的组合方式（模型调用参数；与连续性台账互补，不冲突）：
// - none 不衔接：不使用其他镜头的图参与衔接，仅用当前镜头自己的首帧或参考图
// - first_last_frame 开启首尾帧：当前视频结尾参考下一个分镜首帧；i2v 优先「当前首帧 + 下个分镜首帧」首尾帧，
//   多参模式把下个分镜首帧作为额外参考图
// 解析优先级：单元覆盖（UnitItem.transitionMode）> 执行目标锁定（executionTarget.transitionMode）> 项目默认 > 平台默认
export const TRANSITION_MODES = [
  {
    id: 'none',
    label: '不衔接',
    desc: '不使用其他镜头的图参与衔接，仅用当前镜头自己的首帧或参考图',
  },
  {
    id: 'first_last_frame',
    label: '开启首尾帧',
    desc: '开启后会让当前视频结尾参考下一个分镜镜头。i2v 模式会优先使用「当前首帧 + 下个分镜首帧」的首尾帧，多参模式会把下个分镜首帧作为额外参考图',
  },
] as const;

export type TransitionMode = (typeof TRANSITION_MODES)[number]['id'];

export const TRANSITION_POLICY = {
  version: '1.0',
  /** 平台默认：开启首尾帧（漫剧追求镜头间动作/构图衔接；独立镜头可在单元级改为不衔接） */
  defaultMode: 'first_last_frame' as TransitionMode,
  note: '平台默认开启首尾帧；连续性台账决定参考图的事实来源（上单元真实尾帧 → 本单元），衔接模式决定参考图的组合方式（顺向参考下单元首帧）',
} as const;

/** 项目默认 > 平台默认 */
export function resolveTransitionDefault(mode?: TransitionMode): TransitionMode {
  return mode ?? TRANSITION_POLICY.defaultMode;
}

export function transitionLabel(mode: TransitionMode): string {
  return TRANSITION_MODES.find((m) => m.id === mode)?.label ?? mode;
}

export function transitionDesc(mode: TransitionMode): string {
  return TRANSITION_MODES.find((m) => m.id === mode)?.desc ?? '';
}
