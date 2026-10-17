// EXPORTS: MODEL_CENTER_NAV, MODEL_CENTER_DEFAULT_PATH, modelCenterSectionForPath,
//          type ModelCenterSectionKey, type ModelCenterNavItem
//
// 模型中心信息架构（IA v14 收敛，TASK-IA-001；TASK-MARKET-M8 收敛为 5 项）：
// 独立一级导航 = 模型控制台 5 项「模型广场 / 渠道 / 成本与用量 / 审计日志 / 健康」。
// 本模块只承载「导航事实」——项、层级、路径；不含 JSX 与图标，因此可被 node --test 直接断言。
// M8（Owner 三轮评审）：能力归属无消费证据（创作流只按类型+启用选模型）→ 归属编辑撤 UI（后端契约保留）；
// 「模型目录」撤销（信息密度不足，展示与广场重叠）→ 导航 6 项 → 5 项；启停归位模型广场（Admin+）。
// 用量唯一入口=模型中心（任务中心「账目」页签移除并重定向）。
// 路由固定 /models/market|channels|costs|audit|health（删 /models/protocols 与 /models/catalog，防重定向链）。

export type ModelCenterSectionKey = 'market' | 'channels' | 'costs' | 'audit' | 'health';

export interface ModelCenterNavItem {
  key: ModelCenterSectionKey;
  /** 导航与分组文案（业务词，不用内部术语） */
  label: string;
  /** 分组主路由 */
  path: string;
  /** 用户任务一句话：渲染在每个页面顶部 */
  task: string;
}

/** 左侧二级导航：5 项，顺序即产品顺序（M8：目录撤销，启停归位广场） */
export const MODEL_CENTER_NAV: readonly ModelCenterNavItem[] = [
  { key: 'market', label: '模型广场', path: '/models/market', task: '真实调用模型与详情，可设为个人创作默认' },
  { key: 'channels', label: '渠道', path: '/models/channels', task: '模型从哪来：渠道接入与连通检测' },
  { key: 'costs', label: '成本与用量', path: '/models/costs', task: '钱花在哪、花多少、趋势如何' },
  { key: 'audit', label: '审计日志', path: '/models/audit', task: '每一次调用的完整记录与归因' },
  { key: 'health', label: '健康', path: '/models/health', task: '供给单元健不健康：成功率、错误码与熔断' },
];

/** 默认入口：/models 落到「成本与用量」（已实装主页面） */
export const MODEL_CENTER_DEFAULT_PATH = '/models/costs';

/** 由 pathname 反查当前分组（未知路径回退 costs，保证壳布局始终有高亮项） */
export function modelCenterSectionForPath(pathname: string): ModelCenterNavItem {
  return (
    MODEL_CENTER_NAV.find((n) => pathname === n.path || pathname.startsWith(`${n.path}/`)) ??
    MODEL_CENTER_NAV.find((n) => n.key === 'costs')!
  );
}

/** 角色等级（与 BFF authz.go / useAuthStore 对齐，本地最小实现避免循环依赖） */
const ROLE_RANK: Record<string, number> = { member: 0, viewer: 1, admin: 2, owner: 3 };

/**
 * 按角色过滤模型中心二级导航（TASK-IA-001 v14 权限矩阵）：
 * 审计日志 = 仅 Owner；其余（广场/目录/渠道/成本/健康）= 全角色——
 * 渠道浏览/连通检测全员可读，接入/凭据/同步上游=Admin+ 在页面内按操作细分（不隐藏入口）。
 * role 未知（''）按 member 处理（fail-safe 隐藏而非误放行）。
 */
export function visibleModelCenterNav(role: string): readonly ModelCenterNavItem[] {
  const rank = ROLE_RANK[role] ?? 0;
  return MODEL_CENTER_NAV.filter((n) => {
    if (n.key === 'audit') return rank >= ROLE_RANK.owner;
    return true;
  });
}
