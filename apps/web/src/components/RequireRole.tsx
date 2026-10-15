// 角色守卫（TASK-AUTH-001）：页面/区块级最小角色控制。
// 与后端矩阵一致：未达最小角色渲染 403 提示（不重定向，避免循环跳转）。
// 加载中不渲染内容（防闪烁）；身份不可得时按 member（fail-safe 隐藏）。
import type { ReactNode } from 'react';
import { ShieldX } from 'lucide-react';
import { ROLE_RANK, useAuthStore, type ActorRole } from '@/stores/useAuthStore';

export function RequireRole({ min, children }: { min: ActorRole; children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.role);
  if (status === 'loading') {
    return <div className="flex h-full min-h-64 items-center justify-center text-xs text-muted-foreground">正在校验访问权限…</div>;
  }
  if (ROLE_RANK[role] < ROLE_RANK[min]) {
    return (
      <div className="flex h-full min-h-64 flex-col items-center justify-center gap-2 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-accent/50 text-muted-foreground">
          <ShieldX className="h-5 w-5" />
        </div>
        <p className="text-sm font-medium text-foreground">无权访问</p>
        <p className="max-w-72 text-xs text-muted-foreground">
          该页面需要 {roleLabel(min)} 及以上角色，当前身份（{roleLabel(role)}）无权查看。
        </p>
      </div>
    );
  }
  return <>{children}</>;
}

function roleLabel(role: ActorRole): string {
  switch (role) {
    case 'owner':
      return 'Owner';
    case 'admin':
      return 'Admin';
    case 'viewer':
      return 'Viewer';
    default:
      return '成员';
  }
}
