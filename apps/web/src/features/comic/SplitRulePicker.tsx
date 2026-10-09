// EXPORTS: default SplitRulePicker
// 拆集规则选择器：规则中心先定义 → 项目选择生效 → 未锁定剧集按新规则重拆
// compact 模式内嵌于分集候选核对标题行（下拉式）；完整模式独立卡片
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Settings2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRuleTemplateStore } from '@/stores/useRuleTemplateStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useEpisodeStore } from '@/stores/useEpisodeStore';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function SplitRulePicker({ projectId, compact = false }: { projectId: string; compact?: boolean }) {
  const navigate = useNavigate();
  const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId));
  const updateProject = useProjectStore((s) => s.updateProject);
  const templates = useRuleTemplateStore((s) => s.templates);
  const activeTemplates = templates.filter((t) => t.enabled);
  const [open, setOpen] = useState(false);
  const [ruleId, setRuleId] = useState(project?.ruleOverrides?.ruleTemplateId ?? 'default');
  if (!project) return null;

  const saveRuleSelection = () => {
    const ruleOverrides = ruleId !== 'default' ? { ruleTemplateId: ruleId } : undefined;
    updateProject(projectId, { ruleOverrides });
    const hasLockedEpisodes = Boolean(project.split?.locked) || ['in_production', 'review', 'archived'].includes(project.status);
    if (hasLockedEpisodes) {
      toast.success('生效规则已保存；已锁定剧集保持不变，新建或未锁定剧集使用新规则');
      return;
    }
    useEpisodeStore.getState().splitToCandidates(projectId, []);
    updateProject(projectId, { status: 'pending_parse', split: null });
    toast.success(ruleOverrides ? '生效规则已保存，未锁定剧集按所选规则重新拆分' : '已恢复平台默认规则，未锁定剧集重新拆分');
  };

  const currentRule = ruleId === 'default' ? null : activeTemplates.find((t) => t.id === ruleId);

  // 展开面板（compact 下拉 / 完整卡片共用）
  const panel = (
    <div className={cn('space-y-3', !compact && 'border-t border-border px-3 pb-3 pt-3')}>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">拆集与导演偏好规则</Label>
        <Select value={ruleId} onValueChange={setRuleId}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="选择生效规则" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">平台默认规则（结构拆集 · 场次窗口 1–6 · 上限 8 集）</SelectItem>
            {activeTemplates.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
                {t.maxScenesPerEpisode ? `（每集 ≤ ${t.maxScenesPerEpisode} 场）` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          规则在规则中心先定义；选择模板后按模板的剧本格式（章节/场次标记）拆集，未锁定剧集重新拆分
        </p>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          className="text-[10px] text-primary underline-offset-2 hover:underline"
          onClick={() => navigate('/comic/rules')}
        >
          管理规则（规则中心）
        </button>
        <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]" onClick={saveRuleSelection}>
          保存规则
        </Button>
      </div>
    </div>
  );

  if (compact) {
    // 紧凑下拉：内嵌标题行，展开为浮层面板
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] transition-colors',
            open ? 'border-primary/50 bg-accent/40 text-foreground' : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
          )}
        >
          <Settings2 className="h-3 w-3 text-primary" />
          <span className="max-w-44 truncate">{currentRule ? currentRule.name : '平台默认拆集规则'}</span>
          <ChevronDown className={cn('h-3 w-3 shrink-0 transition-transform', open && 'rotate-180')} />
        </button>
        {open && (
          <div className="absolute right-0 top-full z-30 mt-1 w-80 rounded-lg border border-border bg-card p-3 shadow-lg">
            {panel}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <Settings2 className="h-4 w-4 text-primary" />
        <span className="text-xs font-medium">拆集规则</span>
        <span className="truncate text-[11px] text-muted-foreground">
          {currentRule ? currentRule.name : '平台默认规则（结构拆集 · 场次窗口 1–6 · 上限 8 集）'}
        </span>
        <ChevronDown className={cn('ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && panel}
    </div>
  );
}
