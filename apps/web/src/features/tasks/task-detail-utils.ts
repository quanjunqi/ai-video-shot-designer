// EXPORTS: displayParameterValue, parameterRows, type TaskParameterRow
//
// 任务详情抽屉的展示侧纯逻辑（TASK-OBS-001）。解析 intent_payload / result_payload 一律复用
// `features/genworkbench/result-utils.ts`（parseTaskPayload / extractResultUrl），本文件只做
// 「参数值 → 可渲染文本」的收敛，不重复实现解析。
//
// 为什么需要收敛：契约里 intent_payload 是自由 JSON（oneOf：对象 / JSON 字符串 / null），
// `parameters` 的值运行时不保证是字符串。把对象直接塞进 React 子节点会整抽屉白屏，
// 所以渲染前统一归一到字符串（数组/对象 JSON 化，null 记破折号）。
import type { TaskPayload } from '@/features/genworkbench/result-utils';

export interface TaskParameterRow {
  key: string;
  value: string;
}

/** 参数值归一为可渲染文本：字符串原样、null/undefined 记破折号、数字/布尔字符串化、其余 JSON 化 */
export function displayParameterValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    // 循环引用等无法序列化：退化为 String() 的人类可读形式，但绝不抛
    return String(value);
  }
}

/** 提交时的参数快照行；保持 payload 里的键序，便于与提交表单逐项对照 */
export function parameterRows(payload: TaskPayload): TaskParameterRow[] {
  return Object.entries(payload.parameters ?? {}).map(([key, value]) => ({
    key,
    value: displayParameterValue(value),
  }));
}
