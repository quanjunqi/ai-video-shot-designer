// EXPORTS: default SettingsAccountPage
// 设置 > 账号与安全（TASK-IA-001 v14 §三）：P2 显式占位（禁僵尸按钮，见 frontend-quality）
import { AtSign } from 'lucide-react';

export default function SettingsAccountPage() {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-8 text-center">
      <AtSign className="h-6 w-6 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">账号与安全</p>
      <p className="text-2xs text-muted-foreground">账号信息、登录方式与安全设置（真实账号体系在 P2 提供）</p>
    </div>
  );
}
