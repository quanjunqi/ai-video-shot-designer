// EXPORTS: default CreateLaunchpad
// 创作启动区：图片/视频/音频/漫剧/画布 五个快捷入口
import { Link } from 'react-router-dom';
import { Clapperboard, Image as ImageIcon, Video, AudioLines, PenTool, ArrowUpRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Launch {
  key: string;
  label: string;
  desc: string;
  to: string;
  icon: LucideIcon;
  accent: string;
}

const LAUNCHES: Launch[] = [
  { key: 'image', label: '图片创作', desc: '文生图 / 图生图', to: '/create/image', icon: ImageIcon, accent: 'text-primary' },
  { key: 'video', label: '视频创作', desc: '文生视频 / 图生视频', to: '/create/video', icon: Video, accent: 'text-sky-500' },
  { key: 'audio', label: '音频创作', desc: '配音 / 音效 / 音乐', to: '/create/audio', icon: AudioLines, accent: 'text-emerald-500' },
  { key: 'comic', label: '新建漫剧项目', desc: '剧本 → 拆集 → 工坊', to: '', icon: Clapperboard, accent: 'text-amber-600' },
  { key: 'canvas', label: '无限画布', desc: '节点编排 / 多素材', to: '/canvas', icon: PenTool, accent: 'text-violet-500' },
];

export default function CreateLaunchpad({ onNewComic }: { onNewComic: () => void }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold">创作启动区</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {LAUNCHES.map((l) =>
          l.key === 'comic' ? (
            <button
              key={l.key}
              type="button"
              onClick={onNewComic}
              className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/50 hover:shadow-md"
            >
              <span className={cn('rounded-lg bg-accent/60 p-2.5', l.accent)}>
                <l.icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{l.label}</span>
                <span className="block truncate text-2xs text-muted-foreground">{l.desc}</span>
              </span>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </button>
          ) : (
            <Link
              key={l.key}
              to={l.to}
              className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/50 hover:shadow-md"
            >
              <span className={cn('rounded-lg bg-accent/60 p-2.5', l.accent)}>
                <l.icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{l.label}</span>
                <span className="block truncate text-2xs text-muted-foreground">{l.desc}</span>
              </span>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          ),
        )}
      </div>
    </div>
  );
}
