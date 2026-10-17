// 工作区信息 API（TASK-SETTINGS-P3B）：BFF `GET /api/v1/workspace`（read=roleMember 矩阵）。
// DEV 下透传当前 dev 身份（localStorage['mdp-dev-actor'] → X-Actor-Id，与 fetchMe 同一契约）；
// PROD 不带头走真实身份路径。失败返回 null（调用方降级静态值）。

export interface WorkspaceInfo {
  id: string;
  name: string;
  created_at: string; // RFC3339，来自 workspace 服务
}

export async function fetchWorkspaceInfo(): Promise<WorkspaceInfo | null> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (import.meta.env.DEV) {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('mdp-dev-actor') : null;
    if (saved) headers['X-Actor-Id'] = saved;
  }
  try {
    const resp = await fetch('/api/v1/workspace', { headers, cache: 'no-store' });
    if (!resp.ok) return null;
    const body = (await resp.json()) as WorkspaceInfo | null;
    return body && typeof body?.id === 'string' && typeof body?.name === 'string' ? body : null;
  } catch {
    return null;
  }
}
