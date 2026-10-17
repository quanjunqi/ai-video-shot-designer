// EXPORTS: default SettingsWorkspacePage
// 设置 > 工作区与成员（TASK-IA-001 v14 §三）：P2 显式占位（禁僵尸按钮）
import { Building2 } from 'lucide-react';

export default function SettingsWorkspacePage() {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-8 text-center">
      <Building2 className="h-6 w-6 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">工作区与成员</p>
      <p className="text-2xs text-muted-foreground">工作区信息、成员与角色管理（成员邀请与角色治理在 P2 提供）</p>
    </div>
  );
}
