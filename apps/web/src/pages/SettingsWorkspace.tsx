// EXPORTS: default SettingsWorkspacePage
// 设置 > 工作区与成员（TASK-SETTINGS-P2 v15 §二 + TASK-SETTINGS-P3A）。
// 工作区信息卡全员可见；成员与角色卡仅 Admin+ 渲染（Viewer 整区隐藏）；
// 邀请/调整/移除/共享预设库 = 显式 P3 占位（禁僵尸按钮）。
// P3A：成员数据源 = BFF /api/v1/workspace/members（admin+ 矩阵守卫）；API 失败 → 降级本地 DEV_ACTORS 演示态并标注来源。
// P3B：工作区信息卡（名称/标识/创建时间）数据源 = BFF /api/v1/workspace（全员可读）；失败 → 降级静态值并标注来源。
import { useEffect, useState } from 'react';
import { Building2, Crown, UserPlus, Users, SlidersHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DEV_ACTORS, useAuthStore, ROLE_RANK, type ActorRole } from '@/stores/useAuthStore';
import { fetchWorkspaceMembers, type WorkspaceMember } from '@/features/settings/workspace-members';
import { fetchWorkspaceInfo, type WorkspaceInfo } from '@/features/settings/workspace-info';

const ROLE_LABEL: Record<ActorRole, string> = { owner: 'Owner', admin: 'Admin', viewer: 'Viewer', member: 'Member' };

function MemberBadge({ role }: { role: ActorRole }) {
  const variant = role === 'owner' ? 'default' : role === 'admin' ? 'secondary' : 'outline';
  return <Badge variant={variant} className="font-mono text-2xs">{ROLE_LABEL[role] ?? role}</Badge>;
}

// RFC3339 → YYYY-MM-DD（信息卡展示口径，与 CI 时区无关的纯格式转换）。
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function SettingsWorkspacePage() {
  const workspaceId = useAuthStore((s) => s.workspaceId);
  const role = useAuthStore((s) => s.role);
  const canManage = (ROLE_RANK[role] ?? 0) >= ROLE_RANK.admin;

  // P3B 工作区信息：'loading' 拉取中 / 'api' 真实信息 / 'demo' 静态值降级
  const [info, setInfo] = useState<WorkspaceInfo | null>(null);
  const [infoSource, setInfoSource] = useState<'loading' | 'api' | 'demo'>('loading');

  useEffect(() => {
    let alive = true;
    void fetchWorkspaceInfo().then((data) => {
      if (!alive) return;
      if (data) {
        setInfo(data);
        setInfoSource('api');
      } else {
        setInfoSource('demo');
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  // P3A 成员数据：'loading' 拉取中 / 'api' 真实成员 / 'demo' 演示态降级
  const [members, setMembers] = useState<WorkspaceMember[] | null>(null);
  const [source, setSource] = useState<'loading' | 'api' | 'demo'>('loading');

  useEffect(() => {
    if (!canManage) return;
    let alive = true;
    void fetchWorkspaceMembers().then((items) => {
      if (!alive) return;
      if (items && items.length > 0) {
        setMembers(items);
        setSource('api');
      } else {
        setSource('demo');
      }
    });
    return () => {
      alive = false;
    };
  }, [canManage]);

  const memberCount = source === 'api' && members ? members.length : DEV_ACTORS.length;

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
            <span className="font-medium text-foreground">
              {infoSource === 'loading' ? '加载中…' : infoSource === 'api' && info ? info.name : '镜序 Studio'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-muted-foreground">工作区标识</span>
            <span className="font-mono text-foreground">
              {infoSource === 'api' && info ? info.id : workspaceId ? `ws_${workspaceId.slice(-6)}` : '—'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-muted-foreground">创建时间</span>
            <span className="text-muted-foreground/70">
              {infoSource === 'loading'
                ? '加载中…'
                : infoSource === 'api' && info
                  ? formatDate(info.created_at)
                  : '—（workspace 服务不可达时降级）'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-muted-foreground">成员数量</span>
            <span className="text-foreground">{memberCount}</span>
          </div>
        </div>
        <p className="text-2xs text-muted-foreground">
          {infoSource === 'api'
            ? '工作区信息来源：workspace 服务（BFF /api/v1/workspace，全员可读）。'
            : '工作区信息为本地静态值（workspace 服务不可达时降级，与成员数据同源）。'}
        </p>
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
                {source === 'loading' && (
                  <tr className="border-t border-border">
                    <td colSpan={3} className="px-3 py-3 text-center text-muted-foreground">加载成员…</td>
                  </tr>
                )}
                {source === 'api' &&
                  members?.map((m) => (
                    <tr key={m.actor_id} className="border-t border-border">
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2 font-medium text-foreground">
                          {m.role === 'owner' && <Crown className="h-3 w-3 text-amber-500" />}
                          {m.actor_id}
                        </span>
                      </td>
                      <td className="px-3 py-2"><MemberBadge role={m.role} /></td>
                      <td className="px-3 py-2 text-muted-foreground">—</td>
                    </tr>
                  ))}
                {source === 'demo' &&
                  DEV_ACTORS.map((d) => (
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
            {source === 'api'
              ? '成员数据来源：workspace 服务（BFF /api/v1/workspace/members，仅 Admin+ 可读）。'
              : '成员数据当前为本地演示数据（workspace 服务不可达时降级，与右上角身份切换同源）。'}
          </p>
        </div>
      )}

      <p className="text-2xs text-muted-foreground">设计稿：设置中心 P2 骨架 v15 §二（TASK-SETTINGS-P2 / P3A）</p>
    </div>
  );
}
