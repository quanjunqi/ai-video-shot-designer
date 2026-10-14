// 详情弹层：从画廊卡片点开。
// 上半部分是给人看的（预览 + 何时用 / 别用 / 反例 / 相关组件），
// 工程信息默认折叠——产品同学不展开就永远不会撞见 props 与 data-slot。
import { type ReactNode } from 'react';
import { ChevronDownIcon, CopyIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { UiComponent } from '@/generated/ui-catalog';

import { UI_DEMOS } from './demos';
import { InfoChips } from './InfoChips';
import {
  copyImportPath,
  importPathFor,
  NOTES_FILE,
  summarizeVariants,
  variantPropRows,
  type VariantSummary,
} from './uiKitModel';

type ComponentDetailDialogProps = {
  // open 与 component 分开：关闭时保留 component，退出动画期间弹层内容不会先空掉。
  open: boolean;
  component: UiComponent | null;
  knownComponents: string[];
  onOpenComponent: (name: string) => void;
  onClose: () => void;
};

function NoteRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}

// 属性表：属性 / 取值 / 默认值 / 说明（说明 = cva 里每个取值的类名，即 redline）。
// component.props 只有类型字符串（如 React.ComponentProps<"div">），所以「继承属性」
// 单独用 chip 列类型，不与 cva 变体混在一张表里。
function VariantPropTable({ component }: { component: UiComponent }) {
  const rows = variantPropRows(component);
  if (rows.length === 0) return null;
  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full min-w-0 text-xs">
        <thead className="text-muted-foreground border-border/60 border-b">
          <tr>
            <th scope="col" className="py-1.5 pr-3 text-left font-medium">
              属性
            </th>
            <th scope="col" className="py-1.5 pr-3 text-left font-medium">
              取值
            </th>
            <th scope="col" className="py-1.5 pr-3 text-left font-medium">
              默认值
            </th>
            <th scope="col" className="py-1.5 text-left font-medium">
              说明（类名）
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="border-border/60 border-b align-top">
              <td className="py-2 pr-3 font-mono">{row.name}</td>
              <td className="py-2 pr-3">{row.values.join(' / ') || '—'}</td>
              <td className="text-muted-foreground py-2 pr-3 font-mono">
                {row.defaultValue ?? '—'}
              </td>
              <td className="py-2">
                <ul className="flex min-w-0 flex-col gap-1">
                  {row.values.map((value) => (
                    <li key={value} className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:gap-2">
                      <code className="text-muted-foreground shrink-0 font-mono">{value}</code>
                      <code className="min-w-0 break-all">{row.classes[value] ?? '—'}</code>
                    </li>
                  ))}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EngineeringInfo({
  component,
  variants,
}: {
  component: UiComponent;
  variants: VariantSummary;
}) {
  return (
    <div className="border-border flex min-w-0 flex-col gap-3 rounded-lg border p-3">
      {variants.dimensions.length > 0 ? (
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-muted-foreground text-xs font-medium">属性表</span>
          <VariantPropTable component={component} />
        </div>
      ) : null}
      <InfoChips label="文件" items={[`${component.file}（${component.lines} 行）`]} />
      <InfoChips label={`导出（${component.exports.length}）`} items={component.exports} />
      <InfoChips label={`继承属性类型（${component.props.length}）`} items={component.props} />
      <InfoChips label={`data-slot（${component.slots.length}）`} items={component.slots} />
      <InfoChips label={`使用 token（${component.tokens.length}）`} items={component.tokens} />
      <InfoChips
        label={`被引用（${component.usage.count} 处）`}
        items={component.usage.files}
      />
    </div>
  );
}

export function ComponentDetailDialog({
  open,
  component,
  knownComponents,
  onOpenComponent,
  onClose,
}: ComponentDetailDialogProps) {
  const known = new Set(knownComponents);
  const variants = component ? summarizeVariants(component) : null;

  const handleCopy = async () => {
    if (!component) return;
    const copied = await copyImportPath(component.name);
    if (copied) toast.success(`已复制 ${importPathFor(component.name)}`);
    // 复制失败静默：非安全上下文 / 无剪贴板权限时不该弹错误打断阅读。
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        {component && variants ? (
          <div className="flex min-w-0 flex-col gap-4">
            <DialogHeader>
              <div className="flex min-w-0 flex-wrap items-center gap-2 pr-8">
                <DialogTitle className="min-w-0 truncate font-mono text-base">
                  {component.name}
                </DialogTitle>
                <Badge variant="outline">{component.category}</Badge>
              </div>
              <DialogDescription className="min-w-0">
                {component.category}组件 · 实现细节见下方「工程信息」
              </DialogDescription>
            </DialogHeader>

            <div className="bg-muted/40 flex min-h-40 min-w-0 items-center justify-center overflow-hidden rounded-lg">
              {UI_DEMOS[component.name] ?? (
                <span className="text-muted-foreground text-xs">暂无示例</span>
              )}
            </div>

            <div className="flex min-w-0 flex-col gap-3">
              {component.notes.when ? (
                <NoteRow label="何时用">
                  <span className="text-sm">{component.notes.when}</span>
                </NoteRow>
              ) : null}
              {component.notes.avoid ? (
                <NoteRow label="别用">
                  <span className="text-sm">{component.notes.avoid}</span>
                </NoteRow>
              ) : null}
              {component.notes.antiPatterns.length > 0 ? (
                <NoteRow label="反例">
                  {[...new Set(component.notes.antiPatterns)].map((item) => (
                    <span
                      key={item}
                      className="bg-muted text-muted-foreground rounded-sm px-1.5 py-0.5 text-xs"
                    >
                      {item}
                    </span>
                  ))}
                </NoteRow>
              ) : null}
              {component.notes.related.length > 0 ? (
                <NoteRow label="相关组件">
                  {[...new Set(component.notes.related)].map((item) =>
                    known.has(item) ? (
                      <button
                        key={item}
                        type="button"
                        className="bg-muted hover:bg-accent rounded-sm px-1.5 py-0.5 font-mono text-xs transition-colors"
                        onClick={() => onOpenComponent(item)}
                      >
                        {item}
                      </button>
                    ) : (
                      <span
                        key={item}
                        className="text-muted-foreground rounded-sm px-1.5 py-0.5 font-mono text-xs"
                      >
                        {item}
                      </span>
                    ),
                  )}
                </NoteRow>
              ) : null}
              {!component.notes.when && !component.notes.avoid ? (
                <p className="text-muted-foreground text-xs">
                  尚未补语义注记 —— 在 {NOTES_FILE} 里补「何时用 / 别用 / 反例 / 相关」。
                </p>
              ) : null}
            </div>

            <Collapsible className="flex min-w-0 flex-col gap-2">
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground group w-full justify-start"
                >
                  <ChevronDownIcon className="size-4 transition-transform group-data-[state=open]:rotate-180" />
                  工程信息
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <EngineeringInfo component={component} variants={variants} />
              </CollapsibleContent>
            </Collapsible>

            <div className="border-border flex min-w-0 flex-wrap items-center justify-between gap-2 border-t pt-3">
              <code className="text-muted-foreground min-w-0 truncate font-mono text-xs">
                import：{importPathFor(component.name)}
              </code>
              <Button type="button" variant="outline" size="sm" onClick={() => void handleCopy()}>
                <CopyIcon className="size-3.5" />
                复制 import
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
