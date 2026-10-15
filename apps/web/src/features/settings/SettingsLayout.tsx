// EXPORTS: default SettingsLayout
// 设置中心信息架构（ADR-005 D2/D3）：顶层导航固定 4 项「模型 / 渠道 / 用量 / 偏好」，
// 每项在页面顶部给出「用户任务一句话」；「模型」下再分两个层级（对外能力 / 具体模型与来源渠道）。
// 导航事实（项、层级、旧路径去向）在 features/settings/settings-navigation.ts，并已被单测锁定。
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Boxes, Cable, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  SETTINGS_CHANNEL_RULES_PATH,
  SETTINGS_MODEL_SUBVIEWS,
  settingsSectionForPath,
  visibleSettingsNav,
  type SettingsSectionKey,
} from '@/features/settings/settings-navigation';
import { useAuthStore } from '@/stores/useAuthStore';

const NAV_ICON: Record<SettingsSectionKey, typeof Boxes> = {
  models: Boxes,
  channels: Cable,
  preferences: SlidersHorizontal,
};

export default function SettingsLayout() {
  const { pathname } = useLocation();
  const section = settingsSectionForPath(pathname);
  const onChannelRules = pathname === SETTINGS_CHANNEL_RULES_PATH;
  const role = useAuthStore((s) => s.role);
  // TASK-AUTH-001：按角色过滤设置子导航（偏好 Viewer 隐藏、渠道 Admin+；后端矩阵兜底）
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

            {/* 「模型」的两个层级：顶层是对外能力，次级是具体目录行与来源渠道（ADR-005 §3） */}
            {section.key === 'models' && (
              <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card p-1">
                {SETTINGS_MODEL_SUBVIEWS.map((s) => (
                  <NavLink
                    key={s.key}
                    to={s.path}
                    end
                    title={s.hint}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors',
                        isActive ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
                      )
                    }
                  >
                    {s.label}
                    {s.level === 'secondary' && (
                      <span className="rounded border border-border px-1 font-mono text-4xs text-muted-foreground">次级</span>
                    )}
                  </NavLink>
                ))}
              </div>
            )}

            {/* 「协议配置」取消一级导航后挂在这里（ADR-005 §3）：保留可达，但不再是平级入口 */}
            {section.key === 'channels' && (
              <NavLink
                to={onChannelRules ? '/settings/channels' : SETTINGS_CHANNEL_RULES_PATH}
                className="inline-flex items-center gap-1 text-2xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {onChannelRules ? '← 返回渠道' : '连接规则（协议模板）→'}
              </NavLink>
            )}
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
