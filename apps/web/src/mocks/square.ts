// 创作广场数据（演示模式：无后端社区数据，明确标注不伪装真实公开作品）
import type { SquareItem } from '@/types';
import { placeholderUrl } from '@/lib/placeholder';

const AUTHORS = ['阿澈', '苏小满', '白露', '林晚', '老周', '顾北辰', '叶知秋', '江晚晴', '沈墨'];

export const SQUARE_CATEGORIES = ['推荐', '漫剧', '短片', '广告', 'MV', '教育'];

export const SQUARE_ITEMS: SquareItem[] = [
  { id: 'sq-01', title: '雾都侦探社·夜行篇', category: '漫剧', cover: placeholderUrl('sq-01'), author: AUTHORS[0], kind: '漫剧', model: 'SDXL · Seedance 2.0', reusable: true },
  { id: 'sq-02', title: '像素咖啡馆', category: '短片', cover: placeholderUrl('sq-02'), author: AUTHORS[1], kind: '短片', model: 'Flux · Seedance 2.5', reusable: false },
  { id: 'sq-03', title: '一口好茶', category: '广告', cover: placeholderUrl('sq-03'), author: AUTHORS[2], kind: '广告', model: 'MJ-V6 · Seedance 2.0', reusable: true },
  { id: 'sq-04', title: '夏夜蝉鸣', category: 'MV', cover: placeholderUrl('sq-04'), author: AUTHORS[3], kind: 'MV', model: 'Flux · Seedance 2.0', reusable: true },
  { id: 'sq-05', title: '三分钟读懂黑洞', category: '教育', cover: placeholderUrl('sq-05'), author: AUTHORS[4], kind: '教育', model: 'SDXL', reusable: true },
  { id: 'sq-06', title: '星海拾遗·预告', category: '漫剧', cover: placeholderUrl('sq-06'), author: AUTHORS[5], kind: '漫剧', model: 'SDXL · Seedance 2.0', reusable: false },
  { id: 'sq-07', title: '地铁里的诗人', category: '短片', cover: placeholderUrl('sq-07'), author: AUTHORS[6], kind: '短片', model: 'Flux', reusable: true },
  { id: 'sq-08', title: '机械心脏', category: '广告', cover: placeholderUrl('sq-08'), author: AUTHORS[7], kind: '广告', model: 'MJ-V6', reusable: false },
  { id: 'sq-09', title: '山海回声', category: 'MV', cover: placeholderUrl('sq-09'), author: AUTHORS[8], kind: 'MV', model: 'Seedance 2.5', reusable: true },
  { id: 'sq-10', title: '十分钟学会分镜', category: '教育', cover: placeholderUrl('sq-10'), author: AUTHORS[1], kind: '教育', model: '—', reusable: true },
  { id: 'sq-11', title: '外卖骑士奇谭', category: '漫剧', cover: placeholderUrl('sq-11'), author: AUTHORS[0], kind: '漫剧', model: 'Flux · Seedance 2.5', reusable: true },
  { id: 'sq-12', title: '天台演唱会', category: '短片', cover: placeholderUrl('sq-12'), author: AUTHORS[3], kind: '短片', model: 'SDXL', reusable: false },
  { id: 'sq-13', title: '指尖的温度', category: '广告', cover: placeholderUrl('sq-13'), author: AUTHORS[2], kind: '广告', model: 'Flux', reusable: true },
  { id: 'sq-14', title: '月光航线', category: 'MV', cover: placeholderUrl('sq-14'), author: AUTHORS[5], kind: 'MV', model: 'Seedance 2.0', reusable: true },
  { id: 'sq-15', title: '名画背后的故事', category: '教育', cover: placeholderUrl('sq-15'), author: AUTHORS[6], kind: '教育', model: '—', reusable: true },
  { id: 'sq-16', title: '长安拾遗·同人篇', category: '漫剧', cover: placeholderUrl('sq-16'), author: AUTHORS[7], kind: '漫剧', model: 'SDXL · Seedance 2.0', reusable: false },
  { id: 'sq-17', title: '最后一班公交', category: '短片', cover: placeholderUrl('sq-17'), author: AUTHORS[4], kind: '短片', model: 'MJ-V6', reusable: true },
  { id: 'sq-18', title: '灵感咖啡机', category: '广告', cover: placeholderUrl('sq-18'), author: AUTHORS[7], kind: '广告', model: 'Flux', reusable: true },
  { id: 'sq-19', title: '城市脉搏', category: 'MV', cover: placeholderUrl('sq-19'), author: AUTHORS[0], kind: 'MV', model: 'Seedance 2.5', reusable: false },
  { id: 'sq-20', title: '用镜头讲故事', category: '教育', cover: placeholderUrl('sq-20'), author: AUTHORS[1], kind: '教育', model: '—', reusable: true },
];
