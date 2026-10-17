// EXPORTS: default TopBar
// 顶部工具栏：面包屑 / 全局搜索 / 通知 / 设置 / 用户菜单
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen, Search, Bell, Settings, ChevronRight, UserRound, Check } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { useProjectStore } from '@/stores/useProjectStore';
import { useEpisodeStore } from '@/stores/useEpisodeStore';
import { useAssetStore } from '@/stores/useAssetStore';
import { useTaskStore } from '@/stores/useTaskStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useLensStore } from '@/stores/useLensStore';
import { useUIStore } from '@/stores/useUIStore';
import { DEV_ACTORS, useAuthStore } from '@/stores/useAuthStore';
import { placeholderUrl } from '@/lib/placeholder';
import {
  SETTINGS_DEFAULT_PATH,
  settingsSectionForPath,
} from '@/features/settings/settings-navigation';
import { cn } from '@/lib/utils';

interface Crumb {
  label: string;
  to?: string;
}

const STAGE_LABEL: Record<string, string> = {
  analyze: '首次解读',
  directing: '分镜设计',
  characters: '角色资产',
  props: '道具资产',
  scenes: '场景资产',
  units: '单元规划',
  production: '视频生产',
  done: '完成',
};

function buildCrumbs(pathname: string): Crumb[] {
  const projects = useProjectStore.getState().projects;
  const episodes = useEpisodeStore.getState().episodes;
  const parts = pathname.split('/').filter(Boolean);

  if (pathname === '/') return [{ label: '首页' }];
  if (pathname === '/canvas') return [{ label: '无限画布' }];
  if (parts[0] === 'create') {
    const map: Record<string, string> = { image: '图片创作', video: '视频创作', audio: '音频创作' };
    return [
      { label: '智能创作', to: '/create/image' },
      { label: map[parts[1]] ?? '智能创作' },
    ];
  }
  if (parts[0] === 'comic' && parts[1] === 'styles') {
    return [
      { label: '漫剧导演工坊', to: '/comic/projects' },
      { label: '风格库' },
    ];
  }
  if (parts[0] === 'comic' && parts[1] === 'rules') return [{ label: '漫剧导演工坊', to: '/comic/projects' }, { label: '导演规则' }];
  if (parts[0] === 'comic') {
    const crumbs: Crumb[] = [{ label: '漫剧导演工坊', to: '/comic/projects' }];
    const project = projects.find((p) => p.id === parts[2]);
    if (project) {
      crumbs.push({ label: project.title, to: `/comic/projects/${project.id}` });
      if (parts[3] === 'episodes') {
        const episode = episodes.find((e) => e.id === parts[4]);
        if (episode?.projectId === project.id) {
          crumbs.push({
            label: `第 ${episode.index} 集 · ${episode.title.replace(/^第 \d+ 集：/, '')}`,
            to: `/comic/projects/${project.id}/episodes/${episode.id}/analyze`,
          });
          if (parts[5]) crumbs.push({ label: STAGE_LABEL[parts[5]] ?? parts[5] });
        }
      }
    }
    return crumbs;
  }
  if (parts[0] === 'tasks') return [{ label: '任务中心' }];
  if (parts[0] === 'shot-language') return [{ label: '镜头语言库' }];
  if (parts[0] === 'assets') return [{ label: '资产库' }];
  if (parts[0] === 'settings') {
    // 面包屑按 IA v14 的 6 区系统设置展开
    const crumbs: Crumb[] = [{ label: '设置', to: SETTINGS_DEFAULT_PATH }];
    const section = settingsSectionForPath(pathname);
    if (!section) return crumbs;
    crumbs.push({ label: section.label, to: section.path });
    return crumbs;
  }
  return [{ label: pathname }];
}

/** TASK-AUTH-001：dev 身份切换下拉（仅开发环境渲染；生产不出现）。
 *  对应 workspace 迁移 020 种子：owner=user_dev / admin=user_admin / viewer=user_viewer。
 *  切换即换 X-Actor-Id 并重新拉取 /api/v1/me，驱动导航过滤与页面守卫。 */
function DevActorSwitcher() {
  const actorId = useAuthStore((s) => s.actorId);
  const role = useAuthStore((s) => s.role);
  const switchDevActor = useAuthStore((s) => s.switchDevActor);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" className="h-8 gap-1.5 px-2 text-xs">
          <UserRound className="h-3.5 w-3.5" />
          <span className="hidden capitalize md:inline">{role}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs">开发者身份（dev-only）</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {DEV_ACTORS.map((d) => (
          <DropdownMenuItem key={d.actorId} className="cursor-pointer" onClick={() => void switchDevActor(d.actorId)}>
            <span className="flex-1">{d.label}</span>
            {d.actorId === actorId && <Check className="h-3.5 w-3.5 text-accent-foreground" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function TopBar({ collapsed }: { collapsed: boolean }) {
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const projects = useProjectStore((s) => s.projects);
  const episodes = useEpisodeStore((s) => s.episodes);
  const assets = useAssetStore((s) => s.assets);
  const jobs = useTaskStore((s) => s.jobs);
  const lens = useLensStore((s) => s.items);
  const models = useSettingsStore((s) => s.models);
  const crumbs = buildCrumbs(pathname);
  const results = [
    ...projects.map((p) => ({ id: p.id, type: '项目', label: p.title, to: `/comic/projects/${p.id}` })),
    ...episodes.map((e) => ({ id: e.id, type: '剧集', label: `第 ${e.index} 集 · ${e.title.replace(/^第\s*\d+\s*集[：:]/, '')}`, to: `/comic/projects/${e.projectId}/episodes/${e.id}/analyze` })),
    ...assets.map((a) => ({ id: a.id, type: '资产', label: a.name, to: `/assets?asset=${encodeURIComponent(a.id)}` })),
    ...lens.map((l) => ({ id: l.id, type: '镜头模板', label: l.name, to: `/shot-language?q=${encodeURIComponent(l.name)}` })),
    ...models.map((m) => ({ id: m.id, type: '模型', label: m.name, to: '/models/market' })),
  ].filter((item) => `${item.type} ${item.label}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).slice(0, 30);
  const notifications = [
    ...jobs.filter((j) => j.status === 'failed').map((j) => ({ id: j.id, title: '任务失败', desc: j.label, to: j.contextPath ?? '/tasks', tone: 'danger' })),
    ...assets.filter((a) => a.status === 'AWAITING_USER' || a.stale).map((a) => ({
      id: a.id, title: a.stale ? '资产已失效' : '资产待确认', desc: a.name,
      to: `/comic/projects/${a.projectId}/episodes/${a.episodeId}/${a.kind === 'character' ? 'characters' : a.kind === 'prop' ? 'props' : 'scenes'}`,
      tone: 'warning',
    })),
  ].slice(0, 10);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-sidebar px-4">
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={toggleSidebar}>
        {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
      </Button>

      {/* 面包屑 */}
      <nav className="flex min-w-0 items-center gap-1.5 text-sm">
        {crumbs.map((c, i) => (
          <span key={c.label} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            {c.to ? (
              <Link
                to={c.to}
                className={cn(
                  'truncate text-muted-foreground transition-colors hover:text-foreground',
                  i === crumbs.length - 1 && 'font-medium text-foreground',
                )}
              >
                {c.label}
              </Link>
            ) : (
              <span className={cn('truncate', i === crumbs.length - 1 ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                {c.label}
              </span>
            )}
          </span>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        {/* 全局搜索（3.1：覆盖项目/剧集/资产/镜头/模型，显示对象类型） */}
        <Button type="button" variant="outline" className="h-8 gap-2 px-2 xl:w-56 xl:justify-start" onClick={() => setSearchOpen(true)} aria-label="全局搜索">
          <Search className="h-3.5 w-3.5" /><span className="hidden text-xs text-muted-foreground xl:inline">搜索项目、剧集、资产…</span>
        </Button>

        {/* 通知 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="relative h-8 w-8">
              <Bell className="h-4 w-4" />
              {notifications.length > 0 && <Badge className="!absolute -right-1 -top-1 z-20 h-4 min-w-4 px-1 font-mono text-4xs">{notifications.length}</Badge>}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="text-xs">通知（当前本地数据）</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {notifications.length === 0 && <DropdownMenuItem disabled>暂无待处理通知</DropdownMenuItem>}
            {notifications.map((n) => (
              <DropdownMenuItem key={n.id} onClick={() => navigate(n.to)} className="cursor-pointer items-start gap-2 py-2">
                <span
                  className={cn(
                    'mt-1 h-2 w-2 shrink-0 rounded-full',
                    n.tone === 'success' && 'bg-success',
                    n.tone === 'warning' && 'bg-amber-500',
                    n.tone === 'danger' && 'bg-destructive',
                  )}
                />
                <span className="min-w-0">
                  <span className="block text-xs font-medium">{n.title}</span>
                  <span className="block truncate text-2xs text-muted-foreground">{n.desc}</span>
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 设置 */}
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" asChild>
          <Link to={SETTINGS_DEFAULT_PATH}>
            <Settings className="h-4 w-4" />
          </Link>
        </Button>

        {/* TASK-AUTH-001：dev 身份切换（仅开发环境）——三角色走查 T13 判据 5；生产环境不渲染 */}
        {import.meta.env.DEV && <DevActorSwitcher />}

        {/* 用户菜单 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" className="h-8 gap-2 px-1.5">
              <Avatar className="h-6 w-6">
                <AvatarImage src={placeholderUrl('avatar-director')} alt="" />
                <AvatarFallback>镜</AvatarFallback>
              </Avatar>
              <span className="hidden text-xs lg:inline">导演用户</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel className="text-xs">导演用户 · 演示账号</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer" onClick={() => navigate('/settings/preferences')}>
              <UserRound className="h-3.5 w-3.5" />
              个人中心
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen} title="全局搜索" description="检索项目、剧集、资产、镜头模板和模型">
        <CommandInput value={query} onValueChange={setQuery} placeholder="搜索项目、剧集、资产、镜头、模型…" />
        <CommandList>
          <CommandEmpty>没有匹配的结果</CommandEmpty>
          <CommandGroup heading="搜索结果">
            {results.map((item) => <CommandItem key={`${item.type}-${item.id}`} value={`${item.type} ${item.label}`} onSelect={() => {
              navigate(item.to); setSearchOpen(false); setQuery('');
            }}><span className="w-16 shrink-0 text-xs text-muted-foreground">{item.type}</span><span className="truncate">{item.label}</span></CommandItem>)}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </header>
  );
}
