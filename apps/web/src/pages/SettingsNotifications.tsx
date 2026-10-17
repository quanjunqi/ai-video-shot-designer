// EXPORTS: default SettingsNotificationsPage
// 设置 > 通知与默认行为（TASK-IA-001 v14 §三 + TASK-SETTINGS-P2 §四）：默认模型 / 默认路由（自偏好页迁入）+ 通知开关（P2 新增）
// 默认模型只是新任务的预设；单次可选其他已配置且能力兼容的模型，已提交任务固定版本。
// 通知开关写入 preferences.notifications（persist v4）；成员协作通知 = 显式 P3 占位（禁僵尸按钮）。
import { BellRing, Route, Image as ImageIcon, Video, FileText, UsersRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { cn } from '@/lib/utils';

export default function SettingsNotificationsPage() {
  const preferences = useSettingsStore((s) => s.preferences);
  const models = useSettingsStore((s) => s.models);
  const update = useSettingsStore((s) => s.update);

  const enabledByType = (type: 'text' | 'image' | 'video') =>
    models.filter((m) => m.type === type && m.status === 'enabled');

  const setNotification = (key: 'taskDone' | 'channelHealth', value: boolean) =>
    update({ preferences: { ...preferences, notifications: { ...preferences.notifications, [key]: value } } });

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

      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <BellRing className="h-4 w-4 text-primary" />
          <Label className="text-sm font-medium">通知</Label>
          <Badge variant="outline" className="font-mono text-2xs">本地偏好 · 真实推送 P3</Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">任务完成 / 失败通知</span>
          <Switch
            className="ml-auto"
            checked={preferences.notifications.taskDone}
            onCheckedChange={(v) => setNotification('taskDone', v)}
            aria-label="任务完成/失败通知开关"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">渠道健康告警（关联健康页）</span>
          <Switch
            className="ml-auto"
            checked={preferences.notifications.channelHealth}
            onCheckedChange={(v) => setNotification('channelHealth', v)}
            aria-label="渠道健康告警开关"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <UsersRound className="h-3.5 w-3.5" />
          成员协作通知
          <span className="ml-auto text-2xs text-muted-foreground/70">P3 · 尚未开放</span>
        </div>
        <p className="text-2xs text-muted-foreground">开关仅保存偏好；真实通知推送依赖协作/任务后端（P3）。</p>
      </div>
    </div>
  );
}
