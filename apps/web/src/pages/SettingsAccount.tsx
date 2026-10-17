// EXPORTS: default SettingsAccountPage
// 设置 > 账号与安全（TASK-SETTINGS-P2 v15 §一）：本地态骨架。
// 身份卡 = useAuthStore（/api/v1/me 同源，与 TopBar 角色联动）；昵称/邮箱/登录方式/会话设备 = 显式 P3 占位（禁僵尸按钮）。
import { AtSign, Fingerprint, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useAuthStore, type ActorRole } from '@/stores/useAuthStore';

const ROLE_LABEL: Record<ActorRole, string> = { owner: 'Owner', admin: 'Admin', viewer: 'Viewer', member: 'Member' };

function RoleBadge({ role }: { role: ActorRole }) {
  const variant = role === 'owner' ? 'default' : role === 'admin' ? 'secondary' : 'outline';
  return <Badge variant={variant} className="font-mono text-2xs">{ROLE_LABEL[role] ?? role}</Badge>;
}

export default function SettingsAccountPage() {
  const status = useAuthStore((s) => s.status);
  const actorId = useAuthStore((s) => s.actorId);
  const workspaceId = useAuthStore((s) => s.workspaceId);
  const role = useAuthStore((s) => s.role);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="space-y-4 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-foreground">
            {(actorId || '?').slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate font-medium text-foreground">{actorId || '未登录'}</p>
              {role && <RoleBadge role={role} />}
            </div>
            <p className="font-mono text-2xs text-muted-foreground">
              工作区 {workspaceId ? `ws_${workspaceId.slice(-6)}` : '—'} · 身份来源 BFF /api/v1/me
            </p>
          </div>
        </div>
        {status === 'loading' && <p className="text-2xs text-muted-foreground">身份加载中…</p>}
        {status === 'error' && <p className="text-2xs text-muted-foreground">身份服务不可用，当前按最低权限展示（fail-safe）</p>}
        <p className="text-2xs text-muted-foreground">
          当前为开发身份注入（TopBar 右上角可切换 Owner / Admin / Viewer 走查）；真实账号体系在 P3 提供。
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium text-foreground">安全</p>
          <Badge variant="outline" className="font-mono text-2xs">P3 · 真实账号体系提供</Badge>
        </div>
        <div className="space-y-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <AtSign className="h-3.5 w-3.5" />
            昵称 / 邮箱编辑
            <span className="ml-auto text-2xs text-muted-foreground/70">尚未开放</span>
          </div>
          <div className="flex items-center gap-2">
            <Fingerprint className="h-3.5 w-3.5" />
            登录方式 / 当前会话（退出登录）
            <span className="ml-auto text-2xs text-muted-foreground/70">尚未开放</span>
          </div>
          <div className="flex items-center gap-2">
            <LogOut className="h-3.5 w-3.5" />
            会话与设备管理
            <span className="ml-auto text-2xs text-muted-foreground/70">尚未开放</span>
          </div>
        </div>
        <p className="text-2xs text-muted-foreground">以上能力依赖真实账号体系，不做假按钮；如需切换走查身份请使用右上角身份下拉。</p>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-dashed border-border p-3 text-2xs text-muted-foreground">
        <UserRound className="h-3.5 w-3.5" />
        安全基线：密钥仅在渠道凭据中写不读；角色等级 member(0) &lt; viewer(1) &lt; admin(2) &lt; owner(3)。
      </div>
      <p className="text-2xs text-muted-foreground">设计稿：设置中心 P2 骨架 v15 §一（TASK-SETTINGS-P2）</p>
    </div>
  );
}
