// 环节生效规则展示：环节内显示当前生效的提示词规则（项目覆盖 > 用户模板 > 平台默认）
// 点击跳转规则中心管理；输出字段与画布结构由平台固定，规则只覆盖内容
import { BookOpenCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePromptRuleStore } from '@/stores/usePromptRuleStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { resolvePromptRule } from '@/lib/ruleResolver';
import { PROMPT_STAGES } from '@/types';
import type { PromptStage } from '@/types';

export default function StageRuleBadge({
  projectId,
  stage,
}: {
  projectId: string;
  stage: PromptStage;
}) {
  const navigate = useNavigate();
  const templates = usePromptRuleStore((s) => s.templates);
  const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId));
  const rule = resolvePromptRule(project ?? { promptRuleOverrides: undefined }, stage, templates);
  if (!rule) return null;
  const label = PROMPT_STAGES.find((s) => s.id === stage)?.label ?? stage;
  const isDefault = rule.builtin && !project?.promptRuleOverrides?.[stage];

  return (
    <button
      type="button"
      onClick={() => navigate('/comic/rules')}
      className="group flex max-w-full items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-3xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      title={`${label}生效规则：${rule.name}\n${rule.content.slice(0, 120)}…\n点击前往规则中心管理`}
    >
      <BookOpenCheck className="h-3 w-3 shrink-0 text-primary" />
      <span className="shrink-0 font-medium text-foreground">{label}规则</span>
      <span className="truncate">
        {rule.name}
        {!isDefault && <span className="text-primary">（已覆盖）</span>}
      </span>
      <span className="hidden shrink-0 rounded bg-muted px-1 font-mono text-4xs md:inline">
        {rule.content.length} 字
      </span>
    </button>
  );
}
