// 项目级场景库（Scene Bible）：全剧通用场景设定管理
// 功能：场景卡片网格、新增/编辑/删除场景、场景详情展示、从剧本批量提取
import { useState, useMemo } from 'react';
import { MapPin, Plus, Trash2, Edit3, Save, Sparkles, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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
import { useProjectSceneStore } from '@/stores/useProjectSceneStore';
import { useProjectPropStore } from '@/stores/useProjectPropStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useShallow } from 'zustand/react/shallow';
import { api } from '@/lib/api/client';
import type { ProjectScene, ProjectSceneForm } from '@/types';
import { toast } from 'sonner';

const EMPTY_FORM: ProjectSceneForm = {
  name: '',
  sceneType: '',
  location: '',
  timePeriod: '',
  layout: '',
  size: '',
  structure: '',
  weather: '',
  lighting: '',
  atmosphere: '',
  furniture: '',
  includedProps: '',
  specialMarks: '',
  background: '',
};

const SCENE_TYPE_OPTIONS = ['室内', '室外', '自然', '建筑', '虚拟', '其他'];

export default function ProjectSceneLibrary({ projectId }: { projectId: string }) {
  const allScenes = useProjectSceneStore(useShallow((s) => s.scenes));
  const scenes = allScenes.filter((s) => s.projectId === projectId);
  const addScene = useProjectSceneStore((s) => s.addScene);
  const updateScene = useProjectSceneStore((s) => s.updateScene);
  const removeScene = useProjectSceneStore((s) => s.removeScene);
  const importScenes = useProjectSceneStore((s) => s.importScenes);

  // 项目道具列表（用于场景包含道具选择）
  const allProjectProps = useProjectPropStore(useShallow((s) => s.props));
  const projectProps = allProjectProps.filter((p) => p.projectId === projectId);
  const [selectedIncludedProps, setSelectedIncludedProps] = useState<Set<string>>(new Set());

  const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId));
  const catalogModels = useSettingsStore(useShallow((s) => s.models));

  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProjectSceneForm>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<ProjectScene | null>(null);

  const [extracting, setExtracting] = useState(false);
  const [extractOpen, setExtractOpen] = useState(false);
  const [extractedScenes, setExtractedScenes] = useState<ProjectSceneForm[]>([]);
  const [selectedExtractIds, setSelectedExtractIds] = useState<Set<number>>(new Set());

  const scriptText = useMemo(() => {
    if (!project) return '';
    const source = project.sourceVersions.find((v) => v.version === project.currentSourceVersion);
    return source?.text ?? '';
  }, [project]);

  const textModelId = useMemo(() => {
    return catalogModels.find((m) => m.type === 'text' && m.status === 'enabled')?.id ?? '';
  }, [catalogModels]);

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSelectedIncludedProps(new Set());
    setEditOpen(true);
  };

  const openEdit = (scene: ProjectScene) => {
    setEditingId(scene.id);
    const { id, projectId: _pid, createdAt: _c, updatedAt: _u, ...rest } = scene;
    setForm(rest);
    // 初始化已选道具
    if (scene.includedProps) {
      const propNames = scene.includedProps.split(/[,，、]/).map((s: string) => s.trim()).filter(Boolean);
      const ids = new Set<string>();
      projectProps.forEach((p) => {
        if (propNames.includes(p.name)) ids.add(p.id);
      });
      setSelectedIncludedProps(ids);
    } else {
      setSelectedIncludedProps(new Set());
    }
    setEditOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error('请输入场景名称');
      return;
    }
    // 将选中的道具转换为逗号分隔的字符串
    const includedPropNames = projectProps
      .filter((p) => selectedIncludedProps.has(p.id))
      .map((p) => p.name)
      .join('、');
    const formWithProps = { ...form, includedProps: includedPropNames };
    if (editingId) {
      updateScene(editingId, formWithProps);
      toast.success(`已更新场景「${form.name}」`);
    } else {
      addScene(projectId, formWithProps);
      toast.success(`已添加场景「${form.name}」`);
    }
    setEditOpen(false);
  };

  const toggleIncludedProp = (id: string) => {
    setSelectedIncludedProps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleDelete = () => {
    if (deleteId) {
      const scene = scenes.find((s) => s.id === deleteId);
      removeScene(deleteId);
      toast.success(`已删除场景「${scene?.name}」`);
      setDeleteId(null);
    }
  };

  const updateField = (field: keyof ProjectSceneForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleExtractFromScript = async () => {
    if (!textModelId) {
      toast.error('未找到可用的文本模型');
      return;
    }
    if (!scriptText || scriptText.length < 50) {
      toast.error('剧本内容过短');
      return;
    }
    setExtracting(true);
    try {
      const prompt =
        '你是「漫剧导演工作台」的场景设定分析师。从剧本原文中提取所有重要场景的基本设定。\n\n' +
        '【提取规则】\n' +
        '1. 只提取有具体名称或明确描述的场景，不提取泛称\n' +
        '2. 只提取剧本中明确描述的内容，不确定的字段留空\n' +
        '3. 场景类型：室内/室外/自然/建筑/虚拟/其他\n' +
        '4. 空间描述：布局、尺寸、结构\n' +
        '5. 环境描述：天气、光线、氛围\n' +
        '6. 物品描述：家具、包含的道具\n\n' +
        '【输出格式（严格输出 JSON 数组）】\n' +
        '[{"name":"场景名称","sceneType":"室内/室外/自然/建筑/虚拟/其他","location":"地点","timePeriod":"白天/黄昏/夜晚/凌晨","layout":"空间布局","size":"尺寸","structure":"建筑结构","weather":"天气","lighting":"光线","atmosphere":"氛围","furniture":"家具","includedProps":"包含的道具","specialMarks":"特殊标记","background":"背景故事"}]\n\n' +
        '【剧本原文】\n' + scriptText.slice(0, 8000);

      const res = await api.runModelTest(textModelId, { messages: [{ role: 'user', content: prompt }] });
      const note = res.run?.extracted?.['choices.0.message.content'];
      if (res.ok && typeof note === 'string' && note.trim()) {
        const raw = note.trim();
        const jsonStr = raw.startsWith('```') ? raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '') : raw;
        try {
          const parsed: unknown = JSON.parse(jsonStr);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const valid = (parsed as ProjectSceneForm[]).filter((s) => s.name && s.name.trim());
            if (valid.length > 0) {
              setExtractedScenes(valid);
              setSelectedExtractIds(new Set(valid.map((_, i: number) => i)));
              setExtractOpen(true);
              toast.success(`已从剧本提取 ${valid.length} 个场景设定`);
            } else {
              toast.info('剧本中未找到有具体名称的场景');
            }
          }
        } catch { toast.error('提取结果解析失败'); }
      }
    } catch { toast.error('从剧本提取场景设定失败'); }
    finally { setExtracting(false); }
  };

  const handleConfirmExtract = () => {
    const toImport = extractedScenes.filter((_, i) => selectedExtractIds.has(i));
    if (toImport.length === 0) { toast.error('请至少选择一个场景'); return; }
    const existingNames = new Set(scenes.map((s) => s.name));
    const newScenes = toImport.filter((s) => !existingNames.has(s.name));
    if (newScenes.length === 0) { toast.info('所选场景均已存在'); setExtractOpen(false); return; }
    importScenes(projectId, newScenes);
    toast.success(`已导入 ${newScenes.length} 个场景设定`);
    setExtractOpen(false);
    setExtractedScenes([]);
    setSelectedExtractIds(new Set());
  };

  const toggleExtractSelect = (index: number) => {
    setSelectedExtractIds((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 shadow-lg shadow-sky-500/20">
            <MapPin className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-semibold">项目场景设定集</h2>
            <p className="text-[11px] text-muted-foreground">全剧通用场景设定，所有剧集共享引用 · 共 {scenes.length} 个场景</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="rounded-xl border-violet-500/30 text-violet-500 hover:bg-violet-500/10" onClick={handleExtractFromScript} disabled={extracting}>
            {extracting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
            {extracting ? '提取中...' : '从剧本提取'}
          </Button>
          <Button type="button" size="sm" className="rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 shadow-md shadow-sky-500/20" onClick={openAdd}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />新增场景
          </Button>
        </div>
      </div>

      {scenes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/20 py-16">
          <MapPin className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">项目场景库为空</p>
          <p className="mt-1 text-xs text-muted-foreground/60">点击「新增场景」建立项目级场景设定，或从剧本批量提取</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {scenes.map((scene) => (
            <div key={scene.id} className="group relative cursor-pointer rounded-2xl border border-border/60 bg-card/50 p-5 transition-all hover:border-sky-500/30 hover:bg-card hover:shadow-lg hover:shadow-sky-500/5" onClick={() => setViewing(scene)}>
              <div className="mb-3 flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10"><MapPin className="h-4 w-4 text-sky-500" /></div>
                  <div>
                    <h3 className="text-sm font-semibold">{scene.name}</h3>
                    <div className="flex gap-1">
                      {scene.sceneType && <Badge variant="outline" className="text-[9px]">{scene.sceneType}</Badge>}
                      {scene.timePeriod && <Badge variant="outline" className="text-[9px]">{scene.timePeriod}</Badge>}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(scene); }}><Edit3 className="h-3.5 w-3.5" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteId(scene.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
              <div className="space-y-2 text-[11px] text-muted-foreground">
                <div className="flex gap-2"><span className="shrink-0 text-muted-foreground/60">地点：</span><span className="truncate">{scene.location || '未设置'}</span></div>
                <div className="flex gap-2"><span className="shrink-0 text-muted-foreground/60">光线：</span><span className="truncate">{scene.lighting || '未设置'}</span></div>
                <div className="flex gap-2"><span className="shrink-0 text-muted-foreground/60">氛围：</span><span className="line-clamp-2">{scene.atmosphere || '未设置'}</span></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 新增/编辑弹窗 */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader><DialogTitle>{editingId ? '编辑场景设定' : '新增场景设定'}</DialogTitle></DialogHeader>
          <div className="flex-1 overflow-y-auto py-4">
            <div className="space-y-5 px-6">
              <div>
                <h4 className="mb-3 text-xs font-semibold text-sky-500">基本信息</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2"><label className="mb-1 block text-[11px] text-muted-foreground">场景名称 *</label><Input value={form.name} onChange={(e) => updateField('name', e.target.value)} placeholder="如：青云峰山顶" /></div>
                  <div><label className="mb-1 block text-[11px] text-muted-foreground">场景类型</label>
                    <select className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" value={form.sceneType} onChange={(e) => updateField('sceneType', e.target.value)}>
                      <option value="">请选择</option>{SCENE_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select></div>
                  <div><label className="mb-1 block text-[11px] text-muted-foreground">故事时间</label><Input value={form.timePeriod} onChange={(e) => updateField('timePeriod', e.target.value)} placeholder="如：黄昏" /></div>
                  <div className="col-span-2"><label className="mb-1 block text-[11px] text-muted-foreground">地点/地理位置</label><Input value={form.location} onChange={(e) => updateField('location', e.target.value)} placeholder="如：青云派后山" /></div>
                </div>
              </div>
              <div>
                <h4 className="mb-3 text-xs font-semibold text-sky-500">空间描述</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="mb-1 block text-[11px] text-muted-foreground">空间布局</label><Input value={form.layout} onChange={(e) => updateField('layout', e.target.value)} placeholder="如：开放式平台" /></div>
                  <div><label className="mb-1 block text-[11px] text-muted-foreground">空间尺寸</label><Input value={form.size} onChange={(e) => updateField('size', e.target.value)} placeholder="如：约三丈见方" /></div>
                  <div className="col-span-2"><label className="mb-1 block text-[11px] text-muted-foreground">建筑结构</label><Textarea value={form.structure} onChange={(e) => updateField('structure', e.target.value)} placeholder="如：石台四周有石栏，北侧有石阶下山" rows={2} /></div>
                </div>
              </div>
              <div>
                <h4 className="mb-3 text-xs font-semibold text-sky-500">环境描述</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div><label className="mb-1 block text-[11px] text-muted-foreground">天气</label><Input value={form.weather} onChange={(e) => updateField('weather', e.target.value)} placeholder="如：晴" /></div>
                  <div><label className="mb-1 block text-[11px] text-muted-foreground">光线</label><Input value={form.lighting} onChange={(e) => updateField('lighting', e.target.value)} placeholder="如：夕阳斜照" /></div>
                  <div><label className="mb-1 block text-[11px] text-muted-foreground">氛围</label><Input value={form.atmosphere} onChange={(e) => updateField('atmosphere', e.target.value)} placeholder="如：庄严肃穆" /></div>
                </div>
              </div>
              <div>
                <h4 className="mb-3 text-xs font-semibold text-sky-500">物品描述</h4>
                <div className="space-y-3">
                  <div><label className="mb-1 block text-[11px] text-muted-foreground">家具/固定装置</label><Textarea value={form.furniture} onChange={(e) => updateField('furniture', e.target.value)} placeholder="如：石桌、石凳、香炉" rows={2} /></div>
                  <div>
                    <label className="mb-1 block text-[11px] text-muted-foreground">包含的道具（从项目道具库选择，场景中固定存在的道具）</label>
                    {projectProps.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-4 text-center text-[10px] text-muted-foreground">
                        项目道具库为空，请先在道具库中建立道具设定
                      </div>
                    ) : (
                      <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border/40 bg-muted/20 p-2">
                        {projectProps.map((p) => {
                          const selected = selectedIncludedProps.has(p.id);
                          return (
                            <div
                              key={p.id}
                              className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors ${selected ? 'bg-sky-500/10' : 'hover:bg-muted/40'}`}
                              onClick={() => toggleIncludedProp(p.id)}
                            >
                              <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors ${selected ? 'border-sky-500 bg-sky-500' : 'border-border'}`}>
                                {selected && <Check className="h-2.5 w-2.5 text-white" />}
                              </div>
                              <span className="text-[11px]">{p.name}</span>
                              {p.propType && <Badge variant="outline" className="ml-auto text-[8px]">{p.propType}</Badge>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <p className="mt-1 text-[10px] text-muted-foreground">已选 {selectedIncludedProps.size} 个道具</p>
                  </div>
                </div>
              </div>
              <div>
                <h4 className="mb-3 text-xs font-semibold text-sky-500">其他</h4>
                <div className="space-y-3">
                  <div><label className="mb-1 block text-[11px] text-muted-foreground">特殊标记</label><Input value={form.specialMarks} onChange={(e) => updateField('specialMarks', e.target.value)} placeholder="如：石壁上刻有门派戒律" /></div>
                  <div><label className="mb-1 block text-[11px] text-muted-foreground">背景故事/场景历史</label><Textarea value={form.background} onChange={(e) => updateField('background', e.target.value)} placeholder="如：青云派历代掌门试炼之地" rows={2} /></div>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="border-t border-border/60 pt-4">
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>取消</Button>
            <Button type="button" onClick={handleSave} className="bg-gradient-to-r from-sky-500 to-blue-600"><Save className="mr-1.5 h-3.5 w-3.5" />保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 详情弹窗 */}
      <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 shadow-lg shadow-sky-500/20"><MapPin className="h-5 w-5 text-white" /></div>
              <div><DialogTitle>{viewing?.name}</DialogTitle><p className="text-[11px] text-muted-foreground">项目级场景设定 · 全剧通用 · 只读</p></div>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-4">
            {viewing && (
              <div className="space-y-5 px-6">
                <div><h4 className="mb-3 text-xs font-semibold text-sky-500">基本信息</h4><div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/30 p-4 text-xs"><div><span className="text-muted-foreground">类型：</span>{viewing.sceneType || '未设置'}</div><div><span className="text-muted-foreground">时间：</span>{viewing.timePeriod || '未设置'}</div><div className="col-span-2"><span className="text-muted-foreground">地点：</span>{viewing.location || '未设置'}</div></div></div>
                <div><h4 className="mb-3 text-xs font-semibold text-sky-500">空间描述</h4><div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/30 p-4 text-xs"><div><span className="text-muted-foreground">布局：</span>{viewing.layout || '未设置'}</div><div><span className="text-muted-foreground">尺寸：</span>{viewing.size || '未设置'}</div><div className="col-span-2"><span className="text-muted-foreground">结构：</span>{viewing.structure || '未设置'}</div></div></div>
                <div><h4 className="mb-3 text-xs font-semibold text-sky-500">环境描述</h4><div className="grid grid-cols-3 gap-3 rounded-xl bg-muted/30 p-4 text-xs"><div><span className="text-muted-foreground">天气：</span>{viewing.weather || '未设置'}</div><div><span className="text-muted-foreground">光线：</span>{viewing.lighting || '未设置'}</div><div><span className="text-muted-foreground">氛围：</span>{viewing.atmosphere || '未设置'}</div></div></div>
                <div><h4 className="mb-3 text-xs font-semibold text-sky-500">物品描述</h4><div className="space-y-2 rounded-xl bg-muted/30 p-4 text-xs">
                  <div><span className="text-muted-foreground">家具：</span>{viewing.furniture || '未设置'}</div>
                  <div>
                    <span className="text-muted-foreground">包含道具：</span>
                    {viewing.includedProps ? (
                      <span className="text-sky-500">{viewing.includedProps}</span>
                    ) : (
                      '未设置'
                    )}
                    {viewing.includedProps && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {viewing.includedProps.split(/[、,，]/).map((name: string, idx: number) => {
                          const prop = projectProps.find((p) => p.name === name.trim());
                          if (!prop) return null;
                          return (
                            <div key={idx} className="rounded-lg bg-sky-500/10 px-2 py-1 text-[10px]">
                              <span className="font-medium text-sky-600">{prop.name}</span>
                              {prop.propType && <span className="ml-1 text-muted-foreground">({prop.propType})</span>}
                              {prop.defaultHolder && <div className="mt-0.5 text-[9px] text-muted-foreground">持有者：{prop.defaultHolder}</div>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div></div>
                {viewing.background && <div><h4 className="mb-3 text-xs font-semibold text-sky-500">背景故事</h4><div className="rounded-xl bg-muted/30 p-4 text-xs leading-relaxed">{viewing.background}</div></div>}
              </div>
            )}
          </div>
          <DialogFooter className="border-t border-border/60 pt-4">
            <p className="mr-auto text-[10px] text-muted-foreground">项目级设定为全剧通用</p>
            <Button type="button" variant="outline" onClick={() => { if (viewing) openEdit(viewing); setViewing(null); }}><Edit3 className="mr-1.5 h-3.5 w-3.5" />编辑</Button>
            <Button type="button" onClick={() => setViewing(null)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>删除场景设定？</AlertDialogTitle><AlertDialogDescription>此操作不可撤销。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">确认删除</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 提取结果预览 */}
      <Dialog open={extractOpen} onOpenChange={setExtractOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-violet-500" />从剧本提取的场景设定<Badge variant="outline" className="text-[10px]">{extractedScenes.length} 个</Badge></DialogTitle><p className="text-[11px] text-muted-foreground">请勾选需要入库的场景</p></DialogHeader>
          <div className="flex-1 overflow-y-auto py-4">
            {extractedScenes.length === 0 ? <div className="py-12 text-center text-sm text-muted-foreground">暂无提取结果</div> : (
              <div className="space-y-3 px-6">
                {extractedScenes.map((scene, index) => {
                  const exists = scenes.some((s) => s.name === scene.name);
                  const selected = selectedExtractIds.has(index);
                  return (
                    <div key={index} className={`rounded-xl border p-4 transition-all ${selected ? 'border-violet-500/40 bg-violet-500/5' : 'border-border/40 bg-muted/20 opacity-60'}`}>
                      <div className="flex items-start gap-3">
                        <button type="button" onClick={() => !exists && toggleExtractSelect(index)} className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${exists ? 'cursor-not-allowed border-muted bg-muted' : selected ? 'border-violet-500 bg-violet-500' : 'border-border hover:border-violet-500'}`} disabled={exists}>{selected && !exists && <Check className="h-3 w-3 text-white" />}</button>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2"><h4 className="text-sm font-semibold">{scene.name}</h4>{scene.sceneType && <Badge variant="outline" className="text-[9px]">{scene.sceneType}</Badge>}{scene.timePeriod && <Badge variant="outline" className="text-[9px]">{scene.timePeriod}</Badge>}{exists && <Badge variant="outline" className="border-muted text-muted-foreground text-[9px]">已存在</Badge>}</div>
                          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-muted-foreground"><div>地点：{scene.location || '未设置'}</div><div>氛围：{scene.atmosphere || '未设置'}</div><div className="col-span-2">光线：{scene.lighting || '未设置'}</div></div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter className="border-t border-border/60 pt-4">
            <p className="mr-auto text-[10px] text-muted-foreground">已选 {selectedExtractIds.size} 个</p>
            <Button type="button" variant="outline" onClick={() => setExtractOpen(false)}>取消</Button>
            <Button type="button" onClick={handleConfirmExtract} className="bg-gradient-to-r from-violet-500 to-violet-600" disabled={selectedExtractIds.size === 0}><Check className="mr-1.5 h-3.5 w-3.5" />确认入库 ({selectedExtractIds.size})</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
