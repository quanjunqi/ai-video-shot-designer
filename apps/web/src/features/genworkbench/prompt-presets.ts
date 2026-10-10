// EXPORTS: toggleFragment, appendFragment, removeFragment, isFragmentApplied, normalizeFragment, type FragmentToggle
//
// 提示词片段（风格预设 / 镜头语言）与提示词的组合逻辑（ADR-006 D7）。
//
// 设计取舍：**单向追加，不做双向绑定**。
// 提示词是用户可自由编辑的 textarea；若把「已选风格」做成独立状态再合成提示词，
// 用户一旦手改文本就会与状态失配（改哪边算准？）。因此这里把片段当作**纯文本操作**：
// 点一下把片段文字并进提示词，再点一下把这段文字精确移除；
// chip 的高亮状态由「提示词里现在是否含这段文字」派生，永远与文本一致。
import type { StyleEntry } from '@/types';
import type { LensItem } from '@/types';

/** 片段与提示词之间的分隔（中英混排场景用逗号 + 空格更安全） */
const SEPARATOR = ', ';

/** 归一化：仅用于「是否已包含」的比较，不改变实际写入的文本 */
export function normalizeFragment(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** 提示词里是否已包含该片段（按归一化后的子串判断） */
export function isFragmentApplied(prompt: string, fragment: string): boolean {
  const needle = normalizeFragment(fragment);
  if (needle === '') return false;
  return normalizeFragment(prompt).includes(needle);
}

/** 追加片段：已包含则原样返回（幂等，避免重复点出现两次） */
export function appendFragment(prompt: string, fragment: string): string {
  const addition = fragment.trim();
  if (addition === '') return prompt;
  if (isFragmentApplied(prompt, addition)) return prompt;
  const base = prompt.trim();
  return base === '' ? addition : `${base}${SEPARATOR}${addition}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 移除片段：按「词序列 + 允许其间任意空白/逗号」匹配原文再删掉，并收拾多余分隔符。
 * 不能用 `prompt.split(',')` —— 片段自身常含逗号（风格提示词就是一长串逗号分隔的词），
 * 按逗号切会把一个片段切碎，导致永远匹配不上。
 * 找不到则原样返回（用户可能已经手动删掉了）。
 */
export function removeFragment(prompt: string, fragment: string): string {
  const words = fragment.trim().split(/\s+/).filter((word) => word !== '').map(escapeRegExp);
  if (words.length === 0) return prompt;
  const match = new RegExp(words.join('[\\s,]*'), 'i').exec(prompt);
  if (!match) return prompt;
  const before = prompt.slice(0, match.index);
  const after = prompt.slice(match.index + match[0].length);
  return `${before}${after}`
    .replace(/\s*,\s*,\s*/g, SEPARATOR) // 片段两侧各留一个逗号时合并
    .replace(/^\s*,\s*/, '')
    .replace(/\s*,\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface FragmentToggle {
  prompt: string;
  /** 操作后该片段是否处于已应用状态 */
  applied: boolean;
}

/** 切换片段（chip 的点击语义） */
export function toggleFragment(prompt: string, fragment: string): FragmentToggle {
  if (isFragmentApplied(prompt, fragment)) {
    return { prompt: removeFragment(prompt, fragment), applied: false };
  }
  return { prompt: appendFragment(prompt, fragment), applied: true };
}

/** 风格条目 → 可插入的提示词片段（prompt 缺省时回退 description，与风格库既有约定一致） */
export function styleFragment(style: Pick<StyleEntry, 'prompt' | 'description'>): string {
  return (style.prompt ?? style.description).trim();
}

/** 镜头语言条目 → 可插入的提示词片段（优先英文 prompt，缺省回退镜头参数） */
export function lensFragment(item: Pick<LensItem, 'prompt' | 'shotParams'>): string {
  return (item.prompt.trim() !== '' ? item.prompt : item.shotParams).trim();
}
