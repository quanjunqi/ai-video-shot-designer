-- 009: 预算规则表（budget_rules）
--
-- 背景（dev-plan v1.3 §2/§7 T3 / ADR-004）：成本治理从"看得见"推进到"拦得住"。
-- 防超支机制：按【租户/工作区 × 日/月】两级配置预算上限与动作（告警/拦截）。
-- 本表由 workspace 服务持有（配置属租户领域），execution 经内部 API 读取生效规则
-- 做请求前校验（读侧字段以本表为唯一事实源，禁止 execution 本地缓存规则副本 ——
-- 规则变更应立即生效，缓存只在单次请求内）。
--
-- 语义：
--   · scope           : tenant（租户级，对全部工作区生效）/ workspace（工作区级，优先于租户级）
--   · period          : day / month 周期
--   · limit_amount    : 上限金额（CNY，decimal 语义禁 float64）
--   · action          : warn（只告警不拦截）/ block（超限拦截）
--   · warn_at         : 告警阈值比例（0.8 = 用满 80% 告警；0.95 = 用满 95% 告警）
--   · enabled         : 生效开关；false = 规则不参与校验（fail-open 的"显式关闭"通道）

CREATE TABLE IF NOT EXISTS budget_rules (
    id           text NOT NULL PRIMARY KEY,
    workspace_id text NOT NULL,                -- scope=workspace 时指具体工作区；scope=tenant 时须为 ''（租户级）
    scope        text NOT NULL CHECK (scope IN ('tenant', 'workspace')),
    period       text NOT NULL CHECK (period IN ('day', 'month')),
    limit_amount numeric(18,4) NOT NULL CHECK (limit_amount > 0),
    action       text NOT NULL CHECK (action IN ('warn', 'block')),
    warn_at      numeric(4,2) NOT NULL DEFAULT 0.80 CHECK (warn_at > 0 AND warn_at < 1),
    enabled      boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, scope, period)
);

COMMENT ON TABLE budget_rules IS
    '预算规则（租户/工作区 × 日/月）。workspace 服务持有配置，execution 经内部 API 读取生效规则做请求前校验。'
    'scope=tenant 且 workspace_id='''' 表示租户级（全部工作区生效）；scope=workspace 表示工作区级（优先覆盖租户级）。'
    '防超支机制核心：请求前校验累计已用 vs 上限，block 超限拦截 / warn 或阈值告警。';

COMMENT ON COLUMN budget_rules.limit_amount IS
    '周期预算上限金额（CNY）。decimal(18,4)，禁止 float64 金额（BE-DATA-001）。';

COMMENT ON COLUMN budget_rules.action IS
    '超限动作：block=超限拦截请求（返回明确配额错误码）；warn=不拦截仅告警。'
    '无论 action 为何，达到 warn_at 阈值都写审计标记/日志告警。';

COMMENT ON COLUMN budget_rules.warn_at IS
    '告警阈值比例（0-1 之间）。默认 0.80；任务卡要求 80%/95% 双阈值，'
    '实现为 warn_at=0.80 触发常规告警、0.95 触发严重告警（两级阈值）。';
