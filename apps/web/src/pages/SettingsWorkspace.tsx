// EXPORTS: default SettingsWorkspacePage
// 设置 > 工作区与成员（TASK-SETTINGS-P2 v15 §二）：本地态骨架。
// 工作区信息卡全员可见；成员与角色卡仅 Admin+ 渲染（Viewer 整区隐藏）；
// 邀请/调整/移除/共享预设库 = 显式 P3 占位（禁僵尸按钮）。成员数据源 = 本地 DEV_ACTORS（workspace 成员 API 为 P3）。
import { Building2, Crown, UserPlus, Users, SlidersHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DEV_ACTORS, useAuthStore, ROLE_RANK, type ActorRole } from '@/stores/useAuthStore';

const ROLE_LABEL: Record<ActorRole, string> = { owner: 'Owner', admin: 'Admin', viewer: 'Viewer', member: 'Member' };

function MemberBadge({ role }: { role: ActorRole }) {
  const variant = role === 'owner' ? 'default' : role === 'admin' ? 'secondary' : 'outline';
  return <Badge variant={variant} className="font-mono text-2xs">{ROLE_LABEL[role] ?? role}</Badge>;
}

export default function SettingsWorkspacePage() {
  const workspaceId = useAuthStore((s) => s.workspaceId);
  const role = useAuthStore((s) => s.role);
  const canManage = (ROLE_RANK[role] ?? 0) >= ROLE_RANK.admin;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="space-y-4 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium text-foreground">工作区信息</p>
        </div>
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-muted-foreground">名称</span>
            <span className="font-medium text-foreground">镜序 Studio</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-muted-foreground">工作区标识</span>
            <span className="font-mono text-foreground">{workspaceId ? `ws_${workspaceId.slice(-6)}` : '—'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-muted-foreground">创建时间</span>
            <span className="text-muted-foreground/70">—（P3 由 workspace 服务提供）</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-muted-foreground">成员数量</span>
            <span className="text-foreground">{DEV_ACTORS.length}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          团队共享预设库（镜头语言库 / 风格库）
          <span className="ml-auto text-2xs text-muted-foreground/70">P3 · 尚未开放</span>
        </div>
      </div>

      {canManage && (
        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium text-foreground">成员与角色</p>
            <Badge variant="outline" className="font-mono text-2xs">仅 Admin+ 可见</Badge>
          </div>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">成员</th>
                  <th className="px-3 py-2 text-left font-medium">角色</th>
                  <th className="px-3 py-2 text-left font-medium">最近活跃</th>
                </tr>
              </thead>
              <tbody>
                {DEV_ACTORS.map((d) => (
                  <tr key={d.actorId} className="border-t border-border">
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2 font-medium text-foreground">
                        {d.role === 'owner' && <Crown className="h-3 w-3 text-amber-500" />}
                        {d.actorId}
                      </span>
                    </td>
                    <td className="px-3 py-2"><MemberBadge role={d.role} /></td>
                    <td className="px-3 py-2 text-muted-foreground">{d.role === 'viewer' ? '—' : '刚刚'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <UserPlus className="h-3.5 w-3.5" />
              邀请成员
              <span className="ml-auto text-2xs text-muted-foreground/70">P3 · 尚未开放</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5" />
              调整角色 / 移除成员
              <span className="ml-auto text-2xs text-muted-foreground/70">P3 · 尚未开放</span>
            </div>
          </div>
          <p className="text-2xs text-muted-foreground">
            成员数据当前为本地三角色（与右上角身份切换同源）；workspace 成员 API 接入后替换为真实数据。
          </p>
        </div>
      )}

      <p className="text-2xs text-muted-foreground">设计稿：设置中心 P2 骨架 v15 §二（TASK-SETTINGS-P2）</p>
    </div>
  );
}
