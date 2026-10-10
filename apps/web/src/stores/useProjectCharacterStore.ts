// 项目级角色档案库（Character Bible）：全剧通用角色设定，单集引用 + 状态覆盖
// 定位：项目详情页「角色库」Tab 管理，单集角色资产引用项目级设定
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ProjectCharacter, ProjectCharacterForm } from '@/types';
import { api } from '@/lib/api/client';
import type { ServerProjectCharacter } from '@/lib/api/client';

/** 图片尺寸映射（宽x高） */
export const IMAGE_SIZE_MAP: Record<string, string> = {
  '1:1': '1024x1024',
  '2:3': '1024x1536',
  '3:4': '1024x1365',
  '9:16': '1024x1792',
  '16:9': '1792x1024',
  '4:3': '1152x896',
  '3:2': '1536x1024',
};

/** 基于角色档案自动生成标准立绘提示词 */
export function buildCharacterReferencePrompt(
  char: Pick<ProjectCharacter, 'name' | 'gender' | 'age' | 'identity' | 'hairstyle' | 'eyeColor' | 'facialFeatures' | 'specialMarks' | 'bodyType' | 'skinTexture' | 'top' | 'bottom' | 'shoes' | 'clothingStyle' | 'performance'>,
  visualStyle?: string,
  aspectRatio: string = '9:16'
): { prompt: string; negativePrompt: string } {
  const parts: string[] = [`${char.name}，角色立绘设定图`];

  // 基本身份（性别+年龄+身份职业）
  const identityParts = [
    char.gender || '',
    char.age ? (char.age.includes('岁') ? char.age : `${char.age}岁`) : '',
    char.identity || '',
  ].filter(Boolean);
  if (identityParts.length > 0) parts.push(identityParts.join('，'));

  // 外貌特征（发型+瞳色+面部+体型+皮肤+特殊标记）
  const visualParts = [
    char.hairstyle || '',
    char.eyeColor ? `${char.eyeColor}瞳色` : '',
    char.facialFeatures || '',
    char.bodyType || '',
    char.skinTexture || '',
    char.specialMarks || '',
  ].filter(Boolean);
  if (visualParts.length > 0) parts.push(visualParts.join('，'));

  // 穿着（上装+下装+鞋子+风格配饰）
  const wearingParts = [
    char.top || '',
    char.bottom || '',
    char.shoes || '',
    char.clothingStyle || '',
  ].filter(Boolean);
  if (wearingParts.length > 0) parts.push(`穿着${wearingParts.join('，')}`);

  // 表演基调（中性表情基线参考）
  if (char.performance) {
    parts.push(`表演基调：${char.performance}`);
  }

  // 四视图设定图规范
  parts.push('四视图身份资产：正面全身、90度侧面全身、背面全身、正面胸部以上脸部特写');
  parts.push('完整服装造型，细节清晰');
  parts.push('中性表情基线');
  parts.push('纯白色背景，Studio Lighting，无阴影，专业设定图风格');
  parts.push('双脚完全入镜，绝不裁切，横向多视图无分割线呈现');
  parts.push('画面中绝对不出现任何文字、标签、标注、字母、数字、水印');
  parts.push('视图之间仅用留白分隔，不添加任何文字说明或视图名称标签');

  // 尺寸比例描述（双重保障，配合 API size 参数）
  if (aspectRatio && aspectRatio !== '1:1') {
    parts.push(`${aspectRatio}竖版构图`);
  }

  // 项目全局视觉风格
  if (visualStyle) parts.push(visualStyle);

  parts.push('masterpiece, best quality, ultra detailed, 8k');

  const negativePrompt = [
    'low quality, blurry, distorted, deformed, watermark, text, signature, label, annotation, caption, letter, number, word, font, typography, writing',
    'extra fingers, missing fingers, fused fingers, too many fingers',
    'bad anatomy, bad proportions, missing limbs, extra limbs',
    'cropped, out of frame, cut off',
    'ugly, duplicate, morbid, mutilated',
    'shadow, dark background, cluttered background',
    'dynamic pose, action scene, environment, props',
  ].join(', ');

  return { prompt: parts.filter(Boolean).join(', '), negativePrompt };
}

interface State {
  characters: ProjectCharacter[];
  loading: boolean;
  // 按项目获取角色列表
  getByProject: (projectId: string) => ProjectCharacter[];
  // 获取单个角色
  getById: (id: string) => ProjectCharacter | undefined;
  // 按名称获取（项目内）
  getByName: (projectId: string, name: string) => ProjectCharacter | undefined;
  // 从后端加载项目角色库
  loadFromBackend: (projectId: string) => Promise<void>;
  // 新增角色（同步到后端）
  addCharacter: (projectId: string, form: ProjectCharacterForm) => Promise<ProjectCharacter>;
  // 更新角色（同步到后端）
  updateCharacter: (id: string, form: Partial<ProjectCharacterForm>) => Promise<void>;
  // 删除角色（同步到后端）
  removeCharacter: (id: string) => Promise<void>;
  // 批量导入角色
  importCharacters: (projectId: string, characters: ProjectCharacterForm[]) => void;
  // 更新标准立绘状态（同步到后端）
  updateReferenceImage: (id: string, updates: Partial<Pick<ProjectCharacter, 'imageUrl' | 'imageStatus' | 'imageModel' | 'imagePrompt' | 'imageNegativePrompt' | 'imageGeneratedAt' | 'imageJobId' | 'imageError'>>) => Promise<void>;
  // 设置生成中状态
  setGenerating: (id: string, jobId: string, model: string, prompt: string, negativePrompt: string) => void;
  // 设置加载图片中状态（任务已完成，等待获取图片URL）
  setLoading: (id: string) => void;
  // 设置生成成功
  setGenerated: (id: string, imageUrl: string) => void;
  // 设置生成失败
  setGenerateFailed: (id: string, error: string) => void;
}

const generateId = () => `proj-char-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** 将后端 ServerProjectCharacter 转换为前端 ProjectCharacter */
function fromServer(sc: ServerProjectCharacter): ProjectCharacter {
  return {
    id: sc.id,
    projectId: sc.project_id,
    name: sc.name,
    gender: sc.gender,
    age: sc.age,
    identity: sc.identity,
    hairstyle: sc.hairstyle,
    eyeColor: sc.eye_color,
    facialFeatures: sc.facial_features,
    specialMarks: sc.special_marks,
    bodyType: sc.body_type,
    skinTexture: sc.skin_texture,
    top: sc.top,
    bottom: sc.bottom,
    shoes: sc.shoes,
    clothingStyle: sc.clothing_style,
    performance: sc.performance,
    imageUrl: sc.image_url,
    imageStatus: sc.image_status as ProjectCharacter['imageStatus'],
    imageModel: sc.image_model,
    imagePrompt: sc.image_prompt,
    imageNegativePrompt: sc.image_negative_prompt,
    imageGeneratedAt: sc.image_generated_at,
    imageJobId: sc.image_job_id,
    imageError: sc.image_error,
    imageAspectRatio: sc.image_aspect_ratio,
    createdAt: new Date(sc.created_at).getTime(),
    updatedAt: new Date(sc.updated_at).getTime(),
  };
}

/** 将前端 ProjectCharacter 转换为后端 CreateProjectCharacterRequest */
function toServerCreate(c: ProjectCharacterForm & { id?: string }) {
  return {
    id: c.id || generateId(),
    name: c.name,
    gender: c.gender,
    age: c.age,
    identity: c.identity,
    hairstyle: c.hairstyle,
    eye_color: c.eyeColor,
    facial_features: c.facialFeatures,
    special_marks: c.specialMarks,
    body_type: c.bodyType,
    skin_texture: c.skinTexture,
    top: c.top,
    bottom: c.bottom,
    shoes: c.shoes,
    clothing_style: c.clothingStyle,
    performance: c.performance,
    image_url: c.imageUrl,
    image_status: c.imageStatus,
    image_model: c.imageModel,
    image_prompt: c.imagePrompt,
    image_negative_prompt: c.imageNegativePrompt,
    image_aspect_ratio: c.imageAspectRatio,
  };
}

export const useProjectCharacterStore = create<State>()(
  persist(
    (set, get) => ({
      characters: [],
      loading: false,

      getByProject: (projectId) =>
        get().characters.filter((c) => c.projectId === projectId),

      getById: (id) =>
        get().characters.find((c) => c.id === id),

      getByName: (projectId, name) =>
        get().characters.find((c) => c.projectId === projectId && c.name === name),

      loadFromBackend: async (projectId) => {
        set({ loading: true });
        try {
          const { items } = await api.listProjectCharacters(projectId);
          const backendChars = items.map(fromServer);
          // 合并：后端数据优先，本地新增但未同步的保留
          const localOnly = get().characters.filter(
            (lc) => !backendChars.some((bc) => bc.id === lc.id)
          );
          set({ characters: [...backendChars, ...localOnly] });
        } catch (err) {
          console.error('[project-characters] loadFromBackend failed:', err);
        } finally {
          set({ loading: false });
        }
      },

      addCharacter: async (projectId, form) => {
        const now = Date.now();
        const id = generateId();
        const character: ProjectCharacter = {
          id,
          projectId,
          ...form,
          imageStatus: 'not_generated',
          createdAt: now,
          updatedAt: now,
        };
        // 先本地更新，再同步后端
        set((s) => ({ characters: [...s.characters, character] }));
        try {
          await api.createProjectCharacter(projectId, toServerCreate({ ...form, id }));
        } catch (err) {
          console.error('[project-characters] addCharacter sync failed:', err);
        }
        return character;
      },

      updateCharacter: async (id, form) => {
        const char = get().getById(id);
        if (!char) return;
        // 先本地更新
        set((s) => ({
          characters: s.characters.map((c) =>
            c.id === id ? { ...c, ...form, updatedAt: Date.now() } : c
          ),
        }));
        // 同步后端
        try {
          const patch: Record<string, unknown> = {};
          if (form.name !== undefined) patch.name = form.name;
          if (form.gender !== undefined) patch.gender = form.gender;
          if (form.age !== undefined) patch.age = form.age;
          if (form.identity !== undefined) patch.identity = form.identity;
          if (form.hairstyle !== undefined) patch.hairstyle = form.hairstyle;
          if (form.eyeColor !== undefined) patch.eye_color = form.eyeColor;
          if (form.facialFeatures !== undefined) patch.facial_features = form.facialFeatures;
          if (form.specialMarks !== undefined) patch.special_marks = form.specialMarks;
          if (form.bodyType !== undefined) patch.body_type = form.bodyType;
          if (form.skinTexture !== undefined) patch.skin_texture = form.skinTexture;
          if (form.top !== undefined) patch.top = form.top;
          if (form.bottom !== undefined) patch.bottom = form.bottom;
          if (form.shoes !== undefined) patch.shoes = form.shoes;
          if (form.clothingStyle !== undefined) patch.clothing_style = form.clothingStyle;
          if (form.performance !== undefined) patch.performance = form.performance;
          if (form.imageAspectRatio !== undefined) patch.image_aspect_ratio = form.imageAspectRatio;
          await api.updateProjectCharacter(char.projectId, id, patch);
        } catch (err) {
          console.error('[project-characters] updateCharacter sync failed:', err);
        }
      },

      removeCharacter: async (id) => {
        const char = get().getById(id);
        // 先本地删除
        set((s) => ({
          characters: s.characters.filter((c) => c.id !== id),
        }));
        // 同步后端
        if (char) {
          try {
            await api.deleteProjectCharacter(char.projectId, id);
          } catch (err) {
            console.error('[project-characters] removeCharacter sync failed:', err);
          }
        }
      },

      importCharacters: (projectId, characters) => {
        const now = Date.now();
        set((s) => {
          const existingNames = new Set(s.characters.filter((c) => c.projectId === projectId).map((c) => c.name));
          const newCharacters = characters
            .filter((c) => !existingNames.has(c.name))
            .map((form): ProjectCharacter => ({
              id: generateId(),
              projectId,
              ...form,
              imageStatus: 'not_generated',
              createdAt: now,
              updatedAt: now,
            }));
          return { characters: [...s.characters, ...newCharacters] };
        });
      },

      updateReferenceImage: async (id, updates) => {
        const char = get().getById(id);
        // 先本地更新
        set((s) => ({
          characters: s.characters.map((c) =>
            c.id === id ? { ...c, ...updates, updatedAt: Date.now() } : c
          ),
        }));
        // 同步后端
        if (char) {
          try {
            const patch: Record<string, unknown> = {};
            if (updates.imageUrl !== undefined) patch.image_url = updates.imageUrl;
            if (updates.imageStatus !== undefined) patch.image_status = updates.imageStatus;
            if (updates.imageModel !== undefined) patch.image_model = updates.imageModel;
            if (updates.imagePrompt !== undefined) patch.image_prompt = updates.imagePrompt;
            if (updates.imageNegativePrompt !== undefined) patch.image_negative_prompt = updates.imageNegativePrompt;
            if (updates.imageGeneratedAt !== undefined) patch.image_generated_at = updates.imageGeneratedAt;
            if (updates.imageJobId !== undefined) patch.image_job_id = updates.imageJobId;
            if (updates.imageError !== undefined) patch.image_error = updates.imageError;
            await api.updateProjectCharacter(char.projectId, id, patch);
          } catch (err) {
            console.error('[project-characters] updateReferenceImage sync failed:', err);
          }
        }
      },

      setGenerating: (id, jobId, model, prompt, negativePrompt) => {
        set((s) => ({
          characters: s.characters.map((c) =>
            c.id === id ? {
              ...c,
              imageStatus: 'generating' as const,
              imageJobId: jobId,
              imageModel: model,
              imagePrompt: prompt,
              imageNegativePrompt: negativePrompt,
              imageError: undefined,
              updatedAt: Date.now(),
            } : c
          ),
        }));
      },

      setLoading: (id) => {
        set((s) => ({
          characters: s.characters.map((c) =>
            c.id === id ? {
              ...c,
              imageStatus: 'loading' as const,
              imageError: undefined,
              updatedAt: Date.now(),
            } : c
          ),
        }));
      },

      setGenerated: (id, imageUrl) => {
        set((s) => ({
          characters: s.characters.map((c) =>
            c.id === id ? {
              ...c,
              imageStatus: 'generated' as const,
              imageUrl,
              imageGeneratedAt: Date.now(),
              imageError: undefined,
              updatedAt: Date.now(),
            } : c
          ),
        }));
      },

      setGenerateFailed: (id, error) => {
        set((s) => ({
          characters: s.characters.map((c) =>
            c.id === id ? {
              ...c,
              imageStatus: 'failed' as const,
              imageError: error,
              updatedAt: Date.now(),
            } : c
          ),
        }));
      },
    }),
    {
      name: 'mdp:project-characters',
    }
  )
);
