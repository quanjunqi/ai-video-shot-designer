import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { Layout } from '@/components/Layout';
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
import SettingsChannelsPage from '@/pages/SettingsChannels';
import SettingsModelsPage from '@/pages/SettingsModels';
import SettingsProtocolsPage from '@/pages/SettingsProtocols';
import SettingsPreferencesPage from '@/pages/SettingsPreferences';
import SettingsLogicalModelsPage from '@/pages/SettingsLogicalModels';
import ModelCenterLayout, { ModelCenterPlaceholder } from '@/features/model-center/ModelCenterLayout';
import { MODEL_CENTER_DEFAULT_PATH } from '@/features/model-center/model-center-navigation';
import ModelCostsPage from '@/pages/ModelCosts';
import ModelAuditPage from '@/pages/ModelAudit';
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
        {/* 模型中心（高保真稿 GATE-2）：独立一级导航；T2-2 实装成本与用量/审计日志，其余入口建设中占位 */}
        <Route path="models" element={<ModelCenterLayout />}>
          <Route index element={<Navigate to={MODEL_CENTER_DEFAULT_PATH} replace />} />
          <Route path="catalog" element={<ModelCenterPlaceholder label="模型目录" />} />
          <Route path="market" element={<ModelCenterPlaceholder label="模型广场" />} />
          <Route path="channels" element={<ModelCenterPlaceholder label="渠道与凭据" />} />
          <Route path="costs" element={<ModelCostsPage />} />
          <Route path="audit" element={<ModelAuditPage />} />
          <Route path="protocols" element={<ModelCenterPlaceholder label="协议模板" />} />
        </Route>
        <Route path="settings" element={<SettingsLayout />}>
          {/* ADR-005 D2：设置中心默认落到「模型」 */}
          <Route index element={<Navigate to={SETTINGS_DEFAULT_PATH} replace />} />
          {/* 模型：顶层=对外能力（逻辑模型）；次级=具体模型与来源渠道（原「模型配置」目录行） */}
          <Route path="models" element={<SettingsLogicalModelsPage />} />
          <Route path="models/catalog" element={<SettingsModelsPage />} />
          {/* 渠道：模型从哪来；协议配置取消一级导航后挂在渠道下（ADR-005 §3） */}
          <Route path="channels" element={<SettingsChannelsPage />} />
          <Route path="channels/protocols" element={<SettingsProtocolsPage />} />
          {/* 用量：原「调用审计」并入（ADR-005 §3） */}
          <Route path="preferences" element={<SettingsPreferencesPage />} />
          {/* 旧路径兼容（ADR-005 §3）：旧深链一律 replace 到新位置，不得 404。
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
