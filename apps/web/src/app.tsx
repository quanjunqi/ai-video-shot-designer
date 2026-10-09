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
import SettingsChannelsPage from '@/pages/SettingsChannels';
import SettingsModelsPage from '@/pages/SettingsModels';
import SettingsProtocolsPage from '@/pages/SettingsProtocols';
import SettingsPreferencesPage from '@/pages/SettingsPreferences';
import NotFoundPage from '@/pages/NotFoundPage/NotFoundPage';

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
        <Route path="settings" element={<SettingsLayout />}>
          <Route index element={<Navigate to="/settings/channels" replace />} />
          <Route path="channels" element={<SettingsChannelsPage />} />
          <Route path="protocols" element={<SettingsProtocolsPage />} />
          <Route path="models" element={<SettingsModelsPage />} />
          <Route path="preferences" element={<SettingsPreferencesPage />} />
        </Route>

        {/* 旧路由迁移跳转 */}
        <Route path="drama" element={<Navigate to="/comic/projects" replace />} />
        <Route path="drama/:projectId" element={<DramaProjectRedirect />} />
        <Route path="lens" element={<Navigate to="/shot-language" replace />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
