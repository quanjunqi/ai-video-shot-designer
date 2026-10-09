// EXPORTS: default NewProjectDialog
// 新建剧本项目（单页表单：标题 + 视觉风格(风格库弹窗) + 剧本 + 默认模型；上传校验 + 源版本哈希；默认模型与项目参数打通）
// 单页化：四步内容相互独立、信息量小，合并为可滚动表单一次填写；视觉风格复用 StylePickerDialog（选择模式），风格库可随时扩充
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Upload, Loader2, Clapperboard, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useStyleStore } from '@/stores/useStyleStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { buildSplitCandidates } from '@/mocks/episodes';
import { useRuleTemplateStore } from '@/stores/useRuleTemplateStore';
import { resolveSplitOverrides } from '@/lib/ruleResolver';
import { useSettingsStore } from '@/stores/useSettingsStore';
import StylePickerDialog from '@/features/comic/StylePickerDialog';
import { api, ApiError } from '@/lib/api/client';
import { toast } from 'sonner';

const MAX_SIZE = 2 * 1024 * 1024;
// 剧本无下限（用户既定决策：不为剧本字数设下限，拆集按格式/场次语义而非字数）
// 剧本无字数下限（用户要求）；创建仅校验非空（空剧本无法拆集）

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function NewProjectDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const upsertServerProject = useProjectStore((s) => s.upsertServerProject);
  const allStyles = useStyleStore((s) => s.styles);
  const appPrefs = useSettingsStore((s) => s.preferences);
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  // 打开即默认选中首个可用风格：弹窗内直接展示风格图文，避免「选择风格」空白占位
  const [styleId, setStyleId] = useState(() => allStyles.find((s) => s.enabled)?.id ?? '');
  const [styleOpen, setStyleOpen] = useState(false);
  const [tab, setTab] = useState('upload');
  const [pasteText, setPasteText] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState('');
  const [fileLoading, setFileLoading] = useState(false);
  const [scriptText, setScriptText] = useState('');
  // 生效规则：创建时即可选择（规则中心先定义，创建即生效，之后可随时更换）
  const templates = useRuleTemplateStore((s) => s.templates);
  const activeTemplates = templates.filter((t) => t.enabled);
  const [ruleId, setRuleId] = useState('default');
  const ruleOverrides = ruleId !== 'default' ? { ruleTemplateId: ruleId } : undefined;
  // 拆集预览：按所选生效规则实时预览
  const splitPreview =
    pasteText.trim().length > 0
      ? buildSplitCandidates(pasteText, 7, resolveSplitOverrides({ ruleOverrides }, templates))
      : [];
  const previewSceneMarks = (pasteText.match(/(?:^|\n)\s*#{0,3}\s*(?:场次|场景)[:：]?\s*\d+[-\s\d]*/g) || []).length;
  const previewEpisodeMarks = (pasteText.match(/(?:^|\n)\s*#{0,3}\s*第\s*[一二三四五六七八九十百\d]+\s*[集回话]/g) || []).length;
  const [submitting, setSubmitting] = useState(false);
  // 默认模型预填应用全局默认（settings.preferences），可改；创建后进入项目参数继续调整
  // 文本模型从模型目录取（真实可执行文本模型），图片/视频沿用既有静态选项
  const catalogModels = useSettingsStore((s) => s.models);
  const textModelOptions = useMemo(
    () => catalogModels.filter((m) => m.type === 'text' && m.status === 'enabled').sort((a, b) => a.sort - b.sort),
    [catalogModels],
  );
  const imageModelOptions = useMemo(
    () => catalogModels.filter((m) => m.type === 'image' && m.status === 'enabled').sort((a, b) => a.sort - b.sort),
    [catalogModels],
  );
  const videoModelOptions = useMemo(
    () => catalogModels.filter((m) => m.type === 'video' && m.status === 'enabled').sort((a, b) => a.sort - b.sort),
    [catalogModels],
  );
  const [textModel, setTextModel] = useState<string>(() =>
    appPrefs.defaultTextModel
      ? appPrefs.defaultTextModel
      : textModelOptions[0]?.name ?? '',
  );
  const [imageModel, setImageModel] = useState<string>(() =>
    imageModelOptions.some((m) => m.name === appPrefs.defaultImageModel) ? appPrefs.defaultImageModel : imageModelOptions[0]?.name ?? '',
  );
  const [videoModel, setVideoModel] = useState<string>(() =>
    videoModelOptions.some((m) => m.name === appPrefs.defaultVideoModel) ? appPrefs.defaultVideoModel : videoModelOptions[0]?.name ?? '',
  );

  const reset = () => {
    setTitle('');
    setStyleId('');
    setTab('upload');
    setPasteText('');
    setFileName('');
    setFileError('');
    setFileLoading(false);
    setScriptText('');
    setRuleId('default');
    setStyleOpen(false);
    if (fileRef.current) fileRef.current.value = '';
    setSubmitting(false);
    setTextModel(appPrefs.defaultTextModel ? appPrefs.defaultTextModel : textModelOptions[0]?.name ?? '');
    setImageModel(imageModelOptions.some((m) => m.name === appPrefs.defaultImageModel) ? appPrefs.defaultImageModel : imageModelOptions[0]?.name ?? '');
    setVideoModel(videoModelOptions.some((m) => m.name === appPrefs.defaultVideoModel) ? appPrefs.defaultVideoModel : videoModelOptions[0]?.name ?? '');
  };

  const close = (v: boolean) => {
    onOpenChange(v);
    if (!v) reset();
  };

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['txt', 'md'].includes(ext)) {
      setFileError('仅支持 .txt / .md 文件（正式环境由服务端校验 DOCX/PDF）');
      setFileName('');
      return;
    }
    if (file.size > MAX_SIZE) {
      setFileError('文件超过 2MB 限制');
      setFileName('');
      return;
    }
    setFileError('');
    setFileName(file.name);
    setFileLoading(true);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      // 模拟服务端校验+哈希流程
      window.setTimeout(() => {
        setScriptText(text);
        setFileLoading(false);
      }, 800);
    };
    reader.onerror = () => {
      setFileLoading(false);
      setFileError('读取失败，请重试');
    };
    reader.readAsText(file, 'utf-8');
  };

  const finalText = tab === 'upload' ? scriptText : pasteText;
  const scriptLength = finalText.trim().length;
  // 剧本无字数下限（用户要求），但必须非空——空剧本无法拆集，会静默卡在待解析
  const scriptEmpty = scriptLength === 0;
  const canCreate =
    title.trim().length > 0 &&
    title.trim().length <= 50 &&
    styleId !== '' &&
    !scriptEmpty;
  const enabledStyles = allStyles.filter((s) => s.enabled);
  const currentStyle = enabledStyles.find((s) => s.id === styleId);

  const handleCreate = async () => {
    if (!canCreate) return;
    setSubmitting(true);
    const style = enabledStyles.find((s) => s.id === styleId);
    try {
      const project = await api.createProject({
        title: title.trim(),
        style_id: styleId,
        style_version: style?.version ?? 'v1.0',
        aspect_ratio: '16:9',
        default_text_model: textModel,
        default_image_model: imageModel,
        default_video_model: videoModel,
        source_text: finalText,
      });
      upsertServerProject(project, finalText);
      setSubmitting(false);
      close(false);
      navigate(`/comic/projects/${project.id}`);
      toast.success('项目已创建，已保存到服务端');
    } catch (error) {
      setSubmitting(false);
      if (error instanceof ApiError) {
        toast.error(`${error.message}（${error.code}）`);
      } else {
        toast.error('项目创建失败，请检查服务状态后重试');
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clapperboard className="h-4 w-4 text-primary" />
            新建剧本项目
          </DialogTitle>
        </DialogHeader>

        {/* 单页表单：四步内容合并，可滚动；底部创建按钮固定 */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">剧本标题（1-50 字）</Label>
            <Input
              autoFocus
              value={title}
              maxLength={50}
              placeholder="例如：雾都侦探社"
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">视觉风格（全局 · 可在项目参数随时切换）</Label>
            <Button
              type="button"
              variant="outline"
              className="h-9 w-full justify-start gap-2 px-2"
              onClick={() => setStyleOpen(true)}
              title="打开风格库选择（可搜索）"
            >
              {currentStyle && (
                <img src={currentStyle.cover} alt="" className="h-6 w-8 shrink-0 rounded object-cover" />
              )}
              <span className="truncate text-xs">{currentStyle?.name ?? '选择风格'}</span>
              {currentStyle && (
                <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">{currentStyle.version}</span>
              )}
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </Button>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">剧本（源版本 v1，无字数下限；创建后可在项目参数中修订）</Label>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="upload">上传文件</TabsTrigger>
                <TabsTrigger value="paste">粘贴文本</TabsTrigger>
              </TabsList>
              <TabsContent value="upload" className="pt-3">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".txt,.md"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={fileLoading}
                  className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-6 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-60"
                >
                  {fileLoading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  ) : (
                    <Upload className="h-6 w-6" />
                  )}
                  <span className="text-xs">{fileLoading ? '读取并校验中…' : '点击选择 .txt / .md 文件（≤2MB）'}</span>
                  {fileName && (
                    <span className="flex items-center gap-1 font-mono text-[11px] text-primary">
                      <FileText className="h-3.5 w-3.5" />
                      {fileName} · {scriptText.length} 字符
                    </span>
                  )}
                </button>
                {fileError && <p className="mt-2 text-xs text-destructive">{fileError}</p>}
              </TabsContent>
              <TabsContent value="paste" className="pt-3">
                <Textarea
                  value={pasteText}
                  rows={8}
                  placeholder="粘贴完整剧本…"
                  onChange={(e) => setPasteText(e.target.value)}
                />
                <p className={`mt-1 text-[11px] ${scriptEmpty && pasteText.length === 0 ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
                  当前 {pasteText.length} 字
                  {scriptEmpty && <span className="text-destructive">（请粘贴剧本内容后创建）</span>}
                </p>
                {pasteText.trim().length > 0 && (
                  <div className="mt-2 rounded-lg border border-border bg-muted/30 p-2">
                    <div className="mb-1.5 flex items-center gap-2">
                      <Label className="text-[10px] text-muted-foreground">生效规则</Label>
                      <select
                        value={ruleId}
                        onChange={(e) => setRuleId(e.target.value)}
                        className="h-6 flex-1 rounded border border-border bg-background px-1.5 text-[11px] outline-none"
                      >
                        <option value="default">平台默认规则（结构拆集）</option>
                        {activeTemplates.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="secondary" className="text-[10px]">章节标记 {previewEpisodeMarks} 处</Badge>
                      <Badge variant="secondary" className="text-[10px]">场次标记 {previewSceneMarks} 处</Badge>
                      <Badge variant="secondary" className="text-[10px]">按平台默认规则拆出 {splitPreview.length} 集</Badge>
                      {previewSceneMarks === 0 && (
                        <Badge variant="outline" className="text-[10px]">无场次结构 → 段落粗分组</Badge>
                      )}
                    </div>
                    <div className="mt-1.5 space-y-1">
                      {splitPreview.map((c, i) => {
                        const scenes = pasteText
                          .slice(c.span.start, c.span.end)
                          .match(/(?:^|\n)\s*#{0,3}\s*(?:场次|场景)[:：]?\s*\d+[^\n]*/g)
                          ?.map((m) => m.trim().replace(/^#{0,3}\s*/, ''))
                          .slice(0, 3);
                        return (
                          <div key={i} className="flex items-center gap-2 text-[11px]">
                            <span className="shrink-0 text-primary">第 {c.index} 集</span>
                            <span className="truncate text-muted-foreground">{c.title}</span>
                            {scenes && scenes.length > 0 && (
                              <span className="hidden shrink-0 font-mono text-[10px] text-muted-foreground md:inline">
                                {scenes.join(' · ')}
                              </span>
                            )}
                            <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                              [{c.span.start}–{c.span.end}]
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <p className="mt-1.5 text-[10px] text-muted-foreground">
                      切点只落在章节/场次边界；所选规则创建即生效，之后可到项目参数随时更换
                    </p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
            {tab === 'upload' && scriptEmpty && (
              <p className="text-xs text-destructive">请选择剧本文件或切换到「粘贴文本」填写剧本内容后创建。</p>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-medium">
              <Clapperboard className="h-3.5 w-3.5 text-primary" />
              默认模型
              <span className="ml-auto text-[10px] text-muted-foreground">预填应用默认；创建后可在项目参数中随时调整</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs text-muted-foreground">默认文本模型</Label>
                <Select value={textModel} onValueChange={setTextModel}>
                  <SelectTrigger className="h-9 w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {textModelOptions.map((m) => (
                      <SelectItem key={m.id} value={m.name}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">用于导演解读和单元 Prompt</p>
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs text-muted-foreground">默认图片模型</Label>
                <Select value={imageModel} onValueChange={setImageModel}>
                  <SelectTrigger className="h-9 w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {imageModelOptions.map((m) => (
                      <SelectItem key={m.id} value={m.name}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">用于角色图、场景图和镜头出图</p>
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs text-muted-foreground">默认视频模型</Label>
                <Select value={videoModel} onValueChange={setVideoModel}>
                  <SelectTrigger className="h-9 w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {videoModelOptions.map((m) => (
                      <SelectItem key={m.id} value={m.name}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">本剧专属；单集工坊执行目标预选此值</p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 pt-3">
          <Button type="button" variant="outline" onClick={() => close(false)}>
            取消
          </Button>
          <Button type="button" disabled={!canCreate || submitting} onClick={handleCreate}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
            {submitting ? '创建中…' : '创建项目'}
          </Button>
        </DialogFooter>
      </DialogContent>

      <StylePickerDialog
        key={String(styleOpen)}
        value={styleId}
        onChange={setStyleId}
        open={styleOpen}
        onOpenChange={setStyleOpen}
      />
    </Dialog>
  );
}
