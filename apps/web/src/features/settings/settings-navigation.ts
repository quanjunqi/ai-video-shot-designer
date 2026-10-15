// EXPORTS: SETTINGS_NAV, SETTINGS_DEFAULT_PATH, SETTINGS_MODEL_SUBVIEWS, SETTINGS_MODEL_CATALOG_PATH,
//          SETTINGS_CHANNEL_RULES_PATH, SETTINGS_LEGACY_PATHS, SETTINGS_LEGACY_REDIRECTS, SETTINGS_ROUTES,
//          settingsRelativePath, settingsSectionForPath, settingsSubViewForPath,
//          type SettingsNavItem, type SettingsSectionKey, type SettingsSubView, type SettingsLegacyPath
//
// 设置中心信息架构（ADR-005 D2/D3 → 经 Owner 决策「方案 A」修订）：顶层导航固定 3 项
// 「模型 / 渠道 / 偏好」。「用量」按方案 A【移出设置中心】—— 设置只放「我在配置什么」，
// 「看运行数据」归任务中心（Task 卡 A2 会在那里提供页签）。
// 本模块只承载「导航事实」——导航项、层级、旧路径去向；不含 JSX 与图标，
// 因此可被 node --test 直接断言（tests/settings-navigation.test.ts）：
// 「导航被改回 6 项」或「旧深链失去落点」都会让测试失败。

export type SettingsSectionKey = 'models' | 'channels' | 'preferences';

export interface SettingsNavItem {
  key: SettingsSectionKey;
  /** 导航与分组文案（业务词，不用内部术语） */
  label: string;
  /** 分组主路由 */
  path: string;
  /** 用户任务一句话（ADR-005 §5 导航可理解性）：渲染在每个分组页面顶部 */
  task: string;
}

/** 顶层导航：3 项，顺序即产品顺序（方案 A：设置只放配置） */
export const SETTINGS_NAV: readonly SettingsNavItem[] = [
  { key: 'models', label: '模型', path: '/settings/models', task: '我能用什么模型来生成' },
  { key: 'channels', label: '渠道', path: '/settings/channels', task: '模型从哪来、连不连得通' },
  { key: 'preferences', label: '偏好', path: '/settings/preferences', task: '这个产品怎么为我工作' },
];

/** 默认入口：/settings 落到「模型」（ADR-005 D2 的第一项） */
export const SETTINGS_DEFAULT_PATH = '/settings/models';

export interface SettingsSubView {
  key: 'capabilities' | 'catalog';
  label: string;
  path: string;
  /** primary = 用户视角的对外能力（顶层）；secondary = 具体模型与渠道绑定（次级信息） */
  level: 'primary' | 'secondary';
  hint: string;
}

export const SETTINGS_MODEL_CATALOG_PATH = '/settings/models/catalog';

/**
 * 「模型」分组内的两个层级（ADR-005 §3 与本次任务的核心区分）：
 * 顶层是逻辑模型（用户视角的「文生图」「图生图」）；
 * 「目录行 + 渠道绑定」是次级信息，标注来源渠道，不与顶层平级。
 */
export const SETTINGS_MODEL_SUBVIEWS: readonly SettingsSubView[] = [
  {
    key: 'capabilities',
    label: '对外能力',
    path: SETTINGS_DEFAULT_PATH,
    level: 'primary',
    hint: '一个稳定的名字（如「文生图」）对应一组候选；调用方只认这个名字，不必知道背后接了哪家渠道',
  },
  {
    key: 'catalog',
    label: '具体模型与来源渠道',
    path: SETTINGS_MODEL_CATALOG_PATH,
    level: 'secondary',
    hint: '每个对外能力实际会调用哪个渠道上的哪个模型、按什么顺序兜底',
  },
];

/** 「协议配置」失去一级导航后的落点：挂在「渠道」下（ADR-005 §3） */
export const SETTINGS_CHANNEL_RULES_PATH = '/settings/channels/protocols';

export interface SettingsLegacyPath {
  from: string;
  /** 最终落点 */
  to: string;
  /** 去向理由（同时是评审依据） */
  why: string;
}

/** 改造前的 6 条 + 方案 A 前的「用量」= 7 条设置路径：全部必须可达，任何一条 404 都是破坏性变更（ADR-005 §3/§6） */
export const SETTINGS_LEGACY_PATHS: readonly SettingsLegacyPath[] = [
  {
    from: '/settings/models',
    to: SETTINGS_DEFAULT_PATH,
    why: '仍是「模型」分组主视图；目录行降为同组次级视图 /settings/models/catalog',
  },
  {
    from: '/settings/logical-models',
    to: SETTINGS_DEFAULT_PATH,
    why: '「逻辑模型管理」升为「模型」主视图（ADR-005 D3）；它本来就是「我能用什么模型」',
  },
  {
    from: '/settings/channels',
    to: '/settings/channels',
    why: '仍是「渠道」主视图；仅不再与「协议配置」平级',
  },
  {
    from: '/settings/protocols',
    to: SETTINGS_CHANNEL_RULES_PATH,
    why: '协议是 HTTP 请求形状的实现细节，取消一级导航后降为「渠道」下的连接规则说明（ADR-005 D2/§3）',
  },
  {
    from: '/settings/audit',
    to: '/tasks?tab=ledger',
    why: '「调用审计」= 运行数据，不是配置。方案 A 把它移出设置中心、归入任务中心的「账目」页签（设置只放「我在配置什么」）',
  },
  {
    from: '/settings/usage',
    to: '/tasks?tab=ledger',
    why: '「用量」按方案 A 移出设置中心：原先它只列逐次调用/失败/耗时 —— 那正是任务中心在做的事，两处重复且数据源不同（jobs vs gateway_audit_logs）。深链改指任务中心，保证不 404',
  },
  {
    from: '/settings/preferences',
    to: '/settings/preferences',
    why: '仍是「偏好」主视图，文案与路径不变',
  },
];

/** 需要 <Navigate replace> 的旧路径：落点与自身不同的那几条（单一事实源，app.tsx 直接据此生成路由） */
export const SETTINGS_LEGACY_REDIRECTS: readonly SettingsLegacyPath[] = SETTINGS_LEGACY_PATHS.filter(
  (p) => p.from !== p.to,
);

/**
 * 已迁出设置中心、但仍是**真实应用路由**的落点白名单（方案 A）。
 *
 * 为什么需要它：ADR-005 §6 原来的不变量是「旧路径落点必须都在设置中心内」。
 * 方案 A 把「用量」移出设置中心 ⇒ 那条不变量必须修订；
 * 但「落点必须是真实存在的路由（不能 404）」这条**不能丢** ——
 * 所以改为：落点须在 SETTINGS_ROUTES（仍在设置内）**或**本白名单（已迁出的 app 路由）之内。
 */
export const SETTINGS_EXTERNAL_TARGETS: readonly string[] = ['/tasks?tab=ledger'];

/** 设置中心所有可导航路由：用来校验旧路径的落点确实存在，防止跳转到不存在的路由 */
export const SETTINGS_ROUTES: readonly string[] = [
  '/settings',
  ...SETTINGS_NAV.map((n) => n.path),
  ...SETTINGS_MODEL_SUBVIEWS.map((s) => s.path),
  SETTINGS_CHANNEL_RULES_PATH,
];

/** '/settings/models/catalog' → 'models/catalog'（挂到 <Route path="settings"> 下时用相对路径） */
export function settingsRelativePath(fullPath: string): string {
  const prefix = '/settings/';
  return fullPath.startsWith(prefix) ? fullPath.slice(prefix.length) : fullPath;
}

/** 当前路径属于哪个分组（/settings/models/catalog → 模型）；不属于设置中心时返回 undefined */
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
 * 按角色过滤设置中心顶层导航（TASK-AUTH-001 设计稿 v2）：
 * 「模型」= Viewer+（只读浏览逻辑模型/目录行）；「渠道」= Admin+；「偏好」= Admin+（Viewer 隐藏）。
 * role 未知（''）按 member 处理（fail-safe 隐藏而非误放行）。
 */
export function visibleSettingsNav(role: string): readonly SettingsNavItem[] {
  const rank = ROLE_RANK[role] ?? 0;
  return SETTINGS_NAV.filter((n) => {
    if (n.key === 'preferences') return rank >= ROLE_RANK.admin;
    if (n.key === 'channels') return rank >= ROLE_RANK.admin;
    return rank >= ROLE_RANK.viewer;
  });
}

/** 当前路径落在「模型」分组的哪个视图上（最长前缀匹配：/settings/models/catalog → 次级视图） */
export function settingsSubViewForPath(pathname: string): SettingsSubView | undefined {
  let matched: SettingsSubView | undefined;
  for (const view of SETTINGS_MODEL_SUBVIEWS) {
    if (pathname === view.path || pathname.startsWith(`${view.path}/`)) {
      if (!matched || view.path.length > matched.path.length) matched = view;
    }
  }
  return matched;
}
