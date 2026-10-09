// 镜头语言库（12 条：名称/适用场景/镜头参数/示例 Prompt）
import type { LensItem } from '@/types';
import { placeholderUrl } from '@/lib/placeholder';

export const LENS_CATEGORIES = ['景别', '运镜', '调度', '光线', '剪辑'];

export const LENS_ITEMS: LensItem[] = [
  { id: 'lens-01', name: '远景建立镜头', category: '景别', cover: placeholderUrl('lens-01'), prompt: 'wide establishing shot, environment storytelling, cinematic', shotParams: '焦段 24mm · 固定机位', usage: '开篇交代环境与时代氛围' },
  { id: 'lens-02', name: '全景人物入画', category: '景别', cover: placeholderUrl('lens-02'), prompt: 'full body shot, character enters frame, depth of field', shotParams: '焦段 35mm · 低机位', usage: '角色登场或空间关系交代' },
  { id: 'lens-03', name: '中景双人对话', category: '景别', cover: placeholderUrl('lens-03'), prompt: 'medium two shot, dialogue scene, over shoulder feel', shotParams: '焦段 50mm · 过肩', usage: '两人对白、立场对峙' },
  { id: 'lens-04', name: '近景情绪捕捉', category: '景别', cover: placeholderUrl('lens-04'), prompt: 'close up, emotional beat, shallow depth of field', shotParams: '焦段 85mm · f1.8', usage: '情绪转折、关键反应' },
  { id: 'lens-05', name: '特写细节揭示', category: '景别', cover: placeholderUrl('lens-05'), prompt: 'extreme close up, detail reveal, macro texture', shotParams: '焦段 100mm 微距', usage: '道具线索、表情微变化' },
  { id: 'lens-06', name: '跟拍长镜头', category: '运镜', cover: placeholderUrl('lens-06'), prompt: 'tracking shot, continuous movement, immersive', shotParams: '轨道跟拍 · 匀速', usage: '开场引导、追逐戏' },
  { id: 'lens-07', name: '手持呼吸感', category: '运镜', cover: placeholderUrl('lens-07'), prompt: 'handheld camera, subtle shake, documentary energy', shotParams: '手持 · 轻微晃动', usage: '冲突现场、不稳定情绪' },
  { id: 'lens-08', name: '环绕揭示', category: '运镜', cover: placeholderUrl('lens-08'), prompt: 'orbiting shot, reveal composition, slow arc', shotParams: '摇臂环绕 180°', usage: '揭示主体全貌或反转' },
  { id: 'lens-09', name: '双人调度换位', category: '调度', cover: placeholderUrl('lens-09'), prompt: 'blocking swap, two characters exchange positions', shotParams: '走位换位 · 一镜', usage: '权力关系变化的对白' },
  { id: 'lens-10', name: '低角度压迫', category: '调度', cover: placeholderUrl('lens-10'), prompt: 'low angle shot, power dynamic, imposing scale', shotParams: '贴地机位 · 仰角 30°', usage: '威胁感、力量对比' },
  { id: 'lens-11', name: '剪影轮廓光', category: '光线', cover: placeholderUrl('lens-11'), prompt: 'rim light silhouette, dramatic backlight', shotParams: '逆光 · 轮廓光', usage: '神秘登场、黄昏告别' },
  { id: 'lens-12', name: '雾夜冷调', category: '光线', cover: placeholderUrl('lens-12'), prompt: 'foggy night, cold color grade, low visibility', shotParams: '冷色温 4800K · 雾机', usage: '悬疑氛围、记忆闪回' },
];
