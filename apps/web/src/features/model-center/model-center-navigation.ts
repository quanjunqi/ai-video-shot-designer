// EXPORTS: MODEL_CENTER_NAV, MODEL_CENTER_DEFAULT_PATH, modelCenterSectionForPath,
//          type ModelCenterSectionKey, type ModelCenterNavItem
//
// 模型中心信息架构（高保真稿 GATE-2 锁版 + T11 新增「健康」）：一级导航独立于设置中心，
// 左侧二级导航 7 项「模型目录 / 模型广场 / 渠道与凭据 / 成本与用量 / 审计日志 / 协议模板 / 健康」。
// 本模块只承载「导航事实」——项、层级、路径；不含 JSX 与图标，因此可被 node --test 直接断言。
// T2-2 实装「成本与用量」「审计日志」，T11 实装「健康」，其余入口渲染「建设中」占位
// （禁僵尸按钮，见 .agents/skills/frontend-quality：未实装入口必须显式占位，不得伪交互）。

export type ModelCenterSectionKey = 'catalog' | 'market' | 'channels' | 'costs' | 'audit' | 'protocols' | 'health';

export interface ModelCenterNavItem {
  key: ModelCenterSectionKey;
  /** 导航与分组文案（业务词，不用内部术语） */
  label: string;
  /** 分组主路由 */
  path: string;
  /** 用户任务一句话：渲染在每个页面顶部 */
  task: string;
}

/** 左侧二级导航：7 项，顺序即产品顺序（高保真稿 GATE-2 + T11 健康） */
export const MODEL_CENTER_NAV: readonly ModelCenterNavItem[] = [
  { key: 'catalog', label: '模型目录', path: '/models/catalog', task: '我接入的模型供应池' },
  { key: 'market', label: '模型广场', path: '/models/market', task: '所有可用模型，按渠道与功能分类浏览' },
  { key: 'channels', label: '渠道与凭据', path: '/models/channels', task: '模型从哪来：渠道、探活与凭据' },
  { key: 'costs', label: '成本与用量', path: '/models/costs', task: '钱花在哪、花多少、趋势如何' },
  { key: 'audit', label: '审计日志', path: '/models/audit', task: '每一次调用的完整记录与归因' },
  { key: 'protocols', label: '协议模板', path: '/models/protocols', task: '渠道与模型的接入协议' },
  { key: 'health', label: '健康', path: '/models/health', task: '供给单元健不健康：成功率、错误码与熔断' },
];

/** 默认入口：/models 落到「成本与用量」（T2-2 唯一实装主页面；其余入口为建设中占位） */
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
 * 按角色过滤模型中心二级导航（TASK-AUTH-001 设计稿 v2）：
 * 审计日志 = 仅 Owner；渠道与凭据 = Admin+；其余（目录/广场/成本/协议/健康）= 全角色。
 * role 未知（''）按 member 处理（fail-safe 隐藏而非误放行）。
 */
export function visibleModelCenterNav(role: string): readonly ModelCenterNavItem[] {
  const rank = ROLE_RANK[role] ?? 0;
  return MODEL_CENTER_NAV.filter((n) => {
    if (n.key === 'audit') return rank >= ROLE_RANK.owner;
    if (n.key === 'channels') return rank >= ROLE_RANK.admin;
    return true;
  });
}
