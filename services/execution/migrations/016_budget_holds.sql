-- 016: 预算预扣/结算状态机表（budget_holds）
--
-- 背景（dev-plan v1.3 §3.6 / T3）：异步任务的成本防超支不能只靠"请求前看累计"
-- ——并发提交会在看到对方之前全部放行。预扣/结算状态机把"预计要花的上限"先扣下
-- （预扣即封顶），执行完按实际结算、退差额。
--
-- 状态机（单一 status 字段，BE-DATA-004）：
--   pending  → 预扣金额写入（提交任务时，按模型权威价估算上限）
--   settled  → 任务成功：按实际成本结算，退还 预扣-实际 差额
--   released → 任务失败/取消：全部退扣
-- 迁移只增不改；原子 UPDATE 防并发（BE-CONC-002：禁读改写）。
--
-- 语义：
--   · job_id            : 关联任务（唯一，一行一任务——每个任务最多一个预扣行）
--   · workspace_id      : 预算归属工作区
--   · period            : day/month（与 budget_rules 同口径）
--   · status            : pending / settled / released
--   · hold_amount       : 预扣金额（估算上限）
--   · actual_amount     : 实际成本（结算时写入）
--   · refund_amount     : 退还差额（结算或退扣时写入）
--   · fail_open         : 预扣/结算系统故障时放行标记（见 execution budget 包）

CREATE TABLE IF NOT EXISTS budget_holds (
    id            text NOT NULL PRIMARY KEY,
    job_id        text NOT NULL,
    workspace_id  text NOT NULL,
    period        text NOT NULL CHECK (period IN ('day', 'month')),
    status        text NOT NULL CHECK (status IN ('pending', 'settled', 'released')),
    hold_amount   numeric(18,4) NOT NULL,
    actual_amount numeric(18,4) NOT NULL DEFAULT 0,
    refund_amount numeric(18,4) NOT NULL DEFAULT 0,
    fail_open     boolean NOT NULL DEFAULT false,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    settled_at    timestamptz,
    UNIQUE (job_id)
);

COMMENT ON TABLE budget_holds IS
    '预算预扣/结算状态机（execution 服务持有运行时状态）。异步任务提交时按模型权威价预扣'
    '估算上限（预扣即封顶防并发超支）；成功按实际成本结算退差额；失败/取消全部退扣。'
    '唯一键 job_id：每个任务最多一个预扣行。原子 UPDATE 防并发覆盖（BE-CONC-002）。';

COMMENT ON COLUMN budget_holds.status IS
    '状态机单一字段：pending（预扣生效，金额计入已用封顶）/ settled（成功结算，退差额）/'
    'released（失败或取消，全部退扣）。迁移只增不改，历史行不报错（判据 3 例外）。';

COMMENT ON COLUMN budget_holds.fail_open IS
    '故障放行标记：预算系统故障时本行以 fail_open=true 记录"未校验/未预扣"，请求放行'
    '（fail-open 语义，禁 fail-closed 误伤全部请求）。故障恢复后恢复正常校验。';
