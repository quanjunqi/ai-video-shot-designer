// 组件库展示页（dev-only，路由见 src/app.tsx 的 import.meta.env.DEV 分支）。
//
// 事实源：src/generated/ui-catalog.ts（由 scripts/ui-inventory.mjs 从代码抽取，禁止手改）。
// 本页只做「展示 + 导航 + 缺口标注」，不引入任何新依赖、不重复维护组件元数据。
//
// 信息架构（为什么分三个视图）：这是一份设计规范稿，不是开发者工具页。
//   产品/设计同学问的是「这个组件长什么样、什么时候用、颜色字体间距有哪些」——
//   工程审计信息（exports / props / data-slot / 行数 / 引用数 / token）对他们只是噪音，
//   因此按受众拆成 组件画廊 / 设计规范 / 工程规格 三个视图，各自只回答自己那组问题。
import { useMemo, useState } from 'react';
import { SearchIcon } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UI_CATALOG } from '@/generated/ui-catalog';

import { ComponentDetailDialog } from './ComponentDetailDialog';
import { DesignSpecView } from './DesignSpecView';
import { EngineeringView } from './EngineeringView';
import { GalleryView } from './GalleryView';
import {
  buildCategoryGroups,
  matchesQuery,
  normalizeQuery,
  UI_KIT_VIEWS,
  type UiKitView,
} from './uiKitModel';

function ViewSwitch() {
  return (
    <TabsList aria-label="视图切换">
      {UI_KIT_VIEWS.map((option) => (
        <TabsTrigger key={option.value} value={option.value} title={option.hint}>
          {option.label}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}

export default function UiKitPage() {
  const [view, setView] = useState<UiKitView>('gallery');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  // 详情弹层：关闭时只把 open 置 false、保留 selected，退出动画期间内容不会先空掉。
  const [detailOpen, setDetailOpen] = useState(false);

  const openComponent = (name: string) => {
    setSelected(name);
    setDetailOpen(true);
  };

  const normalizedQuery = normalizeQuery(query);
  const { stats, categories, components, tokens, themeUtilities } = UI_CATALOG;

  const filtered = useMemo(
    () => components.filter((component) => matchesQuery(component, normalizedQuery)),
    [components, normalizedQuery],
  );

  const galleryGroups = useMemo(() => {
    const groups = buildCategoryGroups(filtered, categories);
    // 搜索时隐藏「没有命中在用组件」的分类（空分类标题对搜索没有帮助）；
    // 不搜索时保留空分类，编号与目录保持稳定（如 05 数据展示）。
    return normalizedQuery ? groups.filter((group) => group.components.length > 0) : groups;
  }, [filtered, categories, normalizedQuery]);

  const selectedComponent = useMemo(
    () => components.find((component) => component.name === selected) ?? null,
    [components, selected],
  );

  const componentNames = useMemo(() => components.map((component) => component.name), [components]);

  const unusedComponents = filtered.filter((component) => component.dead);
  const activeHint =
    UI_KIT_VIEWS.find((option) => option.value === view)?.hint ?? UI_KIT_VIEWS[0].hint;

  return (
    <Tabs
      value={view}
      onValueChange={(next) => {
        // Radix 回传的是 string；用白名单比对，避免把任意字符串当成视图（也不用类型断言）。
        const matched = UI_KIT_VIEWS.find((option) => option.value === next);
        if (matched) setView(matched.value);
      }}
      className="flex min-h-full w-full min-w-0 flex-col gap-0"
    >
      {/* 顶栏：全局 TopBar 之外的页面级 sticky 栏（AppShell 的 <main> 才是滚动容器，
          所以贴的是 main 顶边 top-0，不会跑到全局栏底下）。 */}
      <header className="bg-background/95 sticky top-0 z-20 border-b backdrop-blur">
        <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-wrap items-center gap-3 px-6 py-3">
          <div className="flex min-w-0 flex-col">
            <h1 className="text-xl font-semibold tracking-tight">组件库</h1>
            <p className="text-muted-foreground min-w-0 text-sm">
              {stats.components} 个组件 · {categories.length} 个分类 · 与代码同步更新
            </p>
          </div>

          {view === 'spec' ? (
            <span className="text-muted-foreground ml-auto hidden min-w-0 text-xs sm:block">
              设计规范视图不含搜索：色彩 / 字体 / 间距 / 圆角 / 阴影 / 动效全量列出
            </span>
          ) : (
            <div className="relative ml-auto w-full min-w-0 sm:w-72">
              <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                aria-label="搜索组件（名称 / 分类 / 导出名 / 用途）"
                placeholder="搜索组件，例如 button、确认、表单…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="min-w-0 pl-8"
              />
            </div>
          )}

          <ViewSwitch />
        </div>
      </header>

      <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-10 px-6 py-8">
        <p className="text-muted-foreground min-w-0 text-sm">{activeHint}</p>

        <TabsContent value="gallery">
          <GalleryView
            groups={galleryGroups}
            unusedComponents={unusedComponents}
            unusedTotal={stats.dead}
            query={query}
            onOpenComponent={openComponent}
          />
        </TabsContent>

        <TabsContent value="spec">
          <DesignSpecView tokens={tokens} components={components} catalog={UI_CATALOG} />
        </TabsContent>

        <TabsContent value="engineering">
          <EngineeringView
            components={filtered}
            totalComponents={stats.components}
            utilities={themeUtilities}
            query={query}
            onOpenComponent={openComponent}
          />
        </TabsContent>
      </div>

      <ComponentDetailDialog
        open={detailOpen}
        component={selectedComponent}
        knownComponents={componentNames}
        onOpenComponent={openComponent}
        onClose={() => setDetailOpen(false)}
      />
    </Tabs>
  );
}
