// EXPORTS: default ModelCenterLayout
// 模型中心壳（IA v14，TASK-IA-001）：左侧二级导航 6 项 + 内容区。
// 与 SettingsLayout 同一视觉语言（左右双栏、52 宽二级导航、顶部分组任务一句话）。
// 未实装分组渲染 ModelCenterPlaceholder（「建设中」占位，禁僵尸按钮）。
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Boxes, ShoppingBag, Cable, Coins, ScrollText, HeartPulse, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  modelCenterSectionForPath,
  visibleModelCenterNav,
  type ModelCenterSectionKey,
} from '@/features/model-center/model-center-navigation';
import { useAuthStore } from '@/stores/useAuthStore';

const NAV_ICON: Record<ModelCenterSectionKey, LucideIcon> = {
  catalog: Boxes,
  market: ShoppingBag,
  channels: Cable,
  costs: Coins,
  audit: ScrollText,
  health: HeartPulse,
};

/** 未实装分组的占位视图：明确「建设中」，无任何伪交互（frontend-quality：禁僵尸按钮） */
export function ModelCenterPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center gap-2 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-accent/50 text-muted-foreground">
        <Coins className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className="max-w-72 text-xs text-muted-foreground">
        该模块正在建设中，后续迭代开放。当前已开放：成本与用量、审计日志、健康。
      </p>
    </div>
  );
}

export default function ModelCenterLayout() {
  const { pathname } = useLocation();
  const section = modelCenterSectionForPath(pathname);
  const role = useAuthStore((s) => s.role);
  // TASK-IA-001 v14：按角色过滤二级导航（审计仅 Owner；渠道浏览全员，操作页面内细分；后端矩阵兜底）
  const nav = visibleModelCenterNav(role);

  return (
    <div className="flex h-full min-h-0 flex-wrap md:flex-nowrap">
      <nav className="flex w-full shrink-0 gap-1 overflow-x-auto border-b border-border p-2 md:w-52 md:flex-col md:space-y-1 md:overflow-x-hidden md:border-b-0 md:border-r md:p-3">
        <div className="px-2 pb-2 text-xs font-semibold text-muted-foreground">模型中心</div>
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
        <div className="mb-4 space-y-2">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{section.label}</span>
            <span className="mx-1.5">·</span>
            {section.task}
          </p>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
