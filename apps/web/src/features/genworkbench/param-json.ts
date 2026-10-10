// EXPORTS: toParamJson, parseParamJson, type ParamJsonResult
//
// 参数的表单 ⇄ JSON 双视图（ADR-007 专业级改造 / 对齐专业工具研究 B1）：
// 同一份 schema 与同一份值，表单只是它的一个投影；JSON 视图服务于集成方与排障复现
// （fal Playground 的 input-mode selector 就是这个做法）。
//
// 边界（与 ADR-006 D2 红线一致）：
//   · JSON 视图里出现的是**业务参数键**，不是协议字段名；
//   · 不得用它绕过目录去构造任意协议字段 —— 因此解析时**只接受当前 schema 认识的键**，
//     其余键一律报出为 ignoredKeys，绝不悄悄塞进提交负载。
import type { ControlDef } from '@/config/create/control-schema';

/** 当前值 → JSON 文本（按控件顺序，只含 schema 认识的键） */
export function toParamJson(values: Record<string, string>, controls: ControlDef[]): string {
  const ordered: Record<string, string> = {};
  for (const control of controls) {
    ordered[control.key] = values[control.key] ?? control.defaultValue;
  }
  return JSON.stringify(ordered, null, 2);
}

/**
 * 解析结果用**扁平结构**而不是 discriminated union。
 *
 * 原因（值得记一笔）：本仓库 `apps/web/tsconfig.app.json` 是 `"strict": false`，
 * 在这种配置下 TypeScript 对 `{ ok: true } | { ok: false }` 这类**布尔字面量判别联合**
 * 不做收窄，`if (parsed.ok) { parsed.values } else { parsed.error }` 会报
 * "Property 'error' does not exist"。扁平结构 + 可选 error 字段不依赖任何收窄行为。
 */
export interface ParamJsonResult {
  /** 解析成功时的值（失败时为空对象，避免调用方误用半份数据） */
  values: Record<string, string>;
  /** 当前模型不认识、因而被忽略的键（调用方需如实告知用户） */
  ignoredKeys: string[];
  /** 失败原因（存在即失败） */
  error?: string;
}

/**
 * JSON 文本 → 值。只接受对象；标量值接受 string/number/boolean（统一转字符串）。
 * 非法 JSON、数组/标量根、嵌套对象/数组都会给出**可读的字段级原因**，而不是静默失败。
 */
export function parseParamJson(text: string, controls: ControlDef[]): ParamJsonResult {
  const trimmed = text.trim();
  if (trimmed === '') return { values: {}, ignoredKeys: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : '无法解析';
    return { values: {}, ignoredKeys: [], error: `JSON 语法错误：${detail}` };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { values: {}, ignoredKeys: [], error: '顶层必须是对象，例如 {"ratio":"16:9","count":"2"}' };
  }

  const known = new Set(controls.map((control) => control.key));
  const values: Record<string, string> = {};
  const ignoredKeys: string[] = [];
  for (const [key, raw] of Object.entries(parsed as Record<string, unknown>)) {
    if (!known.has(key)) {
      ignoredKeys.push(key);
      continue;
    }
    if (typeof raw === 'string') {
      values[key] = raw;
      continue;
    }
    if (typeof raw === 'number' || typeof raw === 'boolean') {
      values[key] = String(raw);
      continue;
    }
    return {
      values: {},
      ignoredKeys: [],
      error: `字段「${key}」的值必须是字符串、数字或布尔（当前是 ${Array.isArray(raw) ? '数组' : typeof raw}）`,
    };
  }
  return { values, ignoredKeys };
}
