// 项目级道具库（Prop Bible）：全剧通用道具设定管理
// 功能：道具卡片网格、新增/编辑/删除道具、道具详情展示、从剧本批量提取
import { useState, useMemo } from 'react';
import { Package, Plus, Trash2, Edit3, Save, Sparkles, Loader2, Check } from 'lucide-react';
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
import { useProjectPropStore } from '@/stores/useProjectPropStore';
import { useProjectCharacterStore } from '@/stores/useProjectCharacterStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useShallow } from 'zustand/react/shallow';
import { api } from '@/lib/api/client';
import type { ProjectProp, ProjectPropForm } from '@/types';
import { toast } from 'sonner';

const EMPTY_FORM: ProjectPropForm = {
  name: '',
  propType: '',
  category: '',
  defaultHolder: '',
  material: '',
  color: '',
  size: '',
  shape: '',
  decoration: '',
  usage: '',
  specialAbility: '',
  condition: '',
  wearMarks: '',
  specialMarks: '',
  background: '',
};

const PROP_TYPE_OPTIONS = ['武器', '工具', '饰品', '食物', '文书', '电子设备', '家具', '其他'];
const CATEGORY_OPTIONS = ['手持', '穿戴', '放置', '消耗'];

export default function ProjectPropLibrary({ projectId }: { projectId: string }) {
  const allProps = useProjectPropStore(useShallow((s) => s.props));
  const props = allProps.filter((p) => p.projectId === projectId);
  const addProp = useProjectPropStore((s) => s.addProp);
  const updateProp = useProjectPropStore((s) => s.updateProp);
  const removeProp = useProjectPropStore((s) => s.removeProp);
  const importProps = useProjectPropStore((s) => s.importProps);

  // 项目角色列表（用于持有者选择）
  const allProjectCharacters = useProjectCharacterStore(useShallow((s) => s.characters));
  const projectCharacters = allProjectCharacters.filter((c) => c.projectId === projectId);

  const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId));
  const catalogModels = useSettingsStore(useShallow((s) => s.models));

  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProjectPropForm>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<ProjectProp | null>(null);

  // 从剧本提取
  const [extracting, setExtracting] = useState(false);
  const [extractOpen, setExtractOpen] = useState(false);
  const [extractedProps, setExtractedProps] = useState<ProjectPropForm[]>([]);
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
    setEditOpen(true);
  };

  const openEdit = (prop: ProjectProp) => {
    setEditingId(prop.id);
    const { projectId: _pid, createdAt: _c, updatedAt: _u, ...rest } = prop;
    setForm(rest);
    setEditOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error('请输入道具名称');
      return;
    }
    if (editingId) {
      updateProp(editingId, form);
      toast.success(`已更新道具「${form.name}」`);
    } else {
      addProp(projectId, form);
      toast.success(`已添加道具「${form.name}」`);
    }
    setEditOpen(false);
  };

  const handleDelete = () => {
    if (deleteId) {
      const prop = props.find((p) => p.id === deleteId);
      removeProp(deleteId);
      toast.success(`已删除道具「${prop?.name}」`);
      setDeleteId(null);
    }
  };

  const updateField = (field: keyof ProjectPropForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // 从剧本提取道具
  const handleExtractFromScript = async () => {
    if (!textModelId) {
      toast.error('未找到可用的文本模型，请先在模型配置启用文本模型');
      return;
    }
    if (!scriptText || scriptText.length < 50) {
      toast.error('剧本内容过短，无法提取道具设定');
      return;
    }

    setExtracting(true);
    try {
      const prompt =
        '你是「漫剧导演工作台」的道具设定分析师。职责：从剧本原文中提取所有重要道具的基本设定。\n\n' +
        '【提取规则】\n' +
        '1. 只提取有具体名称或明确描述的道具，不提取泛称（如"武器"、"工具"等无具体名称的）\n' +
        '2. 只提取剧本中明确描述的内容，不确定的字段留空，不要编造\n' +
        '3. 道具类型包括：武器、工具、饰品、食物、文书、电子设备、家具、其他\n' +
        '4. 分类包括：手持（拿在手里）、穿戴（佩戴在身上）、放置（固定在场景中）、消耗（会被消耗掉）\n' +
        '5. 默认持有者：如果道具固定属于某个角色，填写角色名；否则留空\n' +
        '6. 外观描述包括：材质、颜色、尺寸、形状、装饰\n' +
        '7. 功能描述包括：用途、特殊能力\n' +
        '8. 状态描述包括：完好程度、使用痕迹\n\n' +
        '【输出格式（严格输出以下 JSON 数组，不要任何其他文字）】\n' +
        '[\n' +
        '  {\n' +
        '    "name": "道具名称",\n' +
        '    "propType": "武器/工具/饰品/食物/文书/电子设备/家具/其他",\n' +
        '    "category": "手持/穿戴/放置/消耗",\n' +
        '    "defaultHolder": "默认持有者角色名（无则留空）",\n' +
        '    "material": "材质",\n' +
        '    "color": "主色调",\n' +
        '    "size": "尺寸",\n' +
        '    "shape": "形状描述",\n' +
        '    "decoration": "装饰细节",\n' +
        '    "usage": "用途/功能",\n' +
        '    "specialAbility": "特殊能力（无则留空）",\n' +
        '    "condition": "完好程度",\n' +
        '    "wearMarks": "使用痕迹",\n' +
        '    "specialMarks": "特殊标记",\n' +
        '    "background": "背景故事/来源"\n' +
        '  }\n' +
        ']\n\n' +
        '【剧本原文】\n' +
        scriptText.slice(0, 8000);

      const res = await api.runModelTest(textModelId, {
        messages: [{ role: 'user', content: prompt }],
      });
      const note = res.run?.extracted?.['choices.0.message.content'];
      if (res.ok && typeof note === 'string' && note.trim()) {
        const raw = note.trim();
        const jsonStr = raw.startsWith('```')
          ? raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
          : raw;
        try {
          const parsed: unknown = JSON.parse(jsonStr);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const valid = (parsed as ProjectPropForm[]).filter((p) => p.name && p.name.trim());
            if (valid.length > 0) {
              setExtractedProps(valid);
              setSelectedExtractIds(new Set(valid.map((_, i: number) => i)));
              setExtractOpen(true);
              toast.success(`已从剧本提取 ${valid.length} 个道具设定，请确认后入库`);
            } else {
              toast.info('剧本中未找到有具体名称的道具');
            }
          } else {
            toast.error('提取结果格式异常，请重试');
          }
        } catch {
          toast.error('提取结果解析失败，请重试');
        }
      } else {
        toast.error('文本模型调用失败，请检查模型配置后重试');
      }
    } catch {
      toast.error('从剧本提取道具设定失败，请稍后重试');
    } finally {
      setExtracting(false);
    }
  };

  const handleConfirmExtract = () => {
    const toImport = extractedProps.filter((_, i) => selectedExtractIds.has(i));
    if (toImport.length === 0) {
      toast.error('请至少选择一个道具');
      return;
    }
    const existingNames = new Set(props.map((p) => p.name));
    const newProps = toImport.filter((p) => !existingNames.has(p.name));
    if (newProps.length === 0) {
      toast.info('所选道具均已存在于项目道具库中');
      setExtractOpen(false);
      return;
    }
    importProps(projectId, newProps);
    toast.success(`已导入 ${newProps.length} 个道具设定到项目道具库`);
    setExtractOpen(false);
    setExtractedProps([]);
    setSelectedExtractIds(new Set());
  };

  const toggleExtractSelect = (index: number) => {
    setSelectedExtractIds((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20">
            <Package className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-semibold">项目道具设定集</h2>
            <p className="text-[11px] text-muted-foreground">
              全剧通用道具设定，所有剧集共享引用 · 共 {props.length} 个道具
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl border-violet-500/30 text-violet-500 hover:bg-violet-500/10"
            onClick={handleExtractFromScript}
            disabled={extracting}
          >
            {extracting ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            )}
            {extracting ? '提取中...' : '从剧本提取'}
          </Button>
          <Button
            type="button"
            size="sm"
            className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 shadow-md shadow-emerald-500/20"
            onClick={openAdd}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            新增道具
          </Button>
        </div>
      </div>

      {/* 道具卡片网格 */}
      {props.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/20 py-16">
          <Package className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">项目道具库为空</p>
          <p className="mt-1 text-xs text-muted-foreground/60">点击「新增道具」建立项目级道具设定，或从剧本批量提取</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {props.map((prop) => (
            <div
              key={prop.id}
              className="group relative cursor-pointer rounded-2xl border border-border/60 bg-card/50 p-5 transition-all hover:border-emerald-500/30 hover:bg-card hover:shadow-lg hover:shadow-emerald-500/5"
              onClick={() => setViewing(prop)}
            >
              <div className="mb-3 flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                    <Package className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{prop.name}</h3>
                    <div className="flex gap-1">
                      {prop.propType && <Badge variant="outline" className="text-[9px]">{prop.propType}</Badge>}
                      {prop.category && <Badge variant="outline" className="text-[9px]">{prop.category}</Badge>}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={(e) => { e.stopPropagation(); openEdit(prop); }}
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={(e) => { e.stopPropagation(); setDeleteId(prop.id); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2 text-[11px] text-muted-foreground">
                <div className="flex gap-2">
                  <span className="shrink-0 text-muted-foreground/60">材质：</span>
                  <span className="truncate">{prop.material || '未设置'}</span>
                </div>
                <div className="flex gap-2">
                  <span className="shrink-0 text-muted-foreground/60">颜色：</span>
                  <span className="truncate">{prop.color || '未设置'}</span>
                </div>
                <div className="flex gap-2">
                  <span className="shrink-0 text-muted-foreground/60">用途：</span>
                  <span className="line-clamp-2">{prop.usage || '未设置'}</span>
                </div>
                {prop.defaultHolder && (
                  <div className="flex gap-2">
                    <span className="shrink-0 text-muted-foreground/60">持有者：</span>
                    <span className="truncate text-emerald-500">{prop.defaultHolder}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 新增/编辑弹窗 */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑道具设定' : '新增道具设定'}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-4">
            <div className="space-y-5 px-6">
              {/* 基本信息 */}
              <div>
                <h4 className="mb-3 text-xs font-semibold text-emerald-500">基本信息</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="mb-1 block text-[11px] text-muted-foreground">道具名称 *</label>
                    <Input value={form.name} onChange={(e) => updateField('name', e.target.value)} placeholder="如：青锋剑" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-muted-foreground">道具类型</label>
                    <select
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      value={form.propType}
                      onChange={(e) => updateField('propType', e.target.value)}
                    >
                      <option value="">请选择</option>
                      {PROP_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-muted-foreground">分类</label>
                    <select
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      value={form.category}
                      onChange={(e) => updateField('category', e.target.value)}
                    >
                      <option value="">请选择</option>
                      {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="mb-1 block text-[11px] text-muted-foreground">默认持有者（从项目角色库选择，无则留空）</label>
                    <select
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      value={form.defaultHolder}
                      onChange={(e) => updateField('defaultHolder', e.target.value)}
                    >
                      <option value="">无固定持有者</option>
                      {projectCharacters.map((c) => (
                        <option key={c.id} value={c.name}>{c.name}{c.identity ? `（${c.identity}）` : ''}</option>
                      ))}
                    </select>
                    {projectCharacters.length === 0 && (
                      <p className="mt-1 text-[10px] text-amber-500">项目角色库为空，请先在角色库中建立角色设定</p>
                    )}
                  </div>
                </div>
              </div>

              {/* 外观描述 */}
              <div>
                <h4 className="mb-3 text-xs font-semibold text-emerald-500">外观描述</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[11px] text-muted-foreground">材质</label>
                    <Input value={form.material} onChange={(e) => updateField('material', e.target.value)} placeholder="如：精钢" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-muted-foreground">主色调</label>
                    <Input value={form.color} onChange={(e) => updateField('color', e.target.value)} placeholder="如：银灰色" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-muted-foreground">尺寸</label>
                    <Input value={form.size} onChange={(e) => updateField('size', e.target.value)} placeholder="如：约一掌长" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-muted-foreground">形状</label>
                    <Input value={form.shape} onChange={(e) => updateField('shape', e.target.value)} placeholder="如：细长直刃" />
                  </div>
                  <div className="col-span-2">
                    <label className="mb-1 block text-[11px] text-muted-foreground">装饰细节</label>
                    <Input value={form.decoration} onChange={(e) => updateField('decoration', e.target.value)} placeholder="如：剑柄缠绕红绳，剑格刻有云纹" />
                  </div>
                </div>
              </div>

              {/* 功能描述 */}
              <div>
                <h4 className="mb-3 text-xs font-semibold text-emerald-500">功能描述</h4>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-[11px] text-muted-foreground">用途/功能</label>
                    <Textarea value={form.usage} onChange={(e) => updateField('usage', e.target.value)} placeholder="如：近战武器，削铁如泥" rows={2} />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-muted-foreground">特殊能力/效果（无则留空）</label>
                    <Textarea value={form.specialAbility} onChange={(e) => updateField('specialAbility', e.target.value)} placeholder="如：注入内力可发出剑气" rows={2} />
                  </div>
                </div>
              </div>

              {/* 状态描述 */}
              <div>
                <h4 className="mb-3 text-xs font-semibold text-emerald-500">状态描述</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[11px] text-muted-foreground">完好程度</label>
                    <Input value={form.condition} onChange={(e) => updateField('condition', e.target.value)} placeholder="如：轻微磨损" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-muted-foreground">使用痕迹</label>
                    <Input value={form.wearMarks} onChange={(e) => updateField('wearMarks', e.target.value)} placeholder="如：刃口有细微缺口" />
                  </div>
                </div>
              </div>

              {/* 其他 */}
              <div>
                <h4 className="mb-3 text-xs font-semibold text-emerald-500">其他</h4>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-[11px] text-muted-foreground">特殊标记</label>
                    <Input value={form.specialMarks} onChange={(e) => updateField('specialMarks', e.target.value)} placeholder="如：剑身上刻有'青锋'二字" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-muted-foreground">背景故事/来源</label>
                    <Textarea value={form.background} onChange={(e) => updateField('background', e.target.value)} placeholder="如：家传宝剑，历代掌门佩戴" rows={2} />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="border-t border-border/60 pt-4">
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>取消</Button>
            <Button type="button" onClick={handleSave} className="bg-gradient-to-r from-emerald-500 to-teal-600">
              <Save className="mr-1.5 h-3.5 w-3.5" />
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 详情弹窗 */}
      <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20">
                <Package className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle>{viewing?.name}</DialogTitle>
                <p className="text-[11px] text-muted-foreground">项目级道具设定 · 全剧通用 · 只读</p>
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-4">
            {viewing && (
              <div className="space-y-5 px-6">
                <div>
                  <h4 className="mb-3 text-xs font-semibold text-emerald-500">基本信息</h4>
                  <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/30 p-4 text-xs">
                    <div><span className="text-muted-foreground">类型：</span>{viewing.propType || '未设置'}</div>
                    <div><span className="text-muted-foreground">分类：</span>{viewing.category || '未设置'}</div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground">默认持有者：</span>
                      {viewing.defaultHolder ? (
                        <span className="text-emerald-500">{viewing.defaultHolder}</span>
                      ) : (
                        '无固定持有者'
                      )}
                      {viewing.defaultHolder && projectCharacters.find((c) => c.name === viewing.defaultHolder) && (
                        <div className="mt-1 rounded-lg bg-emerald-500/10 p-2 text-[10px]">
                          <div className="font-medium text-emerald-600">角色档案</div>
                          <div className="mt-1 text-muted-foreground">
                            {(() => {
                              const char = projectCharacters.find((c) => c.name === viewing.defaultHolder);
                              if (!char) return null;
                              return (
                                <>
                                  {char.gender && <span>{char.gender} · </span>}
                                  {char.age && <span>{char.age} · </span>}
                                  {char.identity && <span>{char.identity}</span>}
                                  {char.personality && <div className="mt-1">性格：{char.personality}</div>}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="mb-3 text-xs font-semibold text-emerald-500">外观描述</h4>
                  <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/30 p-4 text-xs">
                    <div><span className="text-muted-foreground">材质：</span>{viewing.material || '未设置'}</div>
                    <div><span className="text-muted-foreground">颜色：</span>{viewing.color || '未设置'}</div>
                    <div><span className="text-muted-foreground">尺寸：</span>{viewing.size || '未设置'}</div>
                    <div><span className="text-muted-foreground">形状：</span>{viewing.shape || '未设置'}</div>
                    <div className="col-span-2"><span className="text-muted-foreground">装饰：</span>{viewing.decoration || '未设置'}</div>
                  </div>
                </div>
                <div>
                  <h4 className="mb-3 text-xs font-semibold text-emerald-500">功能描述</h4>
                  <div className="space-y-2 rounded-xl bg-muted/30 p-4 text-xs">
                    <div><span className="text-muted-foreground">用途：</span>{viewing.usage || '未设置'}</div>
                    <div><span className="text-muted-foreground">特殊能力：</span>{viewing.specialAbility || '无'}</div>
                  </div>
                </div>
                <div>
                  <h4 className="mb-3 text-xs font-semibold text-emerald-500">状态描述</h4>
                  <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/30 p-4 text-xs">
                    <div><span className="text-muted-foreground">完好程度：</span>{viewing.condition || '未设置'}</div>
                    <div><span className="text-muted-foreground">使用痕迹：</span>{viewing.wearMarks || '未设置'}</div>
                  </div>
                </div>
                {viewing.background && (
                  <div>
                    <h4 className="mb-3 text-xs font-semibold text-emerald-500">背景故事</h4>
                    <div className="rounded-xl bg-muted/30 p-4 text-xs leading-relaxed">{viewing.background}</div>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="border-t border-border/60 pt-4">
            <p className="mr-auto text-[10px] text-muted-foreground">项目级设定为全剧通用，如需修改请点击编辑</p>
            <Button type="button" variant="outline" onClick={() => { if (viewing) openEdit(viewing); setViewing(null); }}>
              <Edit3 className="mr-1.5 h-3.5 w-3.5" />
              编辑
            </Button>
            <Button type="button" onClick={() => setViewing(null)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除道具设定？</AlertDialogTitle>
            <AlertDialogDescription>此操作不可撤销，删除后单集引用的道具将失去项目级设定关联。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">确认删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 提取结果预览弹窗 */}
      <Dialog open={extractOpen} onOpenChange={setExtractOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-violet-500" />
              从剧本提取的道具设定
              <Badge variant="outline" className="text-[10px]">{extractedProps.length} 个</Badge>
            </DialogTitle>
            <p className="text-[11px] text-muted-foreground">以下是 AI 从剧本原文中提取的道具设定草稿，请勾选需要入库的道具</p>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-4">
            {extractedProps.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">暂无提取结果</div>
            ) : (
              <div className="space-y-3 px-6">
                {extractedProps.map((prop, index) => {
                  const exists = props.some((p) => p.name === prop.name);
                  const selected = selectedExtractIds.has(index);
                  return (
                    <div
                      key={index}
                      className={`rounded-xl border p-4 transition-all ${selected ? 'border-violet-500/40 bg-violet-500/5' : 'border-border/40 bg-muted/20 opacity-60'}`}
                    >
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => !exists && toggleExtractSelect(index)}
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${exists ? 'cursor-not-allowed border-muted bg-muted' : selected ? 'border-violet-500 bg-violet-500' : 'border-border hover:border-violet-500'}`}
                          disabled={exists}
                        >
                          {selected && !exists && <Check className="h-3 w-3 text-white" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-semibold">{prop.name}</h4>
                            {prop.propType && <Badge variant="outline" className="text-[9px]">{prop.propType}</Badge>}
                            {prop.category && <Badge variant="outline" className="text-[9px]">{prop.category}</Badge>}
                            {exists && <Badge variant="outline" className="border-muted text-muted-foreground text-[9px]">已存在</Badge>}
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                            <div>材质：{prop.material || '未设置'}</div>
                            <div>颜色：{prop.color || '未设置'}</div>
                            <div className="col-span-2">用途：{prop.usage || '未设置'}</div>
                            {prop.defaultHolder && <div className="col-span-2 text-emerald-500">持有者：{prop.defaultHolder}</div>}
                          </div>
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
            <Button type="button" onClick={handleConfirmExtract} className="bg-gradient-to-r from-violet-500 to-violet-600" disabled={selectedExtractIds.size === 0}>
              <Check className="mr-1.5 h-3.5 w-3.5" />
              确认入库 ({selectedExtractIds.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
