import { useState, type ReactNode } from 'react';
import {
  BookOpenIcon,
  CalendarIcon,
  CopyIcon,
  FileTextIcon,
  FolderIcon,
  ImageIcon,
  LogOutIcon,
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
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
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
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from '@/components/ui/menubar';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu';
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
  "context-menu": (
    <ContextMenu>
      <ContextMenuTrigger className="text-muted-foreground flex h-32 w-full min-w-0 max-w-3xl items-center justify-center rounded-md border border-dashed text-sm">
        在此区域点击鼠标右键
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuLabel>镜头 3</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem><UserIcon /> 重命名<ContextMenuShortcut>⌘R</ContextMenuShortcut></ContextMenuItem>
        <ContextMenuItem><CopyIcon /> 复制</ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>导出为</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem>PNG</ContextMenuItem>
            <ContextMenuItem>MP4</ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuCheckboxItem checked>显示网格</ContextMenuCheckboxItem>
        <ContextMenuRadioGroup value="medium">
          <ContextMenuLabel>镜头时长</ContextMenuLabel>
          <ContextMenuRadioItem value="short">短（≤ 2s）</ContextMenuRadioItem>
          <ContextMenuRadioItem value="medium">中（2 ~ 5s）</ContextMenuRadioItem>
        </ContextMenuRadioGroup>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive"><Trash2Icon /> 删除</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  ),
  "dropdown-menu": (<DropdownMenuDemo />),
  "menubar": (
    <Menubar className="w-fit">
      <MenubarMenu>
        <MenubarTrigger>文件</MenubarTrigger>
        <MenubarContent>
          <MenubarLabel>项目</MenubarLabel>
          <MenubarSeparator />
          <MenubarItem><PlusIcon /> 新建项目<MenubarShortcut>⌘N</MenubarShortcut></MenubarItem>
          <MenubarItem><FolderIcon /> 打开…</MenubarItem>
          <MenubarSub>
            <MenubarSubTrigger>最近打开</MenubarSubTrigger>
            <MenubarSubContent>
              <MenubarItem>第 1 集</MenubarItem>
              <MenubarItem>第 2 集</MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator />
          <MenubarItem variant="destructive"><Trash2Icon /> 删除项目</MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger>视图</MenubarTrigger>
        <MenubarContent>
          <MenubarCheckboxItem checked>显示网格</MenubarCheckboxItem>
          <MenubarCheckboxItem>显示标尺</MenubarCheckboxItem>
          <MenubarSeparator />
          <MenubarRadioGroup value="comfortable">
            <MenubarLabel>密度</MenubarLabel>
            <MenubarRadioItem value="compact">紧凑</MenubarRadioItem>
            <MenubarRadioItem value="comfortable">舒适</MenubarRadioItem>
          </MenubarRadioGroup>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger>帮助</MenubarTrigger>
        <MenubarContent>
          <MenubarItem>
            <BookOpenIcon /> 组件库文档
          </MenubarItem>
          <MenubarItem disabled>
            <LogOutIcon /> 退出登录（禁用）
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  ),
  "navigation-menu": (
    <div className="w-full min-w-0 max-w-3xl">
      <NavigationMenu className="items-start justify-start">
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuTrigger>制作</NavigationMenuTrigger>
            <NavigationMenuContent>
              <ul className="grid w-80 min-w-0 gap-1 p-2">
                <li className="min-w-0"><NavigationMenuLink href="#navigation-menu"><span className="font-medium">分镜脚本</span><span className="text-muted-foreground text-xs">按场次拆分镜头</span></NavigationMenuLink></li>
                <li className="min-w-0"><NavigationMenuLink href="#navigation-menu"><span className="font-medium">素材库</span><span className="text-muted-foreground text-xs">角色、场景与道具</span></NavigationMenuLink></li>
              </ul>
            </NavigationMenuContent>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavigationMenuTrigger>资源</NavigationMenuTrigger>
            <NavigationMenuContent>
              <ul className="w-64 min-w-0 p-2">
                <li className="min-w-0"><NavigationMenuLink href="#navigation-menu" className="flex-row items-center gap-2"><CalendarIcon /> 生成历史</NavigationMenuLink></li>
              </ul>
            </NavigationMenuContent>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavigationMenuLink href="#navigation-menu" className={navigationMenuTriggerStyle()}>直接链接</NavigationMenuLink>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
      <p className="text-muted-foreground mt-3 text-xs">
        悬停「制作 / 资源」展开视图；viewport 属性可关闭浮层容器。
      </p>
    </div>
  ),
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
