-- 006: 租户级路由策略
--
-- 背景（ADR-003 D3，已确认默认值）：平台渠道（production.model_channels）与
-- 租户自带渠道（本库 user_channels）并存。已确认的默认策略为
-- **平台渠道默认启用、租户自带渠道默认关闭**，用户可自由编辑优先级。
--
--   own_channels_first：自带渠道优先。默认 **false**（"用户关"）
--   platform_fallback ：平台渠道兜底。默认 **true**（"平台开"）
--   max_attempts      ：单次请求最多尝试几个候选渠道。已确认 = 3
--
-- 无记录时按上述默认值处理（读取侧用 COALESCE / 不存在即视为默认），
-- 因此本迁移不播种数据，也不要求每个租户都有行。

CREATE TABLE IF NOT EXISTS workspace_routing_policies (
    workspace_id       text PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    own_channels_first boolean NOT NULL DEFAULT false,
    platform_fallback  boolean NOT NULL DEFAULT true,
    max_attempts       integer NOT NULL DEFAULT 3,
    updated_by         text,
    updated_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT workspace_routing_policies_max_attempts_check CHECK (max_attempts BETWEEN 1 AND 10)
);

COMMENT ON TABLE workspace_routing_policies IS
    '租户级路由策略。缺行时按默认值处理：自带优先=false、平台兜底=true、最多尝试 3 个候选';
COMMENT ON COLUMN workspace_routing_policies.own_channels_first IS
    '自带渠道优先：true 时先试 user_channels，再试平台渠道。**默认 false**（平台渠道默认启用）';
COMMENT ON COLUMN workspace_routing_policies.platform_fallback IS
    '平台渠道兜底：true 时自带渠道全部失败后落到平台渠道。**默认 true**';
COMMENT ON COLUMN workspace_routing_policies.max_attempts IS
    '单次请求最多尝试的候选渠道数（防止上游故障时被切换流量打得更死）。默认 3';
