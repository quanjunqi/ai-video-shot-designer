// 「设计规范」07 控件状态：variant（行）× size（列）矩阵 + redline 类名标注。
// 类名（高度/内距/圆角）来自 cva 定义（生成物 variants[].classes），是这份规范稿的
// 实现锚点：设计改动要与这里的类名一一对应。
import { PlusIcon } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { UiComponent } from '@/generated/ui-catalog';

import { PlateCell, SampleLabel, SpecPlate, SpecSectionHeader } from './SpecSection';
import { summarizeVariants, type VariantDimension } from './uiKitModel';

const BUTTON_VARIANTS = ['default', 'destructive', 'outline', 'secondary', 'ghost'] as const;
const BUTTON_SIZES = ['default', 'sm', 'lg', 'icon'] as const;
const BADGE_VARIANTS = ['default', 'secondary', 'destructive', 'outline'] as const;
const ALERT_VARIANTS = ['default', 'destructive', 'success', 'warning'] as const;

// 取值列表从清单里取（新增变体会自动出现在矩阵里），但只用组件类型允许的取值，
// 避免把生成物里的任意字符串塞进 variant（既不安全也不合法）。
function pickValues<T extends string>(allowed: readonly T[], values: string[]): T[] {
  return allowed.filter((item) => values.includes(item));
}

function findComponent(components: UiComponent[], name: string): UiComponent | null {
  return components.find((component) => component.name === name) ?? null;
}

// redline 表：variant / size 每个取值对应的 cva 类名，用整行宽展示（不截断）。
function RedlineTable({ dimensions }: { dimensions: VariantDimension[] }) {
  const rows = dimensions.flatMap((dimension) =>
    dimension.values.map((value) => ({
      key: `${dimension.name}-${value}`,
      name: dimension.name,
      value,
      isDefault: dimension.defaultValue === value,
      className: dimension.classes[value] ?? null,
    })),
  );
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
            <th scope="col" className="py-1.5 text-left font-medium">
              类名（redline）
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-border/60 border-b">
              <td className="py-1.5 pr-3 font-mono">{row.name}</td>
              <td className="py-1.5 pr-3 font-mono">
                {row.value}
                {row.isDefault ? '（默认）' : ''}
              </td>
              <td className="py-1.5 font-mono break-all">{row.className ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ButtonMatrix({ component }: { component: UiComponent }) {
  const { dimensions } = summarizeVariants(component);
  const variant = dimensions.find((dimension) => dimension.name === 'variant') ?? null;
  const size = dimensions.find((dimension) => dimension.name === 'size') ?? null;
  const variants = pickValues(BUTTON_VARIANTS, variant?.values ?? []);
  const sizes = pickValues(BUTTON_SIZES, size?.values ?? []);
  const redline = [variant, size].filter((dimension): dimension is VariantDimension =>
    Boolean(dimension),
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-0 text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th scope="col" className="p-3 text-left font-medium">
                variant \ size
              </th>
              {sizes.map((value) => (
                <th key={value} scope="col" className="p-3 text-left align-bottom font-medium">
                  <code className="font-mono">{`size="${value}"`}</code>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {variants.map((value) => (
              <tr key={value} className="border-border/60 border-t">
                <th scope="row" className="p-3 text-left align-middle font-normal">
                  <code className="font-mono">{`variant="${value}"`}</code>
                </th>
                {sizes.map((sizeValue) => (
                  <td key={sizeValue} className="p-3 align-middle">
                    <Button
                      variant={value}
                      size={sizeValue}
                      aria-label={sizeValue === 'icon' ? '图标按钮' : undefined}
                    >
                      {sizeValue === 'icon' ? <PlusIcon /> : '按钮'}
                    </Button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <RedlineTable dimensions={redline} />
    </div>
  );
}

function BadgeMatrix({ component }: { component: UiComponent }) {
  const variant = summarizeVariants(component).dimensions.find(
    (dimension) => dimension.name === 'variant',
  );
  const values = pickValues(BADGE_VARIANTS, variant?.values ?? []);
  if (values.length === 0) return null;
  return (
    <SpecPlate className="grid-cols-2 sm:grid-cols-4">
      {values.map((value) => (
        <PlateCell key={value} className="items-start">
          <Badge variant={value}>{value}</Badge>
          <SampleLabel hint={variant?.classes[value] ?? null}>{`variant="${value}"`}</SampleLabel>
        </PlateCell>
      ))}
    </SpecPlate>
  );
}

function AlertMatrix({ component }: { component: UiComponent }) {
  const variant = summarizeVariants(component).dimensions.find(
    (dimension) => dimension.name === 'variant',
  );
  const values = pickValues(ALERT_VARIANTS, variant?.values ?? []);
  if (values.length === 0) return null;
  return (
    <div className="border-border/60 divide-border/60 flex min-w-0 flex-col divide-y rounded-lg border">
      {values.map((value) => (
        <div key={value} className="flex min-w-0 flex-col gap-2 p-4 xl:flex-row xl:items-center xl:gap-6">
          <Alert variant={value} className="min-w-0 flex-1">
            <AlertTitle>{value}</AlertTitle>
            <AlertDescription>状态色随 variant 切换；图标与文字色自动跟语义色。</AlertDescription>
          </Alert>
          <span className="min-w-0 xl:w-80">
            <SampleLabel hint={variant?.classes[value] ?? null}>{`variant="${value}"`}</SampleLabel>
          </span>
        </div>
      ))}
    </div>
  );
}

function FormStatePlate() {
  return (
    <SpecPlate className="grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
      <PlateCell>
        <SampleLabel hint="Input · 默认">默认</SampleLabel>
        <Input defaultValue="第 3 集 · 分镜脚本" aria-label="输入框默认态示例" />
      </PlateCell>
      <PlateCell>
        <SampleLabel hint="Input · placeholder">占位</SampleLabel>
        <Input placeholder="搜索镜头、角色、素材…" aria-label="输入框占位态示例" />
      </PlateCell>
      <PlateCell>
        <SampleLabel hint="Input · disabled">禁用</SampleLabel>
        <Input disabled defaultValue="禁用状态不可编辑" aria-label="输入框禁用态示例" />
      </PlateCell>
      <PlateCell>
        <SampleLabel hint="Input · aria-invalid">校验失败</SampleLabel>
        <Input aria-invalid defaultValue="时长必须为 4 的倍数" aria-label="输入框校验失败态示例" />
      </PlateCell>
      <PlateCell>
        <SampleLabel hint="Select · 默认">选择器</SampleLabel>
        <Select defaultValue="model-a">
          <SelectTrigger aria-label="模型选择示例">
            <SelectValue placeholder="选择模型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="model-a">可灵 1.6</SelectItem>
            <SelectItem value="model-b">即梦 3.0</SelectItem>
          </SelectContent>
        </Select>
      </PlateCell>
      <PlateCell>
        <SampleLabel hint="Select · disabled">选择器禁用</SampleLabel>
        <Select disabled>
          <SelectTrigger aria-label="模型选择禁用态示例">
            <SelectValue placeholder="选择模型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="model-a">可灵 1.6</SelectItem>
          </SelectContent>
        </Select>
      </PlateCell>
      <PlateCell>
        <SampleLabel hint="Switch · checked / unchecked">开关</SampleLabel>
        <div className="flex min-w-0 flex-col gap-3">
          <span className="flex min-w-0 items-center gap-2">
            <Switch defaultChecked id="spec-switch-on" aria-label="开关打开示例" />
            <Label htmlFor="spec-switch-on" className="text-xs">
              自动保存
            </Label>
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <Switch id="spec-switch-off" aria-label="开关关闭示例" />
            <Label htmlFor="spec-switch-off" className="text-xs">
              关闭状态
            </Label>
          </span>
        </div>
      </PlateCell>
      <PlateCell>
        <SampleLabel hint="Switch · disabled / Textarea · disabled">禁用</SampleLabel>
        <div className="flex min-w-0 flex-col gap-3">
          <span className="flex min-w-0 items-center gap-2">
            <Switch disabled defaultChecked id="spec-switch-disabled" aria-label="开关禁用示例" />
            <Label htmlFor="spec-switch-disabled" className="text-xs">
              自动保存
            </Label>
          </span>
          <Textarea disabled defaultValue="禁用状态的多行文本" aria-label="多行文本禁用示例" />
        </div>
      </PlateCell>
    </SpecPlate>
  );
}

export function SpecStatesSection({ components }: { components: UiComponent[] }) {
  const button = findComponent(components, 'button');
  const badge = findComponent(components, 'badge');
  const alert = findComponent(components, 'alert');

  return (
    <section id="spec-states" className="flex min-w-0 scroll-mt-24 flex-col gap-5">
      <SpecSectionHeader
        number="07"
        title="控件状态"
        description="variant（行）× size（列）矩阵 + 关键实现类（redline）"
        meta={`${[button, badge, alert].filter(Boolean).length} 个多变体控件`}
      />

      {button ? (
        <div className="flex min-w-0 flex-col gap-3">
          <h3 className="text-sm font-medium">Button</h3>
          <ButtonMatrix component={button} />
        </div>
      ) : null}

      {badge ? (
        <div className="flex min-w-0 flex-col gap-3">
          <h3 className="text-sm font-medium">Badge</h3>
          <BadgeMatrix component={badge} />
        </div>
      ) : null}

      {alert ? (
        <div className="flex min-w-0 flex-col gap-3">
          <h3 className="text-sm font-medium">
            Alert<span className="text-muted-foreground ml-2 text-xs">当前产品未使用</span>
          </h3>
          <AlertMatrix component={alert} />
        </div>
      ) : null}

      <div className="flex min-w-0 flex-col gap-3">
        <h3 className="text-sm font-medium">表单控件状态</h3>
        <p className="text-muted-foreground text-xs">
          Input / Select / Switch / Textarea 没有 cva 变体：状态由 props 与属性表达（disabled、
          aria-invalid、placeholder、defaultChecked）。
        </p>
        <FormStatePlate />
      </div>
    </section>
  );
}
