import type { ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Image } from '@/components/ui/image';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// 数据展示组件展示。key = 组件文件名（src/components/ui/<key>.tsx）。
const WEEKLY_LOAD = [
  { day: '周一', shots: 12, minutes: 34 },
  { day: '周二', shots: 18, minutes: 51 },
  { day: '周三', shots: 9, minutes: 26 },
  { day: '周四', shots: 22, minutes: 63 },
  { day: '周五', shots: 15, minutes: 42 },
  { day: '周六', shots: 6, minutes: 18 },
];

const chartConfig = {
  shots: { label: '镜头数', color: 'var(--chart-1)' },
  minutes: { label: '时长（分钟）', color: 'var(--chart-2)' },
} satisfies ChartConfig;

const SHOT_TABLE = [
  { id: 'S-01', framing: '全景', duration: '3.0s', status: '已生成' },
  { id: 'S-02', framing: '中景', duration: '2.5s', status: '已生成' },
  { id: 'S-03', framing: '近景', duration: '1.8s', status: '生成中' },
  { id: 'S-04', framing: '特写', duration: '1.2s', status: '待审核' },
];

const SLIDES = [
  { id: 'slide-1', src: '/placeholders/p00.jpg', title: '场景 01 · 教室黄昏' },
  { id: 'slide-2', src: '/placeholders/p01.jpg', title: '场景 02 · 天台逆光' },
  { id: 'slide-3', src: '/placeholders/p02.jpg', title: '场景 03 · 雨中街道' },
  { id: 'slide-4', src: '/placeholders/p03.jpg', title: '场景 04 · 夜晚车站' },
];

export const DATADISPLAY_DEMOS: Record<string, ReactNode> = {
  "accordion": (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <Accordion type="single" collapsible defaultValue="shot" className="w-full min-w-0 max-w-3xl">
        <AccordionItem value="shot">
          <AccordionTrigger>镜头如何拆分？</AccordionTrigger>
          <AccordionContent className="text-muted-foreground text-sm">
            按「场次 → 镜头 → 台词」层级拆分，每个镜头带景别、时长与运镜描述。
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="cost">
          <AccordionTrigger>生成成本怎么计算？</AccordionTrigger>
          <AccordionContent className="text-muted-foreground text-sm">
            按模型单价 × 生成次数计费，可在模型中心查看每次调用的明细。
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="export">
          <AccordionTrigger>支持哪些导出格式？</AccordionTrigger>
          <AccordionContent className="text-muted-foreground text-sm">
            支持 PNG 序列、MP4 视频与剪映草稿包。
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <Accordion type="multiple" defaultValue={['a', 'b']} className="w-full min-w-0 max-w-3xl">
        <AccordionItem value="a">
          <AccordionTrigger>type=&quot;multiple&quot;（默认展开）</AccordionTrigger>
          <AccordionContent className="text-muted-foreground text-sm">
            多项可同时展开，用 defaultValue 传入数组。
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="b">
          <AccordionTrigger>第二项</AccordionTrigger>
          <AccordionContent className="text-muted-foreground text-sm">
            适合 FAQ / 参数说明这类并列信息。
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  ),
  "carousel": (
    <Carousel
      className="w-full min-w-0 max-w-3xl px-10"
      opts={{ align: 'start', loop: false }}
    >
      <CarouselContent>
        {SLIDES.map((slide) => (
          <CarouselItem key={slide.id} className="md:basis-1/2 lg:basis-1/3">
            <div className="bg-card min-w-0 overflow-hidden rounded-lg border">
              <Image
                src={slide.src}
                alt={slide.title}
                className="h-32 w-full object-cover"
              />
              <div className="min-w-0 p-3 text-sm">{slide.title}</div>
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious className="left-0" />
      <CarouselNext className="right-0" />
    </Carousel>
  ),
  "chart": (
    <div className="w-full min-w-0 max-w-3xl">
      <ChartContainer config={chartConfig} className="h-56 w-full min-w-0">
        <BarChart data={WEEKLY_LOAD}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="shots" fill="var(--color-shots)" radius={4} />
          <Bar dataKey="minutes" fill="var(--color-minutes)" radius={4} />
        </BarChart>
      </ChartContainer>
      <p className="text-muted-foreground mt-3 text-xs">
        config 里的 color 走 --chart-N 语义 token，ChartContainer 会注入 --color-&lt;key&gt;。
      </p>
    </div>
  ),
  "table": (
    <Table className="min-w-0 max-w-3xl">
      <TableCaption>第 3 集分镜生成状态（TableCaption 说明表格口径）</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead className="w-20">镜头</TableHead>
          <TableHead>景别</TableHead>
          <TableHead>时长</TableHead>
          <TableHead className="text-right">状态</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {SHOT_TABLE.map((shot) => (
          <TableRow key={shot.id}>
            <TableCell className="font-mono text-xs">{shot.id}</TableCell>
            <TableCell>{shot.framing}</TableCell>
            <TableCell className="tabular-nums">{shot.duration}</TableCell>
            <TableCell className="text-right">
              <Badge
                variant={shot.status === '已生成' ? 'secondary' : 'outline'}
                className="ml-auto"
              >
                {shot.status}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={2}>合计</TableCell>
          <TableCell className="tabular-nums">8.5s</TableCell>
          <TableCell className="text-right">4 个镜头</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  ),
};
