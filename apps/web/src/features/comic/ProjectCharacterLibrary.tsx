// 项目级角色库（Character Bible）：全剧通用角色设定管理
// 功能：角色卡片网格、新增/编辑/删除角色、角色详情展示、从剧本批量提取
import { useState, useMemo, useEffect } from 'react';
import { Users, Plus, Trash2, Edit3, User, X, Save, Sparkles, Loader2, Check, Image as ImageIcon, RefreshCw, RotateCcw, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useProjectCharacterStore, buildCharacterReferencePrompt, IMAGE_SIZE_MAP } from '@/stores/useProjectCharacterStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useStyleStore } from '@/stores/useStyleStore';
import { DEFAULT_STYLE_OPTIONS } from '@/mocks/styles';
import { useShallow } from 'zustand/react/shallow';
import { api } from '@/lib/api/client';
import { resolveTaskResult } from '@/features/genworkbench/result-utils';
import type { ProjectCharacter, ProjectCharacterForm } from '@/types';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const EMPTY_FORM: ProjectCharacterForm = {
  name: '',
  gender: '',
  age: '',
  identity: '',
  hairstyle: '',
  eyeColor: '',
  facialFeatures: '',
  specialMarks: '',
  bodyType: '',
  skinTexture: '',
  top: '',
  bottom: '',
  shoes: '',
  clothingStyle: '',
  performance: '',
};

export default function ProjectCharacterLibrary({ projectId }: { projectId: string }) {
  const allCharacters = useProjectCharacterStore(useShallow((s) => s.characters));
  const characters = allCharacters.filter((c) => c.projectId === projectId);
  const addCharacter = useProjectCharacterStore((s) => s.addCharacter);
  const updateCharacter = useProjectCharacterStore((s) => s.updateCharacter);
  const removeCharacter = useProjectCharacterStore((s) => s.removeCharacter);
  const importCharacters = useProjectCharacterStore((s) => s.importCharacters);
  const setGenerating = useProjectCharacterStore((s) => s.setGenerating);
  const setLoading = useProjectCharacterStore((s) => s.setLoading);
  const setGenerated = useProjectCharacterStore((s) => s.setGenerated);
  const setGenerateFailed = useProjectCharacterStore((s) => s.setGenerateFailed);
  const loadFromBackend = useProjectCharacterStore((s) => s.loadFromBackend);

  // 组件加载时从后端同步项目角色库
  useEffect(() => {
    loadFromBackend(projectId);
  }, [projectId, loadFromBackend]);

  const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId));
  const catalogModels = useSettingsStore(useShallow((s) => s.models));

  // 获取项目默认图片模型
  const defaultImageModel = useMemo(() => {
    if (!project?.defaultImageModel) return null;
    return catalogModels.find((m) => m.name === project.defaultImageModel) || null;
  }, [project, catalogModels]);

  // 获取项目视觉风格（响应式，风格库更新时自动同步）
  const styles = useStyleStore((s) => s.styles);
  const projectStyle = useMemo(() => {
    if (!project?.styleId) return null;
    const style = styles.find((s) => s.id === project.styleId);
    if (style) return style;
    return DEFAULT_STYLE_OPTIONS.find((s) => s.id === project.styleId) ?? null;
  }, [project, styles]);

  const stylePrompt = projectStyle?.prompt?.trim() || projectStyle?.description?.trim() || '';

  // 从后端加载角色资产（同步单集中已生成的角色到项目级角色库）
  useEffect(() => {
    let cancelled = false;
    const loadFromServer = async () => {
      try {
        const episodesRes = await api.listEpisodes(projectId);
        const episodes = episodesRes.items || [];
        const allCharacters: ProjectCharacterForm[] = [];

        for (const ep of episodes) {
          try {
            const assetsRes = await api.listEpisodeAssets(projectId, ep.id);
            const assets = assetsRes.items || [];
            for (const asset of assets) {
              if (asset.kind === 'character' && asset.name) {
                allCharacters.push({
                  name: asset.name,
                  gender: '',
                  age: '',
                  identity: asset.description || '',
                  hairstyle: '',
                  eyeColor: '',
                  facialFeatures: '',
                  specialMarks: '',
                  bodyType: '',
                  skinTexture: '',
                  top: '',
                  bottom: '',
                  shoes: '',
                  clothingStyle: '',
                  performance: '',
                  imageUrl: asset.image_url || undefined,
                  imageStatus: asset.image_url ? 'generated' : 'not_generated',
                  imagePrompt: asset.prompt || undefined,
                  imageNegativePrompt: asset.negative_prompt || undefined,
                  imageAspectRatio: '9:16',
                });
              }
            }
          } catch (e) {
            console.warn(`加载剧集 ${ep.id} 资产失败:`, e);
          }
        }

        if (!cancelled && allCharacters.length > 0) {
          importCharacters(projectId, allCharacters);
        }
      } catch (e) {
        console.warn('从后端加载角色资产失败:', e);
      }
    };
    loadFromServer();
    return () => { cancelled = true; };
  }, [projectId, importCharacters]);

  // 友好错误提示：把技术错误转换为用户可理解的提示
  const friendlyError = (error: string): string => {
    if (error.includes('credentials missing') || error.includes('channel credentials not configured')) {
      return '该模型的渠道凭据未配置，请前往「设置中心 → 渠道管理」配置 API Key';
    }
    if (error.includes('502') || error.includes('Bad Gateway')) {
      return '服务暂时不可用，请稍后重试';
    }
    if (error.includes('timeout') || error.includes('超时')) {
      return '生成超时，请稍后重试';
    }
    if (error.includes('model not found') || error.includes('模型不存在')) {
      return '模型不存在或已被禁用，请在项目设置中重新选择模型';
    }
    if (error.includes('rate limit') || error.includes('限流')) {
      return 'API 调用频率超限，请稍后重试';
    }
    if (error.includes('insufficient') || error.includes('余额不足')) {
      return 'API 余额不足，请充值后重试';
    }
    return error;
  };

  // 生成标准立绘
  const generateReference = async (char: ProjectCharacter, customPrompt: string | undefined, jobId: string) => {
    if (!defaultImageModel) {
      toast.error('未找到可用的图片生成模型，请先在项目设置中配置图片模型');
      return;
    }
    if (char.imageStatus === 'generating') return;

    // 图片尺寸：角色立绘默认 9:16 竖版（只传比例，由模型/后端处理像素尺寸）
    const aspectRatio = char.imageAspectRatio || project?.aspectRatio || '9:16';

    // 生成提示词：优先使用用户自定义的，否则自动生成（注入项目风格和尺寸）
    const { prompt: autoPrompt, negativePrompt } = buildCharacterReferencePrompt(char, stylePrompt, aspectRatio);
    const prompt = customPrompt || char.imagePrompt || autoPrompt;

    setGenerating(char.id, jobId, defaultImageModel.name, prompt, negativePrompt);
    // 同步更新 viewing 本地状态
    const genUpdated = useProjectCharacterStore.getState().getById(char.id);
    if (genUpdated) setViewing(genUpdated);

    try {
      // Step 1: 创建异步任务
      const task = await api.createTask({
        kind: 'image',
        label: `角色立绘 - ${char.name}`,
        project_id: project?.id,
        payload: {
          modelId: defaultImageModel.id,
          runtime: { prompt, negative_prompt: negativePrompt, aspect_ratio: aspectRatio, n: 1 },
        },
      });

      // Step 2: 轮询任务状态
      const maxPolls = 120; // 最多 6 分钟（每 3 秒一次）
      let finalTask = task;
      for (let i = 0; i < maxPolls; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        finalTask = await api.getTask(task.id);
        if (finalTask.status === 'succeeded' || finalTask.status === 'failed' || finalTask.status === 'cancelled') {
          break;
        }
      }

      // Step 3: 处理结果（原子性已保证：succeeded时结果已经可读）
      if (finalTask.status !== 'succeeded') {
        const rawError = finalTask.error || '生成任务未完成（可能超时）';
        const error = friendlyError(rawError);
        setGenerateFailed(char.id, error);
        const updated = useProjectCharacterStore.getState().getById(char.id);
        if (updated) setViewing(updated);
        toast.error(`标准立绘生成失败：${error}`);
        return;
      }

      // 提取图片URL（带重试：防止极端时序下result尚未可读）
      let url: string | undefined;
      for (let retry = 0; retry < 10; retry++) {
        if (retry > 0) {
          await new Promise((r) => setTimeout(r, 2000));
          finalTask = await api.getTask(task.id);
        }

        let payload: { result?: Record<string, unknown> } | undefined;
        if (typeof finalTask.intent_payload === 'string') {
          try {
            payload = JSON.parse(finalTask.intent_payload);
          } catch (e) {
            console.error('[立绘生成] JSON.parse intent_payload failed:', e);
          }
        } else {
          payload = finalTask.intent_payload as { result?: Record<string, unknown> } | undefined;
        }

        // 结果优先读 result_payload（execution 010 起与意图分离），回退历史行的 intent_payload.result
        const result = resolveTaskResult(finalTask);
        const payloadKeys = payload ? Object.keys(payload) : [];
        const resultKeys = Object.keys(result);
        const payloadLen = typeof finalTask.intent_payload === 'string' ? finalTask.intent_payload.length : JSON.stringify(finalTask.intent_payload || '').length;
        console.log(`[立绘生成] extract retry=${retry}: status=${finalTask.status}, payloadLen=${payloadLen}, payloadKeys=${JSON.stringify(payloadKeys)}, resultKeys=${JSON.stringify(resultKeys)}`);

        url = (result['output.image_urls.0'] || result['output.data.0.url'] || result['output.0.url'] || result['data.0.url'] || result['result.url'] || result['url']) as string | undefined;
        if (url) {
          console.log(`[立绘生成] got url on retry ${retry}:`, url);
          break;
        }
      }

      if (!url) {
        console.error('[立绘生成] Failed to get image URL after 10 retries, task id:', task.id);
        setGenerateFailed(char.id, '响应未包含图片地址（任务已完成但结果缺失，请重试生成）');
        const updated = useProjectCharacterStore.getState().getById(char.id);
        if (updated) setViewing(updated);
        toast.error('标准立绘生成失败：响应未包含图片地址，请重试');
        return;
      }

      // Step 4: 进入"图片加载中"状态，用Image对象预加载（等待网络下载完成）
      setLoading(char.id);
      const loadingUpdated = useProjectCharacterStore.getState().getById(char.id);
      if (loadingUpdated) setViewing(loadingUpdated);

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        setGenerated(char.id, url);
        const updated = useProjectCharacterStore.getState().getById(char.id);
        if (updated) setViewing(updated);
        toast.success(`「${char.name}」标准立绘生成完成`);

        // 同步到后端数据库（项目级角色表 project_characters）
        api.updateProjectCharacter(projectId, char.id, {
          image_url: url,
          image_status: 'generated',
          image_prompt: prompt,
          image_model: defaultImageModel?.name,
        }).catch((syncErr) => {
          console.warn('同步图片URL到后端失败:', syncErr);
        });
      };
      img.onerror = () => {
        setGenerateFailed(char.id, '图片加载失败');
        const updated = useProjectCharacterStore.getState().getById(char.id);
        if (updated) setViewing(updated);
        toast.error('标准立绘生成失败：图片加载失败');
      };
      img.src = url;
      return;
    } catch (cause) {
      const rawError = cause instanceof Error ? cause.message : '生成失败';
      const error = friendlyError(rawError);
      setGenerateFailed(char.id, error);
      // 同步更新 viewing 本地状态
      const updated = useProjectCharacterStore.getState().getById(char.id);
      if (updated) setViewing(updated);
      toast.error(`标准立绘生成失败：${error}`);
    }
  };

  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProjectCharacterForm>(EMPTY_FORM);
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [completingField, setCompletingField] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<ProjectCharacter | null>(null);
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [promptDraft, setPromptDraft] = useState('');
  const [imageLoadError, setImageLoadError] = useState(false);
  const [cardImageErrors, setCardImageErrors] = useState<Set<string>>(new Set());
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);

  // 从剧本提取角色设定
  const [extracting, setExtracting] = useState(false);
  const [extractOpen, setExtractOpen] = useState(false);
  const [extractedCharacters, setExtractedCharacters] = useState<ProjectCharacterForm[]>([]);
  const [selectedExtractIds, setSelectedExtractIds] = useState<Set<number>>(new Set());

  // 获取项目剧本原文
  const scriptText = useMemo(() => {
    if (!project) return '';
    const source = project.sourceVersions.find((v) => v.version === project.currentSourceVersion);
    return source?.text ?? '';
  }, [project]);

  // 获取默认文本模型
  const textModelId = useMemo(() => {
    return catalogModels.find((m) => m.type === 'text' && m.status === 'enabled')?.id ?? '';
  }, [catalogModels]);

  // 从剧本提取角色设定
  const handleExtractFromScript = async () => {
    if (!textModelId) {
      toast.error('未找到可用的文本模型，请先在模型配置启用文本模型');
      return;
    }
    if (!scriptText || scriptText.length < 50) {
      toast.error('剧本内容过短，无法提取角色设定');
      return;
    }

    setExtracting(true);
    try {
      const prompt =
        '你是「漫剧导演工作台」的角色设定分析师。职责：从剧本原文中提取所有有名字的角色的基本设定。\n\n' +
        '【提取规则】\n' +
        '1. 只提取有具体名字的角色，不提取群体角色（如"众人"、"士兵们"、"队友们"等）\n' +
        '2. 只提取剧本中明确描述的内容，不确定的字段留空，不要编造\n' +
        '3. 外貌描述包括：发型、发色、瞳色、面部特征、体型\n' +
        '4. 服装描述包括：上装、下装、鞋子、配饰、服装风格\n' +
        '5. 性格特征从角色的言行举止中推断\n' +
        '6. 身份/职业从角色的称呼、行为中推断\n\n' +
        '【输出格式（严格输出以下 JSON 数组，不要任何其他文字）】\n' +
        '[\n' +
        '  {\n' +
        '    "name": "角色名称",\n' +
        '    "gender": "男/女",\n' +
        '    "age": "如：25岁",\n' +
        '    "identity": "身份/职业",\n' +
        '    "hairstyle": "发型",\n' +
        '    "hairColor": "发色",\n' +
        '    "eyeColor": "瞳色",\n' +
        '    "facialFeatures": "面部特征",\n' +
        '    "bodyType": "体型",\n' +
        '    "height": "身高",\n' +
        '    "top": "上装",\n' +
        '    "bottom": "下装",\n' +
        '    "shoes": "鞋子",\n' +
        '    "accessories": "配饰",\n' +
        '    "clothingStyle": "服装风格",\n' +
        '    "personality": "性格关键词",\n' +
        '    "typicalExpression": "典型表情",\n' +
        '    "behavior": "行为习惯",\n' +
        '    "specialMarks": "特殊标记",\n' +
        '    "background": "背景故事"\n' +
        '  }\n' +
        ']\n\n' +
        '【剧本原文】\n' +
        scriptText.slice(0, 8000); // 限制长度，避免超出模型上下文

      const res = await api.runModelTest(textModelId, {
        messages: [{ role: 'user', content: prompt }],
      });
      const note = res.run?.extracted?.['choices.0.message.content'];
      if (res.ok && typeof note === 'string' && note.trim()) {
        const raw = note.trim();
        // 解析 JSON：支持纯 JSON 或被 ```json 包裹的情况
        const jsonStr = raw.startsWith('```')
          ? raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
          : raw;
        try {
          const parsed = JSON.parse(jsonStr);
          if (Array.isArray(parsed) && parsed.length > 0) {
            // 过滤掉没有名字的角色
            const valid = parsed.filter((c: any) => c.name && c.name.trim());
            if (valid.length > 0) {
              setExtractedCharacters(valid);
              setSelectedExtractIds(new Set(valid.map((_: any, i: number) => i)));
              setExtractOpen(true);
              toast.success(`已从剧本提取 ${valid.length} 个角色设定，请确认后入库`);
            } else {
              toast.info('剧本中未找到有名字的角色');
            }
          } else {
            toast.error('提取结果格式异常，请重试');
          }
        } catch {
          toast.error('提取结果解析失败，请重试');
        }
      } else {
        toast.error('文本模型调用失败，请检查模型配置后重试');
      }
    } catch {
      toast.error('从剧本提取角色设定失败，请稍后重试');
    } finally {
      setExtracting(false);
    }
  };

  // 确认提取的角色并入库
  const handleConfirmExtract = () => {
    const toImport = extractedCharacters.filter((_, i) => selectedExtractIds.has(i));
    if (toImport.length === 0) {
      toast.error('请至少选择一个角色');
      return;
    }
    // 过滤掉已存在的角色（按名称匹配）
    const existingNames = new Set(characters.map((c) => c.name));
    const newChars = toImport.filter((c) => !existingNames.has(c.name));
    if (newChars.length === 0) {
      toast.info('所选角色均已存在于项目角色库中');
      setExtractOpen(false);
      return;
    }
    importCharacters(projectId, newChars);
    toast.success(`已导入 ${newChars.length} 个角色设定到项目角色库`);
    setExtractOpen(false);
    setExtractedCharacters([]);
    setSelectedExtractIds(new Set());
  };

  const toggleExtractSelect = (index: number) => {
    setSelectedExtractIds((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setEditOpen(true);
  };

  const openEdit = (char: ProjectCharacter) => {
    setEditingId(char.id);
    const { id: _id, projectId: _pid, createdAt: _c, updatedAt: _u, ...rest } = char;
    setForm(rest);
    setEditOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error('请输入角色名称');
      return;
    }
    if (editingId) {
      updateCharacter(editingId, form);
      toast.success(`已更新角色「${form.name}」`);
    } else {
      addCharacter(projectId, form);
      toast.success(`已添加角色「${form.name}」`);
    }
    setEditOpen(false);
  };

  const handleDelete = () => {
    if (deleteId) {
      const char = characters.find((c) => c.id === deleteId);
      removeCharacter(deleteId);
      toast.success(`已删除角色「${char?.name}」`);
      setDeleteId(null);
    }
  };

  const updateField = (field: keyof ProjectCharacterForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // AI 智能补全字段描述
  const handleAIAugment = async (field: keyof ProjectCharacterForm) => {
    if (!textModelId) {
      toast.error('未找到可用的文本模型，请先在模型配置启用文本模型');
      return;
    }
    const currentValue = form[field];
    setCompletingField(field);
    try {
      const fieldLabels: Record<string, string> = {
        hairstyle: '发型+发色',
        facialFeatures: '面部特征/妆造',
        bodyType: '体型+身高',
        skinTexture: '皮肤质感',
        clothingStyle: '服装风格+配饰',
        performance: '表演基调（性格+表情+行为）',
        top: '上装',
        bottom: '下装',
        shoes: '鞋子',
        identity: '身份/职业',
      };
      const label = fieldLabels[field] || field;
      const prompt = `你是角色视觉设定专家。请将以下角色的「${label}」描述改写为 AI 图像生成模型能理解的可视化描述。

【核心原则：视听语言，只写"看得到的"】
1. 只输出描述文本，不要任何解释、前缀或引号
2. 必须使用具体的视觉属性：颜色、形状、长度、纹理、材质、位置、数量
3. 禁止使用抽象形容词：疲惫、无精打采、油腻、沧桑、忧郁、温柔、霸气等
4. 禁止使用文学修辞和拟人化：透出...的感觉、仿佛、似乎、像...一样
5. 禁止描述不可见的内在状态：情绪、性格、经历、社会地位
6. 把抽象词翻译成具体视觉："疲惫"→"眼下有黑眼圈，眼睑下垂"；"油腻"→"发丝反光，贴在头皮上"
7. 长度控制在 30-80 字之间，用中文

【正反示例】
✗ 错误：黑色短碎发略带油腻，透出通宵排位后的疲惫
✓ 正确：黑色短发，长度约3cm，发梢参差不齐，额头前有碎发，发丝贴在头皮上，整体造型凌乱

✗ 错误：眼神忧郁，透着故事感
✓ 正确：黑色瞳孔，眼皮微垂，目光向下，眼下有淡青色阴影

【角色信息】
姓名：${form.name || '未命名'}
性别：${form.gender || ''}
年龄：${form.age || ''}
身份：${form.identity || ''}

【当前${label}描述】
${currentValue || '（空，请根据角色信息生成合理的可视化描述）'}

【改写后的可视化描述】`;

      const res = await api.runModelTest(textModelId, {
        messages: [{ role: 'user', content: prompt }],
      });
      const note = res.run?.extracted?.['choices.0.message.content'];
      if (res.ok && typeof note === 'string' && note.trim()) {
        const augmented = note.trim().replace(/^["'「」]+|["'「」]+$/g, '');
        updateField(field, augmented);
        toast.success(`已 AI 补全「${label}」`);
      } else {
        toast.error('AI 补全失败，请重试');
      }
    } catch (err) {
      console.error('AI augment error:', err);
      toast.error('AI 补全失败，请检查模型配置');
    } finally {
      setCompletingField(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/20">
            <Users className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-semibold">项目角色设定集</h2>
            <p className="text-[11px] text-muted-foreground">
              全剧通用角色设定，所有剧集共享引用 · 共 {characters.length} 个角色
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl border-violet-500/30 text-violet-500 hover:bg-violet-500/10"
            onClick={handleExtractFromScript}
            disabled={extracting}
          >
            {extracting ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            )}
            {extracting ? '提取中...' : '从剧本提取'}
          </Button>
          <Button
            type="button"
            size="sm"
            className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 shadow-md shadow-amber-500/20"
            onClick={openAdd}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            新增角色
          </Button>
        </div>
      </div>

      {/* 角色卡片网格 */}
      {characters.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 p-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50">
            <Users className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-medium text-foreground">还没有角色设定</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            点击「新增角色」建立项目级角色设定，或后续从剧本批量提取
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4 rounded-xl"
            onClick={openAdd}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            添加第一个角色
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {characters.map((char) => (
            <div
              key={char.id}
              className="group overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-500/40 hover:shadow-lg hover:shadow-amber-500/10"
            >
              {/* 标准立绘区域 - 固定 3:4 比例，图片 object-cover 填充 */}
              <div className="relative aspect-[3/4] w-full overflow-hidden bg-gradient-to-br from-stone-50 to-stone-100">
                {char.imageStatus === 'generated' && char.imageUrl && !cardImageErrors.has(char.id) ? (
                  <img
                    src={char.imageUrl}
                    alt={char.name}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    onError={() => setCardImageErrors(prev => new Set(prev).add(char.id))}
                  />
                ) : char.imageStatus === 'generated' && cardImageErrors.has(char.id) ? (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-stone-100 to-stone-200/50 p-4 text-center">
                    <ImageIcon className="h-8 w-8 text-stone-400" />
                    <span className="text-[10px] text-stone-400">图片加载失败</span>
                  </div>
                ) : char.imageStatus === 'generating' ? (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-amber-50 to-orange-100/50">
                    <div className="relative">
                      <div className="h-12 w-12 rounded-full border-3 border-amber-200 border-t-amber-500 animate-spin" />
                    </div>
                    <span className="text-xs font-medium text-amber-600">标准立绘生成中</span>
                  </div>
                ) : char.imageStatus === 'loading' ? (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-blue-50 to-cyan-100/50">
                    <div className="relative">
                      <div className="h-12 w-12 rounded-full border-3 border-blue-200 border-t-blue-500 animate-spin" />
                    </div>
                    <span className="text-xs font-medium text-blue-600">加载图片中</span>
                  </div>
                ) : char.imageStatus === 'failed' ? (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-red-50 to-red-100/50 p-4 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                      <ImageIcon className="h-6 w-6 text-red-400" />
                    </div>
                    <span className="text-xs font-medium text-red-500">生成失败</span>
                    <span className="line-clamp-2 max-w-[80%] text-[10px] text-red-400">{char.imageError}</span>
                  </div>
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-3">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-100/80 to-orange-100/80 shadow-inner">
                      <User className="h-8 w-8 text-amber-400" />
                    </div>
                    <div className="text-center">
                      <span className="block text-xs font-medium text-stone-400">未生成标准立绘</span>
                      <span className="mt-0.5 block text-[10px] text-stone-300">点击下方按钮生成</span>
                    </div>
                  </div>
                )}

                {/* 左上角 - 标准立绘徽章 */}
                {char.imageStatus === 'generated' && (
                  <div className="absolute left-3 top-3 flex items-center gap-1 rounded-lg bg-amber-500/90 px-2.5 py-1 text-[10px] font-semibold text-white shadow-lg backdrop-blur-sm">
                    <Sparkles className="h-3 w-3" />
                    标准立绘
                  </div>
                )}

                {/* 右上角 - 状态标签 */}
                <div className="absolute right-3 top-3">
                  {char.imageStatus === 'generated' && (
                    <span className="rounded-lg bg-green-500/90 px-2 py-1 text-[10px] font-semibold text-white shadow-md backdrop-blur-sm">
                      ✓ 已生成
                    </span>
                  )}
                  {char.imageStatus === 'generating' && (
                    <span className="rounded-lg bg-amber-500/90 px-2 py-1 text-[10px] font-semibold text-white shadow-md backdrop-blur-sm">
                      生成中
                    </span>
                  )}
                  {char.imageStatus === 'loading' && (
                    <span className="rounded-lg bg-cyan-500/90 px-2 py-1 text-[10px] font-semibold text-white shadow-md backdrop-blur-sm">
                      加载中
                    </span>
                  )}
                  {char.imageStatus === 'failed' && (
                    <span className="rounded-lg bg-red-500/90 px-2 py-1 text-[10px] font-semibold text-white shadow-md backdrop-blur-sm">
                      失败
                    </span>
                  )}
                </div>
              </div>

              {/* 卡片内容 */}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-[15px] font-bold text-foreground">{char.name}</h3>
                      {char.gender && (
                        <Badge variant="outline" className="shrink-0 border-amber-500/20 bg-amber-500/5 text-[9px] font-medium text-amber-600">
                          {char.gender}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">
                      {char.identity || '未设置身份'}
                      {char.age && <span className="ml-1.5 text-muted-foreground/60">· {char.age}</span>}
                    </p>
                  </div>
                </div>

                {/* 设定摘要 */}
                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 font-medium text-stone-500">外貌</span>
                    <span className="truncate text-muted-foreground">
                      {[char.hairColor, char.hairstyle, char.eyeColor && `${char.eyeColor}瞳`].filter(Boolean).join(' · ') || '未设置'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 font-medium text-stone-500">服装</span>
                    <span className="truncate text-muted-foreground">
                      {[char.top, char.bottom, char.clothingStyle].filter(Boolean).join(' · ') || '未设置'}
                    </span>
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="mt-4 flex items-center justify-end gap-1 border-t border-border/50 pt-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 rounded-xl p-0 text-muted-foreground hover:bg-amber-500/10 hover:text-amber-500"
                    onClick={() => { setImageLoadError(false); setViewing(char); }}
                    title="查看详情"
                  >
                    <User className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 rounded-xl p-0 text-muted-foreground hover:bg-amber-500/10 hover:text-amber-500"
                    onClick={() => openEdit(char)}
                    title="编辑"
                  >
                    <Edit3 className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 rounded-xl p-0 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                    onClick={() => setDeleteId(char.id)}
                    title="删除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 编辑弹窗 */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑角色设定' : '新增角色设定'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-4">
            {/* 基本信息 */}
            <div>
              <h4 className="mb-3 text-xs font-semibold text-amber-500">基本信息</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">角色名称 *</label>
                  <Input
                    value={form.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder="如：王力"
                    className="h-9 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">性别</label>
                  <Input
                    value={form.gender}
                    onChange={(e) => updateField('gender', e.target.value)}
                    placeholder="男/女"
                    className="h-9 rounded-lg text-sm"
                  />
                  <div className="mt-1.5 flex gap-1">
                    {['男', '女'].map(tag => (
                      <button key={tag} type="button" onClick={() => updateField('gender', tag)} className="rounded-md border border-border/50 bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground hover:border-amber-400/50 hover:text-amber-600 transition-colors">{tag}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">年龄</label>
                  <Input
                    value={form.age}
                    onChange={(e) => updateField('age', e.target.value)}
                    placeholder="如：25岁"
                    className="h-9 rounded-lg text-sm"
                  />
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {['少年', '青年', '中年', '老年'].map(tag => (
                      <button key={tag} type="button" onClick={() => updateField('age', tag)} className="rounded-md border border-border/50 bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground hover:border-amber-400/50 hover:text-amber-600 transition-colors">{tag}</button>
                    ))}
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">身份/职业</label>
                  <Input
                    value={form.identity}
                    onChange={(e) => updateField('identity', e.target.value)}
                    placeholder="如：剑客、学生..."
                    className="h-9 rounded-lg text-sm"
                  />
                </div>
              </div>
            </div>

            {/* 外貌特征 */}
            <div>
              <h4 className="mb-3 text-xs font-semibold text-violet-500">外貌特征</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="mb-1 flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                    <span>发型 + 发色</span>
                    <button
                      type="button"
                      onClick={() => handleAIAugment('hairstyle')}
                      disabled={completingField === 'hairstyle'}
                      className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-violet-500 hover:bg-violet-500/10 disabled:opacity-50"
                    >
                      {completingField === 'hairstyle' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      AI补全
                    </button>
                  </label>
                  <Input
                    value={form.hairstyle}
                    onChange={(e) => updateField('hairstyle', e.target.value)}
                    placeholder="黑色短发，微卷，额前碎发自然垂落"
                    className="h-9 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">瞳色</label>
                  <Input
                    value={form.eyeColor}
                    onChange={(e) => updateField('eyeColor', e.target.value)}
                    placeholder="如：深黑色"
                    className="h-9 rounded-lg text-sm"
                  />
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {['黑色', '棕色', '蓝色', '琥珀色'].map(tag => (
                      <button key={tag} type="button" onClick={() => updateField('eyeColor', tag)} className="rounded-md border border-border/50 bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground hover:border-violet-400/50 hover:text-violet-600 transition-colors">{tag}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">体型 + 身高</label>
                  <Input
                    value={form.bodyType}
                    onChange={(e) => updateField('bodyType', e.target.value)}
                    placeholder="身高180cm，肩宽腰窄"
                    className="h-9 rounded-lg text-sm"
                  />
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {['瘦弱', '标准', '健壮', '肥胖'].map(tag => (
                      <button key={tag} type="button" onClick={() => updateField('bodyType', tag)} className="rounded-md border border-border/50 bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground hover:border-violet-400/50 hover:text-violet-600 transition-colors">{tag}</button>
                    ))}
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="mb-1 flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                    <span>面部特征 / 妆造</span>
                    <button
                      type="button"
                      onClick={() => handleAIAugment('facialFeatures')}
                      disabled={completingField === 'facialFeatures'}
                      className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-violet-500 hover:bg-violet-500/10 disabled:opacity-50"
                    >
                      {completingField === 'facialFeatures' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      AI补全
                    </button>
                  </label>
                  <Input
                    value={form.facialFeatures}
                    onChange={(e) => updateField('facialFeatures', e.target.value)}
                    placeholder="眉毛粗黑呈剑形，眼睛细长，鼻梁高挺，下颌线分明，面部皮肤光滑"
                    className="h-9 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                    <span>皮肤质感</span>
                    <button
                      type="button"
                      onClick={() => handleAIAugment('skinTexture')}
                      disabled={completingField === 'skinTexture'}
                      className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-violet-500 hover:bg-violet-500/10 disabled:opacity-50"
                    >
                      {completingField === 'skinTexture' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      AI补全
                    </button>
                  </label>
                  <Input
                    value={form.skinTexture}
                    onChange={(e) => updateField('skinTexture', e.target.value)}
                    placeholder="小麦色，粗糙有光泽"
                    className="h-9 rounded-lg text-sm"
                  />
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {['白皙细腻', '小麦色', '黝黑粗糙', '苍老皱纹'].map(tag => (
                      <button key={tag} type="button" onClick={() => updateField('skinTexture', tag)} className="rounded-md border border-border/50 bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground hover:border-violet-400/50 hover:text-violet-600 transition-colors">{tag}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">特殊标记 <span className="text-muted-foreground/50">（可选）</span></label>
                  <Input
                    value={form.specialMarks}
                    onChange={(e) => updateField('specialMarks', e.target.value)}
                    placeholder="左眉有一道浅疤"
                    className="h-9 rounded-lg text-sm"
                  />
                </div>
              </div>
            </div>

            {/* 服装设定 */}
            <div>
              <h4 className="mb-3 text-xs font-semibold text-amber-600">服装设定</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">上装</label>
                  <Input
                    value={form.top}
                    onChange={(e) => updateField('top', e.target.value)}
                    placeholder="青色交领长袍"
                    className="h-9 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">下装</label>
                  <Input
                    value={form.bottom}
                    onChange={(e) => updateField('bottom', e.target.value)}
                    placeholder="白色长裤"
                    className="h-9 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">鞋子</label>
                  <Input
                    value={form.shoes}
                    onChange={(e) => updateField('shoes', e.target.value)}
                    placeholder="黑色布靴"
                    className="h-9 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                    <span>风格 + 配饰</span>
                    <button
                      type="button"
                      onClick={() => handleAIAugment('clothingStyle')}
                      disabled={completingField === 'clothingStyle'}
                      className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-amber-600 hover:bg-amber-500/10 disabled:opacity-50"
                    >
                      {completingField === 'clothingStyle' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      AI补全
                    </button>
                  </label>
                  <Input
                    value={form.clothingStyle}
                    onChange={(e) => updateField('clothingStyle', e.target.value)}
                    placeholder="仙侠古风，腰束玉带，袖口绣云纹"
                    className="h-9 rounded-lg text-sm"
                  />
                </div>
              </div>
            </div>

            {/* 表演设定 */}
            <div>
              <h4 className="mb-3 text-xs font-semibold text-emerald-500">表演设定</h4>
              <div>
                <label className="mb-1 flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                  <span>性格 + 表情 + 行为习惯</span>
                  <button
                    type="button"
                    onClick={() => handleAIAugment('performance')}
                    disabled={completingField === 'performance'}
                    className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-emerald-600 hover:bg-emerald-500/10 disabled:opacity-50"
                  >
                    {completingField === 'performance' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    AI补全
                  </button>
                </label>
                <Textarea
                  value={form.performance}
                  onChange={(e) => updateField('performance', e.target.value)}
                  placeholder="面部肌肉放松，嘴角平直，眼神平视前方，双手自然下垂，站姿挺直"
                  className="min-h-[70px] resize-none rounded-lg text-sm"
                />
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {['冷静果断', '温柔善良', '活泼开朗', '阴郁腹黑'].map(tag => (
                    <button key={tag} type="button" onClick={() => updateField('performance', form.performance ? form.performance + '，' + tag : tag)} className="rounded-md border border-border/50 bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground hover:border-emerald-400/50 hover:text-emerald-600 transition-colors">{tag}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 实时提示词预览 */}
          <div className="mt-4 rounded-xl border border-border/40 bg-muted/10">
            <button
              type="button"
              onClick={() => setShowPromptPreview(!showPromptPreview)}
              className="flex w-full items-center justify-between px-4 py-2.5"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-[12px] font-bold text-foreground">生成提示词预览</span>
                <span className="text-[10px] text-muted-foreground">实时更新，跟随项目风格</span>
              </div>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showPromptPreview ? 'rotate-180' : ''}`} />
            </button>
            {showPromptPreview && (
              <div className="border-t border-border/30 px-4 py-3">
                <p className="whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-foreground/70">
                  {buildCharacterReferencePrompt(form, stylePrompt, '9:16').prompt}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              className="bg-gradient-to-r from-amber-500 to-orange-600"
            >
              <Save className="mr-1.5 h-3.5 w-3.5" />
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 详情查看弹窗 */}
      <Dialog open={!!viewing} onOpenChange={(open) => { if (!open) { setViewing(null); setEditingPrompt(false); } }}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col p-0">
          {/* 顶部标题栏 */}
          <div className="flex items-center justify-between border-b border-border/50 px-6 py-4">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <User className="h-5 w-5 text-amber-500" />
              角色档案详情 · {viewing?.name}
              {viewing?.gender && (
                <Badge variant="outline" className="text-[10px]">{viewing.gender}</Badge>
              )}
              {viewing?.imageStatus === 'generated' && (
                <Badge className="border-green-500/30 bg-green-500/10 text-[10px] font-medium text-green-600">
                  ✓ 已生成
                </Badge>
              )}
              {viewing?.imageStatus === 'generating' && (
                <Badge className="border-amber-500/30 bg-amber-500/10 text-[10px] font-medium text-amber-600">
                  生成中
                </Badge>
              )}
              {viewing?.imageStatus === 'loading' && (
                <Badge className="border-blue-500/30 bg-blue-500/10 text-[10px] font-medium text-blue-600">
                  加载中
                </Badge>
              )}
              {viewing?.imageStatus === 'failed' && (
                <Badge className="border-red-500/30 bg-red-500/10 text-[10px] font-medium text-red-600">
                  生成失败
                </Badge>
              )}
              {(!viewing?.imageStatus || viewing.imageStatus === 'not_generated') && (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  未生成
                </Badge>
              )}
            </DialogTitle>
          </div>

          {viewing && (
            <div className="flex-1 overflow-y-auto p-6">
              {/* 上半部分：立绘 + 设定 */}
              <div className="grid grid-cols-1 gap-6 md:grid-cols-[280px_1fr] lg:grid-cols-[320px_1fr]">
                {/* 左侧 - 标准立绘区域 */}
                <div className="space-y-4">
                  {/* 立绘大图 - 固定 3:4 比例 */}
                  <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-gradient-to-br from-stone-50 to-stone-100 shadow-inner">
                    {viewing.imageStatus === 'generated' && viewing.imageUrl && !imageLoadError ? (
                      <img
                        src={viewing.imageUrl}
                        alt={viewing.name}
                        className="h-full w-full cursor-zoom-in object-contain transition-opacity duration-500 hover:opacity-90"
                        onClick={() => setImagePreviewOpen(true)}
                        onError={() => setImageLoadError(true)}
                      />
                    ) : viewing.imageStatus === 'generated' && imageLoadError ? (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-stone-100 to-stone-200/50 p-6 text-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-200/80">
                          <ImageIcon className="h-7 w-7 text-stone-400" />
                        </div>
                        <div>
                          <span className="block text-[12px] font-medium text-stone-500">图片加载失败</span>
                          <span className="mt-0.5 block text-[10px] text-stone-400">URL 无效或网络异常</span>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-1 h-7 rounded-lg text-[11px]"
                          onClick={() => setImageLoadError(false)}
                        >
                          重试加载
                        </Button>
                      </div>
                    ) : viewing.imageStatus === 'generating' ? (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-amber-50 to-orange-100/50">
                        <div className="relative">
                          <div className="h-12 w-12 rounded-full border-4 border-amber-200 border-t-amber-500 animate-spin" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Sparkles className="h-4 w-4 text-amber-400" />
                          </div>
                        </div>
                        <span className="text-sm font-medium text-amber-600">标准立绘生成中</span>
                        <span className="text-[10px] text-amber-400">AI 正在绘制角色形象...</span>
                      </div>
                    ) : viewing.imageStatus === 'loading' ? (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-blue-50 to-cyan-100/50">
                        <div className="relative">
                          <div className="h-12 w-12 rounded-full border-4 border-blue-200 border-t-blue-500 animate-spin" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <ImageIcon className="h-4 w-4 text-blue-400" />
                          </div>
                        </div>
                        <span className="text-sm font-medium text-blue-600">加载图片中</span>
                        <span className="text-[10px] text-blue-400">正在获取生成结果...</span>
                      </div>
                    ) : viewing.imageStatus === 'failed' ? (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-red-50 to-red-100/50 p-6 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                          <ImageIcon className="h-6 w-6 text-red-400" />
                        </div>
                        <span className="text-sm font-medium text-red-500">生成失败</span>
                        <span className="line-clamp-2 text-[11px] text-red-400">{viewing.imageError}</span>
                      </div>
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-3">
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-100/80 to-orange-100/80 shadow-inner">
                          <User className="h-8 w-8 text-amber-400" />
                        </div>
                        <div className="text-center">
                          <span className="block text-sm font-medium text-stone-400">未生成标准立绘</span>
                          <span className="mt-1 block text-[11px] text-stone-300">全剧通用身份基准图</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 尺寸选择 */}
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-muted/20 px-3 py-2">
                    <span className="text-[11px] font-medium text-muted-foreground">立绘比例</span>
                    <Select
                      value={viewing.imageAspectRatio || '9:16'}
                      onValueChange={(v) => {
                        updateCharacter(viewing.id, { imageAspectRatio: v });
                        const updated = useProjectCharacterStore.getState().getById(viewing.id);
                        if (updated) setViewing(updated);
                      }}
                    >
                      <SelectTrigger className="h-7 w-[120px] rounded-lg border-border/50 bg-background text-[11px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(IMAGE_SIZE_MAP).map(([ratio]) => (
                          <SelectItem key={ratio} value={ratio}>
                            {ratio}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 操作按钮 */}
                  <Button
                    type="button"
                    size="sm"
                    className="h-11 w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-[13px] font-semibold text-white shadow-md shadow-amber-500/20 transition-all hover:shadow-lg hover:shadow-amber-500/30 disabled:opacity-60"
                    onClick={() => {
                      generateReference(viewing, editingPrompt ? promptDraft : undefined, `ref-${viewing.id}-${Date.now()}`);
                      setEditingPrompt(false);
                      setTimeout(() => {
                        const updated = useProjectCharacterStore.getState().getById(viewing.id);
                        if (updated) setViewing(updated);
                      }, 100);
                    }}
                    disabled={viewing.imageStatus === 'generating' || viewing.imageStatus === 'loading'}
                  >
                    {viewing.imageStatus === 'generating' ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />生成中...</>
                    ) : viewing.imageStatus === 'loading' ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />加载图片中...</>
                    ) : viewing.imageStatus === 'generated' ? (
                      <><RefreshCw className="mr-2 h-4 w-4" />重新生成</>
                    ) : viewing.imageStatus === 'failed' ? (
                      <><RefreshCw className="mr-2 h-4 w-4" />重试生成</>
                    ) : (
                      <><Sparkles className="mr-2 h-4 w-4" />生成标准立绘</>
                    )}
                  </Button>

                  {/* 生成信息 */}
                  {viewing.imageStatus === 'generated' && (
                    <p className="text-center text-[10px] text-muted-foreground">
                      {viewing.imageModel || '未知模型'} · {viewing.imageGeneratedAt ? new Date(viewing.imageGeneratedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '未知时间'}
                    </p>
                  )}
                </div>

                {/* 右侧 - 角色设定 */}
                <div className="min-w-0 space-y-5">
                  {/* 基本设定 */}
                  <div>
                    <h4 className="mb-3 text-[13px] font-bold text-foreground">基本设定</h4>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                      <div className="flex items-center justify-between border-b border-border/30 pb-2">
                        <span className="text-[12px] text-muted-foreground">性别</span>
                        <span className="text-[12px] font-medium text-foreground">{viewing.gender || <span className="text-muted-foreground/40">未设置</span>}</span>
                      </div>
                      <div className="flex items-center justify-between border-b border-border/30 pb-2">
                        <span className="text-[12px] text-muted-foreground">年龄</span>
                        <span className="text-[12px] font-medium text-foreground">{viewing.age || <span className="text-muted-foreground/40">未设置</span>}</span>
                      </div>
                      <div className="flex items-center justify-between border-b border-border/30 pb-2">
                        <span className="text-[12px] text-muted-foreground">身份</span>
                        <span className="text-[12px] font-medium text-foreground">{viewing.identity || <span className="text-muted-foreground/40">未设置</span>}</span>
                      </div>
                      <div className="col-span-2 flex items-start justify-between border-b border-border/30 pb-2">
                        <span className="text-[12px] text-muted-foreground">发型+发色</span>
                        <span className="max-w-[60%] text-right text-[12px] font-medium text-foreground">{viewing.hairstyle || <span className="text-muted-foreground/40">未设置</span>}</span>
                      </div>
                      <div className="flex items-center justify-between border-b border-border/30 pb-2">
                        <span className="text-[12px] text-muted-foreground">瞳色</span>
                        <span className="text-[12px] font-medium text-foreground">{viewing.eyeColor || <span className="text-muted-foreground/40">未设置</span>}</span>
                      </div>
                      <div className="flex items-center justify-between border-b border-border/30 pb-2">
                        <span className="text-[12px] text-muted-foreground">体型+身高</span>
                        <span className="text-[12px] font-medium text-foreground">{viewing.bodyType || <span className="text-muted-foreground/40">未设置</span>}</span>
                      </div>
                      <div className="col-span-2 flex items-start justify-between border-b border-border/30 pb-2">
                        <span className="text-[12px] text-muted-foreground">皮肤质感</span>
                        <span className="max-w-[60%] break-words text-right text-[12px] font-medium text-foreground">{viewing.skinTexture || <span className="text-muted-foreground/40">未设置</span>}</span>
                      </div>
                      <div className="col-span-2 flex items-start justify-between border-b border-border/30 pb-2">
                        <span className="text-[12px] text-muted-foreground">面部特征/妆造</span>
                        <span className="max-w-[60%] text-right text-[12px] font-medium text-foreground">{viewing.facialFeatures || <span className="text-muted-foreground/40">未设置</span>}</span>
                      </div>
                      <div className="col-span-2 flex items-start justify-between border-b border-border/30 pb-2">
                        <span className="text-[12px] text-muted-foreground">特殊标记</span>
                        <span className="max-w-[60%] text-right text-[12px] font-medium text-foreground">{viewing.specialMarks || <span className="text-muted-foreground/40">未设置</span>}</span>
                      </div>
                    </div>
                  </div>

                  {/* 服装设定 */}
                  <div>
                    <h4 className="mb-3 text-[13px] font-bold text-foreground">服装设定</h4>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                      <div className="flex items-center justify-between border-b border-border/30 pb-2">
                        <span className="text-[12px] text-muted-foreground">上装</span>
                        <span className="text-[12px] font-medium text-foreground">{viewing.top || <span className="text-muted-foreground/40">未设置</span>}</span>
                      </div>
                      <div className="flex items-center justify-between border-b border-border/30 pb-2">
                        <span className="text-[12px] text-muted-foreground">下装</span>
                        <span className="text-[12px] font-medium text-foreground">{viewing.bottom || <span className="text-muted-foreground/40">未设置</span>}</span>
                      </div>
                      <div className="flex items-center justify-between border-b border-border/30 pb-2">
                        <span className="text-[12px] text-muted-foreground">鞋子</span>
                        <span className="text-[12px] font-medium text-foreground">{viewing.shoes || <span className="text-muted-foreground/40">未设置</span>}</span>
                      </div>
                      <div className="col-span-2 flex items-start justify-between border-b border-border/30 pb-2">
                        <span className="text-[12px] text-muted-foreground">风格+配饰</span>
                        <span className="max-w-[60%] text-right text-[12px] font-medium text-foreground">{viewing.clothingStyle || <span className="text-muted-foreground/40">未设置</span>}</span>
                      </div>
                    </div>
                  </div>

                  {/* 表演设定 */}
                  <div className="mt-5">
                    <h4 className="mb-3 text-[13px] font-bold text-foreground">表演设定</h4>
                    <div className="flex items-start justify-between border-b border-border/30 pb-2">
                      <span className="text-[12px] text-muted-foreground">表演基调</span>
                      <span className="max-w-[65%] text-right text-[12px] font-medium text-foreground">{viewing.performance || <span className="text-muted-foreground/40">未设置</span>}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 底部 - 生成提示词（横跨左右） */}
              <div className="mt-6 rounded-xl border border-border/40 bg-muted/10 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-bold text-foreground">生成提示词</span>
                    <span className="text-[10px] text-muted-foreground">自动生成，可编辑，跟随项目风格</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 rounded-lg px-2.5 text-[11px] text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        const text = editingPrompt ? promptDraft : buildCharacterReferencePrompt(viewing, stylePrompt).prompt;
                        navigator.clipboard.writeText(text);
                        toast.success('提示词已复制');
                      }}
                    >
                      复制
                    </Button>
                    {!editingPrompt ? (
                      <>
                        {viewing.imagePrompt && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 rounded-lg px-2.5 text-[11px] text-muted-foreground hover:text-red-500"
                            onClick={() => {
                              updateCharacter(viewing.id, { imagePrompt: '' });
                              const updated = useProjectCharacterStore.getState().getById(viewing.id);
                              if (updated) setViewing(updated);
                              toast.success('已重置为自动生成，将跟随项目风格');
                            }}
                          >
                            <RotateCcw className="mr-1 h-3 w-3" />
                            重置
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 rounded-lg px-2.5 text-[11px] text-amber-600 hover:bg-amber-500/10"
                          onClick={() => {
                            setPromptDraft(buildCharacterReferencePrompt(viewing, stylePrompt).prompt);
                            setEditingPrompt(true);
                          }}
                        >
                          <Edit3 className="mr-1 h-3 w-3" />
                          编辑
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 rounded-lg px-2.5 text-[11px] text-muted-foreground"
                          onClick={() => setEditingPrompt(false)}
                        >
                          取消
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 rounded-lg bg-amber-500 px-2.5 text-[11px] font-medium text-white"
                          onClick={() => {
                            updateCharacter(viewing.id, { imagePrompt: promptDraft });
                            setEditingPrompt(false);
                            const updated = useProjectCharacterStore.getState().getById(viewing.id);
                            if (updated) setViewing(updated);
                            toast.success('提示词已保存');
                          }}
                        >
                          保存
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                {editingPrompt ? (
                  <Textarea
                    value={promptDraft}
                    onChange={(e) => setPromptDraft(e.target.value)}
                    className="min-h-[120px] resize-y rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] leading-relaxed"
                    placeholder="编辑生成提示词..."
                  />
                ) : (
                  <div className="max-h-[160px] overflow-y-auto rounded-xl bg-background/60 p-3 text-[11px] leading-relaxed text-muted-foreground">
                    {editingPrompt ? promptDraft : buildCharacterReferencePrompt(viewing, stylePrompt).prompt}
                  </div>
                )}
                {!viewing.imagePrompt && !editingPrompt && (
                  <p className="mt-2 text-[10px] text-muted-foreground/70">
                    提示词基于当前角色设定 + 项目视觉风格「{projectStyle?.name || '默认'}」自动生成，更换项目风格后自动同步
                  </p>
                )}
              </div>
            </div>
          )}

          {/* 底部操作栏 */}
          <div className="flex items-center justify-end gap-2 border-t border-border/50 px-6 py-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-xl text-[12px]"
              onClick={() => {
                if (viewing) openEdit(viewing);
                setViewing(null);
              }}
            >
              <Edit3 className="mr-1.5 h-3.5 w-3.5" />
              编辑设定
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-9 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-[12px] font-medium text-white shadow-md shadow-amber-500/20"
              onClick={() => setViewing(null)}
            >
              关闭
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 图片预览弹窗 */}
      <Dialog open={imagePreviewOpen} onOpenChange={setImagePreviewOpen}>
        <DialogContent className="max-w-[90vw] border-0 bg-transparent p-0 shadow-none [&>button]:hidden">
          <div className="relative flex max-h-[90vh] items-center justify-center">
            {viewing?.imageUrl && (
              <img
                src={viewing.imageUrl}
                alt={viewing.name}
                className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
              />
            )}
            <button
              type="button"
              onClick={() => setImagePreviewOpen(false)}
              className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认弹窗 */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除角色设定？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后，引用该角色的单集资产将失去项目级设定关联，需要重新关联或手动填写设定。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 从剧本提取结果预览弹窗 */}
      <Dialog open={extractOpen} onOpenChange={setExtractOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-violet-500" />
                从剧本提取的角色设定
                <Badge variant="outline" className="text-[10px]">{extractedCharacters.length} 个</Badge>
              </DialogTitle>
            </div>
            <p className="text-[11px] text-muted-foreground">
              以下是 AI 从剧本原文中提取的角色设定草稿，请勾选需要入库的角色，已存在的角色会自动跳过
            </p>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4">
            {extractedCharacters.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">暂无提取结果</div>
            ) : (
              <div className="space-y-3">
                {extractedCharacters.map((char, index) => {
                  const exists = characters.some((c) => c.name === char.name);
                  const selected = selectedExtractIds.has(index);
                  return (
                    <div
                      key={index}
                      className={cn(
                        'rounded-xl border p-4 transition-all',
                        selected
                          ? 'border-violet-500/40 bg-violet-500/5'
                          : 'border-border/40 bg-muted/20 opacity-60'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => !exists && toggleExtractSelect(index)}
                          className={cn(
                            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors',
                            exists
                              ? 'cursor-not-allowed border-muted bg-muted'
                              : selected
                                ? 'border-violet-500 bg-violet-500'
                                : 'border-border hover:border-violet-500'
                          )}
                          disabled={exists}
                        >
                          {selected && !exists && <Check className="h-3 w-3 text-white" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-semibold text-foreground">{char.name}</h4>
                            {char.gender && (
                              <Badge variant="outline" className="text-[9px]">{char.gender}</Badge>
                            )}
                            {exists && (
                              <Badge variant="outline" className="border-muted text-muted-foreground text-[9px]">已存在</Badge>
                            )}
                          </div>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">{char.identity || '未设置身份'}</p>
                          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                            <div className="flex gap-1">
                              <span className="shrink-0 text-muted-foreground/60">外貌：</span>
                              <span className="truncate">
                                {[char.hairColor, char.hairstyle, char.eyeColor && `${char.eyeColor}眼睛`].filter(Boolean).join('，') || '未设置'}
                              </span>
                            </div>
                            <div className="flex gap-1">
                              <span className="shrink-0 text-muted-foreground/60">服装：</span>
                              <span className="truncate">
                                {[char.top, char.bottom, char.clothingStyle].filter(Boolean).join('，') || '未设置'}
                              </span>
                            </div>
                            <div className="flex gap-1">
                              <span className="shrink-0 text-muted-foreground/60">性格：</span>
                              <span className="truncate">{char.personality || '未设置'}</span>
                            </div>
                            <div className="flex gap-1">
                              <span className="shrink-0 text-muted-foreground/60">特征：</span>
                              <span className="truncate">{char.specialMarks || '未设置'}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-border/60 pt-4">
            <div className="flex w-full items-center justify-between">
              <p className="text-[10px] text-muted-foreground">
                已选 {selectedExtractIds.size} 个 · 入库后可在角色库中编辑完善
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setExtractOpen(false)}>
                  取消
                </Button>
                <Button
                  type="button"
                  onClick={handleConfirmExtract}
                  className="bg-gradient-to-r from-violet-500 to-violet-600"
                  disabled={selectedExtractIds.size === 0}
                >
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                  确认入库 ({selectedExtractIds.size})
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

