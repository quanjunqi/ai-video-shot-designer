import type { ReactNode } from 'react';
import {
  ChevronDownIcon,
  FileTextIcon,
  ImageIcon,
  LayoutDashboardIcon,
  PlusIcon,
  SettingsIcon,
  SparklesIcon,
  UsersIcon,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Image } from '@/components/ui/image';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from '@/components/ui/item';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar';

// 布局结构组件展示。key = 组件文件名（src/components/ui/<key>.tsx）。
const SHOT_ROWS = [
  '镜头 1 · 全景 · 3.0s',
  '镜头 2 · 中景 · 2.5s',
  '镜头 3 · 近景 · 1.8s',
  '镜头 4 · 特写 · 1.2s',
  '镜头 5 · 全景 · 4.0s',
  '镜头 6 · 中景 · 2.2s',
  '镜头 7 · 近景 · 1.5s',
  '镜头 8 · 特写 · 0.9s',
  '镜头 9 · 全景 · 3.6s',
  '镜头 10 · 中景 · 2.8s',
];

const CARDS = ['分镜 01', '分镜 02', '分镜 03', '分镜 04', '分镜 05', '分镜 06'];

export const LAYOUT_DEMOS: Record<string, ReactNode> = {
  "collapsible": (
    <div className="flex w-full min-w-0 max-w-3xl flex-col gap-4">
      <Collapsible defaultOpen className="flex flex-col gap-2">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between">
            高级参数（defaultOpen）
            <ChevronDownIcon />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="text-muted-foreground rounded-md border p-3 text-sm">
          采样步数、CFG、随机种子等仅在需要精细控制时展开。
        </CollapsibleContent>
      </Collapsible>
      <Collapsible className="flex flex-col gap-2">
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full justify-between">
            默认收起状态
            <ChevronDownIcon />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="text-muted-foreground rounded-md border p-3 text-sm">
          展开态由 Radix 管理；触发器 asChild 复用 Button 样式。
        </CollapsibleContent>
      </Collapsible>
    </div>
  ),
  "empty": (
    <div className="flex flex-col gap-4">
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ImageIcon />
          </EmptyMedia>
          <EmptyTitle>还没有镜头</EmptyTitle>
          <EmptyDescription>创建第一个镜头后，这里会显示分镜列表与生成状态。</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button size="sm">
            <PlusIcon /> 新建镜头
          </Button>
        </EmptyContent>
      </Empty>
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia>
            <SparklesIcon />
          </EmptyMedia>
          <EmptyTitle>不带底色媒体</EmptyTitle>
          <EmptyDescription>variant 默认值，适合嵌入已有卡片内部。</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  ),
  "item": (
    <div className="flex w-full min-w-0 max-w-3xl flex-col gap-4">
      <ItemGroup>
        <Item variant="outline">
          <ItemMedia variant="icon">
            <FileTextIcon />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>第 3 集 · 分镜脚本</ItemTitle>
            <ItemDescription>12 个镜头 · 由 AI 生成，待审核</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Badge variant="secondary">草稿</Badge>
          </ItemActions>
        </Item>
        <ItemSeparator />
        <Item variant="muted" size="sm">
          <ItemMedia variant="image">
            <Image src="/placeholders/p00.jpg" alt="素材封面" />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>角色参考图 · 林小满</ItemTitle>
            <ItemDescription>size sm + variant muted 的紧凑形态</ItemDescription>
          </ItemContent>
        </Item>
        <ItemSeparator />
        <Item asChild variant="outline">
          <a href="#item">
            <ItemMedia variant="icon">
              <UsersIcon />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>asChild：整行可点</ItemTitle>
              <ItemDescription>渲染为 a 标签，保留 Item 布局</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Badge variant="outline">链接</Badge>
            </ItemActions>
          </a>
        </Item>
      </ItemGroup>
    </div>
  ),
  "resizable": (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <ResizablePanelGroup
        direction="horizontal"
        className="h-40 w-full min-w-0 max-w-3xl overflow-hidden rounded-md border"
      >
        <ResizablePanel defaultSize={40} minSize={20}>
          <div className="flex h-full min-w-0 items-center justify-center p-4 text-sm">
            左侧面板
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={60} minSize={20}>
          <div className="flex h-full min-w-0 items-center justify-center p-4 text-sm">
            右侧面板（拖拽中间手柄）
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
      <ResizablePanelGroup
        direction="vertical"
        className="h-40 w-full min-w-0 max-w-3xl overflow-hidden rounded-md border"
      >
        <ResizablePanel defaultSize={50}>
          <div className="flex h-full min-w-0 items-center justify-center p-4 text-sm">上</div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={50}>
          <div className="flex h-full min-w-0 items-center justify-center p-4 text-sm">下</div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  ),
  "scroll-area": (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <ScrollArea className="h-40 w-full min-w-0 max-w-3xl rounded-md border">
        <div className="flex flex-col gap-2 p-3">
          {SHOT_ROWS.map((row) => (
            <p key={row} className="text-sm">
              {row}
            </p>
          ))}
        </div>
      </ScrollArea>
      <ScrollArea className="w-full min-w-0 max-w-3xl rounded-md border">
        <div className="flex w-max gap-2 p-3">
          {CARDS.map((card) => (
            <div
              key={card}
              className="bg-muted flex h-16 w-32 shrink-0 items-center justify-center rounded-md text-xs"
            >
              {card}
            </div>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  ),
  "sidebar": (
    <div className="h-96 w-full min-w-0 overflow-hidden rounded-md border">
      <SidebarProvider className="h-full min-h-0">
        <Sidebar collapsible="none" className="h-full">
          <SidebarHeader>
            <div className="flex min-w-0 items-center gap-2 px-2 py-1">
              <SparklesIcon className="size-4" />
              <span className="truncate text-sm font-semibold">漫剧工坊</span>
            </div>
            <SidebarInput placeholder="搜索…" aria-label="搜索菜单" />
          </SidebarHeader>
          <SidebarSeparator />
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>制作</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive tooltip="项目总览">
                      <LayoutDashboardIcon />
                      <span>项目总览</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton tooltip="分镜">
                      <FileTextIcon />
                      <span>分镜</span>
                    </SidebarMenuButton>
                    <SidebarMenuBadge>12</SidebarMenuBadge>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton tooltip="素材">
                      <ImageIcon />
                      <span>素材</span>
                    </SidebarMenuButton>
                    <SidebarMenuAction aria-label="新建素材" title="新建素材">
                      <PlusIcon />
                    </SidebarMenuAction>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton href="#sidebar" isActive>
                          角色
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton href="#sidebar">场景</SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="sm" tooltip="设置">
                  <SettingsIcon />
                  <span>设置</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <SidebarInset className="min-w-0 overflow-hidden">
          <div className="flex min-w-0 items-center gap-2 border-b p-2">
            <SidebarTrigger />
            <span className="text-sm font-medium">SidebarInset</span>
          </div>
          <div className="text-muted-foreground min-w-0 p-4 text-sm">
            SidebarProvider 提供宽度变量与键盘快捷键（⌘/Ctrl + B），SidebarTrigger 切换展开态。
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  ),
};
