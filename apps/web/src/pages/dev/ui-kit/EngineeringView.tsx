// 视图 3「工程规格（开发者）」：面向工程。
// 这里才是 exports / props / data-slot / 引用数 / 行数 / 文件路径 / 使用 token 的归宿，
// 也是 @theme 工具类映射表与两份生成物清单的入口。
// 视觉上刻意「安静」：更少边框、更小字号——它是查询工具，不需要和画廊抢注意力。
import { Fragment, useState } from 'react';
import { ChevronRightIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { UiComponent, UiThemeUtility } from '@/generated/ui-catalog';
import { cn } from '@/lib/utils';

import { InfoChips } from './InfoChips';
import {
  AGENT_DOC_PATH,
  CHECK_COMMAND,
  GENERATE_COMMAND,
  HUMAN_DOC_PATH,
  sizeValuesLabel,
  summarizeVariants,
  utilityClassFor,
  variantDimensionLabel,
} from './uiKitModel';

type EngineeringViewProps = {
  components: UiComponent[];
  totalComponents: number;
  utilities: UiThemeUtility[];
  query: string;
  onOpenComponent: (name: string) => void;
};

const TH_CLASS = 'px-3 py-2 text-left text-xs font-medium';

function ComponentRow({
  component,
  expanded,
  onToggle,
  onOpenComponent,
}: {
  component: UiComponent;
  expanded: boolean;
  onToggle: (name: string) => void;
  onOpenComponent: (name: string) => void;
}) {
  const variants = summarizeVariants(component);
  return (
    <Fragment>
      <tr className="border-border/60 border-b align-top">
        <td className="px-3 py-2">
          <div className="flex min-w-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 shrink-0"
              aria-label={`${expanded ? '收起' : '展开'} ${component.name} 的工程信息`}
              aria-expanded={expanded}
              onClick={() => onToggle(component.name)}
            >
              <ChevronRightIcon
                className={cn('size-3.5 transition-transform', expanded && 'rotate-90')}
              />
            </Button>
            <button
              type="button"
              className="min-w-0 truncate font-mono text-xs hover:underline"
              onClick={() => onOpenComponent(component.name)}
            >
              {component.name}
            </button>
          </div>
        </td>
        <td className="text-muted-foreground px-3 py-2 text-xs whitespace-nowrap">
          {component.category}
        </td>
        <td className="px-3 py-2 text-xs whitespace-nowrap">{variantDimensionLabel(component)}</td>
        <td className="text-muted-foreground px-3 py-2 font-mono text-xs whitespace-nowrap">
          {sizeValuesLabel(component)}
        </td>
        <td
          className="px-3 py-2 text-xs tabular-nums"
          title={component.usage.files.join('\n') || '无引用'}
        >
          {component.usage.count}
        </td>
        <td className="text-muted-foreground px-3 py-2 text-xs tabular-nums">{component.lines}</td>
        <td className="px-3 py-2">
          {component.dead ? (
            <Badge variant="outline" className="text-xs">
              零引用
            </Badge>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          )}
        </td>
      </tr>
      {expanded ? (
        <tr className="border-border/60 border-b">
          <td colSpan={7} className="px-3 py-3">
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <InfoChips label="文件" items={[`${component.file}（${component.lines} 行）`]} />
              <InfoChips label={`导出（${component.exports.length}）`} items={component.exports} />
              <InfoChips label={`Props（${component.props.length}）`} items={component.props} />
              <InfoChips label={`data-slot（${component.slots.length}）`} items={component.slots} />
              <InfoChips label={`使用 token（${component.tokens.length}）`} items={component.tokens} />
              <InfoChips label={`被引用（${component.usage.count} 处）`} items={component.usage.files} />
              {variants.dimensions.length > 0 ? (
                <InfoChips
                  label="变体取值"
                  items={variants.dimensions.map(
                    (dimension) =>
                      `${dimension.name}: ${dimension.values.join(' / ') || '—'}${
                        dimension.defaultValue ? `（默认 ${dimension.defaultValue}）` : ''
                      }`,
                  )}
                />
              ) : null}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => onOpenComponent(component.name)}
            >
              查看用法
            </Button>
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

export function EngineeringView({
  components,
  totalComponents,
  utilities,
  query,
  onOpenComponent,
}: EngineeringViewProps) {
  const [expanded, setExpanded] = useState<string[]>([]);

  const toggle = (name: string) => {
    setExpanded((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name],
    );
  };

  return (
    <div className="flex min-w-0 flex-col gap-10">
      <section className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-3">
          <h2 className="text-base font-semibold">组件总表</h2>
          <span className="text-muted-foreground text-xs tabular-nums">
            {components.length} / {totalComponents}
          </span>
          <span className="text-muted-foreground min-w-0 text-xs">
            用上方搜索框过滤；点行首箭头展开 exports、props、data-slot、引用与文件路径。
          </span>
        </div>
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-0 text-xs">
            <thead className="text-muted-foreground border-border border-b">
              <tr>
                <th scope="col" className={TH_CLASS}>
                  组件
                </th>
                <th scope="col" className={TH_CLASS}>
                  分类
                </th>
                <th scope="col" className={TH_CLASS}>
                  变体
                </th>
                <th scope="col" className={TH_CLASS}>
                  尺寸
                </th>
                <th scope="col" className={TH_CLASS}>
                  引用数
                </th>
                <th scope="col" className={TH_CLASS}>
                  行数
                </th>
                <th scope="col" className={TH_CLASS}>
                  零引用
                </th>
              </tr>
            </thead>
            <tbody>
              {components.length > 0 ? (
                components.map((component) => (
                  <ComponentRow
                    key={component.name}
                    component={component}
                    expanded={expanded.includes(component.name)}
                    onToggle={toggle}
                    onOpenComponent={onOpenComponent}
                  />
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="text-muted-foreground px-3 py-6 text-sm">
                    {query ? `没有匹配「${query}」的组件。` : '组件清单为空。'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-3">
          <h2 className="text-base font-semibold">@theme 工具类映射</h2>
          <span className="text-muted-foreground text-xs tabular-nums">{utilities.length} 条</span>
          <span className="text-muted-foreground min-w-0 text-xs">
            来自 <code className="font-mono">@theme inline</code>：写 UI 只用这些工具类，不要硬编码数值或色值（V-002）。
          </span>
        </div>
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-0 text-xs">
            <thead className="text-muted-foreground border-border border-b">
              <tr>
                <th scope="col" className={TH_CLASS}>
                  @theme token
                </th>
                <th scope="col" className={TH_CLASS}>
                  值
                </th>
                <th scope="col" className={TH_CLASS}>
                  分类
                </th>
                <th scope="col" className={TH_CLASS}>
                  对应工具类
                </th>
              </tr>
            </thead>
            <tbody>
              {utilities.map((utility) => (
                <tr key={utility.name} className="border-border/60 border-b">
                  <td className="px-3 py-1.5 font-mono whitespace-nowrap">{utility.name}</td>
                  <td
                    className="text-muted-foreground max-w-0 truncate px-3 py-1.5 font-mono"
                    title={utility.value}
                  >
                    {utility.value}
                  </td>
                  <td className="text-muted-foreground px-3 py-1.5 whitespace-nowrap">
                    {utility.group}
                  </td>
                  <td className="px-3 py-1.5 font-mono">{utilityClassFor(utility.name)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="border-border flex min-w-0 flex-col gap-2 border-t pt-5">
        <h2 className="text-base font-semibold">生成物与清单</h2>
        <p className="text-muted-foreground text-xs">
          清单由代码生成、禁止手改；改组件或注记后跑{' '}
          <code className="font-mono">{GENERATE_COMMAND}</code>，CI 用{' '}
          <code className="font-mono">{CHECK_COMMAND}</code> 拦漂移。
        </p>
        <ul className="flex min-w-0 flex-col gap-1">
          <li className="flex min-w-0 flex-wrap items-baseline gap-2">
            <code className="min-w-0 truncate font-mono text-xs">{HUMAN_DOC_PATH}</code>
            <span className="text-muted-foreground text-xs">人看的清单</span>
          </li>
          <li className="flex min-w-0 flex-wrap items-baseline gap-2">
            <code className="min-w-0 truncate font-mono text-xs">{AGENT_DOC_PATH}</code>
            <span className="text-muted-foreground text-xs">agent 看的清单（规则域）</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
