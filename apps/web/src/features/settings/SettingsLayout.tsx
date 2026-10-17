// EXPORTS: default SettingsLayout
// 设置中心信息架构（IA v14 收敛，TASK-IA-001 / ADR-005 D2 终态）：
// 设置中心 = 系统设置域，顶层导航 6 区「账号与安全 / 工作区与成员 / 外观 / 通知与默认行为 / 数据与存储 / 关于」，
// 每项在页面顶部给出「用户任务一句话」。业务配置（模型/渠道/偏好）已迁出至模型中心。
// 导航事实（项、层级、旧路径去向）在 features/settings/settings-navigation.ts，并已被单测锁定。
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { AtSign, Building2, Palette, Bell, Database, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  settingsSectionForPath,
  visibleSettingsNav,
  type SettingsSectionKey,
} from '@/features/settings/settings-navigation';
import { useAuthStore } from '@/stores/useAuthStore';

const NAV_ICON: Record<SettingsSectionKey, typeof AtSign> = {
  account: AtSign,
  workspace: Building2,
  appearance: Palette,
  notifications: Bell,
  data: Database,
  about: Info,
};

export default function SettingsLayout() {
  const { pathname } = useLocation();
  const section = settingsSectionForPath(pathname);
  const role = useAuthStore((s) => s.role);
  // TASK-IA-001 v14：系统设置 6 区全员可见；敏感操作在页面内按角色细分（后端矩阵兜底）
  const nav = visibleSettingsNav(role);

  return (
    <div className="flex h-full min-h-0">
      <nav className="flex w-full shrink-0 gap-1 overflow-x-auto border-b border-border p-2 md:w-52 md:flex-col md:space-y-1 md:overflow-x-hidden md:border-b-0 md:border-r md:p-3">
        <div className="px-2 pb-2 text-xs font-semibold text-muted-foreground">设置</div>
        {nav.map((n) => {
          const Icon = NAV_ICON[n.key];
          return (
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
              <Icon className="h-4 w-4" />
              {n.label}
            </NavLink>
          );
        })}
      </nav>
      <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6">
        {section && (
          <div className="mb-4 space-y-2">
            {/* 用户任务一句话（ADR-005 §5：导航必须能被理解，而不只是被列出） */}
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{section.label}</span>
              <span className="mx-1.5">·</span>
              {section.task}
            </p>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
