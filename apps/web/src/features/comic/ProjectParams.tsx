// EXPORTS: default ProjectParams
// 项目设置面板（默认收起，不占据功能页首要空间）：
//   核心参数（5 项）：视觉风格 / 画面比例 / 默认文本模型 / 默认图片模型 / 默认视频模型
//   拆集规则已移出至 SplitRulePicker（置于分集候选核对区，功能上下文）
//   视频衔接 / 环节提示词规则等高级设置按用户要求移除，后续阶段需要时在对应阶段添加
// 风格切换逻辑在 StylePickerDialog：记录新版本 + 旧风格资产 markStale（待复核/重新生成）
import { useState } from 'react';
import { ChevronDown, Settings2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useStyleStore } from '@/stores/useStyleStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useShallow } from 'zustand/react/shallow';

import { useProjectStore } from '@/stores/useProjectStore';
import StylePickerDialog from '@/features/comic/StylePickerDialog';
import type { AspectRatio } from '@/types';
import { cn } from '@/lib/utils';

export default function ProjectParams({ projectId }: { projectId: string }) {
  const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId));
  const updateProject = useProjectStore((s) => s.updateProject);
  const [styleOpen, setStyleOpen] = useState(false);
  const [open, setOpen] = useState(true);
  const allStyles = useStyleStore((s) => s.styles);
  // 默认模型选项：模型目录（真实可执行模型）；useShallow 防数组引用重渲染死循环
  const textModelOptions = useSettingsStore(
    useShallow((s) => s.models.filter((m) => m.type === 'text' && m.status === 'enabled').sort((a, b) => a.sort - b.sort)),
  );
  const imageModelOptions = useSettingsStore(
    useShallow((s) => s.models.filter((m) => m.type === 'image' && m.status === 'enabled').sort((a, b) => a.sort - b.sort)),
  );
  const videoModelOptions = useSettingsStore(
    useShallow((s) => s.models.filter((m) => m.type === 'video' && m.status === 'enabled').sort((a, b) => a.sort - b.sort)),
  );
  if (!project) return null;

  const currentStyle = allStyles.find((s) => s.id === project.styleId);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* 折叠头 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/50"
      >
        <Settings2 className="h-4 w-4 shrink-0 text-primary" />
        <span className="whitespace-nowrap text-sm font-semibold">项目设置</span>
        <span className="ml-auto hidden truncate text-[11px] text-muted-foreground xl:inline">
          {currentStyle?.name ?? '未选风格'} · {project.aspectRatio}
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')} />
      </button>

      {/* 展开内容：grid 过渡 */}
      <div
        className={cn(
          'grid transition-all duration-200 ease-in-out',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-3 border-t border-border p-4">
            {/* 视觉风格：全宽突出卡片 */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <Label className="text-[10px] font-medium uppercase tracking-wider text-primary">视觉风格 · 全局可切换</Label>
              <Button
                type="button"
                variant="outline"
                className="mt-2 h-10 w-full justify-start gap-3 border-border bg-background px-3"
                onClick={() => setStyleOpen(true)}
                title="打开风格库选择（可搜索）"
              >
                {currentStyle && (
                  <img src={currentStyle.cover} alt="" className="h-7 w-10 shrink-0 rounded object-cover" />
                )}
                <span className="truncate text-sm font-medium">{currentStyle?.name ?? '未选择风格'}</span>
                <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">v{currentStyle?.version}</span>
              </Button>
            </div>

            {/* 画面比例 + 默认文本模型 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0 space-y-1.5">
                <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">画面比例</Label>
                <Select value={project.aspectRatio} onValueChange={(v) => updateProject(projectId, { aspectRatio: v as AspectRatio })}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="16:9">16:9 横屏</SelectItem>
                    <SelectItem value="9:16">9:16 竖屏</SelectItem>
                    <SelectItem value="1:1">1:1 方屏</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">默认文本模型</Label>
                <Select value={(project.defaultTextModel || textModelOptions[0]?.name) ?? ''} onValueChange={(v) => updateProject(projectId, { defaultTextModel: v })}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="未配置" />
                  </SelectTrigger>
                  <SelectContent>
                    {textModelOptions.map((m) => (
                      <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 图片模型 + 视频模型 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0 space-y-1.5">
                <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">默认图片模型</Label>
                <Select value={project.defaultImageModel ?? ''} onValueChange={(v) => updateProject(projectId, { defaultImageModel: v })}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="未配置" />
                  </SelectTrigger>
                  <SelectContent>
                    {imageModelOptions.map((m) => (
                      <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">默认视频模型</Label>
                <Select value={project.defaultVideoModel ?? ''} onValueChange={(v) => updateProject(projectId, { defaultVideoModel: v })}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="未配置" />
                  </SelectTrigger>
                  <SelectContent>
                    {videoModelOptions.map((m) => (
                      <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
      </div>

      <StylePickerDialog key={String(styleOpen)} projectId={projectId} open={styleOpen} onOpenChange={setStyleOpen} />
    </div>
  );
}
