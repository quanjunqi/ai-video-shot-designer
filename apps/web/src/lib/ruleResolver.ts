// 规则解析：项目「生效规则」→ 拆集/容量 override；环节提示词规则 → 生效模板
// 定位：规则在规则中心先定义（平台默认只读 + 用户模板），项目侧选择模板引用后生效
// 拆集/容量解析顺序：项目引用的模板（enabled）→ 项目级容量微调 → 平台默认
// 环节规则解析顺序：项目环节覆盖（模板）→ 该环节用户模板 → 该环节平台默认
import type { Project, PromptRuleTemplate, PromptStage, RuleTemplate } from '@/types';
import type { SplitOverrides } from '@/mocks/episodes';

export function findActiveTemplate(
  project: Pick<Project, 'ruleOverrides'>,
  templates: RuleTemplate[],
): RuleTemplate | undefined {
  const id = project.ruleOverrides?.ruleTemplateId;
  if (!id) return undefined;
  return templates.find((t) => t.id === id && t.enabled);
}

/** 拆集 override：模板字段 → SplitOverrides（未引用/停用 = 平台默认） */
export function resolveSplitOverrides(
  project: Pick<Project, 'ruleOverrides'>,
  templates: RuleTemplate[],
): SplitOverrides | undefined {
  const tpl = findActiveTemplate(project, templates);
  if (!tpl) return undefined;
  return {
    targetEpisodes: tpl.targetEpisodes,
    maxScenesPerEpisode: tpl.maxScenesPerEpisode,
    episodePattern: tpl.episodePattern,
    scenePattern: tpl.scenePattern,
  };
}

/** 容量秒数：项目级微调 > 模板 > 平台（undefined = 按模型映射） */
export function resolveCapacitySeconds(
  project: Pick<Project, 'ruleOverrides'>,
  templates: RuleTemplate[],
): number | undefined {
  const micro = project.ruleOverrides?.capacity?.maxUnitSeconds;
  if (micro && micro > 0) return micro;
  const tpl = findActiveTemplate(project, templates);
  return tpl?.maxUnitSeconds && tpl.maxUnitSeconds > 0 ? tpl.maxUnitSeconds : undefined;
}

// ---- 环节提示词规则解析 ----

/** 该环节平台默认模板（builtin） */
export function builtinPromptRule(
  stage: PromptStage,
  templates: PromptRuleTemplate[],
): PromptRuleTemplate | undefined {
  return templates.find((t) => t.stage === stage && t.builtin);
}

/**
 * 环节生效规则：项目 `promptRuleOverrides[stage]` 引用的模板（enabled）优先，
 * 其次该环节用户模板中 enabled 的第一条，最后平台默认 builtin。
 */
export function resolvePromptRule(
  project: Pick<Project, 'promptRuleOverrides'>,
  stage: PromptStage,
  templates: PromptRuleTemplate[],
): PromptRuleTemplate | undefined {
  const id = project.promptRuleOverrides?.[stage];
  if (id) {
    const t = templates.find((x) => x.id === id && x.enabled);
    if (t) return t;
  }
  const user = templates.find((x) => x.stage === stage && !x.builtin && x.enabled);
  if (user) return user;
  return builtinPromptRule(stage, templates);
}
