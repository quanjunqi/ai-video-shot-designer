// 工作区成员 API（TASK-SETTINGS-P3A）：BFF `GET /api/v1/workspace/members`（admin+ 矩阵守卫）。
// DEV 下透传当前 dev 身份（localStorage['mdp-dev-actor'] → X-Actor-Id，与 fetchMe 同一契约）；
// PROD 不带头走真实身份路径。失败返回 null（调用方降级演示态）。
import type { ActorRole } from '@/stores/useAuthStore';

export interface WorkspaceMember {
  workspace_id: string;
  actor_id: string;
  role: ActorRole;
}

export async function fetchWorkspaceMembers(): Promise<WorkspaceMember[] | null> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (import.meta.env.DEV) {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('mdp-dev-actor') : null;
    if (saved) headers['X-Actor-Id'] = saved;
  }
  try {
    const resp = await fetch('/api/v1/workspace/members', { headers, cache: 'no-store' });
    if (!resp.ok) return null;
    const body = (await resp.json()) as { items?: WorkspaceMember[] };
    return Array.isArray(body?.items) ? body.items : null;
  } catch {
    return null;
  }
}
