// EXPORTS: default AppShell
// 应用外壳：左侧导航 + 顶部工具栏 + 内容区（页面切换动画），并挂载主题与 Toaster
import { Outlet, useLocation } from 'react-router-dom';
import { ThemeProvider, useTheme } from 'next-themes';
import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import SideNav from '@/layouts/SideNav';
import TopBar from '@/layouts/TopBar';
import { Toaster } from '@/components/ui/sonner';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useUIStore } from '@/stores/useUIStore';
import { useJobResumer } from '@/hooks/useJobResumer';
import { devActorInitial, useAuthStore } from '@/stores/useAuthStore';

function ThemeSync() {
  const theme = useSettingsStore((s) => s.theme);
  const { setTheme } = useTheme();
  useEffect(() => {
    setTheme(theme);
  }, [theme, setTheme]);
  return null;
}

export default function AppShell() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const { pathname } = useLocation();
  const syncCatalog = useSettingsStore((s) => s.syncCatalog);
  // 全局 Job 推进器：统一驱动所有 queued/running 任务（可恢复 Job 语义），刷新后任务继续而非卡死
  useJobResumer();

  // 全局模型目录同步：确保所有页面（不仅设置中心）都能获取到最新的渠道/模型/协议
  useEffect(() => {
    void syncCatalog();
  }, [syncCatalog]);

  // TASK-AUTH-001：启动拉取当前身份（/api/v1/me → role 驱动导航过滤与页面守卫）。
  // dev 模式优先用 localStorage 记忆的身份（TopBar 下拉切换）。
  const hydrate = useAuthStore((s) => s.hydrate);
  useEffect(() => {
    if (import.meta.env.DEV) {
      useAuthStore.setState({ actorId: devActorInitial() });
    }
    void hydrate();
  }, [hydrate]);

  return (
    <ThemeProvider attribute="class" enableSystem defaultTheme="dark">
      <ThemeSync />
      <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
        <SideNav collapsed={collapsed} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar collapsed={collapsed} />
          <main className="min-w-0 flex-1 overflow-y-auto">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="h-full"
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
      <Toaster position="top-center" />
    </ThemeProvider>
  );
}
