// EXPORTS: placeholderUrl(seed: string): string

const BASE = (import.meta.env.MIAODA_CLIENT_BASE_PATH || '').replace(/\/$/, '') + '/';

const PLACEHOLDER_COUNT = 24;

/** 根据任意字符串 seed 稳定映射到本地占位图（public/placeholders/p00~p23.jpg） */
export function placeholderUrl(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const idx = hash % PLACEHOLDER_COUNT;
  return `${BASE}placeholders/p${String(idx).padStart(2, '0')}.jpg`;
}
