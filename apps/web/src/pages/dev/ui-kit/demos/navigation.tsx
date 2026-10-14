import { useState, type ReactNode } from 'react';
import {
  CopyIcon,
  FileTextIcon,
  FolderIcon,
  ImageIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  SlashIcon,
  SparklesIcon,
  Trash2Icon,
  UserIcon,
} from 'lucide-react';

import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// 导航类组件展示。key = 组件文件名（src/components/ui/<key>.tsx）。
// 说明：react-refresh/only-export-components 不建议「非组件导出 + 文件内局部组件」共存，
// 但本文件是 dev-only 展示页的 demo 注册表（对外只导出 NAVIGATION_DEMOS 一张表），
// 命令面板 / 下拉菜单需要受控 open 才能展示真实交互；按仓库「例外必须注释说明」的口径逐处显式豁免。
// eslint-disable-next-line react-refresh/only-export-components -- demo 注册表：CommandDialog 需要受控 open
function CommandDialogDemo() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <Button variant="outline" className="w-fit" onClick={() => setOpen(true)}>
        <SearchIcon /> 打开命令面板
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="命令面板"
        description="搜索要执行的命令"
      >
        <CommandInput placeholder="输入命令或搜索项目…" />
        <CommandList>
          <CommandEmpty>没有匹配的结果。</CommandEmpty>
          <CommandGroup heading="导航">
            <CommandItem onSelect={() => setOpen(false)}>
              <FolderIcon /> 项目总览
              <CommandShortcut>⌘1</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => setOpen(false)}>
              <FileTextIcon /> 分镜脚本
              <CommandShortcut>⌘2</CommandShortcut>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="操作">
            <CommandItem onSelect={() => setOpen(false)}>
              <PlusIcon /> 新建镜头
            </CommandItem>
            <CommandItem onSelect={() => setOpen(false)}>
              <SettingsIcon /> 设置
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- demo 注册表：勾选项 / 单选组需要受控状态
function DropdownMenuDemo() {
  const [grid, setGrid] = useState(true);
  const [duration, setDuration] = useState('medium');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">打开下拉菜单</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="start">
        <DropdownMenuLabel>第 3 集</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem>
            <UserIcon /> 重命名
            <DropdownMenuShortcut>⌘R</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <CopyIcon /> 复制
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>导出为</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem>PNG 序列</DropdownMenuItem>
              <DropdownMenuItem>MP4 视频</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={grid} onCheckedChange={setGrid}>
          显示网格
        </DropdownMenuCheckboxItem>
        <DropdownMenuRadioGroup value={duration} onValueChange={setDuration}>
          <DropdownMenuLabel>镜头时长</DropdownMenuLabel>
          <DropdownMenuRadioItem value="short">短（≤ 2s）</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="medium">中（2 ~ 5s）</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="long">长（&gt; 5s）</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" disabled>
          <Trash2Icon /> 删除（示例禁用）
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const NAVIGATION_DEMOS: Record<string, ReactNode> = {
  "breadcrumb": (
    <div className="flex flex-col gap-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink href="#breadcrumb">漫剧项目</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink href="#breadcrumb">第 3 集</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>分镜脚本</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><a href="#breadcrumb">asChild 链接</a></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator><SlashIcon /></BreadcrumbSeparator>
          <BreadcrumbItem><BreadcrumbEllipsis /></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>当前页（无链接）</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  ),
  "command": (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <Command className="max-w-3xl rounded-md border">
        <CommandInput placeholder="搜索镜头、角色、素材…" />
        <CommandList>
          <CommandEmpty>没有匹配的结果。</CommandEmpty>
          <CommandGroup heading="项目">
            <CommandItem value="项目总览">
              <FolderIcon /> 项目总览
              <CommandShortcut>⌘1</CommandShortcut>
            </CommandItem>
            <CommandItem value="分镜脚本">
              <FileTextIcon /> 分镜脚本
              <CommandShortcut>⌘2</CommandShortcut>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="素材">
            <CommandItem value="角色参考图">
              <ImageIcon /> 角色参考图
            </CommandItem>
            <CommandItem value="风格库" disabled>
              <SparklesIcon /> 风格库（禁用）
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
      <CommandDialogDemo />
    </div>
  ),
  "dropdown-menu": (<DropdownMenuDemo />),
  "pagination": (
    <div className="flex flex-col gap-4">
      <Pagination>
        <PaginationContent>
          <PaginationItem><PaginationPrevious href="#pagination" /></PaginationItem>
          <PaginationItem><PaginationLink href="#pagination">1</PaginationLink></PaginationItem>
          <PaginationItem><PaginationLink href="#pagination" isActive>2</PaginationLink></PaginationItem>
          <PaginationItem><PaginationLink href="#pagination">3</PaginationLink></PaginationItem>
          <PaginationItem><PaginationEllipsis /></PaginationItem>
          <PaginationItem><PaginationNext href="#pagination" /></PaginationItem>
        </PaginationContent>
      </Pagination>
      <Pagination>
        <PaginationContent>
          <PaginationItem><PaginationPrevious href="#pagination" aria-disabled /></PaginationItem>
          <PaginationItem><PaginationLink href="#pagination" isActive size="default">仅一页（isActive + size default）</PaginationLink></PaginationItem>
          <PaginationItem><PaginationNext href="#pagination" aria-disabled /></PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  ),
  "tabs": (
    <Tabs defaultValue="script" className="w-full min-w-0 max-w-3xl">
      <TabsList>
        <TabsTrigger value="script"><FileTextIcon /> 脚本</TabsTrigger>
        <TabsTrigger value="storyboard">分镜</TabsTrigger>
        <TabsTrigger value="assets" disabled>素材（禁用）</TabsTrigger>
      </TabsList>
      <TabsContent value="script" className="text-muted-foreground text-sm">
        脚本面板：TabsContent 只在激活时渲染，内容会随触发器懒挂载。
      </TabsContent>
      <TabsContent value="storyboard" className="text-muted-foreground text-sm">
        分镜面板：可用 defaultValue 指定初始页签，value 必填。
      </TabsContent>
    </Tabs>
  ),
};
