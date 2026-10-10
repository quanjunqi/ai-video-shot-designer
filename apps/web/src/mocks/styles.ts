// 内置默认视觉风格（风格库首次初始化种子；用户可在风格库管理中增删改/停用）
import type { StyleOption } from '@/types';
import { placeholderUrl } from '@/lib/placeholder';

export const DEFAULT_STYLE_OPTIONS: StyleOption[] = [
  { id: 'cel', name: '赛璐璐动画', version: 'v2.3', description: '日式动画平涂，轮廓清晰，适合奇幻/冒险题材', cover: placeholderUrl('style-cel'), prompt: 'cel shaded anime style, clean bold outlines, flat color blocks, vibrant saturated colors, classic japanese animation aesthetic, clean lineart, cel shading, no gradients' },
  { id: 'ink', name: '水墨国风', version: 'v1.8', description: '宣纸质感 + 墨色晕染，适合武侠/历史题材', cover: placeholderUrl('style-ink'), prompt: 'chinese ink wash painting style, rice paper texture, sumi-e ink bleeding, traditional chinese aesthetic, monochrome ink tones, subtle color accents, brush stroke texture, oriental painting style' },
  { id: 'american', name: '美漫厚涂', version: 'v2.1', description: '高对比厚涂，肌肉与光影强化，适合动作/超级英雄', cover: placeholderUrl('style-american'), prompt: 'american comic style, bold ink outlines, dramatic high contrast lighting, heavy cel shading, dynamic action poses, superhero comic aesthetic, strong shadows, vibrant primary colors' },
  { id: 'korean', name: '韩漫柔光', version: 'v3.0', description: '柔光渐变 + 精致五官，适合都市/情感题材', cover: placeholderUrl('style-korean'), prompt: 'korean manhwa style, soft gradient lighting, delicate refined facial features, smooth skin rendering, warm soft color palette, webtoon aesthetic, gentle shadows, polished illustration style' },
  { id: 'pixar3d', name: '3D 皮克斯风', version: 'v1.5', description: '圆润三维渲染，亲和力强，适合合家欢/治愈题材', cover: placeholderUrl('style-pixar'), prompt: '3D pixar style render, rounded cute character design, subsurface scattering skin, global illumination, soft cinematic lighting, high quality 3D render, friendly expressive characters, disney pixar aesthetic' },
  { id: 'realism', name: '写实电影感', version: 'v2.0', description: '电影级光影与景深，适合悬疑/现实题材', cover: placeholderUrl('style-realism'), prompt: 'cinematic realistic style, photorealistic rendering, shallow depth of field, dramatic film lighting, anamorphic lens flare, color graded, hyper detailed, 8k resolution, professional cinematography, film grain texture' },
  { id: 'pixel', name: '像素复古', version: 'v1.2', description: '8-bit 像素风，适合怀旧/游戏化题材', cover: placeholderUrl('style-pixel'), prompt: 'pixel art style, 8-bit retro game aesthetic, limited color palette, blocky pixelated rendering, nostalgic video game style, crisp pixel edges, chiptune vibe, classic game sprite style' },
  { id: 'cyber', name: '赛博霓虹', version: 'v2.7', description: '霓虹光效 + 金属质感，适合科幻/都市题材', cover: placeholderUrl('style-cyber'), prompt: 'cyberpunk style, neon glow lighting, metallic reflective surfaces, rain soaked streets, holographic effects, high contrast dark atmosphere, pink and cyan neon colors, futuristic sci-fi aesthetic, blade runner vibe' },
];

// 兼容别名（组件已改读 useStyleStore；此处保留供 store 初始化与历史引用）
export const STYLE_OPTIONS = DEFAULT_STYLE_OPTIONS;

export const STYLE_NAME_BY_ID: Record<string, string> = Object.fromEntries(
  DEFAULT_STYLE_OPTIONS.map((s) => [s.id, s.name]),
);

export const STYLE_VERSION_BY_ID: Record<string, string> = Object.fromEntries(
  DEFAULT_STYLE_OPTIONS.map((s) => [s.id, s.version]),
);
