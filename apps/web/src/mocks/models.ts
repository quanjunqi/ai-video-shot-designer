// 模型选项常量（项目参数 / 新建项目弹窗 / 工坊执行目标共用，避免各页面选项漂移）
// 单一事实源 = src/config/models/model-catalog.ts（模型目录：渠道→类型→能力/计费）
// 此处为兼容旧消费点（IMAGE_MODELS/VIDEO_MODELS 字符串数组）的派生视图
import { enabledImageModels, enabledVideoModels } from '@/config/models/model-catalog';

export const IMAGE_MODELS = enabledImageModels().map((m) => m.name);
export const VIDEO_MODELS = enabledVideoModels().map((m) => m.name);
