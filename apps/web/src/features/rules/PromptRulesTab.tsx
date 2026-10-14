// 环节提示词规则（规则中心 Tab）：平台默认每环节只读 + 用户模板 CRUD
// 对齐竞品「生成提示词规则」：按环节配置规则，平台固定输出字段与画布结构，用户覆盖/补充内容
// 生效逻辑：项目未单独指定时，该环节启用的第一条用户模板生效；否则平台默认
import { useState, useEffect } from 'react';
import { Wand2, Plus, Pencil, Trash2, Lock } from 'lucide-react';
import { usePromptRuleStore } from '@/stores/usePromptRuleStore';
import { PROMPT_STAGES } from '@/types';
import type { PromptRuleTemplate, PromptStage } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import RuleVersionList from '@/features/rules/RuleVersionList';

interface FormState {
  name: string;
  desc: string;
  content: string;
  enabled: boolean;
  note: string;
}

const EMPTY_FORM: FormState = { name: '', desc: '', content: '', enabled: true, note: '' };

export default function PromptRulesTab() {
  const templates = usePromptRuleStore((s) => s.templates);
  const upsertTemplate = usePromptRuleStore((s) => s.upsertTemplate);
  const removeTemplate = usePromptRuleStore((s) => s.removeTemplate);
  const toggleEnabled = usePromptRuleStore((s) => s.toggleEnabled);
  const restoreVersion = usePromptRuleStore((s) => s.restoreVersion);
  const loadFromServer = usePromptRuleStore((s) => s.loadFromServer);
  const [stage, setStage] = useState<PromptStage>('interpretation');
  const [open, setOpen] = useState(false);

  // 页面加载时从后端拉取环节提示词规则
  useEffect(() => {
    loadFromServer().catch(() => {});
  }, [loadFromServer]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const stageLabel = PROMPT_STAGES.find((s) => s.id === stage)?.label ?? stage;
  const builtins = templates.filter((t) => t.stage === stage && t.builtin);
  const userTemplates = templates.filter((t) => t.stage === stage && !t.builtin);
  const activeUser = userTemplates.find((t) => t.enabled);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  };
  const openEdit = (t: PromptRuleTemplate) => {
    setEditingId(t.id);
    setForm({ name: t.name, desc: t.desc ?? '', content: t.content, enabled: t.enabled, note: '' });
    setOpen(true);
  };

  const save = () => {
    if (!form.name.trim()) {
      toast.error('请填写模板名称');
      return;
    }
    if (!form.content.trim()) {
      toast.error('提示词内容不能为空');
      return;
    }
    upsertTemplate({
      id: editingId ?? `pr-${Date.now().toString(36)}`,
      stage,
      name: form.name.trim(),
      desc: form.desc.trim() || undefined,
      content: form.content.trim(),
      enabled: form.enabled,
    }, { note: form.note.trim() || undefined });
    setOpen(false);
    toast.success(editingId ? '模板已更新（项目未单独指定环节规则时自动生效）' : `「${stageLabel}」环节模板已创建`);
  };

  return (
    <div className="space-y-4">
      {/* 环节切换 */}
      <div className="flex flex-wrap gap-1.5">
        {PROMPT_STAGES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStage(s.id)}
            className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
              s.id === stage
                ? 'bg-primary text-primary-foreground'
                : 'border border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
            }`}
          >
            {s.label}
            {templates.filter((t) => t.stage === s.id && !t.builtin && t.enabled).length > 0 && (
              <span className="ml-1 text-4xs opacity-70">已覆盖</span>
            )}
          </button>
        ))}
      </div>

      {/* 平台默认（只读） */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Lock className="h-4 w-4 text-muted-foreground" />
            {stageLabel} · 平台内置规则
            <Badge variant="secondary" className="text-3xs">只读 · 输出字段与画布结构由平台固定</Badge>
          </CardTitle>
          <span className="text-3xs text-muted-foreground">{builtins.length} 个内置模板</span>
        </CardHeader>
        <CardContent className="space-y-3">
          {builtins.length === 0 && (
            <div className="text-xs text-muted-foreground">该环节暂无平台默认模板</div>
          )}
          {builtins.map((b) => (
            <div key={b.id} className="space-y-1.5 rounded-lg border border-border/60 bg-muted/20 p-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">{b.name}</span>
                <Badge variant="secondary" className="font-mono text-3xs">v{b.version ?? 1}</Badge>
                {!activeUser && <Badge className="bg-success/15 text-success text-3xs">可选生效</Badge>}
                <Switch checked={b.enabled} onCheckedChange={() => toggleEnabled(b.id)} className="ml-auto scale-75" />
                {!b.enabled && <Badge variant="secondary" className="text-3xs">已停用</Badge>}
              </div>
              {b.desc && <div className="text-2xs text-muted-foreground">{b.desc}</div>}
              <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3 font-mono text-2xs leading-relaxed text-muted-foreground">
                {b.content}
              </pre>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 我的模板（该环节） */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Wand2 className="h-4 w-4 text-muted-foreground" />
            我的{stageLabel}规则
            <span className="text-3xs font-normal text-muted-foreground">
              启用后自动成为该环节生效规则（项目未单独指定时）
            </span>
          </CardTitle>
          <Button size="sm" className="h-7 gap-1 text-2xs" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" />
            新建规则
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {userTemplates.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
              该环节暂无自定义规则，新建一条覆盖/补充平台默认
            </div>
          )}
          {userTemplates.map((t) => (
            <div key={t.id} className="flex items-start gap-3 rounded-lg border border-border p-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{t.name}</span>
                  <Badge variant="secondary" className="font-mono text-3xs">v{t.version ?? 1}</Badge>
                  {activeUser?.id === t.id && (
                    <Badge className="bg-success/15 text-success text-3xs">当前生效</Badge>
                  )}
                  <Switch checked={t.enabled} onCheckedChange={() => toggleEnabled(t.id)} className="scale-75" />
                  {!t.enabled && <Badge variant="secondary" className="text-3xs">已停用</Badge>}
                </div>
                {t.desc && <div className="text-xs text-muted-foreground">{t.desc}</div>}
                <pre className="line-clamp-3 whitespace-pre-wrap rounded bg-muted/30 px-2 py-1.5 font-mono text-3xs leading-relaxed text-muted-foreground">
                  {t.content}
                </pre>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(t)} title="编辑规则">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive"
                  onClick={() => {
                    removeTemplate(t.id);
                    toast.info('规则已删除（该环节回退平台默认）');
                  }}
                  title="删除规则"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <RuleVersionList
                currentVersion={t.version ?? 1}
                versions={(t.versionHistory ?? []).map((h) => ({ ...h, snapshot: h.snapshot as Record<string, unknown> }))}
                onRestore={(v) => {
                  restoreVersion(t.id, v);
                  toast.success(`已恢复至 v${v}（生成新版本）`);
                }}
                renderSummary={(snap) => {
                  const x = snap as { name?: string; desc?: string; content?: string };
                  return [x.name, x.desc, x.content ? `内容 ${x.content.slice(0, 80)}${x.content.length > 80 ? '…' : ''}` : ''].filter(Boolean).join(' · ');
                }}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? `编辑「${stageLabel}」规则` : `新建「${stageLabel}」规则`}</DialogTitle>
            <DialogDescription>
              输出字段与画布结构由平台固定；这里填写你的提示词内容，覆盖/补充该环节平台默认规则
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label className="text-xs text-muted-foreground">规则名称</Label>
              <Input value={form.name} placeholder="如：快节奏打斗分镜规则" onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs text-muted-foreground">描述（可选）</Label>
              <Textarea value={form.desc} rows={2} placeholder="说明这条规则适用什么场景/风格" onChange={(e) => setForm({ ...form, desc: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs text-muted-foreground">本次修改说明（可选，自动记录版本）</Label>
              <Input value={form.note} placeholder="如：加快节奏、聚焦悬念钩子" onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs text-muted-foreground">提示词 / 规则内容</Label>
              <Textarea
                value={form.content}
                rows={7}
                className="font-mono text-xs"
                placeholder="填写该环节生成时的提示词规则内容（平台固定输出结构，你覆盖内容）"
                onChange={(e) => setForm({ ...form, content: e.target.value })}
              />
              <div className="text-right font-mono text-3xs text-muted-foreground">{form.content.length}/12000</div>
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button size="sm" onClick={save}>{editingId ? '保存修改' : '创建规则'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
