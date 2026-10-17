// EXPORTS: default SettingsDataPage
// 设置 > 数据与存储（TASK-IA-001 v14 §三）：P2 显式占位（禁僵尸按钮）
import { Database } from 'lucide-react';

export default function SettingsDataPage() {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-8 text-center">
      <Database className="h-6 w-6 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">数据与存储</p>
      <p className="text-2xs text-muted-foreground">数据导出、清理与存储用量（导出与清理在 P3 提供）</p>
    </div>
  );
}
