// 「设计规范」08 应用场景：把组件拼成真实页面片段（组件 → 页面）。
// 每个示例下方一行小字标注「由哪些组件拼成」——这是规范稿里最有价值的一层：
// 设计同学照着拼页面，工程同学知道该复用哪些组件。
// 注意：示例用真实组件（含 4 个未纳入当前产品的组件）手写，不引用 demos/（那是冒烟测试资产）。
import type { ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';
import { ImageIcon, SparklesIcon } from 'lucide-react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import { Checkbox } from '@/components/ui/checkbox';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

import { PlateCell, SpecPlate, SpecSectionHeader } from './SpecSection';

type Scenario = {
  id: string;
  title: string;
  caption: string;
  composedOf: string[];
  sample: ReactNode;
};

const CHART_CONFIG = {
  shots: { label: '镜头数', color: 'var(--chart-1)' },
} satisfies ChartConfig;

const CHART_DATA = [
  { day: '一', shots: 12 },
  { day: '二', shots: 18 },
  { day: '三', shots: 9 },
  { day: '四', shots: 16 },
  { day: '五', shots: 22 },
];

function FormScenario() {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="spec-scene-title">分镜标题</Label>
          <Input id="spec-scene-title" defaultValue="第 3 集 · 开场空镜" />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="spec-scene-model">生成模型</Label>
          <Select defaultValue="kling">
            <SelectTrigger id="spec-scene-model" aria-label="生成模型">
              <SelectValue placeholder="选择模型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="kling">可灵 1.6</SelectItem>
              <SelectItem value="jimeng">即梦 3.0</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="spec-scene-prompt">画面提示词</Label>
        <Textarea id="spec-scene-prompt" rows={2} defaultValue="雨夜天台，霓虹反光，人物侧脸特写" />
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-6">
        <span className="flex min-w-0 items-center gap-2">
          <Switch defaultChecked id="spec-scene-lock" />
          <Label htmlFor="spec-scene-lock" className="text-xs">
            锁定角色一致性
          </Label>
        </span>
        <span className="flex min-w-0 items-center gap-2">
          <Checkbox id="spec-scene-hd" defaultChecked />
          <Label htmlFor="spec-scene-hd" className="text-xs">
            4K 输出
          </Label>
        </span>
      </div>
      <div className="flex min-w-0 gap-2">
        <Button size="sm">开始生成</Button>
        <Button size="sm" variant="outline">
          存为草稿
        </Button>
      </div>
    </div>
  );
}

function ListScenario() {
  const shots = [
    { id: 'S-03', title: '开场空镜', status: '已生成', duration: '4.0s' },
    { id: 'S-04', title: '人物入场', status: '生成中', duration: '6.5s' },
  ];
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {shots.map((shot) => (
        <Card key={shot.id} className="min-w-0">
          <CardHeader className="min-w-0 flex-row items-center gap-3">
            <Avatar className="size-9 shrink-0">
              <AvatarFallback className="font-mono text-xs">{shot.id.slice(-2)}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-1 flex-col">
              <CardTitle className="min-w-0 truncate text-sm">{shot.title}</CardTitle>
              <CardDescription className="font-mono text-xs">
                {shot.id} · {shot.duration}
              </CardDescription>
            </div>
            <Badge variant={shot.status === '已生成' ? 'secondary' : 'outline'}>
              {shot.status}
            </Badge>
          </CardHeader>
          <CardContent className="min-w-0">
            <div className="flex min-w-0 items-center gap-3">
              <Progress value={shot.status === '已生成' ? 100 : 62} className="min-w-0 flex-1" />
              <Button size="sm" variant="ghost" className="shrink-0">
                查看
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EmptyAndLoadingScenario() {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Empty className="min-w-0 border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ImageIcon />
          </EmptyMedia>
          <EmptyTitle>还没有素材</EmptyTitle>
          <EmptyDescription>上传角色参考图或风格图，生成时会自动引用。</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button size="sm" variant="outline">
            上传素材
          </Button>
        </EmptyContent>
      </Empty>
      <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-dashed p-4">
        <span className="text-muted-foreground flex min-w-0 items-center gap-2 text-xs">
          <Spinner />
          正在生成第 3 集分镜…
        </span>
        <div className="flex min-w-0 items-center gap-3">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ChartCardScenario() {
  return (
    <Card className="min-w-0">
      <CardHeader className="min-w-0">
        <CardTitle className="flex min-w-0 items-center gap-2 text-sm">
          <SparklesIcon className="size-4 shrink-0" />
          本周分镜产出
        </CardTitle>
        <CardDescription className="text-xs">按天统计生成的镜头数</CardDescription>
      </CardHeader>
      <CardContent className="min-w-0">
        <ChartContainer config={CHART_CONFIG} className="h-36 w-full min-w-0">
          <BarChart data={CHART_DATA}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} />
            {/* fill 走 ChartContainer 注入的 --color-shots（config 里映射 --chart-1）。
                isAnimationActive=false：规范稿是静态参考图，不要入场动画——顺带避免
                无头截图/视觉基线在 rAF 动画未落定时拿到空图。 */}
            <Bar dataKey="shots" fill="var(--color-shots)" radius={4} isAnimationActive={false} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

const SCENARIOS: Scenario[] = [
  {
    id: 'form',
    title: '表单区',
    caption: '生成参数录入：标签、输入、选择、开关与主次操作按钮',
    composedOf: ['Label', 'Input', 'Select', 'Textarea', 'Switch', 'Checkbox', 'Button'],
    sample: <FormScenario />,
  },
  {
    id: 'list',
    title: '列表卡片区',
    caption: '任务列表：头像 + 标题 + 状态徽标 + 进度 + 行内操作',
    composedOf: ['Card', 'Avatar', 'Badge', 'Progress', 'Button'],
    sample: <ListScenario />,
  },
  {
    id: 'empty',
    title: '空态与加载',
    caption: '无数据时给下一步动作；加载中用骨架屏占位，避免布局跳动',
    composedOf: ['Empty', 'Button', 'Spinner', 'Skeleton'],
    sample: <EmptyAndLoadingScenario />,
  },
  {
    id: 'chart',
    title: '图表卡',
    caption: '数据卡：标题 + 说明 + 图表，颜色取 --chart-N 语义 token',
    composedOf: ['Card', 'ChartContainer', 'BarChart', 'XAxis'],
    sample: <ChartCardScenario />,
  },
];

export function SpecScenariosSection() {
  return (
    <section id="spec-scenarios" className="flex min-w-0 scroll-mt-24 flex-col gap-5">
      <SpecSectionHeader
        number="08"
        title="应用场景"
        description="真实组合示例：组件怎么拼成页面"
        meta={`${SCENARIOS.length} 个示例`}
      />
      <SpecPlate className="grid-cols-1 xl:grid-cols-2">
        {SCENARIOS.map((scenario) => (
          <PlateCell key={scenario.id} className="gap-4">
            <div className="flex min-w-0 flex-col gap-1">
              <h3 className="text-sm font-medium">{scenario.title}</h3>
              <p className="text-muted-foreground text-xs">{scenario.caption}</p>
            </div>
            <div className="bg-muted/20 flex min-w-0 flex-col rounded-lg p-4">{scenario.sample}</div>
            <p className="text-muted-foreground min-w-0 text-xs">
              由 {scenario.composedOf.join('、')} 拼成
            </p>
          </PlateCell>
        ))}
      </SpecPlate>
    </section>
  );
}
