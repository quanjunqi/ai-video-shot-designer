// EXPORTS: default SideNav
// 左侧导航：主要入口 + 次级区（任务中心 / 设置）
import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Home,
  PenTool,
  Sparkles,
  Clapperboard,
  Camera,
  FolderOpen,
  Video,
  AudioLines,
  ListTodo,
  Settings,
  Palette,
  BookOpenCheck,
  ChevronDown,
  Image as ImageIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavChild {
  label: string;
  path: string;
  icon: LucideIcon;
}
interface NavItem {
  key: string;
  label: string;
  path: string;
  icon: LucideIcon;
  children?: NavChild[];
}

const NAV: NavItem[] = [
  { key: 'home', label: '首页', path: '/', icon: Home },
  { key: 'canvas', label: '无限画布', path: '/canvas', icon: PenTool },
  {
    key: 'create',
    label: '智能创作',
    path: '/create/image',
    icon: Sparkles,
    children: [
      { label: '图片', path: '/create/image', icon: ImageIcon },
      { label: '视频', path: '/create/video', icon: Video },
      { label: '音频', path: '/create/audio', icon: AudioLines },
    ],
  },
  {
    key: 'comic',
    label: '漫剧导演工坊',
    path: '/comic/projects',
    icon: Clapperboard,
  },
  { key: 'shot', label: '镜头语言库', path: '/shot-language', icon: Camera },
  { key: 'styles', label: '风格库', path: '/comic/styles', icon: Palette },
  { key: 'rules', label: '规则中心', path: '/comic/rules', icon: BookOpenCheck },
  { key: 'assets', label: '资产库', path: '/assets', icon: FolderOpen },
];

const SECONDARY: NavItem[] = [
  { key: 'tasks', label: '任务中心', path: '/tasks', icon: ListTodo },
  // path 用 /settings 本身：默认入口会 replace 到「模型」，且在任一设置子页上该项都保持高亮（ADR-005 D2）
  { key: 'settings', label: '设置', path: '/settings', icon: Settings },
];

function NavLinkItem({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(item.key === 'create');
  const active = pathname === item.path || pathname.startsWith(item.path + '/');

  if (item.children) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
            active ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
          )}
        >
          <item.icon className={cn('shrink-0', collapsed ? 'h-5 w-5' : 'h-4 w-4')} />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">{item.label}</span>
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
            </>
          )}
        </button>
        {!collapsed && open && (
          <div className="mt-1 space-y-0.5 pl-4">
            {item.children.map((c) => (
              <NavLink
                key={c.path}
                to={c.path}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] transition-colors',
                    isActive
                      ? 'bg-accent/70 font-medium text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground',
                  )
                }
              >
                <c.icon className="h-3.5 w-3.5" />
                {c.label}
              </NavLink>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
          collapsed && 'justify-center px-2',
          isActive || (item.key === 'comic' && pathname.startsWith('/comic/projects/'))
            ? 'bg-accent font-medium text-accent-foreground'
            : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
        )
      }
    >
      <item.icon className={cn('shrink-0', collapsed ? 'h-5 w-5' : 'h-4 w-4')} />
      {!collapsed && <span>{item.label}</span>}
    </NavLink>
  );
}

export default function SideNav({ collapsed }: { collapsed: boolean }) {
  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-border bg-sidebar transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      {/* 品牌区 */}
      <div className={cn('flex h-14 items-center gap-2.5 border-b border-border px-4', collapsed && 'justify-center px-2')}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary font-mono text-sm font-bold text-primary-foreground">
          镜
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold leading-tight">镜序 Studio</div>
            <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">JINGXU STUDIO</div>
          </div>
        )}
      </div>

      {/* 主入口 */}
      <nav className={cn('flex-1 space-y-1 overflow-y-auto px-3 py-3', collapsed && 'px-2')}>
        {NAV.map((item) => (
          <NavLinkItem key={item.key} item={item} collapsed={collapsed} />
        ))}
      </nav>

      {/* 次级区 */}
      <div className={cn('border-t border-border px-3 py-3', collapsed && 'px-2')}>
        <div className="space-y-1">
          {SECONDARY.map((item) => (
            <NavLinkItem key={item.key} item={item} collapsed={collapsed} />
          ))}
        </div>
        <div className={cn('mt-3 px-1 font-mono text-[9px] text-muted-foreground', collapsed && 'text-center')}>
          {!collapsed ? 'V0.2 · 镜序前端原型' : 'V0.2'}
        </div>
      </div>
    </aside>
  );
}
