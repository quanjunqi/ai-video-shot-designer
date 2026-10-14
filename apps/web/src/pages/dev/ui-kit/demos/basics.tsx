import type { ReactNode } from 'react';
import { ArrowRightIcon, PlusIcon, SparklesIcon, Trash2Icon } from 'lucide-react';

import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
} from '@/components/ui/button-group';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Image } from '@/components/ui/image';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

// 基础层（原子组件）展示：优先穷举 variant / size 组合，其次演示组合用法。
// 约定：key = 组件文件名（与 src/components/ui/<key>.tsx 对应），缺失会被 `npm run ui:check` 拦。
export const BASICS_DEMOS: Record<string, ReactNode> = {
  "button": (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button>默认</Button>
        <Button variant="secondary">次要</Button>
        <Button variant="outline">描边</Button>
        <Button variant="ghost">幽灵</Button>
        <Button variant="destructive">危险</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm">sm</Button>
        <Button size="default">default</Button>
        <Button size="lg">lg</Button>
        <Button size="icon" title="新增" aria-label="新增">
          <PlusIcon />
        </Button>
        <Button size="icon" variant="outline" title="删除" aria-label="删除">
          <Trash2Icon />
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild>
          <a href="#button">asChild 渲染为 a 标签</a>
        </Button>
        <Button disabled>
          <Spinner /> 提交中
        </Button>
        <Button variant="outline">
          下一步 <ArrowRightIcon />
        </Button>
        <Button variant="ghost" size="sm">
          <SparklesIcon /> AI 生成
        </Button>
      </div>
    </div>
  ),
  "badge": (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>default</Badge>
        <Badge variant="secondary">secondary</Badge>
        <Badge variant="destructive">destructive</Badge>
        <Badge variant="outline">outline</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">草稿</Badge>
        <Badge>已完成 12</Badge>
        <Badge variant="destructive">失败 2</Badge>
        <Badge variant="outline" className="font-mono">
          v1.2.0
        </Badge>
      </div>
    </div>
  ),
  "button-group": (
    <div className="flex flex-col gap-4">
      <ButtonGroup>
        <Button variant="outline">左</Button>
        <Button variant="outline">中</Button>
        <Button variant="outline">右</Button>
      </ButtonGroup>
      <ButtonGroup>
        <Button variant="outline">复制</Button>
        <ButtonGroupSeparator />
        <Button variant="outline">粘贴</Button>
      </ButtonGroup>
      <ButtonGroup>
        <ButtonGroupText>https://</ButtonGroupText>
        <Button variant="outline">访问</Button>
      </ButtonGroup>
      <ButtonGroup orientation="vertical">
        <Button variant="outline" size="sm">
          上移
        </Button>
        <Button variant="outline" size="sm">
          下移
        </Button>
      </ButtonGroup>
    </div>
  ),
  "card": (
    <div className="flex flex-col gap-4">
      <Card className="w-full min-w-0">
        <CardHeader>
          <CardTitle>分镜脚本</CardTitle>
          <CardDescription>第 3 集 · 12 个镜头待审核</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p>卡片承载一组相关内容：标题、描述、主体与操作区。</p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">草稿</Badge>
            <Badge variant="outline">AI 生成</Badge>
          </div>
        </CardContent>
        <CardFooter className="flex flex-wrap items-center gap-2">
          <Button size="sm">查看详情</Button>
          <Button size="sm" variant="ghost">
            稍后处理
          </Button>
        </CardFooter>
      </Card>
      <Card className="w-full min-w-0">
        <CardHeader>
          <CardTitle>紧凑卡片</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">仅标题 + 内容，适合列表内的密集信息。</p>
        </CardContent>
      </Card>
    </div>
  ),
  "avatar": (
    <div className="flex flex-wrap items-center gap-4">
      <Avatar>
        <AvatarImage src="/placeholders/p00.jpg" alt="用户头像" />
        <AvatarFallback>AI</AvatarFallback>
      </Avatar>
      <Avatar className="size-10">
        <AvatarImage src="/placeholders/p01.jpg" alt="用户头像" />
        <AvatarFallback>导</AvatarFallback>
      </Avatar>
      <Avatar className="size-12">
        <AvatarImage src="/placeholders/does-not-exist.jpg" alt="加载失败时回退" />
        <AvatarFallback>回退</AvatarFallback>
      </Avatar>
      <div className="flex items-center -space-x-2">
        <Avatar className="ring-background ring-2">
          <AvatarImage src="/placeholders/p02.jpg" alt="协作者" />
          <AvatarFallback>A</AvatarFallback>
        </Avatar>
        <Avatar className="ring-background ring-2">
          <AvatarImage src="/placeholders/p03.jpg" alt="协作者" />
          <AvatarFallback>B</AvatarFallback>
        </Avatar>
        <Avatar className="ring-background ring-2">
          <AvatarFallback>+3</AvatarFallback>
        </Avatar>
      </div>
    </div>
  ),
  "separator": (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="text-sm">横向分隔（默认）</span>
        <Separator />
        <span className="text-sm text-muted-foreground">分隔线之上的内容</span>
      </div>
      <div className="flex h-10 items-center gap-3">
        <span className="text-sm">纵向</span>
        <Separator orientation="vertical" />
        <span className="text-sm">分隔线</span>
        <Separator orientation="vertical" />
        <span className="text-sm text-muted-foreground">结尾</span>
      </div>
    </div>
  ),
  "skeleton": (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    </div>
  ),
  "spinner": (
    <div className="flex flex-wrap items-center gap-4">
      <Spinner />
      <Spinner className="size-6" />
      <Spinner className="text-muted-foreground size-8" />
      <span className="text-muted-foreground flex items-center gap-2 text-sm">
        <Spinner /> 正在生成分镜…
      </span>
    </div>
  ),
  "kbd": (
    <div className="flex flex-wrap items-center gap-4">
      <Kbd>Esc</Kbd>
      <Kbd>⌘</Kbd>
      <KbdGroup>
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </KbdGroup>
      <KbdGroup>
        <Kbd>Ctrl</Kbd>
        <span className="text-muted-foreground text-xs">+</span>
        <Kbd>Enter</Kbd>
      </KbdGroup>
      <span className="text-muted-foreground text-sm">
        快速搜索 <KbdGroup><Kbd>⌘</Kbd><Kbd>K</Kbd></KbdGroup>
      </span>
    </div>
  ),
  "image": (
    <div className="flex flex-col gap-4">
      <Image
        src="/placeholders/p00.jpg"
        alt="场景占位图"
        width={320}
        height={200}
        className="h-40 w-full max-w-3xl rounded-md object-cover"
      />
      <p className="text-muted-foreground text-sm">
        非白名单域名按原生 img 渲染，白名单（storage / attachments）会自动补 srcSet 与格式协商。
      </p>
    </div>
  ),
  "aspect-ratio": (
    <div className="flex flex-wrap gap-4">
      <AspectRatio ratio={16 / 9} className="bg-muted w-64 overflow-hidden rounded-md">
        <Image
          src="/placeholders/p01.jpg"
          alt="16:9 占位"
          className="size-full object-cover"
        />
      </AspectRatio>
      <AspectRatio ratio={1} className="bg-muted w-40 overflow-hidden rounded-md">
        <Image src="/placeholders/p02.jpg" alt="1:1 占位" className="size-full object-cover" />
      </AspectRatio>
      <AspectRatio ratio={4 / 3} className="bg-muted w-52 overflow-hidden rounded-md">
        <Image src="/placeholders/p03.jpg" alt="4:3 占位" className="size-full object-cover" />
      </AspectRatio>
    </div>
  ),
};
