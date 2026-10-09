// EXPORTS: default SettingsLayout
// 设置台二级导航布局（3.4）
import { NavLink, Outlet } from 'react-router-dom';
import { Cable, Boxes, SlidersHorizontal, Layers, ScrollText } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { key: 'channels', label: '渠道配置', path: '/settings/channels', icon: Cable },
  { key: 'protocols', label: '协议配置', path: '/settings/protocols', icon: Layers },
  { key: 'models', label: '模型配置', path: '/settings/models', icon: Boxes },
  { key: 'audit', label: '调用审计', path: '/settings/audit', icon: ScrollText },
  { key: 'preferences', label: '通用设置', path: '/settings/preferences', icon: SlidersHorizontal },
];

export default function SettingsLayout() {
  return (
    <div className="flex h-full min-h-0">
      <nav className="flex w-full shrink-0 gap-1 overflow-x-auto border-b border-border p-2 md:w-52 md:flex-col md:space-y-1 md:overflow-x-hidden md:border-b-0 md:border-r md:p-3">
        <div className="px-2 pb-2 text-xs font-semibold text-muted-foreground">设置</div>
        {NAV.map((n) => (
          <NavLink
            key={n.key}
            to={n.path}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs transition-colors',
                isActive ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
              )
            }
          >
            <n.icon className="h-4 w-4" />
            {n.label}
          </NavLink>
        ))}
      </nav>
      <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}
