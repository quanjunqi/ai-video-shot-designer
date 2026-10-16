// AUTH 状态（TASK-AUTH-001 前端角色控制）
// 身份唯一事实源：BFF `GET /api/v1/me`（workspace 成员授权端点解析角色）。
// 角色等级与 BFF authz.go / production authz.go 对齐：
// member(0) < viewer(1) < admin(2) < owner(3)；editor 由后端映射为 admin。
import { create } from 'zustand';

export type ActorRole = 'owner' | 'admin' | 'viewer' | 'member';
export type AuthStatus = 'loading' | 'ready' | 'error';

export const ROLE_RANK: Record<ActorRole, number> = {
  member: 0,
  viewer: 1,
  admin: 2,
  owner: 3,
};

export interface DevActorOption {
  actorId: string;
  label: string;
  role: ActorRole;
}

/** dev 身份切换下拉的三角色（对应 workspace 迁移 020 种子：ws_dev/user_dev|user_admin|user_viewer） */
export const DEV_ACTORS: readonly DevActorOption[] = [
  { actorId: 'user_dev', label: 'Owner · user_dev', role: 'owner' },
  { actorId: 'user_admin', label: 'Admin · user_admin', role: 'admin' },
  { actorId: 'user_viewer', label: 'Viewer · user_viewer', role: 'viewer' },
];

interface MeResponse {
  workspace_id: string;
  actor_id: string;
  role: ActorRole;
}

interface AuthState {
  status: AuthStatus;
  workspaceId: string;
  actorId: string;
  role: ActorRole;
  /** 启动/切换身份后拉取 /api/v1/me；失败时降级为最低档（fail-safe 隐藏而非误放行） */
  hydrate(): Promise<void>;
  /** dev-only：切换走查身份（改 X-Actor-Id 后重新拉取角色） */
  switchDevActor(actorId: string): Promise<void>;
  /** 角色是否达到最低档（含等于） */
  hasAtLeast(min: ActorRole): boolean;
}

async function fetchMe(): Promise<MeResponse | null> {
  try {
    // TASK-AUTH-002：dev 身份切换链路修复——fetchMe 必须透传当前 dev 身份，
    // 否则 BFF authorize() 对缺省头回退 devActor（恒 owner），三角色导航过滤永不生效。
    // 来源与 devActorInitial() 同一契约（localStorage['mdp-dev-actor']），避免依赖 store 闭包时序；
    // PROD 下不带头，走真实身份路径（行为与修复前一致）。
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (import.meta.env.DEV) {
      const saved = typeof window !== 'undefined' ? window.localStorage.getItem('mdp-dev-actor') : null;
      if (saved && DEV_ACTOR_BY_ID.has(saved)) headers['X-Actor-Id'] = saved;
    }
    const resp = await fetch('/api/v1/me', { headers, cache: 'no-store' });
    if (!resp.ok) return null;
    const body = (await resp.json()) as MeResponse;
    if (!body.role) return null;
    return body;
  } catch {
    return null;
  }
}

const DEV_ACTOR_BY_ID = new Map(DEV_ACTORS.map((d) => [d.actorId, d]));

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'loading',
  workspaceId: '',
  actorId: '',
  role: 'member', // 未拉到身份前按最低档（fail-safe：不误放行仅 owner/admin 的功能）
  hydrate: async () => {
    const me = await fetchMe();
    if (!me) {
      set({ status: 'error' });
      return;
    }
    set({ status: 'ready', workspaceId: me.workspace_id, actorId: me.actor_id, role: me.role });
  },
  switchDevActor: async (actorId: string) => {
    // dev-only 走查：本地 localStorage 记住，BFF 端 X-Actor-Id 覆盖 devActor
    try {
      localStorage.setItem('mdp-dev-actor', actorId);
    } catch {
      // 隐私模式等场景忽略
    }
    set({ actorId, status: 'loading' });
    await get().hydrate();
  },
  hasAtLeast: (min: ActorRole) => {
    const rank = ROLE_RANK[get().role] ?? 0;
    return rank >= ROLE_RANK[min];
  },
}));

/** 供 client.ts request() 惰性读取身份头（避免 store↔client 循环 import 初始化问题） */
export function authHeaders(): Record<string, string> {
  const { actorId, workspaceId, status } = useAuthStore.getState();
  const headers: Record<string, string> = {};
  if (status === 'ready' && workspaceId) headers['X-Workspace-Id'] = workspaceId;
  if (status === 'ready' && actorId) headers['X-Actor-Id'] = actorId;
  return headers;
}

/** dev 模式下初始身份（localStorage 记忆 + 默认 owner） */
export function devActorInitial(): string {
  if (typeof window === 'undefined') return 'user_dev';
  try {
    const saved = localStorage.getItem('mdp-dev-actor');
    if (saved && DEV_ACTOR_BY_ID.has(saved)) return saved;
  } catch {
    // ignore
  }
  return 'user_dev';
}
