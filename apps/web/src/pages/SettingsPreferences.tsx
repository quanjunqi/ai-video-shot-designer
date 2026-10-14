// EXPORTS: default SettingsPreferencesPage
// 通用设置（3.4 / 7.9）：主题 / 语言 / 默认路由与默认模型
import { Monitor, Sun, Moon, Languages, Route, Image as ImageIcon, Video } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSettingsStore } from '@/stores/useSettingsStore';
import type { ThemeMode } from '@/stores/useSettingsStore';
import { cn } from '@/lib/utils';

const THEMES: Array<{ value: ThemeMode; label: string; icon: typeof Sun }> = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor },
];

export default function SettingsPreferencesPage() {
  const settings = useSettingsStore((s) => s);
  const update = useSettingsStore((s) => s.update);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold">通用设置</h1>
              </div>

      <div className="space-y-4 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Monitor className="h-4 w-4 text-primary" />
          <Label className="text-sm font-medium">主题</Label>
          <div className="ml-auto flex flex-wrap gap-2">
            {THEMES.map((t) => (
              <Button
                key={t.value}
                type="button"
                size="sm"
                variant={settings.theme === t.value ? 'default' : 'outline'}
                onClick={() => update({ theme: t.value })}
                className="gap-1.5"
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Languages className="h-4 w-4 text-primary" />
          <Label className="text-sm font-medium">语言</Label>
          <div className="ml-auto">
            <Select value={settings.language} onValueChange={(v) => update({ language: v })}>
              <SelectTrigger className="h-9 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="简体中文">简体中文</SelectItem>
                <SelectItem value="English" disabled>English（尚未开放）</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Route className="h-4 w-4 text-primary" />
          <Label className="text-sm font-medium">默认路由</Label>
          <Badge variant="outline" className={cn('ml-auto font-mono text-3xs')}>{settings.preferences.defaultRoute}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-primary" />
          <Label className="text-sm font-medium">默认图片模型</Label>
          <div className="ml-auto">
            <Select
              value={settings.preferences.defaultImageModel}
              onValueChange={(v) => update({ preferences: { ...settings.preferences, defaultImageModel: v } })}
            >
              <SelectTrigger className="h-9 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {settings.models.filter((m) => m.type === 'image' && m.status === 'enabled').map((m) => (
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
              value={settings.preferences.defaultVideoModel}
              onValueChange={(v) => update({ preferences: { ...settings.preferences, defaultVideoModel: v } })}
            >
              <SelectTrigger className="h-9 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {settings.models.filter((m) => m.type === 'video' && m.status === 'enabled').map((m) => (
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
