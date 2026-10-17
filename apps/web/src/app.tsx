import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { RequireRole } from '@/components/RequireRole';
import HomePage from '@/pages/Home';
import CanvasPage from '@/pages/Canvas';
import CreateImagePage from '@/pages/CreateImage';
import CreateVideoPage from '@/pages/CreateVideo';
import CreateAudioPage from '@/pages/CreateAudio';
import ComicProjectsPage from '@/pages/ComicProjects';
import ComicProjectDetailPage from '@/pages/ComicProjectDetail';
import StyleLibraryPage from '@/pages/StyleLibraryPage';
import RulesCenterPage from '@/pages/RulesCenterPage';
import EpisodeWorkbenchPage from '@/pages/EpisodeWorkbench';
import TasksPage from '@/pages/Tasks';
import ShotLanguagePage from '@/pages/ShotLanguage';
import AssetsPage from '@/pages/Assets';
import SettingsLayout from '@/features/settings/SettingsLayout';
import {
  SETTINGS_DEFAULT_PATH,
  SETTINGS_LEGACY_REDIRECTS,
  settingsRelativePath,
} from '@/features/settings/settings-navigation';
import SettingsAccountPage from '@/pages/SettingsAccount';
import SettingsWorkspacePage from '@/pages/SettingsWorkspace';
import SettingsAppearancePage from '@/pages/SettingsAppearance';
import SettingsNotificationsPage from '@/pages/SettingsNotifications';
import SettingsDataPage from '@/pages/SettingsData';
import SettingsAboutPage from '@/pages/SettingsAbout';
import ModelCenterLayout from '@/features/model-center/ModelCenterLayout';
import { MODEL_CENTER_DEFAULT_PATH } from '@/features/model-center/model-center-navigation';
import ModelMarketPage from '@/pages/ModelMarket';
import ModelChannelsPage from '@/pages/ModelChannels';
import ModelCostsPage from '@/pages/ModelCosts';
import ModelAuditPage from '@/pages/ModelAudit';
import ModelHealthPage from '@/pages/ModelHealth';
import NotFoundPage from '@/pages/NotFoundPage/NotFoundPage';

// 组件库展示页的开关：开发环境默认可用；非开发环境（预览/部署）用 VITE_ENABLE_UI_KIT=1
// 显式开启，供产品/设计同学看组件库（默认关闭 ⇒ 生产产物里不含该页）。
// **必须写成条件表达式**，不要写成「常量 + 死分支」——后者死分支里的动态 import 仍会被
// 打包器产出 chunk（实测 dist 会多出 UiKitPage-*.js）；这样写可完全消除（实测 0 个 ui-kit 资源）。
// 清单口径见 .agents/skills/frontend-coding/ui-components.md
const UI_KIT_ENABLED = import.meta.env.DEV || import.meta.env.VITE_ENABLE_UI_KIT === '1';
const UiKitPage = UI_KIT_ENABLED ? lazy(() => import('@/pages/dev/ui-kit/UiKitPage')) : null;

// 旧路由迁移：/drama/:projectId → /comic/projects/:projectId
function DramaProjectRedirect() {
  const { projectId } = useParams();
  return <Navigate to={`/comic/projects/${projectId}`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="canvas" element={<CanvasPage />} />
        <Route path="create/image" element={<CreateImagePage />} />
        <Route path="create/video" element={<CreateVideoPage />} />
        <Route path="create/audio" element={<CreateAudioPage />} />
        <Route path="comic/projects" element={<ComicProjectsPage />} />
        <Route path="comic/styles" element={<StyleLibraryPage />} />
        <Route path="comic/rules" element={<RulesCenterPage />} />
        <Route path="comic/projects/:projectId" element={<ComicProjectDetailPage />} />
        <Route path="comic/projects/:projectId/episodes/:episodeId/:stage" element={<EpisodeWorkbenchPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="shot-language" element={<ShotLanguagePage />} />
        <Route path="assets" element={<AssetsPage />} />
        {/* 模型中心（IA v14，TASK-IA-001；M8 收敛 5 项）：广场/渠道/成本/审计/健康；
            模型目录已撤销（TASK-MARKET-M8），启停归位广场卡片 */}
        <Route path="models" element={<ModelCenterLayout />}>
          <Route index element={<Navigate to={MODEL_CENTER_DEFAULT_PATH} replace />} />
          <Route path="market" element={<ModelMarketPage />} />
          {/* M8：模型目录已撤销，旧路径重定向到广场（ADR-005 §6：跳转不 404） */}
          <Route path="catalog" element={<Navigate to="/models/market" replace />} />
          {/* TASK-IA-001 v14：渠道浏览/连通检测全员，接入/凭据/同步=Admin+ 在页面内按操作细分 */}
          <Route path="channels" element={<ModelChannelsPage />} />
          <Route path="costs" element={<ModelCostsPage />} />
          {/* TASK-AUTH-001：审计日志 = 仅 Owner */}
          <Route
            path="audit"
            element={
              <RequireRole min="owner">
                <ModelAuditPage />
              </RequireRole>
            }
          />
          <Route path="health" element={<ModelHealthPage />} />
          {/* IA v14 路由稳定性：/models/protocols 占位删除，归渠道接入方式 */}
          <Route path="protocols" element={<Navigate to="/models/channels" replace />} />
        </Route>
        <Route path="settings" element={<SettingsLayout />}>
          {/* IA v14：设置中心默认落到「外观」 */}
          <Route index element={<Navigate to={SETTINGS_DEFAULT_PATH} replace />} />
          {/* 系统设置 6 区：账号/工作区/数据 = P2 显式占位；外观/通知与默认行为/关于 = 实装 */}
          <Route path="account" element={<SettingsAccountPage />} />
          <Route path="workspace" element={<SettingsWorkspacePage />} />
          <Route path="appearance" element={<SettingsAppearancePage />} />
          <Route path="notifications" element={<SettingsNotificationsPage />} />
          <Route path="data" element={<SettingsDataPage />} />
          <Route path="about" element={<SettingsAboutPage />} />
          {/* 旧路径兼容（IA v14 §四 10 条）：旧深链一律 replace 到新位置，不得 404。
              映射表唯一事实源在 features/settings/settings-navigation.ts，并由单测锁定。 */}
          {SETTINGS_LEGACY_REDIRECTS.map((r) => (
            <Route key={r.from} path={settingsRelativePath(r.from)} element={<Navigate to={r.to} replace />} />
          ))}
        </Route>

        {/* 组件库展示页（仅开发环境）：见 apps/web/scripts/ui-inventory.mjs 生成的清单 */}
        {UI_KIT_ENABLED && (
          <Route
            path="dev/ui-kit" /* ui-route:dev-only —— 开发工具页，不进 routes.json 送审枚举 */
            element={
              <Suspense fallback={null}>
                <UiKitPage />
              </Suspense>
            }
          />
        )}

        {/* 旧路由迁移跳转 */}
        <Route path="drama" element={<Navigate to="/comic/projects" replace />} />
        <Route path="drama/:projectId" element={<DramaProjectRedirect />} />
        <Route path="lens" element={<Navigate to="/shot-language" replace />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
