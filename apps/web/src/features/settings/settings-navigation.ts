// EXPORTS: SETTINGS_NAV, SETTINGS_DEFAULT_PATH, SETTINGS_LEGACY_PATHS, SETTINGS_LEGACY_REDIRECTS,
//          SETTINGS_EXTERNAL_TARGETS, SETTINGS_ROUTES,
//          settingsRelativePath, settingsSectionForPath, visibleSettingsNav,
//          type SettingsNavItem, type SettingsSectionKey, type SettingsLegacyPath
//
// 设置中心信息架构（IA v14 收敛，TASK-IA-001 / ADR-005 D2 终态）：
// 设置中心 = **系统设置域**，只承载系统自身配置 6 区
// 「账号与安全 / 工作区与成员 / 外观 / 通知与默认行为 / 数据与存储 / 关于」。
// 业务对象配置（模型/渠道/凭据/偏好）全部迁出：模型配置→模型中心（模型控制台 6 项），
// 用量/审计唯一入口=模型中心（任务中心「账目」页签移除）。
// 本模块只承载「导航事实」——导航项、层级、旧路径去向；不含 JSX 与图标，
// 因此可被 node --test 直接断言（tests/settings-navigation.test.ts）：
// 「导航被改回 3 项业务 tab」或「旧深链失去落点」都会让测试失败。

export type SettingsSectionKey = 'account' | 'workspace' | 'appearance' | 'notifications' | 'data' | 'about';

export interface SettingsNavItem {
  key: SettingsSectionKey;
  /** 导航与分组文案（业务词，不用内部术语） */
  label: string;
  /** 分组主路由 */
  path: string;
  /** 用户任务一句话（ADR-005 §5 导航可理解性）：渲染在每个分组页面顶部 */
  task: string;
}

/** 顶层导航：6 区系统设置，顺序即产品顺序（IA v14 §三） */
export const SETTINGS_NAV: readonly SettingsNavItem[] = [
  { key: 'account', label: '账号与安全', path: '/settings/account', task: '我的账号、登录与安全设置' },
  { key: 'workspace', label: '工作区与成员', path: '/settings/workspace', task: '工作区信息与成员管理' },
  { key: 'appearance', label: '外观', path: '/settings/appearance', task: '主题、语言与显示偏好' },
  { key: 'notifications', label: '通知与默认行为', path: '/settings/notifications', task: '通知方式与创作默认值' },
  { key: 'data', label: '数据与存储', path: '/settings/data', task: '数据导出、清理与存储用量' },
  { key: 'about', label: '关于', path: '/settings/about', task: '版本、条款与反馈' },
];

/** 默认入口：/settings 落到「外观」（P1 实装区首项，IA v14：偏好内容拆散在设置内导航） */
export const SETTINGS_DEFAULT_PATH = '/settings/appearance';

export interface SettingsLegacyPath {
  from: string;
  /** 最终落点 */
  to: string;
  /** 去向理由（同时是评审依据） */
  why: string;
}

/** v14 §四 重定向全量清单（10 条）：全部必须可达，任何一条 404 都是破坏性变更（ADR-005 §6 不变量） */
export const SETTINGS_LEGACY_PATHS: readonly SettingsLegacyPath[] = [
  {
    from: '/settings/models',
    to: '/models/market',
    why: '模型配置迁出设置中心：模型中心「模型广场」接管（IA v14 §四；M8 目录撤销，落点改广场）',
  },
  {
    from: '/settings/logical-models',
    to: '/models/market',
    why: '逻辑模型管理降级为执行器契约，UI 归模型中心「模型广场」（M8：归属编辑撤下，落点改广场）',
  },
  {
    from: '/settings/models/catalog',
    to: '/models/market',
    why: '目录行视图迁移至模型中心「模型广场」（M8：模型目录撤销）',
  },
  {
    from: '/settings/channels',
    to: '/models/channels',
    why: '渠道配置迁出设置中心：模型中心「渠道」（接入源）接管',
  },
  {
    from: '/settings/channels/protocols',
    to: '/models/channels',
    why: '协议规则降为渠道向导「接入方式」高级区/专家模式（IA v14 §四）',
  },
  {
    from: '/settings/protocols',
    to: '/models/channels',
    why: '同上：协议模板不再独立成页，归渠道接入方式',
  },
  {
    from: '/settings/preferences',
    to: '/settings/appearance',
    why: '偏好拆散迁入设置 6 区：主题/语言→外观；默认模型/路由→通知与默认行为；预算→成本页（IA v14 §四，v8 单一重定向目标）',
  },
  {
    from: '/settings/usage',
    to: '/models/costs',
    why: '用量唯一入口=模型中心「成本与用量」（Owner 2026-10-17 确认；不再指向任务中心账目）',
  },
  {
    from: '/settings/audit',
    to: '/models/audit',
    why: '审计唯一入口=模型中心「审计日志」（Owner 2026-10-17 确认）',
  },
  {
    from: '/models/protocols',
    to: '/models/channels',
    why: '模型中心协议模板占位删除，归渠道接入方式（IA v14 路由稳定性：删 /models/protocols）',
  },
];

/**
 * 需要 <Navigate replace> 的旧路径：落点与自身不同的那几条（单一事实源，app.tsx 直接据此生成路由）。
 * 仅取 /settings/ 前缀（挂到 settings 路由下用 settingsRelativePath）；/models/protocols 的落点
 * 由 app.tsx 的 models 路由手动处理（绝对路径，避免跨一级导航嵌套）。
 */
export const SETTINGS_LEGACY_REDIRECTS: readonly SettingsLegacyPath[] = SETTINGS_LEGACY_PATHS.filter(
  (p) => p.from !== p.to && p.from.startsWith('/settings/'),
);

/**
 * 已迁出设置中心、但仍是**真实应用路由**的落点白名单（IA v14）。
 *
 * 不变量：旧路径落点须在 SETTINGS_ROUTES（仍在设置内）**或**本白名单（模型中心/任务中心）之内，
 * 保证跳转不 404（ADR-005 §6；模型配置/用量/审计迁入模型中心后白名单扩容）。
 */
export const SETTINGS_EXTERNAL_TARGETS: readonly string[] = [
  '/models/market',
  '/models/channels',
  '/models/costs',
  '/models/audit',
  '/tasks?tab=ledger', // 任务中心账目页签移除前仍为其旧深链提供落点（Tasks.tsx 内重定向）
];

/** 设置中心所有可导航路由：用来校验旧路径的落点确实存在，防止跳转到不存在的路由 */
export const SETTINGS_ROUTES: readonly string[] = [
  '/settings',
  ...SETTINGS_NAV.map((n) => n.path),
];

/** '/settings/models/catalog' → 'models/catalog'（挂到 <Route path="settings"> 下时用相对路径） */
export function settingsRelativePath(fullPath: string): string {
  const prefix = '/settings/';
  return fullPath.startsWith(prefix) ? fullPath.slice(prefix.length) : fullPath;
}

/** 当前路径属于哪个分组（/settings/appearance → 外观）；不属于设置中心时返回 undefined */
export function settingsSectionForPath(pathname: string): SettingsNavItem | undefined {
  let matched: SettingsNavItem | undefined;
  for (const item of SETTINGS_NAV) {
    if (pathname === item.path || pathname.startsWith(`${item.path}/`)) {
      if (!matched || item.path.length > matched.path.length) matched = item;
    }
  }
  return matched;
}

/** 角色等级（与 BFF authz.go 对齐，本地最小实现避免循环依赖） */
const ROLE_RANK: Record<string, number> = { member: 0, viewer: 1, admin: 2, owner: 3 };

/**
 * 按角色过滤设置中心顶层导航（TASK-IA-001 v14 权限矩阵）：
 * 系统设置 6 区全员可见（账号/外观/通知/数据=本人可配，工作区写=Admin+，关于=全员），
 * 敏感操作在页面内按角色细分，不隐藏入口。member 及以上均可见全部 6 区；
 * role 未知（''）按 member 处理（fail-safe：不放行任何角色专属项——本矩阵无角色专属导航项）。
 */
export function visibleSettingsNav(role: string): readonly SettingsNavItem[] {
  const rank = ROLE_RANK[role] ?? 0;
  return SETTINGS_NAV.filter(() => rank >= ROLE_RANK.member);
}
