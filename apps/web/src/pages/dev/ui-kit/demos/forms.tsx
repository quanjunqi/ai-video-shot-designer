import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import {
  SearchIcon,
  XIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from '@/components/ui/input-group';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

// 数据录入组件展示。key = 组件文件名（src/components/ui/<key>.tsx）。
const CALENDAR_MONTH = new Date(2026, 0, 15);
const CALENDAR_START = new Date(2024, 0, 1);
const CALENDAR_END = new Date(2028, 11, 31);

// 说明：react-refresh/only-export-components 不建议「非组件导出 + 文件内局部组件」共存，
// 但本文件是 dev-only 展示页的 demo 注册表（对外只导出 FORMS_DEMOS 一张表），
// 而 react-hook-form 的 useForm 只能写在组件里；按仓库「例外必须注释说明」的口径显式豁免。
// eslint-disable-next-line react-refresh/only-export-components -- demo 注册表：useForm 必须落在组件内
function FormDemo() {
  const form = useForm<{ title: string; prompt: string }>({
    defaultValues: { title: '', prompt: '' },
  });

  return (
    <Form {...form}>
      <form
        className="flex w-full min-w-0 max-w-3xl flex-col gap-4"
        onSubmit={form.handleSubmit(() => undefined)}
      >
        <FormField
          control={form.control}
          name="title"
          rules={{ required: '请输入镜头标题' }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>镜头标题（必填）</FormLabel>
              <FormControl>
                <Input placeholder="教室 · 中景 · 逆光" {...field} />
              </FormControl>
              <FormDescription>留空直接提交会触发 FormMessage 的校验提示。</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="prompt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>提示词</FormLabel>
              <FormControl>
                <Textarea rows={3} placeholder="描述运镜、光线与情绪…" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-fit">
          提交
        </Button>
      </form>
    </Form>
  );
}

export const FORMS_DEMOS: Record<string, ReactNode> = {
  "calendar": (
    <div className="flex flex-wrap gap-4">
      <Calendar
        mode="single"
        defaultMonth={CALENDAR_MONTH}
        className="w-fit rounded-md border"
      />
      <Calendar
        mode="single"
        captionLayout="dropdown"
        defaultMonth={CALENDAR_MONTH}
        startMonth={CALENDAR_START}
        endMonth={CALENDAR_END}
        className="w-fit rounded-md border"
      />
    </div>
  ),
  "checkbox": (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2"><Checkbox id="demo-checkbox-on" defaultChecked /><Label htmlFor="demo-checkbox-on">已勾选（defaultChecked）</Label></div>
      <div className="flex items-center gap-2"><Checkbox id="demo-checkbox-off" /><Label htmlFor="demo-checkbox-off">未勾选</Label></div>
      <div className="flex items-center gap-2"><Checkbox id="demo-checkbox-disabled" disabled /><Label htmlFor="demo-checkbox-disabled">禁用</Label></div>
      <div className="flex items-center gap-2"><Checkbox id="demo-checkbox-disabled-on" defaultChecked disabled /><Label htmlFor="demo-checkbox-disabled-on">禁用且已勾选</Label></div>
    </div>
  ),
  "field": (
    <FieldSet className="w-full min-w-0 max-w-3xl">
      <FieldLegend>镜头信息</FieldLegend>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="demo-field-title">镜头标题</FieldLabel>
          <Input id="demo-field-title" placeholder="教室 · 中景 · 逆光" />
          <FieldDescription>Field 纵向排列：标签 + 控件 + 描述。</FieldDescription>
        </Field>
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>自动优化提示词</FieldTitle>
            <FieldDescription>提交前由网关补全画面细节。</FieldDescription>
          </FieldContent>
          <Switch defaultChecked />
        </Field>
        <Field data-invalid="true">
          <FieldLabel htmlFor="demo-field-duration">镜头时长（秒）</FieldLabel>
          <Input id="demo-field-duration" defaultValue="0" aria-invalid />
          <FieldError errors={[{ message: '时长必须大于 0' }]} />
        </Field>
        <FieldSeparator>或</FieldSeparator>
        <Field orientation="horizontal">
          <FieldLabel htmlFor="demo-field-resolution">分辨率</FieldLabel>
          <FieldContent>
            <NativeSelect id="demo-field-resolution" defaultValue="1080p">
              <NativeSelectOption value="1080p">1080p</NativeSelectOption>
              <NativeSelectOption value="720p">720p</NativeSelectOption>
            </NativeSelect>
          </FieldContent>
        </Field>
      </FieldGroup>
    </FieldSet>
  ),
  "form": (<FormDemo />),
  "input": (
    <div className="flex w-full min-w-0 max-w-3xl flex-col gap-3">
      <Input type="text" placeholder="项目名称" aria-label="项目名称" />
      <Input type="email" placeholder="contact@example.com" aria-label="邮箱" />
      <Input type="password" defaultValue="secret" aria-label="密码" />
      <Input type="number" defaultValue={24} min={0} max={60} aria-label="帧率" />
      <Input disabled placeholder="禁用状态" aria-label="禁用状态" />
    </div>
  ),
  "input-group": (
    <div className="flex w-full min-w-0 max-w-3xl flex-col gap-4">
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput placeholder="搜索素材…" aria-label="搜索素材" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton aria-label="清空搜索">
            <XIcon />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <InputGroupText>https://</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput defaultValue="api.example.com" aria-label="接口地址" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton variant="outline">复制</InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <InputGroup>
        <InputGroupAddon align="block-start">
          <InputGroupText>提示词</InputGroupText>
        </InputGroupAddon>
        <InputGroupTextarea placeholder="描述镜头内容…" aria-label="提示词" />
        <InputGroupAddon align="block-end">
          <InputGroupText>⌘ + Enter 提交</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
    </div>
  ),
  "label": (
    <div className="flex w-full min-w-0 max-w-3xl flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="demo-label-input">项目标题</Label>
        <Input id="demo-label-input" placeholder="Label 通过 htmlFor 关联控件" />
      </div>
      <div className="flex items-center gap-2"><Checkbox id="demo-label-checkbox" defaultChecked /><Label htmlFor="demo-label-checkbox">关联 Checkbox 的 Label</Label></div>
      <Label className="text-muted-foreground">纯文本标签（未关联任何控件）</Label>
    </div>
  ),
  "native-select": (
    <div className="flex w-full min-w-0 max-w-3xl flex-col gap-3">
      <NativeSelect defaultValue="medium" aria-label="镜头时长">
        <NativeSelectOption value="short">短（≤ 2s）</NativeSelectOption>
        <NativeSelectOption value="medium">中（2 ~ 5s）</NativeSelectOption>
        <NativeSelectOption value="long">长（&gt; 5s）</NativeSelectOption>
      </NativeSelect>
      <NativeSelect defaultValue="cn" aria-label="渠道（分组）">
        <NativeSelectOptGroup label="国内渠道">
          <NativeSelectOption value="cn">默认渠道</NativeSelectOption>
        </NativeSelectOptGroup>
        <NativeSelectOptGroup label="海外渠道">
          <NativeSelectOption value="us">US 节点</NativeSelectOption>
        </NativeSelectOptGroup>
      </NativeSelect>
      <NativeSelect disabled aria-label="禁用示例">
        <NativeSelectOption value="none">禁用状态</NativeSelectOption>
      </NativeSelect>
    </div>
  ),
  "radio-group": (
    <RadioGroup defaultValue="medium" className="w-fit">
      <div className="flex items-center gap-2"><RadioGroupItem value="short" id="demo-radio-short" /><Label htmlFor="demo-radio-short">短镜头（≤ 2s）</Label></div>
      <div className="flex items-center gap-2"><RadioGroupItem value="medium" id="demo-radio-medium" /><Label htmlFor="demo-radio-medium">中镜头（2 ~ 5s）</Label></div>
      <div className="flex items-center gap-2"><RadioGroupItem value="long" id="demo-radio-long" /><Label htmlFor="demo-radio-long">长镜头（&gt; 5s）</Label></div>
      <div className="flex items-center gap-2"><RadioGroupItem value="disabled" id="demo-radio-disabled" disabled /><Label htmlFor="demo-radio-disabled">禁用项</Label></div>
    </RadioGroup>
  ),
  "select": (
    <div className="flex w-full min-w-0 max-w-3xl flex-col gap-3">
      <Select defaultValue="medium">
        <SelectTrigger className="w-full min-w-0" aria-label="镜头时长">
          <SelectValue placeholder="选择时长" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>常用</SelectLabel>
            <SelectItem value="short">短（≤ 2s）</SelectItem>
            <SelectItem value="medium">中（2 ~ 5s）</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectItem value="long">长（&gt; 5s）</SelectItem>
          <SelectItem value="disabled" disabled>
            禁用项
          </SelectItem>
        </SelectContent>
      </Select>
      <Select defaultValue="video">
        <SelectTrigger size="sm" className="w-full min-w-0" aria-label="模型类型">
          <SelectValue placeholder="选择模型类型" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="video">视频模型</SelectItem>
          <SelectItem value="image">图像模型</SelectItem>
        </SelectContent>
      </Select>
      <Select>
        <SelectTrigger className="w-full min-w-0" aria-label="未选择状态">
          <SelectValue placeholder="未选择（placeholder 态）" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">选项 A</SelectItem>
          <SelectItem value="b">选项 B</SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),
  "slider": (
    <div className="flex w-full min-w-0 max-w-3xl flex-col gap-6 py-2">
      <Slider defaultValue={[40]} max={100} step={1} aria-label="不透明度" />
      <Slider defaultValue={[20, 70]} max={100} step={5} aria-label="时长范围" />
      <Slider defaultValue={[30]} max={100} step={1} disabled aria-label="禁用示例" />
    </div>
  ),
  "switch": (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2"><Switch id="demo-switch-on" defaultChecked /><Label htmlFor="demo-switch-on">自动保存（已开启）</Label></div>
      <div className="flex items-center gap-2"><Switch id="demo-switch-off" /><Label htmlFor="demo-switch-off">关闭状态</Label></div>
      <div className="flex items-center gap-2"><Switch id="demo-switch-disabled" disabled /><Label htmlFor="demo-switch-disabled">禁用</Label></div>
    </div>
  ),
  "textarea": (
    <div className="flex w-full min-w-0 max-w-3xl flex-col gap-3">
      <Textarea placeholder="描述这一镜的画面与情绪…" rows={4} aria-label="镜头描述" />
      <Textarea
        defaultValue="已填写的镜头描述：黄昏教室，逆光，人物侧脸特写。"
        aria-label="已填写示例"
      />
      <Textarea disabled placeholder="禁用状态" aria-label="禁用状态" />
    </div>
  ),
};
