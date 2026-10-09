// EXPORTS: default HomePage
// 首页：最近项目 / 创作启动区 / 创作广场
import { useState } from 'react';
import RecentProjects from '@/features/home/RecentProjects';
import CreateLaunchpad from '@/features/home/CreateLaunchpad';
import CreationSquare from '@/features/home/CreationSquare';
import NewProjectDialog from '@/features/comic/NewProjectDialog';

export default function HomePage() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-8 px-6 py-6">
      <RecentProjects onNew={() => setDialogOpen(true)} />
      <CreateLaunchpad onNewComic={() => setDialogOpen(true)} />
      <CreationSquare />
      <NewProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
