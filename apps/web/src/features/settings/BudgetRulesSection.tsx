// EXPORTS: default BudgetRulesSection
// 模型中心 > 成本与用量 > 预算规则区块（TASK-IA-001 v14 §2.6：预算从设置中心迁入成本页）
// 复用 T3（TASK-MODEL-005）的预算 API 与交互逻辑，数据层零改动（判据：数据层复用）。
// 权限（v14 矩阵）：区块浏览=全员；新增/删除=Admin+（操作入口不渲染）。
import { useCallback, useEffect, useState } from 'react';
import { Wallet, Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuthStore, ROLE_RANK } from '@/stores/useAuthStore';
import { api, type BudgetRuleItem } from '@/lib/api/client';

const PERIOD_LABEL: Record<'day' | 'month', string> = { day: '日预算', month: '月预算' };
const ACTION_LABEL: Record<'warn' | 'block', string> = { warn: '只告警', block: '超限拦截' };
const SCOPE_LABEL: Record<'tenant' | 'workspace', string> = { tenant: '租户级', workspace: '工作区级' };

interface BudgetForm {
  scope: 'tenant' | 'workspace';
  period: 'day' | 'month';
  limitAmount: string;
  action: 'warn' | 'block';
  warnAt: string;
}

const EMPTY_BUDGET_FORM: BudgetForm = {
  scope: 'workspace',
  period: 'day',
  limitAmount: '',
  action: 'block',
  warnAt: '0.8',
};

export default function BudgetRulesSection() {
  const role = useAuthStore((s) => s.role);
  const canWrite = (ROLE_RANK[role] ?? 0) >= ROLE_RANK.admin;

  const [rules, setRules] = useState<BudgetRuleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budgetForm, setBudgetForm] = useState<BudgetForm>({ ...EMPTY_BUDGET_FORM });
  const [saving, setSaving] = useState(false);
  const [deletingPeriod, setDeletingPeriod] = useState<'day' | 'month' | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.listBudgetRules();
      setRules(res.items ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '预算规则加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .listBudgetRules()
      .then((res) => {
        if (cancelled) return;
        setRules(res.items ?? []);
        setLoadError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : '预算规则加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const saveBudget = async () => {
    const limit = Number(budgetForm.limitAmount);
    if (!limit || limit <= 0) {
      toast.error('预算上限必须是大于 0 的金额');
      return;
    }
    const warnAt = Number(budgetForm.warnAt);
    if (!warnAt || warnAt <= 0 || warnAt >= 1) {
      toast.error('告警阈值须在 0 到 1 之间（如 0.8 = 80%）');
      return;
    }
    setSaving(true);
    try {
      await api.upsertBudgetRule({
        scope: budgetForm.scope,
        period: budgetForm.period,
        limitAmount: limit,
        action: budgetForm.action,
        warnAt,
        enabled: true,
      });
      toast.success(`已保存${PERIOD_LABEL[budgetForm.period]}（${SCOPE_LABEL[budgetForm.scope]}，${ACTION_LABEL[budgetForm.action]}）`);
      setBudgetOpen(false);
      setBudgetForm({ ...EMPTY_BUDGET_FORM });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const removeBudget = async (period: 'day' | 'month') => {
    // R-CRUD-002：删除必须有确认
    if (!window.confirm(`删除${PERIOD_LABEL[period]}预算规则？超限拦截将不再对该周期生效。`)) return;
    setDeletingPeriod(period);
    try {
      await api.deleteBudgetRule(period);
      toast.success(`已删除${PERIOD_LABEL[period]}预算`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeletingPeriod(null);
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Wallet className="h-4 w-4 text-primary" />
        <Label className="text-sm font-medium">预算规则</Label>
        {canWrite && (
          <Button type="button" size="sm" variant="outline" className="ml-auto gap-1.5" onClick={() => setBudgetOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            新增预算
          </Button>
        )}
      </div>
      <p className="text-2xs text-muted-foreground">
        超限拦截只基于已校准（权威价）成本；未校准调用不计入拦截。故障时放行并告警（fail-open）。
      </p>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          加载中…
        </div>
      ) : loadError ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {loadError}（预算配置暂不可用；预算校验在服务端 fail-open，不影响生成）
        </p>
      ) : rules.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          未配置任何预算规则 —— 当前不拦截任何成本（建议设置日预算，防脚本失控刷上游付费模型）
        </p>
      ) : (
        <ul className="space-y-2">
          {rules.map((r) => (
            <li key={`${r.scope}-${r.period}`} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs">
              <Badge variant="outline" className="font-mono">{SCOPE_LABEL[r.scope]}</Badge>
              <Badge variant="outline" className="font-mono">{PERIOD_LABEL[r.period]}</Badge>
              <span className="font-medium text-foreground">¥{r.limitAmount.toLocaleString('zh-CN')}</span>
              <Badge variant={r.action === 'block' ? 'default' : 'outline'}>{ACTION_LABEL[r.action]}</Badge>
              <span className="ml-auto text-2xs text-muted-foreground">告警线 {(r.warnAt ?? 0.8) * 100}%</span>
              {canWrite && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  title={`删除${PERIOD_LABEL[r.period]}`}
                  onClick={() => void removeBudget(r.period)}
                  disabled={deletingPeriod === r.period}
                >
                  {deletingPeriod === r.period ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={budgetOpen} onOpenChange={setBudgetOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>新增预算规则</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs">维度</Label>
                <Select
                  value={budgetForm.scope}
                  onValueChange={(v) => setBudgetForm({ ...budgetForm, scope: v as 'tenant' | 'workspace' })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="workspace">工作区级（当前工作区）</SelectItem>
                    <SelectItem value="tenant">租户级（全部工作区）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs">周期</Label>
                <Select
                  value={budgetForm.period}
                  onValueChange={(v) => setBudgetForm({ ...budgetForm, period: v as 'day' | 'month' })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">日预算</SelectItem>
                    <SelectItem value="month">月预算</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label className="text-xs">上限金额（CNY）</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="如 500"
                value={budgetForm.limitAmount}
                onChange={(e) => setBudgetForm({ ...budgetForm, limitAmount: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs">超限动作</Label>
                <Select
                  value={budgetForm.action}
                  onValueChange={(v) => setBudgetForm({ ...budgetForm, action: v as 'warn' | 'block' })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="block">超限拦截</SelectItem>
                    <SelectItem value="warn">只告警</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs">告警阈值（0-1）</Label>
                <Input
                  type="number"
                  min="0.01"
                  max="0.99"
                  step="0.01"
                  placeholder="如 0.8"
                  value={budgetForm.warnAt}
                  onChange={(e) => setBudgetForm({ ...budgetForm, warnAt: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBudgetOpen(false)}>取消</Button>
            <Button type="button" onClick={() => void saveBudget()} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
