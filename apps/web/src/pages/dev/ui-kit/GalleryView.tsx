// 视图 1「组件画廊」：面向产品 / 设计。
// 卡片只回答两件事——叫什么、长什么样；一行 muted 小字说用途。整张卡片可点开用法，
// 一切工程元数据（exports / props / data-slot / 行数 / 引用数 / 文件路径 / token）
// 都下沉到「工程规格」视图与详情弹层。
import { useState } from 'react';
import { ChevronRightIcon } from 'lucide-react';

import type { UiComponent } from '@/generated/ui-catalog';
import { cn } from '@/lib/utils';

import { UI_DEMOS } from './demos';
import { SpecSectionHeader } from './SpecSection';
import { UNUSED_ANCHOR, type CategoryGroup } from './uiKitModel';

type GalleryViewProps = {
  groups: CategoryGroup[];
  unusedComponents: UiComponent[];
  unusedTotal: number;
  query: string;
  onOpenComponent: (name: string) => void;
};

// 整张卡片即入口：鼠标 hover 出主色描边，键盘用 Enter / Space（role=button + tabIndex）。
function ComponentCard({
  component,
  onOpenComponent,
}: {
  component: UiComponent;
  onOpenComponent: (name: string) => void;
}) {
  const when = component.notes.when;
  const demo = UI_DEMOS[component.name];

  return (
    <article
      role="button"
      tabIndex={0}
      title="查看用法"
      aria-label={`查看 ${component.name} 的用法`}
      onClick={() => onOpenComponent(component.name)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onOpenComponent(component.name);
      }}
      className="bg-background border-border/60 hover:bg-muted/25 focus-visible:ring-ring/30 -mr-px -mb-px flex min-w-0 cursor-pointer flex-col gap-3 border-r border-b p-4 transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      {/* 样本 + 下方等宽小字标签（规范稿的格子语法）：预览瓷砖统一中性底面、统一高度；
          必须 min-h-0，否则 flex 子项的 min-height:auto 会让 demo 把盒子撑开（max-h-* 无效，实测）。
          底部渐隐遮罩把超出部分裁成「预览截断」而不是硬切口，完整 demo 在详情弹层里。 */}
      <div className="bg-muted/30 flex h-40 min-h-0 min-w-0 items-start justify-center overflow-hidden rounded-lg p-2 [mask-image:linear-gradient(to_bottom,black_88%,transparent)]">
        {demo ?? <span className="text-muted-foreground text-xs">暂无示例</span>}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <h3 className="min-w-0 truncate font-mono text-xs font-medium">{component.name}</h3>
        <p className="text-muted-foreground min-w-0 truncate text-xs" title={when}>
          {when || '暂无用途说明'}
        </p>
      </div>
    </article>
  );
}

function CategoryNav({ groups, unusedTotal }: { groups: CategoryGroup[]; unusedTotal: number }) {
  const itemClass =
    'text-muted-foreground hover:text-foreground flex min-w-0 items-baseline gap-3 rounded-md px-2 py-1.5 text-sm transition-colors';
  return (
    <aside className="flex min-w-0 flex-col gap-0.5 lg:sticky lg:top-24 lg:z-10 lg:w-56 lg:shrink-0">
      <p className="text-muted-foreground px-2 pb-2 text-xs font-medium">分类目录</p>
      {groups.map((group) => (
        <a key={group.id} href={`#${group.id}`} className={itemClass}>
          <span className="font-mono text-xs tabular-nums">{group.number}</span>
          <span className="min-w-0 flex-1 truncate">{group.category}</span>
          <span className="text-xs tabular-nums">{group.components.length || '—'}</span>
        </a>
      ))}
      {unusedTotal > 0 ? (
        <a href={`#${UNUSED_ANCHOR}`} className={cn(itemClass, 'border-border mt-2 border-t pt-3')}>
          <span className="font-mono text-xs tabular-nums">—</span>
          <span className="min-w-0 flex-1 truncate">未纳入当前产品</span>
          <span className="text-xs tabular-nums">{unusedTotal}</span>
        </a>
      ) : null}
    </aside>
  );
}

function UnusedComponents({
  components,
  total,
  query,
  onOpenComponent,
}: {
  components: UiComponent[];
  total: number;
  query: string;
  onOpenComponent: (name: string) => void;
}) {
  const [pinnedOpen, setPinnedOpen] = useState(false);
  // 默认折叠；一旦在搜索，自动展开（否则「搜到的组件在哪」会变成谜）。
  const open = pinnedOpen || query.length > 0;

  return (
    <section
      id={UNUSED_ANCHOR}
      className="flex min-w-0 scroll-mt-24 flex-col gap-3 rounded-xl border p-5"
    >
      <button
        type="button"
        className="flex min-w-0 items-center gap-3 text-left"
        aria-expanded={open}
        aria-controls={`${UNUSED_ANCHOR}-body`}
        onClick={() => setPinnedOpen((value) => !value)}
      >
        <ChevronRightIcon
          className={cn(
            'text-muted-foreground size-4 shrink-0 transition-transform',
            open && 'rotate-90',
          )}
        />
        <h2 className="text-lg font-semibold tracking-tight">
          未纳入当前产品的组件（{total}）
        </h2>
      </button>
      <p className="text-muted-foreground text-sm">这些组件已实现但当前页面未使用，可复用。</p>
      {open ? (
        <div id={`${UNUSED_ANCHOR}-body`} className="flex min-w-0 flex-col gap-2">
          {components.length !== total ? (
            <span className="text-muted-foreground text-xs">匹配 {components.length} 个</span>
          ) : null}
          <div className="flex min-w-0 flex-wrap gap-2">
            {components.length > 0 ? (
              components.map((component) => (
                <button
                  key={component.name}
                  type="button"
                  title="查看用法"
                  className="bg-muted text-muted-foreground hover:text-foreground min-w-0 truncate rounded-md px-2 py-1 font-mono text-xs transition-colors"
                  onClick={() => onOpenComponent(component.name)}
                >
                  {component.name}
                </button>
              ))
            ) : (
              <p className="text-muted-foreground text-sm">没有匹配的组件。</p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function GalleryView({
  groups,
  unusedComponents,
  unusedTotal,
  query,
  onOpenComponent,
}: GalleryViewProps) {
  const matched = groups.reduce((sum, group) => sum + group.components.length, 0);

  return (
    <div className="flex min-w-0 flex-col gap-12 lg:flex-row lg:items-start">
      <CategoryNav groups={groups} unusedTotal={unusedTotal} />

      <div className="flex min-w-0 flex-1 flex-col gap-12">
        {matched === 0 ? (
          <p className="text-muted-foreground text-sm">
            {query ? `没有匹配「${query}」的组件。` : '组件清单为空。'}
          </p>
        ) : null}

        {groups.map((group) => (
          <section
            key={group.id}
            id={group.id}
            className="flex min-w-0 scroll-mt-24 flex-col gap-5"
          >
            <SpecSectionHeader
              number={group.number}
              title={group.category}
              description={group.description}
              meta={group.components.length > 0 ? `${group.components.length} 个组件` : undefined}
            />
            {group.components.length > 0 ? (
              // 细线样本板：格子自带 1px 右/下边线（-mr/-mb-px 让边线互相压住，
              // 外层 overflow-hidden 剪掉最后一列/行的 1px），不用卡片边框与阴影；
              // 末行不满时剩下的格子保持页面底色，不会出现「半透明空洞」。
              <div className="border-border/60 grid min-w-0 grid-cols-1 overflow-hidden rounded-lg border sm:grid-cols-2 xl:grid-cols-3">
                {group.components.map((component) => (
                  <ComponentCard
                    key={component.name}
                    component={component}
                    onOpenComponent={onOpenComponent}
                  />
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                暂无在用组件；该分类下 {group.implementedCount} 个实现均未纳入当前产品。
              </p>
            )}
          </section>
        ))}

        <UnusedComponents
          components={unusedComponents}
          total={unusedTotal}
          query={query}
          onOpenComponent={onOpenComponent}
        />
      </div>
    </div>
  );
}
