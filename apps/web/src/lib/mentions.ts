// @引用解析：从提示词文本匹配 三类引用——
//   本图参考（@本图1 / @首帧 / @尾帧，上传即编号）、
//   项目资产（@资产名，绑定当前版本）、
//   镜头模板（@镜头名）
import type { Asset } from '@/types';
import { LENS_ITEMS } from '@/mocks/lens';

export interface MentionRef {
  kind: 'local' | 'asset' | 'lens';
  id: string;
  name: string;
  thumb?: string;
  version?: number;
  category?: string;
}

export interface LocalRef {
  id: string;
  name: string; // 本图1 / 首帧 / 尾帧
  thumb: string;
}

/** token = @名称，名称内不含空白与中英文标点 */
export function parseMentions(
  text: string,
  assets: Asset[],
  localRefs: LocalRef[] = [],
): { mentions: MentionRef[]; unresolved: string[] } {
  const tokens = text.match(/@([^\s@，。,.!！?？;；、]+)/g) ?? [];
  const seen = new Set<string>();
  const mentions: MentionRef[] = [];
  const unresolved: string[] = [];
  for (const raw of tokens) {
    const name = raw.slice(1);
    if (seen.has(name)) continue;
    seen.add(name);
    const lr = localRefs.find((x) => x.name === name);
    if (lr) {
      mentions.push({ kind: 'local', id: lr.id, name, thumb: lr.thumb });
      continue;
    }
    const a = assets.find((x) => x.name === name);
    if (a) {
      mentions.push({ kind: 'asset', id: a.id, name, thumb: a.imageUrl, version: a.currentVersion });
      continue;
    }
    const l = LENS_ITEMS.find((x) => x.name === name);
    if (l) {
      mentions.push({ kind: 'lens', id: l.id, name, thumb: l.cover, category: l.category });
      continue;
    }
    unresolved.push(name);
  }
  return { mentions, unresolved };
}
