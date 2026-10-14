import type { ReactNode } from 'react';
import {
  CircleAlertIcon,
  CircleCheckIcon,
  InfoIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Toaster } from '@/components/ui/sonner';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// 反馈与浮层组件展示。key = 组件文件名（src/components/ui/<key>.tsx）。
// 浮层类组件默认关闭（portal 到 body），点击触发按钮即可查看真实渲染。
export const FEEDBACK_DEMOS: Record<string, ReactNode> = {
  "alert": (
    <div className="flex w-full min-w-0 max-w-3xl flex-col gap-3">
      <Alert>
        <InfoIcon />
        <AlertTitle>默认（default）</AlertTitle>
        <AlertDescription>用于普通说明与背景信息，不抢注意力。</AlertDescription>
      </Alert>
      <Alert variant="success">
        <CircleCheckIcon />
        <AlertTitle>成功（success）</AlertTitle>
        <AlertDescription>生成任务已完成，可以去预览分镜结果。</AlertDescription>
      </Alert>
      <Alert variant="warning">
        <TriangleAlertIcon />
        <AlertTitle>警告（warning）</AlertTitle>
        <AlertDescription>当前模型配额剩余不足 20%，请及时补充。</AlertDescription>
      </Alert>
      <Alert variant="destructive">
        <CircleAlertIcon />
        <AlertTitle>错误（destructive）</AlertTitle>
        <AlertDescription>生成失败：上游网关超时，请重试或更换渠道。</AlertDescription>
      </Alert>
    </div>
  ),
  "alert-dialog": (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" className="w-fit">
          <Trash2Icon /> 删除这一集
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认删除第 3 集？</AlertDialogTitle>
          <AlertDialogDescription>
            删除后该集的分镜、素材关联与生成记录都会一并移除，且无法恢复。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction>确认删除</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ),
  "dialog": (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-fit">
          打开对话框
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建镜头</DialogTitle>
          <DialogDescription>填写基础信息，后续可在工作台继续细化运镜。</DialogDescription>
        </DialogHeader>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="dialog-shot-name">镜头名称</Label>
          <Input id="dialog-shot-name" placeholder="例如：教室 · 中景 · 逆光" />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">取消</Button>
          </DialogClose>
          <Button>创建</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
  "popover": (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-fit">
          设置画布尺寸
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="popover-width">宽度（px）</Label>
            <Input id="popover-width" defaultValue="1920" inputMode="numeric" />
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="popover-height">高度（px）</Label>
            <Input id="popover-height" defaultValue="1080" inputMode="numeric" />
          </div>
          <Button size="sm">应用</Button>
        </div>
      </PopoverContent>
    </Popover>
  ),
  "tooltip": (
    <div className="flex flex-wrap items-center gap-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline">上方提示</Button>
        </TooltipTrigger>
        <TooltipContent side="top">重新生成当前镜头</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline">下方提示</Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">复制镜头参数到下一镜</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="icon" variant="ghost" title="删除镜头" aria-label="删除镜头">
            <Trash2Icon />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">删除镜头（不可撤销）</TooltipContent>
      </Tooltip>
    </div>
  ),
  "progress": (
    <div className="flex w-full min-w-0 max-w-3xl flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-muted-foreground text-xs">0%</span>
        <Progress value={0} />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-muted-foreground text-xs">25%</span>
        <Progress value={25} />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-muted-foreground text-xs">60%</span>
        <Progress value={60} />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-muted-foreground text-xs">100%</span>
        <Progress value={100} />
      </div>
    </div>
  ),
  "sheet": (
    <div className="flex flex-wrap items-center gap-3">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline">右侧抽屉面板</Button>
        </SheetTrigger>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>镜头参数</SheetTitle>
            <SheetDescription>Sheet 基于 Dialog，从屏幕边缘滑出，适合编辑表单。</SheetDescription>
          </SheetHeader>
          <div className="flex min-w-0 flex-col gap-3 px-4">
            <div className="flex min-w-0 flex-col gap-2">
              <Label htmlFor="sheet-framing">景别</Label>
              <Input id="sheet-framing" defaultValue="中景" />
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <Label htmlFor="sheet-duration">时长（秒）</Label>
              <Input id="sheet-duration" defaultValue="2.5" inputMode="decimal" />
            </div>
          </div>
          <SheetFooter>
            <SheetClose asChild>
              <Button variant="outline">取消</Button>
            </SheetClose>
            <Button>保存</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline">左侧抽屉面板</Button>
        </SheetTrigger>
        <SheetContent side="left">
          <SheetHeader>
            <SheetTitle>side=&quot;left&quot;</SheetTitle>
            <SheetDescription>同一组件通过 side 切换四个方向。</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    </div>
  ),
  "sonner": (
    <div className="flex w-full min-w-0 max-w-3xl flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={() => toast.success('分镜已保存')}>
          成功 toast
        </Button>
        <Button variant="outline" onClick={() => toast.error('生成失败：网关超时')}>
          错误 toast
        </Button>
        <Button variant="outline" onClick={() => toast.info('已切换到暗色主题')}>
          信息 toast
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            toast.promise(new Promise((resolve) => setTimeout(resolve, 1500)), {
              loading: '正在生成…',
              success: '生成完成',
              error: '生成失败',
            })
          }
        >
          Promise toast
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Toaster 通过 next-themes 的 theme 跟随明暗主题；AppShell 已全局挂载一个（top-center），
        此处为展示组件本身额外挂载在右下角，因此同一 toast 会同时出现两处。
      </p>
      <Toaster position="bottom-right" />
    </div>
  ),
};
