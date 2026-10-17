// EXPORTS: default SettingsAppearancePage
// 设置 > 外观（TASK-IA-001 v14 §三 + TASK-SETTINGS-P2 §四）：主题 / 语言（自偏好页迁入）+ 专家模式开关（新建，仅 Admin+ 显示）
// + 创作界面密度（P2 新增：分镜字号/画布密度，写入 preferences.density，persist v4）。
// 专家模式：展示渠道接入方式/参数映射/精细路由等高级配置入口（v14：接入方式=渠道向导高级区）
import { Monitor, Sun, Moon, Languages, Wrench, Scaling } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useSettingsStore, type ThemeMode } from '@/stores/useSettingsStore';
import { useAuthStore, ROLE_RANK } from '@/stores/useAuthStore';

const THEMES: Array<{ value: ThemeMode; label: string; icon: typeof Sun }> = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor },
];

const SHOT_SIZES = [
  { value: 'compact', label: '紧凑' },
  { value: 'standard', label: '标准' },
  { value: 'relaxed', label: '宽松' },
] as const;

const CANVAS_DENSITIES = [
  { value: 'normal', label: '普通' },
  { value: 'high', label: '高密度' },
] as const;

export default function SettingsAppearancePage() {
  const theme = useSettingsStore((s) => s.theme);
  const language = useSettingsStore((s) => s.language);
  const expertMode = useSettingsStore((s) => s.expertMode);
  const preferences = useSettingsStore((s) => s.preferences);
  const update = useSettingsStore((s) => s.update);
  const role = useAuthStore((s) => s.role);
  const canExpert = (ROLE_RANK[role] ?? 0) >= ROLE_RANK.admin;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="space-y-4 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Monitor className="h-4 w-4 text-primary" />
          <Label className="text-sm font-medium">主题</Label>
          <div className="ml-auto flex flex-wrap gap-2">
            {THEMES.map((t) => (
              <Button
                key={t.value}
                type="button"
                size="sm"
                variant={theme === t.value ? 'default' : 'outline'}
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
            <Select value={language} onValueChange={(v) => update({ language: v })}>
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
          <Scaling className="h-4 w-4 text-primary" />
          <Label className="text-sm font-medium">创作界面密度</Label>
          <Badge variant="outline" className="font-mono text-2xs">本地偏好</Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">分镜字号</span>
          <div className="ml-auto flex flex-wrap gap-2">
            {SHOT_SIZES.map((s) => (
              <Button
                key={s.value}
                type="button"
                size="sm"
                variant={preferences.density.shotFontSize === s.value ? 'default' : 'outline'}
                onClick={() => update({ preferences: { ...preferences, density: { ...preferences.density, shotFontSize: s.value } } })}
                className="gap-1.5"
              >
                {s.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">画布密度</span>
          <div className="ml-auto flex flex-wrap gap-2">
            {CANVAS_DENSITIES.map((d) => (
              <Button
                key={d.value}
                type="button"
                size="sm"
                variant={preferences.density.canvasDensity === d.value ? 'default' : 'outline'}
                onClick={() => update({ preferences: { ...preferences, density: { ...preferences.density, canvasDensity: d.value } } })}
                className="gap-1.5"
              >
                {d.label}
              </Button>
            ))}
          </div>
        </div>
        <p className="text-2xs text-muted-foreground">
          创作页面按此密度渲染（本期仅存储与展示；分镜/画布组件适配在后续迭代接入）。
        </p>
      </div>

      {canExpert && (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-primary" />
            <Label className="text-sm font-medium">专家模式</Label>
            <Switch
              className="ml-auto"
              checked={expertMode}
              onCheckedChange={(v) => update({ expertMode: v })}
              aria-label="专家模式开关"
            />
          </div>
          <p className="text-2xs text-muted-foreground">
            开启后，在渠道接入与模型目录中显示接入方式、参数映射与精细路由等高级配置（IA v14：仅 Admin+ 可切换）。
          </p>
          <Badge variant="outline" className="font-mono text-2xs">仅 Admin+ 可见</Badge>
        </div>
      )}
    </div>
  );
}
