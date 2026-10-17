// EXPORTS: default SettingsNotificationsPage
// 设置 > 通知与默认行为（TASK-IA-001 v14 §三）：默认模型 / 默认路由（自偏好页迁入）
// 默认模型只是新任务的预设；单次可选其他已配置且能力兼容的模型，已提交任务固定版本。
import { Route, Image as ImageIcon, Video, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { cn } from '@/lib/utils';

export default function SettingsNotificationsPage() {
  const preferences = useSettingsStore((s) => s.preferences);
  const models = useSettingsStore((s) => s.models);
  const update = useSettingsStore((s) => s.update);

  const enabledByType = (type: 'text' | 'image' | 'video') =>
    models.filter((m) => m.type === type && m.status === 'enabled');

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="space-y-4 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Route className="h-4 w-4 text-primary" />
          <Label className="text-sm font-medium">默认路由</Label>
          <Badge variant="outline" className={cn('ml-auto font-mono text-3xs')}>{preferences.defaultRoute}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <Label className="text-sm font-medium">默认文本模型</Label>
          <div className="ml-auto">
            <Select
              value={preferences.defaultTextModel}
              onValueChange={(v) => update({ preferences: { ...preferences, defaultTextModel: v } })}
            >
              <SelectTrigger className="h-9 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {enabledByType('text').map((m) => (
                  <SelectItem key={m.id} value={m.name}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-primary" />
          <Label className="text-sm font-medium">默认图片模型</Label>
          <div className="ml-auto">
            <Select
              value={preferences.defaultImageModel}
              onValueChange={(v) => update({ preferences: { ...preferences, defaultImageModel: v } })}
            >
              <SelectTrigger className="h-9 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {enabledByType('image').map((m) => (
                  <SelectItem key={m.id} value={m.name}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Video className="h-4 w-4 text-primary" />
          <Label className="text-sm font-medium">默认视频模型</Label>
          <div className="ml-auto">
            <Select
              value={preferences.defaultVideoModel}
              onValueChange={(v) => update({ preferences: { ...preferences, defaultVideoModel: v } })}
            >
              <SelectTrigger className="h-9 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {enabledByType('video').map((m) => (
                  <SelectItem key={m.id} value={m.name}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-2xs text-muted-foreground">
          默认模型只是新任务的预设；单次可选其他已配置且能力兼容的模型，已提交任务固定版本。
        </p>
      </div>
    </div>
  );
}
