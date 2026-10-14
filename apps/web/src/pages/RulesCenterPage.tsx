// 规则中心：先定义，后生效
// 平台默认规则（只读展示 + 版本号） + 用户规则模板（CRUD）
// 项目侧通过「生效规则」选择器引用模板；未引用 = 平台默认
import { useState, useEffect } from 'react';
import { ScrollText, Plus, Pencil, Trash2, BookOpenCheck, FlaskConical } from 'lucide-react';
import { useRuleTemplateStore } from '@/stores/useRuleTemplateStore';
import { SPLIT_POLICY } from '@/config/rules/split-policy';
import { MODEL_CAPACITY, FAITHFUL_MIN_SECONDS } from '@/config/rules/capacity-policy';
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
import { buildSplitCandidates } from '@/mocks/episodes';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PromptRulesTab from '@/features/rules/PromptRulesTab';
import RuleVersionList from '@/features/rules/RuleVersionList';
import type { RuleTemplate } from '@/types';

interface FormState {
  name: string;
  desc: string;
  episodePattern: string;
  scenePattern: string;
  targetEpisodes: string;
  maxScenesPerEpisode: string;
  maxUnitSeconds: string;
  enabled: boolean;
  note: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  desc: '',
  episodePattern: '',
  scenePattern: '',
  targetEpisodes: '',
  maxScenesPerEpisode: '',
  maxUnitSeconds: '',
  enabled: true,
  note: '',
};

function patternValid(p: string): boolean {
  if (!p.trim()) return true;
  try {
    new RegExp(p);
    return true;
  } catch {
    return false;
  }
}

export default function RulesCenterPage() {
  const templates = useRuleTemplateStore((s) => s.templates);
  const upsertTemplate = useRuleTemplateStore((s) => s.upsertTemplate);
  const removeTemplate = useRuleTemplateStore((s) => s.removeTemplate);
  const toggleEnabled = useRuleTemplateStore((s) => s.toggleEnabled);
  const restoreVersion = useRuleTemplateStore((s) => s.restoreVersion);
  const loadFromServer = useRuleTemplateStore((s) => s.loadFromServer);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  // 页面加载时从后端拉取规则模板
  useEffect(() => {
    loadFromServer().catch(() => {});
  }, [loadFromServer]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  };
  const openEdit = (t: RuleTemplate) => {
    setEditingId(t.id);
    setForm({
      name: t.name,
      desc: t.desc ?? '',
      episodePattern: t.episodePattern ?? '',
      scenePattern: t.scenePattern ?? '',
      targetEpisodes: t.targetEpisodes?.toString() ?? '',
      maxScenesPerEpisode: t.maxScenesPerEpisode?.toString() ?? '',
      maxUnitSeconds: t.maxUnitSeconds?.toString() ?? '',
      enabled: t.enabled,
      note: '',
    });
    setOpen(true);
  };

  const save = () => {
    if (!form.name.trim()) {
      toast.error('请填写模板名称');
      return;
    }
    if (!patternValid(form.episodePattern) || !patternValid(form.scenePattern)) {
      toast.error('正则表达式不合法，请检查章节/场次标记');
      return;
    }
    const target = parseInt(form.targetEpisodes, 10);
    const maxSc = parseInt(form.maxScenesPerEpisode, 10);
    const cap = parseInt(form.maxUnitSeconds, 10);
    upsertTemplate({
      id: editingId ?? `tpl-${Date.now().toString(36)}`,
      name: form.name.trim(),
      desc: form.desc.trim() || undefined,
      episodePattern: form.episodePattern.trim() || undefined,
      scenePattern: form.scenePattern.trim() || undefined,
      targetEpisodes: Number.isFinite(target) && target > 0 ? target : undefined,
      maxScenesPerEpisode: Number.isFinite(maxSc) && maxSc > 0 ? maxSc : undefined,
      maxUnitSeconds: Number.isFinite(cap) && cap > 0 ? cap : undefined,
      enabled: form.enabled,
    }, { note: form.note.trim() || undefined });
    setOpen(false);
    toast.success(editingId ? '模板已更新（引用它的项目重新拆分后生效）' : '模板已创建，可到项目参数选择生效');
  };

  // ---- 格式识别测试：粘贴剧本 → 实时预览拆集结果与切点 ----
  const [testScript, setTestScript] = useState('');
  const [testRuleId, setTestRuleId] = useState('default');
  const testRule =
    testRuleId === 'default'
      ? undefined
      : templates.find((t) => t.id === testRuleId && t.enabled);
  const testOverrides = testRule
    ? {
        targetEpisodes: testRule.targetEpisodes,
        maxScenesPerEpisode: testRule.maxScenesPerEpisode,
        episodePattern: testRule.episodePattern,
        scenePattern: testRule.scenePattern,
      }
    : undefined;
  const testCandidates = testScript.trim().length > 0 ? buildSplitCandidates(testScript, 7, testOverrides) : [];
  const testSceneMarks = (testScript.match(/(?:^|\n)\s*#{0,3}\s*(?:场次|场景)[:：]?\s*\d+[-\s\d]*/g) || []).length;
  const testEpisodeMarks = (testScript.match(/(?:^|\n)\s*#{0,3}\s*第\s*[一二三四五六七八九十百\d]+\s*[集回话]/g) || []).length;

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-5">
      <div className="flex items-center gap-2">
        <BookOpenCheck className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">规则中心</h1>
        <span className="ml-auto text-xs text-muted-foreground">先定义规则 → 项目选择生效</span>
      </div>

      <Tabs defaultValue="split">
        <TabsList>
          <TabsTrigger value="split">拆集规则</TabsTrigger>
          <TabsTrigger value="prompt">环节提示词规则</TabsTrigger>
        </TabsList>

        <TabsContent value="split" className="space-y-5">
      {/* 平台默认规则（只读） */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ScrollText className="h-4 w-4 text-muted-foreground" />
            平台默认规则
            <Badge variant="secondary" className="text-3xs">只读 · v{SPLIT_POLICY.version ?? '1.0'}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-xs text-muted-foreground md:grid-cols-3">
          <div className="min-w-0 space-y-1 rounded-lg border border-border p-3">
            <div className="text-xs font-medium text-foreground">拆集格式识别（按结构，不按字数）</div>
            <div>场次：N-M / 场景N / 第N场 / Markdown # 前缀</div>
            <div>场次为最小不可分单元，切点只落场次边界</div>
          </div>
          <div className="space-y-1 rounded-lg border border-border p-3">
            <div className="text-xs font-medium text-foreground">节拍分组窗口</div>
            <div>单集场次 {SPLIT_POLICY.scenesPerEpisode.min}–{SPLIT_POLICY.scenesPerEpisode.max} 场（追求集内弧线闭合）</div>
            <div>单剧集数上限 {SPLIT_POLICY.maxEpisodes} 集</div>
          </div>
          <div className="space-y-1 rounded-lg border border-border p-3">
            <div className="text-xs font-medium text-foreground">容量映射（模型 → 最大生成单元）</div>
            {Object.entries(MODEL_CAPACITY).map(([model, sec]) => (
              <div key={model} className="flex justify-between">
                <span>{model}</span>
                <span className="font-mono">{sec}s</span>
              </div>
            ))}
            <div>忠实呈现下限 {FAITHFUL_MIN_SECONDS}s</div>
          </div>
        </CardContent>
      </Card>

      {/* 我的规则模板 */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <BookOpenCheck className="h-4 w-4 text-muted-foreground" />
            我的规则模板
            <span className="text-3xs font-normal text-muted-foreground">平台默认打底 · 模板自定义优先 · 不同剧本格式可配置</span>
          </CardTitle>
          <Button size="sm" className="h-7 gap-1 text-2xs" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" />
            新建模板
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {templates.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
              暂无自定义模板，新建一个模板来定义你的剧本格式与导演偏好
            </div>
          )}
          {templates.map((t) => (
            <div key={t.id} className="flex items-start gap-3 rounded-lg border border-border p-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{t.name}</span>
                  <Badge variant="secondary" className="font-mono text-3xs">v{t.version ?? 1}</Badge>
                  <Switch checked={t.enabled} onCheckedChange={() => toggleEnabled(t.id)} className="scale-75" />
                </div>
                {t.desc && <div className="text-xs text-muted-foreground">{t.desc}</div>}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {t.episodePattern && (
                    <Badge variant="outline" className="font-mono text-3xs">章节 {t.episodePattern}</Badge>
                  )}
                  {t.scenePattern && (
                    <Badge variant="outline" className="font-mono text-3xs">场次 {t.scenePattern}</Badge>
                  )}
                  {t.targetEpisodes && <Badge variant="outline" className="text-3xs">目标 {t.targetEpisodes} 集</Badge>}
                  {t.maxScenesPerEpisode && <Badge variant="outline" className="text-3xs">每集 ≤ {t.maxScenesPerEpisode} 场</Badge>}
                  {t.maxUnitSeconds && <Badge variant="outline" className="text-3xs">单元 ≤ {t.maxUnitSeconds}s</Badge>}
                  {!t.enabled && <Badge variant="secondary" className="text-3xs">已停用</Badge>}
                </div>
                <RuleVersionList
                  currentVersion={t.version ?? 1}
                  versions={(t.versionHistory ?? []).map((h) => ({ ...h, snapshot: h.snapshot as Record<string, unknown> }))}
                  onRestore={(v) => {
                    restoreVersion(t.id, v);
                    toast.success(`已恢复至 v${v}（生成新版本）`);
                  }}
                  renderSummary={(snap) => {
                    const x = snap as { name?: string; desc?: string; episodePattern?: string; scenePattern?: string };
                    return [x.name, x.desc, x.episodePattern ? `章节 ${x.episodePattern}` : '', x.scenePattern ? `场次 ${x.scenePattern}` : '']
                      .filter(Boolean)
                      .join(' · ');
                  }}
                />
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(t)} title="编辑模板">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive"
                  onClick={() => {
                    removeTemplate(t.id);
                    toast.info('模板已删除（引用它的项目回退平台默认）');
                  }}
                  title="删除模板"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 格式识别测试 */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <FlaskConical className="h-4 w-4 text-muted-foreground" />
            格式识别测试
            <span className="text-3xs font-normal text-muted-foreground">粘贴剧本 → 实时预览拆集结果与切点（场次为最小不可分单元）</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-[1fr_220px]">
            <div className="min-w-0 space-y-1.5">
              <Label className="text-xs text-muted-foreground">剧本片段（支持 Markdown / 场次制 / 纯文本）</Label>
              <Textarea
                value={testScript}
                rows={6}
                placeholder={'例如：\n## 第1集\n### 场次：1-1\n地点：王力出租屋  时间: 夜/内\n△ 电脑屏幕发出冷蓝色的光。\n### 场次：1-2\n△ 排位进入英雄选择界面。'}
                className="font-mono text-xs"
                onChange={(e) => setTestScript(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">测试规则</Label>
              <select
                value={testRuleId}
                onChange={(e) => setTestRuleId(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
              >
                <option value="default">平台默认规则</option>
                {templates.filter((t) => t.enabled).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <div className="rounded-md border border-border bg-muted/40 p-2 text-3xs leading-relaxed text-muted-foreground">
                {testRule
                  ? `按模板识别：${testRule.scenePattern ? '场次标记命中，' : ''}${testRule.episodePattern ? '章节标记命中，' : ''}切点只落场次边界`
                  : '平台默认：识别 场次：N-M / 场景N / 第N场 / Markdown # 前缀'}
              </div>
            </div>
          </div>

          {testScript.trim().length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              粘贴一段剧本，实时查看该规则会拆出几集、切点落在哪里
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2 text-2xs text-muted-foreground">
                <Badge variant="secondary">章节标记 {testEpisodeMarks} 处</Badge>
                <Badge variant="secondary">场次标记 {testSceneMarks} 处</Badge>
                <Badge variant="secondary">拆出 {testCandidates.length} 集候选</Badge>
                {testSceneMarks === 0 && <Badge variant="outline">无场次结构 → 段落粗分组</Badge>}
              </div>
              <div className="grid gap-2 lg:grid-cols-2">
                {testCandidates.map((c, i) => {
                  const sceneTitles = testScript
                    .slice(c.span.start, c.span.end)
                    .match(/(?:^|\n)\s*#{0,3}\s*(?:场次|场景)[:：]?\s*\d+[^\n]*/g)
                    ?.map((m) => m.trim().replace(/^#{0,3}\s*/, ''))
                    .slice(0, 3);
                  return (
                    <div key={i} className="rounded-lg border border-border p-3">
                      <div className="flex items-center gap-2 text-xs font-medium">
                        <span className="text-primary">第 {c.index} 集</span>
                        <span className="truncate">{c.title}</span>
                        <span className="ml-auto shrink-0 font-mono text-3xs text-muted-foreground">
                          [{c.span.start}–{c.span.end}]
                        </span>
                      </div>
                      {sceneTitles && sceneTitles.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {sceneTitles.map((t) => (
                            <Badge key={t} variant="outline" className="font-mono text-3xs">{t}</Badge>
                          ))}
                        </div>
                      )}
                      <div className="mt-1.5 line-clamp-2 text-2xs leading-relaxed text-muted-foreground">
                        {c.summary}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      </TabsContent>
        <TabsContent value="prompt" className="space-y-5">
          <PromptRulesTab />
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑规则模板' : '新建规则模板'}</DialogTitle>
            <DialogDescription>
              定义你的剧本格式（章节/场次标记正则）与导演偏好；保存后到项目参数选择「生效规则」
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label className="text-xs text-muted-foreground">模板名称</Label>
              <Input value={form.name} placeholder="如：短剧节奏模板" onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs text-muted-foreground">描述（可选）</Label>
              <Textarea value={form.desc} rows={2} placeholder="说明该模板适用哪种剧本格式/创作风格" onChange={(e) => setForm({ ...form, desc: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs text-muted-foreground">自定义章节标记（正则，可选）</Label>
              <Input value={form.episodePattern} className="font-mono text-xs" placeholder="如：^#{1,3}\s*第\s*\d+[集回话]" onChange={(e) => setForm({ ...form, episodePattern: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs text-muted-foreground">自定义场次标记（正则，可选）</Label>
              <Input value={form.scenePattern} className="font-mono text-xs" placeholder="如：^(?:场次|场景)[:：]?\s*\d+(?:-\d+)?" onChange={(e) => setForm({ ...form, scenePattern: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="min-w-0 grid gap-1.5">
                <Label className="text-xs text-muted-foreground">目标集数</Label>
                <Input type="number" min={1} value={form.targetEpisodes} placeholder="自动" onChange={(e) => setForm({ ...form, targetEpisodes: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">单集场次上限</Label>
                <Input type="number" min={1} value={form.maxScenesPerEpisode} placeholder="默认 6" onChange={(e) => setForm({ ...form, maxScenesPerEpisode: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">最大单元秒数</Label>
                <Input type="number" min={1} value={form.maxUnitSeconds} placeholder="按模型" onChange={(e) => setForm({ ...form, maxUnitSeconds: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button size="sm" onClick={save}>{editingId ? '保存修改' : '创建模板'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
