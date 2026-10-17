// EXPORTS: default SettingsDataPage
// 设置 > 数据与存储（TASK-SETTINGS-P2 v15 §三）：本地态骨架。
// 存储用量动态统计（localStorage）；「清理离线缓存」=确认弹窗→清目录数据回演示态（保留偏好/主题/语言/专家）；
// 「重置本地偏好」=确认弹窗（列出范围）→ 清 mdp:settings persist → 刷新恢复默认；导出 = 显式 P3 占位（禁僵尸按钮）。
// 权限：全员可操作（选 A）+ 确认弹窗兜底（破坏性操作禁误触）。
import { useMemo, useState } from 'react';
import { Database, Download, RefreshCw, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useSettingsStore } from '@/stores/useSettingsStore';

const PREF_KEYS = ['mdp:settings', 'mdp-dev-actor'];

function estimateBytes(key: string): number {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return 0;
    return new TextEncoder().encode(raw).length;
  } catch {
    return -1; // localStorage 不可用（隐私模式等）
  }
}

export default function SettingsDataPage() {
  const catalogSource = useSettingsStore((s) => s.catalogSource);
  const [clearOpen, setClearOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const storage = useMemo(() => {
    const entries = PREF_KEYS.map((k) => ({ key: k, bytes: estimateBytes(k) }));
    const ok = entries.every((e) => e.bytes >= 0);
    return { entries, total: ok ? entries.reduce((sum, e) => sum + e.bytes, 0) : -1, ok };
  }, []);

  const fmt = (bytes: number) => (bytes < 0 ? '—' : bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`);

  const clearOfflineCache = () => {
    // 仅清目录数据（offline-fallback 快照）：渠道/模型/模板/数据源恢复演示默认，偏好/主题/语言/专家保留
    const store = useSettingsStore.getState();
    store.update({ channels: [], models: [], templates: [], catalogSource: 'demo' });
    toast.success('离线目录缓存已清理（渠道/模型已恢复演示默认，偏好保留）');
    setClearOpen(false);
  };

  const resetPrefs = () => {
    try {
      window.localStorage.removeItem('mdp:settings');
    } catch {
      // ignore
    }
    toast.success('本地偏好已重置，刷新后恢复默认设置');
    setResetOpen(false);
    // 延迟刷新，让 toast 先展示
    setTimeout(() => window.location.reload(), 600);
  };

  const p3Row = (icon: React.ReactNode, label: string) => (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {icon}
      {label}
      <span className="ml-auto text-2xs text-muted-foreground/70">P3 · 尚未开放</span>
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="space-y-4 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium text-foreground">本地数据</p>
          <Badge variant="outline" className="font-mono text-2xs">本机浏览器存储</Badge>
        </div>
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-muted-foreground">本地存储用量</span>
            <span className="text-foreground">
              离线模板缓存 / 草稿
              <span className="ml-1 font-mono text-2xs text-muted-foreground">
                {storage.ok ? `约 ${fmt(storage.total)}` : '存储不可用'}
              </span>
            </span>
          </div>
          {storage.ok && storage.total === 0 && <p className="text-2xs text-muted-foreground">当前无离线缓存（未进入离线回退态）</p>}
          {!storage.ok && <p className="text-2xs text-amber-600">localStorage 不可用（隐私模式等），清理/重置能力受限</p>}
        </div>
        <div className="flex flex-wrap gap-3 border-t border-border pt-3">
          <Button type="button" size="sm" variant="outline" onClick={() => setClearOpen(true)} disabled={!storage.ok}>
            <Trash2 className="h-3.5 w-3.5" />
            清理离线缓存
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setResetOpen(true)} disabled={!storage.ok}>
            <RefreshCw className="h-3.5 w-3.5" />
            重置本地偏好
          </Button>
        </div>
        <p className="text-2xs text-muted-foreground">
          清理离线缓存仅清目录快照（渠道/模型/模板回演示默认），不动偏好；重置本地偏好将恢复全部默认设置（见确认弹窗范围）。
        </p>
      </div>

      <div className="space-y-2 rounded-xl border border-dashed border-border p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Download className="h-3.5 w-3.5" />
          导出（项目 / 剧集 / 资产 / 分镜）
          <span className="ml-auto text-2xs text-muted-foreground/70">P3 · 尚未开放</span>
        </div>
        {p3Row(<Database className="h-3.5 w-3.5" />, '云端存储管理')}
        <p className="text-2xs text-muted-foreground">当前数据源：{catalogSource === 'server' ? '平台目录' : catalogSource === 'offline-fallback' ? '离线缓存（后端不可达）' : '内置演示目录'}</p>
      </div>

      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>清理离线缓存</DialogTitle>
            <DialogDescription>
              将清除离线目录快照（渠道 / 模型 / 协议模板回到演示默认，若当前为离线回退态），
              <b>主题 / 语言 / 专家模式 / 默认模型 / 默认路由 / 密度 / 通知等偏好保留</b>。此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" size="sm" variant="outline" onClick={() => setClearOpen(false)}>取消</Button>
            <Button type="button" size="sm" variant="destructive" onClick={clearOfflineCache}>确认清理</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重置本地偏好</DialogTitle>
            <DialogDescription>
              将清除并恢复以下为默认值：主题、语言、专家模式、默认模型（文本/图片/视频）、默认路由、
              创作界面密度、通知开关。渠道与模型目录数据不受影响（可重新同步/添加）。此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" size="sm" variant="outline" onClick={() => setResetOpen(false)}>取消</Button>
            <Button type="button" size="sm" variant="destructive" onClick={resetPrefs}>确认重置</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-2xs text-muted-foreground">设计稿：设置中心 P2 骨架 v15 §三（TASK-SETTINGS-P2）</p>
    </div>
  );
}
