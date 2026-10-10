// 资产提取规则统一配置
// 明确角色/道具/场景三类资产的提取边界，避免交叉污染
// 规则来源：ai-video-shot-designer skill 的 asset-generation-rules.md

// ============================================================
// 一、资产类型定义与边界
// ============================================================

export type AssetKind = 'character' | 'prop' | 'scene';

export interface AssetExtractionRule {
  kind: AssetKind;
  label: string;
  description: string;
  // 提取时必须包含的字段
  requiredFields: string[];
  // 提取时可选字段
  optionalFields: string[];
  // 禁止提取的内容（避免交叉污染）
  forbiddenPatterns: string[];
  // 提示词模板片段
  promptTemplate: string;
}

// ============================================================
// 二、角色资产提取规则
// ============================================================

export const CHARACTER_EXTRACTION_RULE: AssetExtractionRule = {
  kind: 'character',
  label: '角色',
  description: '有具体名称、独立身份和外貌特征的人物',
  requiredFields: ['name', 'gender', 'appearance'],
  optionalFields: [
    'age', 'identity', 'hairstyle', 'hairColor', 'eyeColor',
    'facialFeatures', 'bodyType', 'height', 'top', 'bottom',
    'shoes', 'clothingStyle', 'personality', 'background'
  ],
  // 禁止把道具/配饰当作角色服装的一部分
  forbiddenPatterns: [
    '手持物品', '武器', '工具', '书本', '包', '手机',
    '电子设备', '食物', '文书', '家具'
  ],
  promptTemplate: `你是「漫剧导演工作台」的角色设定分析师。从剧本原文中提取所有重要角色的基本设定。

【提取规则】
1. 只提取有具体名称或明确身份的角色，不提取泛称（如"路人"、"众人"）
2. 只提取剧本中明确描述的内容，不确定的字段留空，不要编造
3. 服装只描述角色穿着的衣物（上装/下装/鞋子/服装风格），不要把手持物品、武器、工具等道具写入服装
4. 配饰只描述佩戴在身上的饰品（项链/戒指/耳环/头饰等），手持物品不算配饰
5. 性格描述用于角色档案，不写入图像生成提示词
6. 外貌特征必须是视觉可描述的（发型/发色/瞳色/面部特征/体型/身高）

【输出格式】严格输出 JSON 数组`,
};

// ============================================================
// 三、道具资产提取规则
// ============================================================

export const PROP_EXTRACTION_RULE: AssetExtractionRule = {
  kind: 'prop',
  label: '道具',
  description: '角色手持、穿戴或场景中可移动的物品',
  requiredFields: ['name', 'propType', 'appearance'],
  optionalFields: [
    'category', 'defaultHolder', 'material', 'color', 'size',
    'shape', 'decoration', 'usage', 'specialAbility', 'condition',
    'wearMarks', 'specialMarks', 'background'
  ],
  // 禁止把角色/场景当作道具
  forbiddenPatterns: [
    '人物', '角色', '建筑', '房间', '山峰', '河流', '天空',
    '天气', '光线', '氛围'
  ],
  promptTemplate: `你是「漫剧导演工作台」的道具设定分析师。从剧本原文中提取所有重要道具的基本设定。

【提取规则】
1. 只提取有具体名称或明确描述的道具，不提取泛称（如"武器"、"工具"等无具体名称的）
2. 只提取剧本中明确描述的内容，不确定的字段留空，不要编造
3. 道具类型包括：武器、工具、饰品、食物、文书、电子设备、家具、其他
4. 分类包括：手持（拿在手里）、穿戴（佩戴在身上）、放置（固定在场景中）、消耗（会被消耗掉）
5. 默认持有者：如果道具固定属于某个角色，填写角色名；否则留空
6. 外观描述包括：材质、颜色、尺寸、形状、装饰
7. 功能描述包括：用途、特殊能力
8. 状态描述包括：完好程度、使用痕迹
9. 注意：角色佩戴的饰品（项链/戒指/耳环等）属于道具，不要写入角色服装

【输出格式】严格输出 JSON 数组`,
};

// ============================================================
// 四、场景资产提取规则
// ============================================================

export const SCENE_EXTRACTION_RULE: AssetExtractionRule = {
  kind: 'scene',
  label: '场景',
  description: '故事发生的空间环境，包括室内/室外/自然/建筑',
  requiredFields: ['name', 'sceneType', 'location'],
  optionalFields: [
    'timePeriod', 'layout', 'size', 'structure', 'weather',
    'lighting', 'atmosphere', 'furniture', 'includedProps',
    'specialMarks', 'background'
  ],
  // 禁止把角色/道具当作场景
  forbiddenPatterns: [
    '人物', '角色', '手持物品', '武器', '工具', '饰品'
  ],
  promptTemplate: `你是「漫剧导演工作台」的场景设定分析师。从剧本原文中提取所有重要场景的基本设定。

【提取规则】
1. 只提取有具体名称或明确描述的场景，不提取泛称
2. 只提取剧本中明确描述的内容，不确定的字段留空，不要编造
3. 场景类型：室内/室外/自然/建筑/虚拟/其他
4. 空间描述：布局、尺寸、结构
5. 环境描述：天气、光线、氛围
6. 物品描述：家具、包含的道具（场景中固定存在的道具）
7. 注意：场景中固定存在的家具和道具要记录在 includedProps 中，但不要把角色手持的移动道具写入场景

【输出格式】严格输出 JSON 数组`,
};

// ============================================================
// 五、统一规则映射
// ============================================================

export const ASSET_EXTRACTION_RULES: Record<AssetKind, AssetExtractionRule> = {
  character: CHARACTER_EXTRACTION_RULE,
  prop: PROP_EXTRACTION_RULE,
  scene: SCENE_EXTRACTION_RULE,
};

// ============================================================
// 六、资产依赖关系规则
// ============================================================

export interface AssetDependencyRule {
  source: AssetKind;
  target: AssetKind;
  relation: string;
  description: string;
}

export const ASSET_DEPENDENCY_RULES: AssetDependencyRule[] = [
  {
    source: 'prop',
    target: 'character',
    relation: 'held_by',
    description: '道具由角色持有（defaultHolder 字段）',
  },
  {
    source: 'prop',
    target: 'scene',
    relation: 'located_in',
    description: '道具位于场景中（场景的 includedProps 字段）',
  },
  {
    source: 'character',
    target: 'scene',
    relation: 'appears_in',
    description: '角色出现在场景中（分镜中记录）',
  },
];

// ============================================================
// 七、提示词生成规则（避免交叉污染）
// ============================================================

// 角色立绘提示词中禁止出现的道具词汇
export const CHARACTER_PROMPT_FORBIDDEN_WORDS = [
  '手机', '武器', '剑', '刀', '枪', '弓', '盾', '法杖',
  '书本', '卷轴', '包', '袋子', '食物', '杯子', '瓶子',
  '工具', '锤子', '钳子', '钥匙', '灯笼', '火把',
];

// 道具提示词中禁止出现的角色词汇
export const PROP_PROMPT_FORBIDDEN_WORDS = [
  '人物', '角色', '脸', '手', '身体', '头发', '眼睛',
  '服装', '衣服', '裤子', '鞋子',
];

// 场景提示词中禁止出现的角色/道具词汇
export const SCENE_PROMPT_FORBIDDEN_WORDS = [
  '人物', '角色', '脸', '手', '身体',
  '手持', '拿着', '握着',
];

// ============================================================
// 八、资产完整性检查清单
// ============================================================

export interface AssetCompletenessCheck {
  kind: AssetKind;
  checks: { field: string; label: string; required: boolean }[];
}

export const ASSET_COMPLETENESS_CHECKS: Record<AssetKind, AssetCompletenessCheck> = {
  character: {
    kind: 'character',
    checks: [
      { field: 'name', label: '角色名称', required: true },
      { field: 'gender', label: '性别', required: true },
      { field: 'appearance', label: '外貌描述', required: true },
      { field: 'clothing', label: '服装描述', required: false },
      { field: 'imageUrl', label: '角色立绘', required: false },
    ],
  },
  prop: {
    kind: 'prop',
    checks: [
      { field: 'name', label: '道具名称', required: true },
      { field: 'propType', label: '道具类型', required: true },
      { field: 'appearance', label: '外观描述', required: true },
      { field: 'usage', label: '用途描述', required: false },
      { field: 'imageUrl', label: '道具图', required: false },
    ],
  },
  scene: {
    kind: 'scene',
    checks: [
      { field: 'name', label: '场景名称', required: true },
      { field: 'sceneType', label: '场景类型', required: true },
      { field: 'location', label: '地点', required: true },
      { field: 'environment', label: '环境描述', required: false },
      { field: 'imageUrl', label: '场景图', required: false },
    ],
  },
};
