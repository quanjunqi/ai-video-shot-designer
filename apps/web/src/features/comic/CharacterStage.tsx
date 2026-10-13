// EXPORTS: default CharacterStage
// 角色资产（网格+抽屉布局）：角色资产网格为主，点击卡片滑出详情抽屉
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Loader2, Check, X, Globe, Sparkles, CheckCircle2, ChevronRight, ChevronDown,
  Film, Search, Image as ImageIcon, User, Palette,
  RotateCcw, Download, Trash2, Plus, RefreshCw, BookOpen, Link2, ExternalLink, Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useAssetStore } from '@/stores/useAssetStore';
import { useCharacterExtractionRuleStore } from '@/stores/useCharacterExtractionRuleStore';
import { useProjectCharacterStore } from '@/stores/useProjectCharacterStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useStyleStore } from '@/stores/useStyleStore';
import { DEFAULT_STYLE_OPTIONS } from '@/mocks/styles';
import { useShallow } from 'zustand/react/shallow';
import { useFakeGeneration } from '@/hooks/useFakeGeneration';
import { useSettingsStore } from '@/stores/useSettingsStore';
import StageModelPicker from '@/features/comic/StageModelPicker';
import type { ArtifactStatus, Asset, AssetVersion, Episode, Project, ProjectCharacter, ShotCard, StyleEntry, StyleOption } from '@/types';
import type { GenerateResponse, ServerTask } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api/client';
import { resolveTaskResult } from '@/features/genworkbench/result-utils';

const STATUS_META: Record<ArtifactStatus, { label: string; className: string; dot: string }> = {
  DRAFT: { label: '草稿', className: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground' },
  AWAITING_USER: { label: '待审核', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
  USER_APPROVED: { label: '已批准', className: 'bg-success/15 text-success', dot: 'bg-success' },
  USER_REJECTED: { label: '已拒绝', className: 'bg-destructive/10 text-destructive', dot: 'bg-destructive' },
  STALE: { label: '失效', className: 'bg-destructive/10 text-destructive', dot: 'bg-destructive' },
  SUPERSEDED: { label: '已取代', className: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground' },
};

type FilterType = 'all' | 'draft' | 'pending' | 'approved';

// 角色档案结构
interface CharacterProfile {
  // 基本信息
  name: string;
  gender: string;
  age: string;
  identity: string;
  // 外貌特征
  hairstyle: string;
  hairColor: string;
  eyeColor: string;
  facialFeatures: string;
  bodyType: string;
  height: string;
  // 服装描述
  top: string;
  bottom: string;
  shoes: string;
  accessories: string;
  clothingStyle: string;
  // 性格特征
  personality: string;
  typicalExpression: string;
  behavior: string;
  // 其他
  specialMarks: string;
  background: string;
}

// 空角色档案模板
const EMPTY_PROFILE: CharacterProfile = {
  name: '', gender: '', age: '', identity: '',
  hairstyle: '', hairColor: '', eyeColor: '', facialFeatures: '', bodyType: '', height: '',
  top: '', bottom: '', shoes: '', accessories: '', clothingStyle: '',
  personality: '', typicalExpression: '', behavior: '',
  specialMarks: '', background: '',
};

// 分镜统计（与 shotStats useMemo 产物结构一致）
interface ShotStat {
  name: string;
  shotCount: number;
  sceneCount: number;
  emotions: string[];
  shotIds: string[];
  bodyStates: string[];
  costumeStates: string[];
}

// 从分镜统计推断角色档案
function inferProfileFromShots(name: string, shotStat: ShotStat): CharacterProfile {
  const profile = { ...EMPTY_PROFILE, name };
  
  // 从情绪变化推断性格
  if (shotStat.emotions.length > 0) {
    profile.personality = `情绪变化丰富，常见情绪：${shotStat.emotions.join('、')}`;
    profile.typicalExpression = shotStat.emotions[0];
  }
  
  // 从服装状态推断服装类型
  if (shotStat.costumeStates.length > 0) {
    profile.clothingStyle = `服装状态变化：${shotStat.costumeStates.join('、')}`;
  }
  
  // 从身体状态推断角色经历
  if (shotStat.bodyStates.length > 0) {
    profile.background = `剧中经历：${shotStat.bodyStates.join('、')}`;
  }
  
  // 出场统计
  profile.identity = `出场 ${shotStat.shotCount} 镜，覆盖 ${shotStat.sceneCount} 个场景`;
  
  return profile;
}

// 从角色描述字符串解析档案
function parseProfileFromDescription(description: string): CharacterProfile {
  const profile = { ...EMPTY_PROFILE };
  if (!description) return profile;
  
  // 简单的关键词匹配解析
  const patterns: [keyof CharacterProfile, RegExp][] = [
    ['gender', /(男|女|男性|女性|男孩|女孩|少年|少女)/],
    ['age', /(\d+)\s*岁/],
    ['hairstyle', /(长发|短发|卷发|直发|马尾|辫子|光头|齐刘海)/],
    ['hairColor', /(黑色|棕色|金色|银色|白色|红色|蓝色|粉色)头发/],
    ['eyeColor', /(黑色|棕色|蓝色|绿色|金色|红色)眼睛/],
    ['bodyType', /(瘦弱|健壮|苗条|丰满|高大|矮小|匀称)/],
    ['clothingStyle', /(古装|现代|军装|西装|休闲|运动|礼服|校服)/],
  ];
  
  patterns.forEach(([key, regex]) => {
    const match = description.match(regex);
    if (match) {
      profile[key] = match[0];
    }
  });
  
  return profile;
}

// 基于角色档案生成提示词
function generatePromptFromProfile(profile: CharacterProfile): string {
  const parts: string[] = [];
  
  // 身份段
  parts.push(`${profile.name || '角色'}，角色立绘设定图`);
  
  // 外貌段（纯视觉描述）
  const appearanceParts: string[] = [];
  if (profile.gender) appearanceParts.push(profile.gender);
  if (profile.age) appearanceParts.push(`${profile.age}岁`);
  if (profile.hairstyle) appearanceParts.push(profile.hairstyle);
  if (profile.hairColor) appearanceParts.push(`${profile.hairColor}头发`);
  if (profile.eyeColor) appearanceParts.push(`${profile.eyeColor}眼睛`);
  if (profile.facialFeatures) appearanceParts.push(profile.facialFeatures);
  if (profile.bodyType) appearanceParts.push(profile.bodyType);
  if (profile.height) appearanceParts.push(profile.height);
  if (appearanceParts.length > 0) parts.push(appearanceParts.join('，'));
  
  // 服装段（纯视觉描述，区分穿着和佩戴）
  const wearingParts: string[] = [];
  if (profile.top) wearingParts.push(profile.top);
  if (profile.bottom) wearingParts.push(profile.bottom);
  if (profile.shoes) wearingParts.push(profile.shoes);
  if (profile.clothingStyle) wearingParts.push(profile.clothingStyle);
  if (wearingParts.length > 0) parts.push(`穿着${wearingParts.join('，')}`);
  
  // 配饰段（只包含穿戴类配饰，不包含手持道具）
  if (profile.accessories) {
    // 过滤掉明显是道具的词汇（手机、武器、工具等应在道具资产阶段生成）
    const propKeywords = ['手机', '电话', '武器', '刀', '剑', '枪', '工具', '书本', '包', '箱子'];
    const accessoryItems = profile.accessories.split(/[，,、；;]/).filter(item => {
      const trimmed = item.trim();
      return trimmed && !propKeywords.some(keyword => trimmed.includes(keyword));
    });
    if (accessoryItems.length > 0) {
      parts.push(`佩戴${accessoryItems.join('，')}`);
    }
  }
  
  // 表情段（角色立绘用中性表情基线，不放入抽象性格描述）
  // 性格描述不直接放入提示词，AI图像模型无法理解抽象性格
  // 如果需要特定表情，应在单集状态中明确指定视觉化的表情描述
  parts.push('中性表情基线');
  
  // 特殊标记（纯视觉描述，如疤痕、纹身等）
  if (profile.specialMarks) parts.push(profile.specialMarks);
  
  // 构图段（固定）
  parts.push('四视图身份资产：正面全身、90度侧面全身、背面全身、正面胸部以上脸部特写');
  parts.push('完整服装造型，细节清晰');
  parts.push('纯白色背景，Studio Lighting，无阴影，专业设定图风格');
  parts.push('双脚完全入镜，绝不裁切，横向多视图无分割线呈现');
  
  // 质量段（固定）
  parts.push('masterpiece, best quality, ultra detailed, 8k');
  
  return parts.join(', ');
}

// 生成负面提示词（固定）
function generateNegativePrompt(): string {
  return [
    'low quality, blurry, distorted, deformed, watermark, text, signature',
    'extra fingers, missing fingers, fused fingers, too many fingers',
    'bad anatomy, bad proportions, missing limbs, extra limbs',
    'cropped, out of frame, cut off',
    'ugly, duplicate, morbid, mutilated',
    'shadow, dark background, cluttered background',
    'dynamic pose, action scene, environment, props, handheld items, weapons, tools',
    'multiple characters, group photo, crowd',
  ].join(', ');
}

// 从项目级角色设定生成提示词（复用 generatePromptFromProfile）
function toCharacterProfile(pc: ProjectCharacter): CharacterProfile {
  return {
    name: pc.name,
    gender: pc.gender,
    age: pc.age,
    identity: pc.identity,
    hairstyle: pc.hairstyle,
    hairColor: pc.hairColor ?? '',
    eyeColor: pc.eyeColor,
    facialFeatures: pc.facialFeatures,
    bodyType: pc.bodyType,
    height: pc.height ?? '',
    top: pc.top,
    bottom: pc.bottom,
    shoes: pc.shoes,
    accessories: pc.accessories ?? '',
    clothingStyle: pc.clothingStyle,
    personality: pc.personality ?? '',
    typicalExpression: '',
    behavior: '',
    specialMarks: pc.specialMarks,
    background: '',
  };
}

// 项目级角色设定的展示视图：允许读取合并描述（performance）之外的细分展示字段
interface ProjectCharacterView extends ProjectCharacter {
  typicalExpression?: string;
  behavior?: string;
  background?: string;
}

// 从项目级角色设定生成提示词（复用 generatePromptFromProfile）
function generatePromptFromProjectCharacter(pc: ProjectCharacter): string {
  return generatePromptFromProfile(toCharacterProfile(pc));
}

function ProgressRing({ progress, size = 80 }: { progress: number; size?: number }) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - progress / 100);
  return (
    <div className="relative text-primary" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="6" className="stroke-muted" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: offset }}
          transition={{ ease: 'easeOut', duration: 0.25 }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-mono text-sm font-semibold">{progress}%</div>
    </div>
  );
}

// 角色资产网格卡片
function CharacterGridCard({
  char,
  projectCharacter,
  shotCount,
  selected,
  generatingTask,
  onSelect,
  onToggleCheck,
  onDelete,
}: {
  char: Asset;
  projectCharacter?: ProjectCharacter;
  shotCount?: number;
  selected: boolean;
  generatingTask?: { progress: number };
  onSelect: () => void;
  onToggleCheck: (checked: boolean) => void;
  onDelete?: () => void;
}) {
  const meta = STATUS_META[char.status];
  // 优先展示变体立绘，其次标准立绘，最后单集旧imageUrl
  const displayImage = char.variantImageUrl || projectCharacter?.imageUrl || char.imageUrl;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -4 }}
      className="group relative cursor-pointer overflow-hidden rounded-2xl border border-border/60 bg-card/80 shadow-sm backdrop-blur-sm transition-all hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5"
      onClick={onSelect}
    >
      {/* 多选框 */}
      <div
        className="absolute left-3 top-3 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={selected}
          onCheckedChange={(v) => onToggleCheck(Boolean(v))}
          className="h-5 w-5 rounded-md border-2 border-white/30 bg-black/30 backdrop-blur-sm data-[state=checked]:border-primary data-[state=checked]:bg-primary"
        />
      </div>

      {/* 状态标签 */}
      <div className="absolute right-3 top-3 z-10">
        <Badge className={cn('rounded-full px-2.5 py-1 text-[10px] font-semibold shadow-lg backdrop-blur-sm', meta?.className)}>
          {meta?.label ?? char.status ?? '未知'}
        </Badge>
      </div>

      {/* 预览图区域 */}
      <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-muted/50 to-muted/20">
        {generatingTask ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <ProgressRing progress={generatingTask.progress} size={64} />
            <div className="text-center">
              <p className="text-xs font-medium text-foreground">生成中...</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">正在绘制角色立绘</p>
            </div>
          </div>
        ) : displayImage ? (
          <img
            src={displayImage}
            alt={char.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50">
              <User className="h-8 w-8 text-muted-foreground/40" />
            </div>
            <p className="text-[11px] text-muted-foreground">前往项目角色库生成立绘</p>
          </div>
        )}

        {/* hover 遮罩 */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        {/* hover 操作按钮 */}
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <span className="rounded-full bg-black/50 px-2.5 py-1 text-[10px] text-white backdrop-blur-sm">
            v{char.currentVersion}
          </span>
          <div className="flex gap-1.5">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-full bg-white/10 text-white backdrop-blur-sm hover:bg-white/20"
              onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
              title="删除角色"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* 卡片底部信息 */}
      <div className="p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground truncate">{char.name}</h3>
          {char.scope === 'global' && (
            <Globe className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="全局资产" />
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Film className="h-3 w-3" />
            {shotCount || 0} 镜
          </span>
          <span className="text-border">·</span>
          <span>v{char.currentVersion}</span>
        </div>
      </div>
    </motion.div>
  );
}

// 详情抽屉
function CharacterDetailDrawer({
  char,
  shotCount,
  charShots,
  shotStat,
  generatingTask,
  imageModelId,
  imageModelName,
  statement,
  setStatement,
  projectCharacter,
  onClose,
  onGenerate,
  onApprove,
  onReject,
  onToggleGlobal,
  onUpdateDescription,
  onUpdatePrompt,
}: {
  char: Asset;
  shotCount?: number;
  charShots: ShotCard[];
  shotStat?: ShotStat;
  generatingTask?: { progress: number };
  imageModelId: string;
  imageModelName: string;
  statement: string;
  setStatement: (v: string) => void;
  projectCharacter?: ProjectCharacterView;
  onClose: () => void;
  onGenerate: () => void;
  onApprove: () => void;
  onReject: () => void;
  onToggleGlobal: () => void;
  onUpdateDescription: (v: string) => void;
  onUpdatePrompt: (v: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<'info' | 'versions'>('info');
  const [profile, setProfile] = useState<CharacterProfile>(EMPTY_PROFILE);
  const [showProjectDetail, setShowProjectDetail] = useState(false);
  const [episodeVariant, setEpisodeVariant] = useState({
    emotionState: '',
    appearanceChange: '',
    temporaryOutfit: '',
    specialProp: '',
  });
  const [variantInitialized, setVariantInitialized] = useState(false);
  const [imageTab, setImageTab] = useState<'standard' | 'variant'>('standard');
  const meta = STATUS_META[char.status];

  // 当角色切换时，在渲染期间重新解析档案与状态变体（React 19：避免在 effect 内同步 setState）
  const [syncedCharId, setSyncedCharId] = useState<string | null>(null);
  if (syncedCharId !== char.id) {
    setSyncedCharId(char.id);
    const parsed = parseProfileFromDescription(char.description || '');
    parsed.name = char.name;
    setProfile(parsed);
    setVariantInitialized(false);
    if (char.episodeVariant) {
      setEpisodeVariant({
        emotionState: char.episodeVariant.emotionState || '',
        appearanceChange: char.episodeVariant.appearanceChange || '',
        temporaryOutfit: char.episodeVariant.temporaryOutfit || '',
        specialProp: char.episodeVariant.specialProp || '',
      });
    } else {
      setEpisodeVariant({ emotionState: '', appearanceChange: '', temporaryOutfit: '', specialProp: '' });
    }
  }

  // 初始化宽限期：100ms 内不把「角色切换触发的状态变体重置」误判为用户编辑并保存
  useEffect(() => {
    const t = setTimeout(() => setVariantInitialized(true), 100);
    return () => clearTimeout(t);
  }, [char.id]);

  // 状态变体变化时保存到后端
  useEffect(() => {
    if (!variantInitialized) return;
    const { updateAsset } = useAssetStore.getState();
    updateAsset(char.id, { episodeVariant: { ...episodeVariant } });
  }, [episodeVariant, char.id]);

  // 更新档案字段
  const updateProfileField = (field: keyof CharacterProfile, value: string) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  // 从分镜提取档案
  const extractFromShots = () => {
    if (!shotStat) {
      toast.error('未找到该角色的分镜数据');
      return;
    }
    const inferred = inferProfileFromShots(char.name, shotStat);
    // 合并已有档案，保留用户已填写的字段
    setProfile((prev) => ({
      ...inferred,
      // 保留用户已填写的非空字段
      gender: prev.gender || inferred.gender,
      age: prev.age || inferred.age,
      hairstyle: prev.hairstyle || inferred.hairstyle,
      hairColor: prev.hairColor || inferred.hairColor,
      eyeColor: prev.eyeColor || inferred.eyeColor,
      facialFeatures: prev.facialFeatures || inferred.facialFeatures,
      bodyType: prev.bodyType || inferred.bodyType,
      height: prev.height || inferred.height,
      top: prev.top || inferred.top,
      bottom: prev.bottom || inferred.bottom,
      shoes: prev.shoes || inferred.shoes,
      accessories: prev.accessories || inferred.accessories,
      clothingStyle: prev.clothingStyle || inferred.clothingStyle,
      personality: prev.personality || inferred.personality,
      typicalExpression: prev.typicalExpression || inferred.typicalExpression,
      behavior: prev.behavior || inferred.behavior,
      specialMarks: prev.specialMarks || inferred.specialMarks,
      background: prev.background || inferred.background,
      identity: inferred.identity, // 身份总是从分镜更新
    }));
    toast.success('已从分镜提取角色信息');
  };

  // 基于档案生成提示词（合并项目级设定 + 单集状态覆盖）
  const generatePromptFromProfileHandler = () => {
    // 如果引用了项目级设定，优先使用项目级设定，单集状态覆盖特定字段
    let finalProfile = { ...profile };
    if (projectCharacter) {
      const base = toCharacterProfile(projectCharacter);
      finalProfile = {
        ...base,
        name: profile.name || base.name,
        // 单集状态覆盖：只覆盖本集特有的变化
        personality: profile.personality || base.personality,
        typicalExpression: profile.typicalExpression || base.typicalExpression,
        specialMarks: profile.specialMarks || base.specialMarks,
        // 单集临时换装覆盖
        top: profile.top || base.top,
        bottom: profile.bottom || base.bottom,
        shoes: profile.shoes || base.shoes,
        accessories: profile.accessories || base.accessories,
        clothingStyle: profile.clothingStyle || base.clothingStyle,
      };
    }
    const prompt = generatePromptFromProfile(finalProfile);
    const negativePrompt = generateNegativePrompt();
    onUpdatePrompt(prompt);
    // 同时更新描述为结构化档案
    const descParts = [
      profile.gender && profile.age ? `${profile.gender}，${profile.age}` : profile.gender || profile.age,
      profile.hairstyle && profile.hairColor ? `${profile.hairColor}${profile.hairstyle}` : profile.hairstyle || profile.hairColor,
      profile.eyeColor && `${profile.eyeColor}眼睛`,
      profile.facialFeatures,
      profile.bodyType,
      [profile.top, profile.bottom, profile.shoes].filter(Boolean).join('，'),
      profile.accessories,
      profile.clothingStyle,
      profile.personality,
      profile.specialMarks,
    ].filter(Boolean).join('，');
    if (descParts.length > 0) {
      onUpdateDescription(descParts);
    }
    toast.success('已基于角色档案生成提示词');
  };

  // 生成本集变体立绘（图生图模式：以标准立绘为参考，只描述状态变体）
  const [generatingVariant, setGeneratingVariant] = useState(false);

  const generateVariantImage = async () => {
    console.log('[变体立绘调试] episodeVariant:', JSON.stringify(episodeVariant));
    const hasVariant = episodeVariant.emotionState || episodeVariant.appearanceChange || episodeVariant.temporaryOutfit || episodeVariant.specialProp;
    if (!hasVariant) {
      toast.info('当前没有状态变体，无需生成变体立绘');
      return;
    }
    if (!imageModelId) {
      toast.error('未找到可用的图片生成模型，请先在模型配置启用图片模型');
      return;
    }
    // 图生图模式需要标准立绘作为参考
    const referenceImageUrl = projectCharacter?.imageUrl || char.imageUrl;
    if (!referenceImageUrl) {
      toast.error('请先生成项目级标准立绘，再生成本集变体立绘');
      return;
    }
    if (generatingVariant) return;

    setGeneratingVariant(true);
    try {
      // 1. 只构建状态变体描述（不重复描述角色外貌，由参考图保证一致性）
      const variantParts: string[] = [];
      if (episodeVariant.emotionState) variantParts.push(`表情状态：${episodeVariant.emotionState}`);
      if (episodeVariant.appearanceChange) variantParts.push(`外观变化：${episodeVariant.appearanceChange}`);
      if (episodeVariant.temporaryOutfit) variantParts.push(`临时换装：${episodeVariant.temporaryOutfit}`);
      if (episodeVariant.specialProp) variantParts.push(`持有道具：${episodeVariant.specialProp}`);
      const variantDesc = variantParts.join('，');

      // 2. 注入项目全局风格（保证色调一致）
      const projectState = useProjectStore.getState?.();
      const project = projectState?.projects?.find((p: Project) => p.id === char.projectId);
      let stylePrompt = '';
      if (project) {
        const styleState = useStyleStore.getState?.();
        const style = styleState?.styles?.find((s: StyleEntry) => s.id === project.styleId) ?? DEFAULT_STYLE_OPTIONS.find((s: StyleOption) => s.id === project.styleId);
        stylePrompt = style?.prompt?.trim() || style?.description?.trim() || '';
      }

      // 3. 组合最终提示词：状态变体 + 风格（角色外貌由参考图保证）
      const finalPrompt = [variantDesc, stylePrompt].filter(Boolean).join('，');
      const aspectRatio = projectCharacter?.imageAspectRatio || project?.aspectRatio || '9:16';
      console.log('[变体立绘生成-图生图]', {
        charName: char.name,
        referenceImageUrl,
        variantParts,
        stylePrompt,
        finalPromptLength: finalPrompt.length,
        modelId: imageModelId,
        aspectRatio,
      });

      // 4. 调用统一网关API创建异步任务（图生图模式）
      const genRes: GenerateResponse = await api.generate({
        modelId: imageModelId,
        modality: 'image',
        mode: 'image-to-image',
        input: {
          prompt: finalPrompt,
          reference_images: [{ url: referenceImageUrl, role: 'identity' }],
        },
        parameters: {
          strength: 0.6,
          aspect_ratio: aspectRatio,
          n: 1,
        },
        metadata: {
          product: 'comic',
          project_id: char.projectId,
          episode_id: char.episodeId,
          asset_id: char.id,
        },
      });

      if (!genRes.task_id) {
        const err = genRes.error || genRes.run?.error || '未知错误';
        toast.error(`变体立绘生成失败：${err}`);
        return;
      }

      // 5. 轮询任务状态（最多6分钟）
      const maxPolls = 120;
      let finalTask: ServerTask | null = null;
      for (let i = 0; i < maxPolls; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        finalTask = await api.getTask(genRes.task_id);
        if (finalTask.status === 'succeeded' || finalTask.status === 'failed' || finalTask.status === 'cancelled') {
          break;
        }
      }

      if (!finalTask || finalTask.status !== 'succeeded') {
        const rawError = finalTask?.error || '生成任务未完成（可能超时）';
        toast.error(`变体立绘生成失败：${rawError}`);
        return;
      }

      // 6. 提取图片URL（结果优先读 result_payload，回退历史行的 intent_payload.result）
      let url: string | undefined;
      for (let retry = 0; retry < 10; retry++) {
        if (retry > 0) {
          await new Promise((r) => setTimeout(r, 2000));
          finalTask = await api.getTask(genRes.task_id);
        }
        const result = resolveTaskResult(finalTask);
        url = (result['output.image_urls.0'] || result['output.data.0.url'] || result['data.0.url'] || result['url']) as string | undefined;
        if (url) break;
      }

      if (!url) {
        toast.error('变体立绘生成失败：响应未包含图片地址');
        return;
      }

      // 7. 保存到asset的variantImageUrl
      useAssetStore.getState().updateAsset(char.id, { variantImageUrl: url });
      toast.success(`「${char.name}」变体立绘生成完成`);
      // 自动切换到变体立绘标签
      setImageTab('variant');
    } catch (cause) {
      toast.error(cause instanceof Error ? `变体立绘生成失败：${cause.message}` : '变体立绘生成失败');
    } finally {
      setGeneratingVariant(false);
    }
  };

  return (
    <>
    <AnimatePresence>
      {/* 弹窗遮罩 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-md"
        onClick={onClose}
      />

      {/* 弹窗 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[95vw] max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-border/60 bg-card shadow-2xl"
      >
        {/* 抽屉头部 */}
        <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-lg shadow-primary/20">
              <User className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">{char.name}</h2>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Badge className={cn('rounded-full px-2 py-0.5 text-[10px]', meta?.className)}>{meta?.label ?? char.status ?? '未知'}</Badge>
                <span>出场 {shotCount || 0} 镜</span>
                <span>·</span>
                <span>v{char.currentVersion}</span>
              </div>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full hover:bg-accent"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* 主体内容：左右两栏 */}
        <div className="flex min-h-0 flex-1">
          {/* 左侧栏：立绘预览 + 摘要 */}
          <div className="flex w-[38%] shrink-0 flex-col border-r border-border/60 bg-gradient-to-b from-muted/20 to-transparent">
            {/* 立绘切换标签 */}
            <div className="flex shrink-0 gap-1.5 px-5 pt-4">
              <button
                type="button"
                onClick={() => setImageTab('standard')}
                className={cn(
                  'flex-1 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all',
                  imageTab === 'standard'
                    ? 'bg-primary/15 text-primary border border-primary/30'
                    : 'text-muted-foreground hover:bg-accent/50 border border-transparent',
                )}
              >
                标准立绘
              </button>
              <button
                type="button"
                onClick={() => setImageTab('variant')}
                className={cn(
                  'flex-1 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all',
                  imageTab === 'variant'
                    ? 'bg-primary/15 text-primary border border-primary/30'
                    : 'text-muted-foreground hover:bg-accent/50 border border-transparent',
                )}
              >
                变体立绘
              </button>
            </div>
            {/* 大预览图 */}
            <div className="shrink-0 p-5">
              <div className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-border/40 bg-gradient-to-br from-muted/50 to-muted/20 shadow-inner">
            {generatingTask ? (
              <div className="flex h-full flex-col items-center justify-center gap-4">
                <ProgressRing progress={generatingTask.progress} size={100} />
                <div className="text-center">
                  <p className="text-base font-semibold text-foreground">AI 生成中...</p>
                  <p className="mt-1 text-xs text-muted-foreground">正在绘制角色立绘，请稍候</p>
                </div>
              </div>
            ) : imageTab === 'standard' ? (
              projectCharacter?.imageUrl ? (
                <img
                  src={projectCharacter.imageUrl}
                  alt={char.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-4">
                  <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-muted/50">
                    <User className="h-12 w-12 text-muted-foreground/40" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground">暂无标准立绘</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">前往项目角色库生成</p>
                  </div>
                  <Link to={`/comic/projects/${char.projectId}?tab=characters`}>
                    <Button
                      type="button"
                      size="sm"
                      className="gap-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      前往生成
                    </Button>
                  </Link>
                </div>
              )
            ) : (
              char.variantImageUrl ? (
                <img
                  src={char.variantImageUrl}
                  alt={`${char.name} 变体`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-4">
                  <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-muted/50">
                    <User className="h-12 w-12 text-muted-foreground/40" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground">暂无变体立绘</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">有状态变体时可生成</p>
                  </div>
                </div>
              )
            )}
            {char.status === 'USER_APPROVED' && imageTab === 'standard' && (
              <div className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-success/90 px-3 py-1.5 text-[11px] font-semibold text-success-foreground shadow-lg backdrop-blur-sm">
                <Check className="h-3.5 w-3.5" />
                Canonical
              </div>
            )}
              </div>
            </div>

            {/* 角色摘要信息 */}
            <div className="flex-1 overflow-y-auto px-5 pb-5">
              <div className="space-y-4">
                {/* 身份标签 */}
                <div className="flex flex-wrap gap-1.5">
                  {projectCharacter?.identity && (
                    <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary text-[10px]">
                      {projectCharacter.identity}
                    </Badge>
                  )}
                  {projectCharacter?.gender && (
                    <Badge variant="outline" className="border-border/40 text-[10px]">{projectCharacter.gender}</Badge>
                  )}
                  {projectCharacter?.age && (
                    <Badge variant="outline" className="border-border/40 text-[10px]">{projectCharacter.age}</Badge>
                  )}
                </div>

                {/* 外貌摘要 */}
                <div className="rounded-xl bg-muted/30 p-3">
                  <p className="mb-1.5 text-[10px] font-semibold text-muted-foreground/70">外貌特征</p>
                  <p className="text-[11px] leading-relaxed text-foreground/80">
                    {[projectCharacter?.hairColor, projectCharacter?.hairstyle, projectCharacter?.eyeColor && `${projectCharacter.eyeColor}瞳`, projectCharacter?.bodyType].filter(Boolean).join('，') || '未设置'}
                  </p>
                </div>

                {/* 服装摘要 */}
                <div className="rounded-xl bg-muted/30 p-3">
                  <p className="mb-1.5 text-[10px] font-semibold text-muted-foreground/70">服装造型</p>
                  <p className="text-[11px] leading-relaxed text-foreground/80">
                    {[projectCharacter?.top, projectCharacter?.bottom, projectCharacter?.shoes, projectCharacter?.clothingStyle].filter(Boolean).join('，') || '未设置'}
                  </p>
                </div>

                {/* 出场统计 */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-muted/30 p-3 text-center">
                    <p className="text-lg font-bold text-primary">{shotCount || 0}</p>
                    <p className="text-[10px] text-muted-foreground">出场镜头</p>
                  </div>
                  <div className="rounded-xl bg-muted/30 p-3 text-center">
                    <p className="text-lg font-bold text-primary">v{char.currentVersion}</p>
                    <p className="text-[10px] text-muted-foreground">当前版本</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 右侧栏：Tab + 内容 */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Tab 切换 */}
            <div className="flex shrink-0 gap-1 border-b border-border/60 px-5 py-3">
          {([
            { key: 'info', label: '基本信息' },
            { key: 'versions', label: '版本历史' },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'rounded-lg px-4 py-2 text-xs font-medium transition-all',
                activeTab === tab.key
                  ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {tab.label}
            </button>
          ))}
            </div>

            {/* 内容区域 */}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {activeTab === 'info' && (
            <div className="space-y-5">
              {/* 标准设定（来自项目级，只读） */}
              {projectCharacter ? (
                <div className="rounded-2xl border border-border/40 bg-background/30">
                  <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/20">
                        <BookOpen className="h-3.5 w-3.5 text-amber-500" />
                      </div>
                      <span className="text-xs font-semibold text-foreground">标准设定</span>
                      <Badge variant="outline" className="border-amber-500/30 text-amber-500 text-[9px]">项目角色库 · 只读</Badge>
                    </div>
                    <Link to={`/comic/projects/${char.projectId}?tab=characters`} className="text-[10px] text-primary hover:underline">
                      编辑完整设定 →
                    </Link>
                  </div>
                  <div className="space-y-4 p-4">
                    <div>
                      <p className="mb-2 text-[10px] font-semibold text-muted-foreground/70">基本信息</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                        <div className="flex"><span className="w-14 shrink-0 text-muted-foreground/60">身份</span><span className="text-foreground">{projectCharacter.identity || '未设置'}</span></div>
                        <div className="flex"><span className="w-14 shrink-0 text-muted-foreground/60">性别</span><span className="text-foreground">{projectCharacter.gender || '未设置'}</span></div>
                        <div className="flex"><span className="w-14 shrink-0 text-muted-foreground/60">年龄</span><span className="text-foreground">{projectCharacter.age || '未设置'}</span></div>
                        <div className="flex"><span className="w-14 shrink-0 text-muted-foreground/60">身高</span><span className="text-foreground">{projectCharacter.height || '未设置'}</span></div>
                      </div>
                    </div>
                    <div>
                      <p className="mb-2 text-[10px] font-semibold text-muted-foreground/70">外貌特征</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                        <div className="flex"><span className="w-14 shrink-0 text-muted-foreground/60">发型</span><span className="text-foreground">{projectCharacter.hairstyle || '未设置'}</span></div>
                        <div className="flex"><span className="w-14 shrink-0 text-muted-foreground/60">发色</span><span className="text-foreground">{projectCharacter.hairColor || '未设置'}</span></div>
                        <div className="flex"><span className="w-14 shrink-0 text-muted-foreground/60">瞳色</span><span className="text-foreground">{projectCharacter.eyeColor || '未设置'}</span></div>
                        <div className="flex"><span className="w-14 shrink-0 text-muted-foreground/60">体型</span><span className="text-foreground">{projectCharacter.bodyType || '未设置'}</span></div>
                        <div className="col-span-2 flex"><span className="w-14 shrink-0 text-muted-foreground/60">面部特征</span><span className="text-foreground">{projectCharacter.facialFeatures || '未设置'}</span></div>
                        <div className="col-span-2 flex"><span className="w-14 shrink-0 text-muted-foreground/60">特殊标记</span><span className="text-foreground">{projectCharacter.specialMarks || '未设置'}</span></div>
                      </div>
                    </div>
                    <div>
                      <p className="mb-2 text-[10px] font-semibold text-muted-foreground/70">服装造型</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                        <div className="flex"><span className="w-14 shrink-0 text-muted-foreground/60">上衣</span><span className="text-foreground">{projectCharacter.top || '未设置'}</span></div>
                        <div className="flex"><span className="w-14 shrink-0 text-muted-foreground/60">下装</span><span className="text-foreground">{projectCharacter.bottom || '未设置'}</span></div>
                        <div className="flex"><span className="w-14 shrink-0 text-muted-foreground/60">鞋子</span><span className="text-foreground">{projectCharacter.shoes || '未设置'}</span></div>
                        <div className="flex"><span className="w-14 shrink-0 text-muted-foreground/60">风格</span><span className="text-foreground">{projectCharacter.clothingStyle || '未设置'}</span></div>
                        <div className="col-span-2 flex"><span className="w-14 shrink-0 text-muted-foreground/60">配饰</span><span className="text-foreground">{projectCharacter.accessories || '未设置'}</span></div>
                      </div>
                    </div>
                    <div>
                      <p className="mb-2 text-[10px] font-semibold text-muted-foreground/70">性格特征</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                        <div className="flex"><span className="w-14 shrink-0 text-muted-foreground/60">性格</span><span className="text-foreground">{projectCharacter.personality || '未设置'}</span></div>
                        <div className="flex"><span className="w-14 shrink-0 text-muted-foreground/60">典型表情</span><span className="text-foreground">{projectCharacter.typicalExpression || '未设置'}</span></div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border/40 bg-muted/20 p-4">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-muted/50">
                      <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">未引用项目级设定</span>
                  </div>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    请先在顶部「角色库」中引用项目级角色设定，引用后标准设定自动填充，单集只需填写状态变化
                  </p>
                </div>
              )}

              {/* 本集状态变体（可编辑，覆盖标准设定） */}
              <div className="rounded-2xl border border-primary/30 bg-primary/5">
                <div className="flex items-center gap-2 border-b border-primary/20 px-4 py-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/20">
                    <Zap className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <span className="text-xs font-semibold text-foreground">本集状态变体</span>
                  <Badge variant="outline" className="border-primary/30 text-primary text-[9px]">覆盖标准设定</Badge>
                </div>
                <div className="space-y-3 p-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-muted-foreground">情绪状态</label>
                      <Input
                        value={episodeVariant.emotionState}
                        onChange={(e) => setEpisodeVariant(prev => ({ ...prev, emotionState: e.target.value }))}
                        placeholder="如：疲惫、愤怒、悲伤"
                        className="h-8 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-muted-foreground">外观变化</label>
                      <Input
                        value={episodeVariant.appearanceChange}
                        onChange={(e) => setEpisodeVariant(prev => ({ ...prev, appearanceChange: e.target.value }))}
                        placeholder="如：眼角淤青、嘴角血迹"
                        className="h-8 rounded-lg text-xs"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-muted-foreground">临时换装</label>
                      <Input
                        value={episodeVariant.temporaryOutfit}
                        onChange={(e) => setEpisodeVariant(prev => ({ ...prev, temporaryOutfit: e.target.value }))}
                        placeholder="如：睡衣、战斗服、便装"
                        className="h-8 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-muted-foreground">特殊道具</label>
                      <Input
                        value={episodeVariant.specialProp}
                        onChange={(e) => setEpisodeVariant(prev => ({ ...prev, specialProp: e.target.value }))}
                        placeholder="如：断剑、信件、玉佩"
                        className="h-8 rounded-lg text-xs"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground/70">
                    状态变体会在生成提示词时覆盖标准设定中的对应字段，仅作用于本集
                  </p>
                </div>
              </div>

              {/* 提示信息 */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                <p className="text-[10px] leading-relaxed text-primary/80">
                  💡 换装或明显受伤建议生成「单集变体立绘」，作为视频参考图保证角色一致性。情绪变化可通过提示词控制，无需重新生图。
                </p>
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={generatingVariant}
                  className="flex-1 rounded-xl bg-gradient-to-r from-primary to-primary/80 shadow-md shadow-primary/20 disabled:opacity-60"
                  onClick={generateVariantImage}
                >
                  {generatingVariant ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      生成中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                      生成本集变体立绘
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {activeTab === 'versions' && (
            <div className="space-y-3">
              {(char.versions || []).slice().reverse().map((ver: AssetVersion, idx: number) => (
                <div
                  key={ver.version}
                  className={cn(
                    'rounded-2xl border p-4 transition-all',
                    ver.version === char.currentVersion
                      ? 'border-primary/40 bg-primary/5 shadow-md shadow-primary/5'
                      : 'border-border/40 bg-background/30 hover:border-border/60',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-xl font-mono text-sm font-bold',
                        ver.version === char.currentVersion
                          ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                          : 'bg-muted/50 text-muted-foreground',
                      )}>
                        v{ver.version}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          版本 {ver.version}
                          {ver.version === char.currentVersion && (
                            <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">当前</span>
                          )}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(ver.createdAt).toLocaleString('zh-CN')}
                        </p>
                      </div>
                    </div>
                    <Badge className={cn('rounded-full px-2 py-0.5 text-[10px]', STATUS_META[ver.status as ArtifactStatus]?.className)}>
                      {STATUS_META[ver.status as ArtifactStatus]?.label || ver.status}
                    </Badge>
                  </div>
                  {ver.prompt && (
                    <p className="mt-3 line-clamp-2 rounded-lg bg-muted/30 p-2 font-mono text-[10px] text-muted-foreground">
                      {ver.prompt}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
            </div>
          </div>
        </div>

        {/* 底部操作栏 */}
        <div className="shrink-0 border-t border-border/60 bg-card/95 px-5 py-4 backdrop-blur-sm">
          {/* 待审核状态 */}
          {char.status === 'AWAITING_USER' && (
            <div className="mb-3 space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
              <div className="text-[11px] font-medium text-amber-700 dark:text-amber-400">候选 v{char.currentVersion} 待审核</div>
              <Input
                value={statement}
                onChange={(e) => setStatement(e.target.value)}
                className="h-8 rounded-lg border-amber-500/30 bg-background/50 text-xs"
                placeholder="选择理由 / 确认声明"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="flex-1 rounded-lg bg-success hover:bg-success/90 text-success-foreground"
                  disabled={!statement.trim()}
                  onClick={onApprove}
                >
                  <Check className="mr-1.5 h-3.5 w-3.5" />批准
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-lg border-destructive/30 text-destructive hover:bg-destructive/10"
                  onClick={onReject}
                >
                  <X className="mr-1.5 h-3.5 w-3.5" />退回
                </Button>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-11 w-11 shrink-0 rounded-xl border-border/60 transition-all hover:scale-105 hover:border-primary/30"
              onClick={onToggleGlobal}
              title={char.scope === 'global' ? '取消全局' : '标记全局'}
            >
              <Globe className={cn('h-4 w-4', char.scope === 'global' && 'text-primary')} />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-11 w-11 shrink-0 rounded-xl border-border/60 transition-all hover:scale-105 hover:border-primary/30"
              title="下载"
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>

    {/* 项目级设定详情弹窗 */}
    <Dialog open={showProjectDetail} onOpenChange={setShowProjectDetail}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/20">
              <BookOpen className="h-5 w-5 text-white" />
            </div>
            <div>
              <DialogTitle>{projectCharacter?.name || '角色设定'}</DialogTitle>
              <p className="text-[11px] text-muted-foreground">项目级角色设定 · 全剧通用 · 只读</p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {projectCharacter && (
            <div className="space-y-5 px-6">
              {/* 基本信息 */}
              <div>
                <h4 className="mb-3 text-xs font-semibold text-primary">基本信息</h4>
                <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/30 p-4">
                  <DetailRow label="性别" value={projectCharacter.gender || '未设置'} />
                  <DetailRow label="年龄" value={projectCharacter.age || '未设置'} />
                  <DetailRow label="身份" value={projectCharacter.identity || '未设置'} />
                  <DetailRow label="身高" value={projectCharacter.height || '未设置'} />
                </div>
              </div>

              {/* 外貌特征 */}
              <div>
                <h4 className="mb-3 text-xs font-semibold text-primary">外貌特征</h4>
                <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/30 p-4">
                  <DetailRow label="发型" value={projectCharacter.hairstyle || '未设置'} />
                  <DetailRow label="发色" value={projectCharacter.hairColor || '未设置'} />
                  <DetailRow label="瞳色" value={projectCharacter.eyeColor || '未设置'} />
                  <DetailRow label="体型" value={projectCharacter.bodyType || '未设置'} />
                  <DetailRow label="面部特征" value={projectCharacter.facialFeatures || '未设置'} />
                  <DetailRow label="特殊标记" value={projectCharacter.specialMarks || '未设置'} />
                </div>
              </div>

              {/* 服装描述 */}
              <div>
                <h4 className="mb-3 text-xs font-semibold text-primary">服装描述</h4>
                <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/30 p-4">
                  <DetailRow label="上装" value={projectCharacter.top || '未设置'} />
                  <DetailRow label="下装" value={projectCharacter.bottom || '未设置'} />
                  <DetailRow label="鞋子" value={projectCharacter.shoes || '未设置'} />
                  <DetailRow label="配饰" value={projectCharacter.accessories || '未设置'} />
                  <DetailRow label="服装风格" value={projectCharacter.clothingStyle || '未设置'} />
                </div>
              </div>

              {/* 性格特征 */}
              <div>
                <h4 className="mb-3 text-xs font-semibold text-primary">性格特征</h4>
                <div className="space-y-3 rounded-xl bg-muted/30 p-4">
                  <DetailRow label="性格" value={projectCharacter.personality || '未设置'} />
                  <DetailRow label="典型表情" value={projectCharacter.typicalExpression || '未设置'} />
                  <DetailRow label="行为习惯" value={projectCharacter.behavior || '未设置'} />
                </div>
              </div>

              {/* 背景故事 */}
              {projectCharacter.background && (
                <div>
                  <h4 className="mb-3 text-xs font-semibold text-primary">背景故事</h4>
                  <div className="rounded-xl bg-muted/30 p-4">
                    <p className="text-xs leading-relaxed text-foreground">{projectCharacter.background}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border/60 pt-4">
          <p className="mr-auto text-[10px] text-muted-foreground">
            项目级设定为全剧通用，修改后所有引用剧集自动同步
          </p>
          <Link to={`/comic/projects/${char.projectId}?tab=characters`} className="mr-2">
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs">
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              前往项目角色库编辑
            </Button>
          </Link>
          <Button type="button" onClick={() => setShowProjectDetail(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

export default function CharacterStage({ episode }: { episode: Episode }) {
  const {
    assets,
    upsertAssets,
    removeAsset,
    approveAsset,
    rejectAsset,
    toggleGlobal,
    loadAssetsFromServer,
  } = useAssetStore(
    useShallow((s) => ({
      assets: s.assets,
      upsertAssets: s.upsertAssets,
      removeAsset: s.removeAsset,
      approveAsset: s.approveAsset,
      rejectAsset: s.rejectAsset,
      toggleGlobal: s.toggleGlobal,
      loadAssetsFromServer: s.loadAssetsFromServer,
    })),
  );

  const chars = useMemo(() => assets.filter((a) => a.kind === 'character' && a.episodeId === episode.id), [assets, episode.id]);
  const { generate, getTaskByAsset } = useFakeGeneration();

  const [selected, setSelected] = useState<string[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [statement, setStatement] = useState('确认此版本用于本集');
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newCharName, setNewCharName] = useState('');
  const [newCharDesc, setNewCharDesc] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [showCharacterLibrary, setShowCharacterLibrary] = useState(false);
  const [showExtractConfirm, setShowExtractConfirm] = useState(false);
  const [selectedExtractNames, setSelectedExtractNames] = useState<Set<string>>(new Set());
  const [expandedExtractName, setExpandedExtractName] = useState<string | null>(null);
  const [selectedLibraryIdMap, setSelectedLibraryIdMap] = useState<Record<string, string>>({}); // 角色名 -> 档案ID 或 'new'
  const [libraryPickerName, setLibraryPickerName] = useState<string | null>(null); // 当前选择档案的角色名
  const [showAllLibraryInPicker, setShowAllLibraryInPicker] = useState(false); // 档案选择弹窗中是否显示全部

  // 项目级角色库
  const allProjectCharacters = useProjectCharacterStore(useShallow((s) => s.characters));
  const projectCharacters = allProjectCharacters.filter((c) => c.projectId === episode.projectId);

  const current = currentId ? chars.find((c) => c.id === currentId) ?? null : null;

  // 删除角色
  const handleDelete = (id: string) => {
    const char = chars.find((c) => c.id === id);
    if (!char) return;
    removeAsset(id);
    if (currentId === id) {
      setCurrentId(null);
      setShowDrawer(false);
    }
    setSelected((prev) => prev.filter((sid) => sid !== id));
    setPendingDelete(null);
    toast.success(`已删除角色「${char.name}」`);
  };

  // 打开提取确认弹窗
  const handleReextract = () => {
    if (shotStats.length === 0) {
      toast.info('分镜中没有角色数据');
      return;
    }
    // 默认选中所有角色库中没有的角色
    const existingNames = new Set(chars.map((c) => c.name));
    const toSelect = new Set(shotStats.filter((s) => !existingNames.has(s.name)).map((s) => s.name));
    setSelectedExtractNames(toSelect);

    // 初始化档案选择：角色库中有匹配的默认选第一个，没有的选 'new'
    const libMap: Record<string, string> = {};
    shotStats.forEach((s) => {
      const matches = projectCharacters.filter((pc) => pc.name === s.name);
      libMap[s.name] = matches.length > 0 ? matches[0].id : 'new';
    });
    setSelectedLibraryIdMap(libMap);
    setExpandedExtractName(null);
    setShowExtractConfirm(true);
  };

  // 确认提取选中的角色
  const confirmExtract = () => {
    if (selectedExtractNames.size === 0) {
      toast.info('请至少选择一个角色');
      return;
    }

    const existingMap = new Map(chars.map((c) => [c.name, c]));
    const libraryByIdMap = new Map(projectCharacters.map((pc) => [pc.id, pc]));
    const selectedStats = shotStats.filter((s) => selectedExtractNames.has(s.name));
    const assetsToUpsert = selectedStats.map((s) => {
      const existing = existingMap.get(s.name);
      // 使用用户选择的角色库档案ID，如果没有选择则按名称匹配第一个
      const selectedLibraryId = selectedLibraryIdMap[s.name];
      const libraryChar = selectedLibraryId
        ? libraryByIdMap.get(selectedLibraryId)
        : projectCharacters.find((pc) => pc.name === s.name);
      const appearanceInfo = [
        s.emotions.length > 0 ? `情绪变化：${s.emotions.join('、')}` : '',
        s.costumeStates.length > 0 ? `服装变化：${s.costumeStates.join('、')}` : '',
        s.bodyStates.length > 0 ? `身体状态：${s.bodyStates.join('、')}` : '',
      ].filter(Boolean).join('；');

      // 如果角色库有匹配，基于角色库设定生成 description 和 prompt
      let description = existing?.description || '';
      const promptParts = [
        `${s.name}，角色立绘设定图`,
        '四视图身份资产：正面全身、90度侧面全身、背面全身、正面胸部以上脸部特写',
        '完整服装造型，细节清晰',
        '中性表情基线',
        '纯白色背景，Studio Lighting，无阴影，专业设定图风格',
        '双脚完全入镜，绝不裁切，横向多视图无分割线呈现',
      ];

      if (libraryChar && !existing) {
        // 从角色库填充基本设定
        const profileParts = [
          libraryChar.gender ? `性别：${libraryChar.gender}` : '',
          libraryChar.age ? `年龄：${libraryChar.age}` : '',
          libraryChar.identity ? `身份：${libraryChar.identity}` : '',
          libraryChar.hairstyle ? `发型：${libraryChar.hairstyle}` : '',
          libraryChar.hairColor ? `发色：${libraryChar.hairColor}` : '',
          libraryChar.eyeColor ? `瞳色：${libraryChar.eyeColor}` : '',
          libraryChar.bodyType ? `体型：${libraryChar.bodyType}` : '',
          libraryChar.height ? `身高：${libraryChar.height}` : '',
          libraryChar.clothingStyle ? `服装风格：${libraryChar.clothingStyle}` : '',
          libraryChar.top ? `上装：${libraryChar.top}` : '',
          libraryChar.bottom ? `下装：${libraryChar.bottom}` : '',
          libraryChar.shoes ? `鞋子：${libraryChar.shoes}` : '',
          libraryChar.accessories ? `配饰：${libraryChar.accessories}` : '',
        ].filter(Boolean);
        description = `引用自角色库\n${profileParts.join('\n')}`;

        // 基于角色库设定生成视觉描述 prompt
        const visualParts = [
          libraryChar.gender || '',
          libraryChar.age ? `${libraryChar.age}岁` : '',
          libraryChar.hairstyle || '',
          libraryChar.hairColor ? `${libraryChar.hairColor}头发` : '',
          libraryChar.eyeColor ? `${libraryChar.eyeColor}眼睛` : '',
          libraryChar.facialFeatures || '',
          libraryChar.bodyType || '',
        ].filter(Boolean);
        if (visualParts.length > 0) {
          promptParts.splice(1, 0, visualParts.join('，'));
        }

        // 服装描述（区分穿着和佩戴）
        const wearingParts = [
          libraryChar.top || '',
          libraryChar.bottom || '',
          libraryChar.shoes || '',
          libraryChar.clothingStyle || '',
        ].filter(Boolean);
        if (wearingParts.length > 0) {
          promptParts.splice(2, 0, `穿着${wearingParts.join('，')}`);
        }
        if (libraryChar.accessories) {
          // 过滤道具类词汇
          const propKeywords = ['手机', '电话', '武器', '刀', '剑', '枪', '工具', '书本', '包', '箱子'];
          const accessories = libraryChar.accessories.split(/[，,、；;]/).filter(item => {
            const trimmed = item.trim();
            return trimmed && !propKeywords.some(keyword => trimmed.includes(keyword));
          });
          if (accessories.length > 0) {
            promptParts.splice(3, 0, `佩戴${accessories.join('，')}`);
          }
        }
      }

      promptParts.push('masterpiece, best quality, ultra detailed, 8k');
      const prompt = promptParts.filter(Boolean).join(', ');

      const negativePrompt = [
        'low quality, blurry, distorted, deformed, watermark, text, signature',
        'extra fingers, missing fingers, fused fingers, too many fingers',
        'bad anatomy, bad proportions, missing limbs, extra limbs',
        'cropped, out of frame, cut off',
        'ugly, duplicate, morbid, mutilated',
        'shadow, dark background, cluttered background',
        'dynamic pose, action scene, environment, props',
      ].join(', ');

      const stableId = `${episode.id}-char-${s.name.replace(/\s+/g, '-')}`;
      const sourceLabel = libraryChar ? '引用自角色库' : '分镜提取';
      // 建立角色库外键引用：用户选择了引用档案且不是新建
      const projectCharacterId = (selectedLibraryId && selectedLibraryId !== 'new') ? selectedLibraryId : undefined;

      return {
        id: existing?.id || stableId,
        projectId: episode.projectId,
        episodeId: episode.id,
        kind: 'character' as const,
        name: s.name,
        description,
        scope: 'episode' as const,
        sourceScene: `${sourceLabel}（出场${s.shotCount}镜，覆盖${s.sceneCount}场次）${appearanceInfo ? `；${appearanceInfo}` : ''}`,
        projectCharacterId,
        currentVersion: existing?.currentVersion || 1,
        versions: existing?.versions || [{
          version: 1,
          prompt,
          negativePrompt,
          sha256: `storyboard-derived-${stableId}`,
          status: 'DRAFT' as const,
          createdAt: Date.now(),
        }],
        prompt,
        negativePrompt,
        status: existing?.status || ('DRAFT' as const),
        model: existing?.model || 'derived-from-storyboard',
        stale: false,
        createdAt: existing?.createdAt || Date.now(),
        source: 'local' as const,
      };
    });

    const newCount = assetsToUpsert.filter((a) => !existingMap.has(a.name)).length;
    const updatedCount = assetsToUpsert.length - newCount;

    upsertAssets(assetsToUpsert);
    setShowExtractConfirm(false);
    if (newCount > 0 && updatedCount > 0) {
      toast.success(`提取 ${assetsToUpsert.length} 个角色（新增 ${newCount}，更新 ${updatedCount}）`);
    } else if (newCount > 0) {
      toast.success(`新增 ${newCount} 个角色资产`);
    } else {
      toast.success(`已更新 ${updatedCount} 个角色的出场统计`);
    }
  };

  // 手动添加角色
  const handleAddChar = () => {
    if (!newCharName.trim()) {
      toast.error('请输入角色名称');
      return;
    }
    const prompt = [
      `${newCharName}，角色立绘设定图`,
      `四视图身份资产：正面全身、90度侧面全身、背面全身、正面胸部以上脸部特写`,
      newCharDesc || '完整服装造型，细节清晰',
      '中性表情基线',
      '纯白色背景，Studio Lighting，无阴影，专业设定图风格',
      '双脚完全入镜，绝不裁切，横向多视图无分割线呈现',
      'masterpiece, best quality, ultra detailed, 8k',
    ].join(', ');

    const negativePrompt = [
      'low quality, blurry, distorted, deformed, watermark, text, signature',
      'extra fingers, missing fingers, fused fingers, too many fingers',
      'bad anatomy, bad proportions, missing limbs, extra limbs',
      'cropped, out of frame, cut off',
      'ugly, duplicate, morbid, mutilated',
      'shadow, dark background, cluttered background',
      'dynamic pose, action scene, environment, props',
    ].join(', ');

    const newAsset = {
      id: `${episode.id}-char-manual-${Date.now().toString(36)}`,
      projectId: episode.projectId,
      episodeId: episode.id,
      kind: 'character' as const,
      name: newCharName.trim(),
      description: newCharDesc.trim() || '手动创建的角色资产',
      scope: 'episode' as const,
      sourceScene: '手动创建',
      currentVersion: 1,
      versions: [{
        version: 1,
        prompt,
        negativePrompt,
        sha256: `manual-${Date.now()}`,
        status: 'DRAFT' as const,
        createdAt: Date.now(),
      }],
      prompt,
      negativePrompt,
      status: 'DRAFT' as const,
      model: 'manually-created',
      stale: false,
      createdAt: Date.now(),
      source: 'local' as const,
    };
    upsertAssets([newAsset]);
    setShowAddDialog(false);
    setNewCharName('');
    setNewCharDesc('');
    toast.success(`已手动添加角色「${newAsset.name}」`);
  };

  // 角色提取规则
  const isGroupCharacter = useCharacterExtractionRuleStore((s) => s.isGroupCharacter);
  const activeRuleId = useCharacterExtractionRuleStore((s) => s.activeRuleId);
  const rules = useCharacterExtractionRuleStore((s) => s.rules);
  const setActiveRule = useCharacterExtractionRuleStore((s) => s.setActiveRule);
  const activeRule = rules.find((r) => r.id === activeRuleId);

  // 分镜需求统计
  const shotStats = useMemo(() => {
    const shots = (episode.directing ?? []) as ShotCard[];
    const charMap = new Map<string, { count: number; scenes: Set<string>; emotions: Set<string>; shotIds: string[]; bodyStates: Set<string>; costumeStates: Set<string> }>();
    shots.forEach((shot) => {
      shot.world.characters.forEach((ch) => {
        if (isGroupCharacter(ch.name)) return;
        const key = ch.name;
        if (!charMap.has(key)) charMap.set(key, { count: 0, scenes: new Set(), emotions: new Set(), shotIds: [], bodyStates: new Set(), costumeStates: new Set() });
        const entry = charMap.get(key)!;
        entry.count += 1;
        entry.scenes.add(shot.sceneLabel);
        entry.shotIds.push(shot.id);
        if (ch.emotion && ch.emotion !== '正常') entry.emotions.add(ch.emotion);
        if (ch.bodyState && ch.bodyState !== '正常') entry.bodyStates.add(ch.bodyState);
        if (ch.costumeState && ch.costumeState !== '正常') entry.costumeStates.add(ch.costumeState);
      });
    });
    return Array.from(charMap.entries()).map(([name, data]) => ({
      name,
      shotCount: data.count,
      sceneCount: data.scenes.size,
      emotions: Array.from(data.emotions),
      shotIds: data.shotIds,
      bodyStates: Array.from(data.bodyStates),
      costumeStates: Array.from(data.costumeStates),
    }));
  }, [episode.directing]);

  // 分镜变化检测
  const missingFromShots = useMemo(() => {
    const existingNames = new Set(chars.map((c) => c.name));
    return shotStats.filter((s) => !existingNames.has(s.name));
  }, [shotStats, chars]);

  // 页面加载时从后端拉取资产数据和项目级角色库
  useEffect(() => {
    loadAssetsFromServer(episode.projectId, episode.id).catch(() => {});
    useProjectCharacterStore.getState().loadFromBackend(episode.projectId).catch(() => {});
  }, [episode.projectId, episode.id, loadAssetsFromServer]);

  // 筛选角色
  const filteredChars = useMemo(() => {
    return chars.filter((c) => {
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filter === 'draft') return c.status === 'DRAFT';
      if (filter === 'pending') return c.status === 'AWAITING_USER';
      if (filter === 'approved') return c.status === 'USER_APPROVED';
      return true;
    });
  }, [chars, filter, search]);

  // 统计
  const stats = useMemo(() => ({
    total: chars.length,
    draft: chars.filter((c) => c.status === 'DRAFT').length,
    pending: chars.filter((c) => c.status === 'AWAITING_USER').length,
    approved: chars.filter((c) => c.status === 'USER_APPROVED').length,
    shotNeeds: shotStats.length,
  }), [chars, shotStats]);

  const allDone = stats.approved === stats.total && stats.total > 0;
  const anyRunning = selected.some((id) => Boolean(getTaskByAsset(id)));
  const generatingTask = current ? getTaskByAsset(current.id) : undefined;

  const toggleSelect = (id: string, checked: boolean) =>
    setSelected((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));

  const catalogModels = useSettingsStore((s) => s.models);
  const imageModelId = (() => {
    const slot = episode.stageModels?.characters as { image?: string } | undefined;
    if (slot?.image) return slot.image;
    return catalogModels.find((m) => m.type === 'image' && m.status === 'enabled')?.id ?? '';
  })();
  const imageModelName = catalogModels.find((m) => m.id === imageModelId)?.name ?? '';

  const runGenerate = (id: string) => {
    if (getTaskByAsset(id)) return;
    generate(id, { modelId: imageModelId, modelName: imageModelName });
  };

  const runBatch = () => {
    selected.forEach(runGenerate);
    toast.info(`已提交 ${selected.length} 个生成任务`);
  };

  const getShotCount = (name: string) => shotStats.find((s) => s.name === name)?.shotCount;
  const getCharShots = (name: string) => {
    const stat = shotStats.find((s) => s.name === name);
    if (!stat) return [];
    return (episode.directing ?? []).filter((s: ShotCard) => stat.shotIds.includes(s.id));
  };
  const getShotStat = (name: string) => shotStats.find((s) => s.name === name);

  const handleCardClick = (id: string) => {
    setCurrentId(id);
    setShowDrawer(true);
  };

  const handleUpdateDescription = (value: string) => {
    if (!current) return;
    upsertAssets([{ ...current, description: value }]);
  };

  const handleUpdatePrompt = (value: string) => {
    if (!current) return;
    upsertAssets([{ ...current, prompt: value }]);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* 顶部工具栏 */}
      <div className="flex shrink-0 items-center justify-between gap-4 rounded-2xl border border-border/60 bg-card/80 px-6 py-4 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-lg shadow-primary/20">
            <Users className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">角色资产</h1>
            <p className="text-[11px] text-muted-foreground">
              共 {stats.total} 个 · 草稿 {stats.draft} · 待审核 {stats.pending} · 已批准 {stats.approved}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 rounded-xl border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
            onClick={() => setShowCharacterLibrary(true)}
          >
            <BookOpen className="mr-1.5 h-3.5 w-3.5" />
            角色库
            <Badge variant="outline" className="ml-1.5 font-mono text-[9px]">{projectCharacters.length}</Badge>
          </Button>
          <div className="h-8 w-px bg-border" />
          <StageModelPicker
            stage="characters"
            type="image"
            label="角色图模型"
            episodeId={episode.id}
          />
          <div className="h-8 w-px bg-border" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 rounded-xl"
            onClick={handleReextract}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            从分镜提取
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-9 rounded-xl bg-gradient-to-r from-primary to-primary/80 shadow-md shadow-primary/20"
            onClick={() => setShowAddDialog(true)}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            手动添加
          </Button>
        </div>
      </div>

      {/* 完成状态提示 */}
      {allDone && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex shrink-0 items-center gap-4 rounded-2xl border border-success/30 bg-success/10 px-6 py-4"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/20">
            <CheckCircle2 className="h-5 w-5 text-success" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-success">角色资产已完成</div>
            <div className="text-[11px] text-muted-foreground">全部 {stats.total} 个角色立绘已批准，可以进入道具资产阶段</div>
          </div>
          <Link to={`/comic/projects/${episode.projectId}/episodes/${episode.id}/props`}>
            <Button type="button" size="sm" className="h-9 rounded-xl bg-success hover:bg-success/90 text-success-foreground">
              进入道具资产
              <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </Link>
        </motion.div>
      )}

      {/* 搜索栏 */}
      <div className="flex shrink-0 items-center gap-4">
        <div className="relative min-w-[240px] flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索角色..."
            className="h-10 rounded-xl border-border/60 bg-card/80 pl-11 text-sm backdrop-blur-sm focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* 角色资产网格 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {filteredChars.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-muted/30">
              <Users className="h-12 w-12 text-muted-foreground/30" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-foreground">暂无角色资产</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {projectCharacters.length > 0
                  ? `角色库中有 ${projectCharacters.length} 个角色，可直接引用`
                  : '从分镜提取或手动添加角色资产'}
              </p>
            </div>
            <div className="flex gap-3">
              {projectCharacters.length > 0 && (
                <Button
                  type="button"
                  size="lg"
                  className="h-11 rounded-xl border-amber-500/30 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 shadow-md shadow-amber-500/10"
                  onClick={() => setShowCharacterLibrary(true)}
                >
                  <BookOpen className="mr-2 h-4 w-4" />
                  从角色库引用
                </Button>
              )}
              <Button
                type="button"
                size="lg"
                className="h-11 rounded-xl bg-gradient-to-r from-primary to-primary/80 shadow-lg shadow-primary/20"
                onClick={handleReextract}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                从分镜提取
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="h-11 rounded-xl"
                onClick={() => setShowAddDialog(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                手动添加
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            <AnimatePresence>
              {filteredChars.map((char) => (
                <CharacterGridCard
                  key={char.id}
                  char={char}
                  projectCharacter={projectCharacters.find((pc) => pc.name === char.name)}
                  shotCount={getShotCount(char.name)}
                  selected={selected.includes(char.id)}
                  generatingTask={getTaskByAsset(char.id)}
                  onSelect={() => handleCardClick(char.id)}
                  onToggleCheck={(checked) => toggleSelect(char.id, checked)}
                  onDelete={() => setPendingDelete(char.id)}
                />
              ))}
            </AnimatePresence>

            {/* 添加角色卡片 */}
            <motion.div
              whileHover={{ y: -4, scale: 1.02 }}
              className="group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border/60 bg-card/30 p-8 transition-all hover:border-primary/40 hover:bg-primary/5"
              onClick={() => setShowAddDialog(true)}
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 transition-all group-hover:bg-primary/20 group-hover:scale-110">
                <Plus className="h-7 w-7 text-primary" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">添加角色</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">手动创建角色资产</p>
              </div>
            </motion.div>
          </div>
        )}
      </div>

      {/* 批量操作栏 */}
      <AnimatePresence>
        {selected.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="flex shrink-0 items-center gap-4 rounded-2xl border border-primary/30 bg-primary/10 px-6 py-4 shadow-lg shadow-primary/10 backdrop-blur-sm"
          >
            <Checkbox
              checked={selected.length === filteredChars.length}
              onCheckedChange={(v) => setSelected(v ? filteredChars.map((c) => c.id) : [])}
              className="h-5 w-5 rounded-md border-2"
            />
            <div>
              <span className="text-sm font-semibold text-foreground">已选 {selected.length} 个角色</span>
              <span className="ml-2 text-[11px] text-muted-foreground">预估费用 ¥{(selected.length * 0.06).toFixed(2)}</span>
            </div>
            <div className="ml-auto flex gap-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 rounded-xl"
                onClick={() => setSelected([])}
              >
                <X className="mr-1.5 h-3.5 w-3.5" />
                取消选择
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-9 rounded-xl bg-gradient-to-r from-primary to-primary/80 shadow-md shadow-primary/20"
                disabled={anyRunning}
                onClick={runBatch}
              >
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                批量生成
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 详情抽屉 */}
      {showDrawer && current && (
        <CharacterDetailDrawer
          char={current}
          shotCount={getShotCount(current.name)}
          charShots={getCharShots(current.name)}
          shotStat={getShotStat(current.name)}
          generatingTask={generatingTask}
          imageModelId={imageModelId}
          imageModelName={imageModelName}
          statement={statement}
          setStatement={setStatement}
          projectCharacter={projectCharacters.find((pc) => pc.name === current.name)}
          onClose={() => setShowDrawer(false)}
          onGenerate={() => runGenerate(current.id)}
          onApprove={() => approveAsset(current.id, statement.trim())}
          onReject={() => rejectAsset(current.id, statement || '不符合预期')}
          onToggleGlobal={() => toggleGlobal(current.id)}
          onUpdateDescription={handleUpdateDescription}
          onUpdatePrompt={handleUpdatePrompt}
        />
      )}

      {/* 提取确认弹窗 */}
      <Dialog open={showExtractConfirm} onOpenChange={setShowExtractConfirm}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-lg shadow-primary/20">
                <Users className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle>从分镜提取角色</DialogTitle>
                <p className="text-[11px] text-muted-foreground">
                  检测到分镜中有 {shotStats.length} 个角色，角色库中已有 {shotStats.filter((s) => projectCharacters.some((pc) => pc.name === s.name)).length} 个可引用
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4">
            <div className="space-y-2 px-6">
              {shotStats.map((s) => {
                const libraryMatches = projectCharacters.filter((pc) => pc.name === s.name);
                const inEpisode = chars.some((c) => c.name === s.name);
                const selected = selectedExtractNames.has(s.name);
                const expanded = expandedExtractName === s.name;
                const selectedLibId = selectedLibraryIdMap[s.name];
                const selectedLibChar = selectedLibId && selectedLibId !== 'new'
                  ? projectCharacters.find((pc) => pc.id === selectedLibId)
                  : null;

                return (
                  <div
                    key={s.name}
                    className={cn(
                      'rounded-xl border transition-all overflow-hidden',
                      selected ? 'border-primary/50 bg-primary/5' : 'border-border/40 bg-card/50',
                    )}
                  >
                    {/* 角色栏 */}
                    <div className="flex items-center gap-3 p-3">
                      <div
                        className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded border-2 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedExtractNames((prev) => {
                            const next = new Set(prev);
                            if (next.has(s.name)) next.delete(s.name); else next.add(s.name);
                            return next;
                          });
                        }}
                      >
                        <div className={cn(
                          'flex h-full w-full items-center justify-center rounded transition-colors',
                          selected ? 'border-primary bg-primary' : 'border-transparent',
                        )}>
                          {selected && <Check className="h-3 w-3 text-white" />}
                        </div>
                      </div>
                      <div
                        className="min-w-0 flex-1 cursor-pointer"
                        onClick={() => {
                          setLibraryPickerName(s.name);
                          setShowAllLibraryInPicker(false);
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{s.name}</span>
                          {libraryMatches.length > 0 ? (
                            <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 text-[9px]">
                              <BookOpen className="mr-1 h-2.5 w-2.5" />
                              角色库 {libraryMatches.length} 个档案
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-border/40 text-muted-foreground text-[9px]">
                              新建角色
                            </Badge>
                          )}
                          {inEpisode && (
                            <Badge variant="outline" className="border-success/30 text-success text-[9px]">已在本集</Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          出场 {s.shotCount} 镜 · 覆盖 {s.sceneCount} 个场景
                          {selectedLibChar && ` · 已选：${selectedLibChar.identity || selectedLibChar.gender || '角色档案'}`}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground cursor-pointer"
                        onClick={() => {
                          setLibraryPickerName(s.name);
                          setShowAllLibraryInPicker(false);
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between border-t border-border/60 px-6 py-3">
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedExtractNames(new Set(shotStats.map((s) => s.name)))}
              >
                全选
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedExtractNames(new Set())}
              >
                取消全选
              </Button>
              <span className="text-[11px] text-muted-foreground">已选 {selectedExtractNames.size} 个</span>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowExtractConfirm(false)}>
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-gradient-to-r from-primary to-primary/80 shadow-md shadow-primary/20"
                onClick={confirmExtract}
                disabled={selectedExtractNames.size === 0}
              >
                确认提取
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 项目角色设定集选择弹窗 */}
      <Dialog open={libraryPickerName !== null} onOpenChange={(open) => !open && setLibraryPickerName(null)}>
        <DialogContent className="max-w-xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 shadow-lg shadow-amber-500/20">
                <BookOpen className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle>项目角色设定集</DialogTitle>
                <p className="text-[11px] text-muted-foreground">
                  为「{libraryPickerName}」选择要引用的角色档案（同一角色可能有多个设定版本）
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4">
            <div className="px-6">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[10px] font-medium text-muted-foreground">
                  {showAllLibraryInPicker
                    ? `全部角色库（${projectCharacters.length} 个档案，同名优先）`
                    : `同名匹配（${projectCharacters.filter((pc) => pc.name === libraryPickerName).length} 个档案）`}
                </p>
                {projectCharacters.length > projectCharacters.filter((pc) => pc.name === libraryPickerName).length && (
                  <button
                    type="button"
                    className="text-[10px] text-primary hover:underline"
                    onClick={() => setShowAllLibraryInPicker(!showAllLibraryInPicker)}
                  >
                    {showAllLibraryInPicker ? '只看同名' : '查看全部角色库'}
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {(() => {
                  const sameName = projectCharacters.filter((pc) => pc.name === libraryPickerName);
                  const otherName = projectCharacters.filter((pc) => pc.name !== libraryPickerName);
                  const displayList = showAllLibraryInPicker ? [...sameName, ...otherName] : sameName;

                  return displayList.map((pc) => {
                    const isSelected = selectedLibraryIdMap[libraryPickerName || ''] === pc.id;
                    const isSameName = pc.name === libraryPickerName;
                    return (
                      <div
                        key={pc.id}
                        className={cn(
                          'cursor-pointer rounded-xl border p-3 transition-all',
                          isSelected ? 'border-amber-500/50 bg-amber-500/10' : 'border-border/40 hover:border-border/60',
                          !isSameName && 'opacity-70',
                        )}
                        onClick={() => {
                          if (libraryPickerName) {
                            setSelectedLibraryIdMap((prev) => ({ ...prev, [libraryPickerName]: pc.id }));
                            setSelectedExtractNames((prev) => {
                              const next = new Set(prev);
                              next.add(libraryPickerName);
                              return next;
                            });
                            setLibraryPickerName(null);
                            toast.success(`已选择引用「${pc.name}」的角色档案`);
                          }
                        }}
                      >
                        <div className="flex gap-3">
                          {/* 标准立绘预览 */}
                          <div className="h-20 w-14 shrink-0 overflow-hidden rounded-lg border border-border/40 bg-muted/30">
                            {pc.imageUrl ? (
                              <img src={pc.imageUrl} alt={pc.name} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center">
                                <User className="h-6 w-6 text-muted-foreground/40" />
                              </div>
                            )}
                          </div>
                          {/* 角色信息 */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <div className={cn(
                                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                                isSelected ? 'border-amber-500 bg-amber-500' : 'border-border',
                              )}>
                                {isSelected && <Check className="h-3 w-3 text-white" />}
                              </div>
                              <span className="text-sm font-semibold truncate">{pc.name}</span>
                              {!isSameName && <Badge variant="outline" className="text-[9px] border-border/40 text-muted-foreground shrink-0">不同名</Badge>}
                              {pc.imageStatus === 'generated' && <Badge variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-600 shrink-0">有立绘</Badge>}
                            </div>
                            {pc.identity && <p className="mt-0.5 ml-7 text-[11px] text-muted-foreground truncate">{pc.identity}</p>}
                            <div className="mt-1.5 ml-7 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                              {pc.gender && <span>性别：{pc.gender}</span>}
                              {pc.age && <span>年龄：{pc.age}</span>}
                              {pc.hairstyle && <span className="truncate">发型：{pc.hairstyle}</span>}
                              {pc.eyeColor && <span>瞳色：{pc.eyeColor}</span>}
                              {pc.bodyType && <span>体型：{pc.bodyType}</span>}
                              {pc.clothingStyle && <span className="truncate">风格：{pc.clothingStyle}</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}

                {/* 新建空白角色选项 */}
                <div
                  className={cn(
                    'cursor-pointer rounded-xl border border-dashed p-3 transition-all',
                    selectedLibraryIdMap[libraryPickerName || ''] === 'new' ? 'border-primary/50 bg-primary/5' : 'border-border/40 hover:border-border/60',
                  )}
                  onClick={() => {
                    if (libraryPickerName) {
                      setSelectedLibraryIdMap((prev) => ({ ...prev, [libraryPickerName]: 'new' }));
                      setSelectedExtractNames((prev) => {
                        const next = new Set(prev);
                        next.add(libraryPickerName);
                        return next;
                      });
                      setLibraryPickerName(null);
                      toast.success('已选择新建空白角色');
                    }
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                      selectedLibraryIdMap[libraryPickerName || ''] === 'new' ? 'border-primary bg-primary' : 'border-border',
                    )}>
                      {selectedLibraryIdMap[libraryPickerName || ''] === 'new' && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <span className="text-sm font-semibold">新建空白角色</span>
                  </div>
                  <p className="mt-1.5 ml-7 text-[10px] text-muted-foreground">不引用角色库，创建空白档案后手动填写设定</p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-border/60 px-6 py-3">
            <Button type="button" variant="outline" size="sm" onClick={() => setLibraryPickerName(null)}>
              取消
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 添加角色弹窗 */}
      <AnimatePresence>
        {showAddDialog && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
              onClick={() => setShowAddDialog(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border/60 bg-card p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-lg shadow-primary/20">
                    <Plus className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground">手动添加角色</h3>
                </div>
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  onClick={() => setShowAddDialog(false)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-xs font-semibold text-foreground">角色名称 *</label>
                  <Input
                    value={newCharName}
                    onChange={(e) => setNewCharName(e.target.value)}
                    placeholder="如：李明、王芳"
                    className="h-10 rounded-xl border-border/60 bg-background/50 text-sm focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold text-foreground">角色描述</label>
                  <Textarea
                    value={newCharDesc}
                    onChange={(e) => setNewCharDesc(e.target.value)}
                    placeholder="描述角色的外貌、服装、性格等特征..."
                    className="min-h-[100px] resize-none rounded-xl border-border/60 bg-background/50 text-sm focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
              <div className="mt-6 flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 h-10 rounded-xl"
                  onClick={() => setShowAddDialog(false)}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  className="flex-1 h-10 rounded-xl bg-gradient-to-r from-primary to-primary/80 shadow-md shadow-primary/20"
                  onClick={handleAddChar}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  添加角色
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 删除确认弹窗 */}
      <AnimatePresence>
        {pendingDelete && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
              onClick={() => setPendingDelete(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border/60 bg-card p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10">
                  <Trash2 className="h-5 w-5 text-destructive" />
                </div>
                <h3 className="text-lg font-bold text-foreground">确认删除</h3>
              </div>
              <p className="mb-6 text-sm text-muted-foreground">
                确定要删除角色「{chars.find((c) => c.id === pendingDelete)?.name}」吗？此操作不可撤销，相关的生成结果和版本历史也会被删除。
              </p>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 h-10 rounded-xl"
                  onClick={() => setPendingDelete(null)}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  className="flex-1 h-10 rounded-xl bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                  onClick={() => handleDelete(pendingDelete)}
                >
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  确认删除
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 项目级角色库弹窗 */}
      <AnimatePresence>
        {showCharacterLibrary && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
              onClick={() => setShowCharacterLibrary(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed left-1/2 top-1/2 z-50 flex max-h-[80vh] w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-border/60 bg-card shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/20">
                    <BookOpen className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">项目角色设定集</h3>
                    <p className="text-[11px] text-muted-foreground">全剧通用角色设定 · 引用后单集可覆盖状态</p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  onClick={() => setShowCharacterLibrary(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {projectCharacters.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50">
                      <Users className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h4 className="text-sm font-medium text-foreground">项目角色库为空</h4>
                    <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                      前往项目详情页的「角色库」Tab 建立项目级角色设定，或后续从剧本批量提取
                    </p>
                    <Link to={`/comic/projects/${episode.projectId}`} target="_blank">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-4 rounded-xl"
                      >
                        前往项目角色库
                        <ChevronRight className="ml-1 h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {projectCharacters.map((pc) => {
                      const isLinked = chars.some((c) => c.name === pc.name);
                      return (
                        <div
                          key={pc.id}
                          className="rounded-xl border border-border/60 bg-muted/20 p-4 transition-all hover:border-amber-500/40 hover:bg-amber-500/5"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20">
                                <User className="h-4 w-4 text-amber-500" />
                              </div>
                              <div>
                                <h4 className="text-sm font-semibold text-foreground">{pc.name}</h4>
                                <p className="text-[10px] text-muted-foreground">{pc.identity || '未设置身份'}</p>
                              </div>
                            </div>
                            {isLinked ? (
                              <Badge variant="outline" className="border-success/30 bg-success/10 text-success text-[9px]">
                                已引用
                              </Badge>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 rounded-lg text-[10px]"
                                onClick={() => {
                                  // 引用项目级角色到单集
                                  const stableId = `${episode.id}-char-${pc.name.replace(/\s+/g, '-')}`;
                                  const prompt = generatePromptFromProjectCharacter(pc);
                                  upsertAssets([{
                                    id: stableId,
                                    projectId: episode.projectId,
                                    episodeId: episode.id,
                                    kind: 'character' as const,
                                    name: pc.name,
                                    description: `引用自项目角色库：${pc.identity || ''}`,
                                    scope: 'episode' as const,
                                    sourceScene: '项目角色库引用',
                                    status: 'DRAFT' as const,
                                    imageUrl: pc.imageUrl || undefined,
                                    currentVersion: 1,
                                    versions: [{
                                      version: 1,
                                      prompt,
                                      negativePrompt: generateNegativePrompt(),
                                      sha256: '',
                                      status: 'DRAFT' as const,
                                      createdAt: Date.now(),
                                    }],
                                    prompt,
                                    negativePrompt: generateNegativePrompt(),
                                    model: '',
                                    stale: false,
                                    createdAt: Date.now(),
                                  }]);
                                  toast.success(`已引用角色「${pc.name}」到本集`);
                                }}
                              >
                                <Link2 className="mr-1 h-3 w-3" />
                                引用
                              </Button>
                            )}
                          </div>
                          <div className="mt-3 space-y-1 text-[10px] text-muted-foreground">
                            <div className="flex gap-1">
                              <span className="shrink-0 text-muted-foreground/60">外貌：</span>
                              <span className="truncate">
                                {[pc.hairColor, pc.hairstyle, pc.eyeColor && `${pc.eyeColor}眼睛`].filter(Boolean).join('，') || '未设置'}
                              </span>
                            </div>
                            <div className="flex gap-1">
                              <span className="shrink-0 text-muted-foreground/60">服装：</span>
                              <span className="truncate">
                                {[pc.top, pc.bottom, pc.clothingStyle].filter(Boolean).join('，') || '未设置'}
                              </span>
                            </div>
                            <div className="flex gap-1">
                              <span className="shrink-0 text-muted-foreground/60">性格：</span>
                              <span className="truncate">{pc.personality || '未设置'}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-border/60 px-6 py-3">
                <p className="text-[10px] text-muted-foreground">
                  项目级设定为全剧通用，单集引用后可在详情中覆盖本集状态（情绪/受伤/换装等）
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  onClick={() => setShowCharacterLibrary(false)}
                >
                  关闭
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="w-16 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <span className="flex-1 text-[11px] text-foreground">{value || '—'}</span>
    </div>
  );
}
