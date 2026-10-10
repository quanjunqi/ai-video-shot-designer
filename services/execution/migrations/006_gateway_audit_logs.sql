-- 006_gateway_audit_logs.sql
-- 网关调用审计日志表：记录每次AI模型调用的完整审计信息
-- 遵循项目架构规范：Execution服务拥有Job/Attempt/审计/用量数据

CREATE TABLE IF NOT EXISTS gateway_audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    request_id      TEXT NOT NULL,                              -- 全局唯一追踪ID
    workspace_id    TEXT NOT NULL,                              -- 租户ID
    project_id      TEXT NOT NULL DEFAULT '',                   -- 项目ID（智能创造/画布可为空）
    episode_id      TEXT NOT NULL DEFAULT '',                   -- 剧集ID
    asset_id        TEXT NOT NULL DEFAULT '',                   -- 资产ID
    user_id         TEXT NOT NULL DEFAULT '',                   -- 调用用户ID
    product         TEXT NOT NULL DEFAULT '',                   -- 产品来源：comic/canvas/create
    model_id        TEXT NOT NULL,                              -- 模型ID
    channel_id      TEXT NOT NULL DEFAULT '',                   -- 渠道ID
    provider_model  TEXT NOT NULL DEFAULT '',                   -- 供应商模型标识
    mode            TEXT NOT NULL,                              -- 调用模式：text-to-image/image-to-image/text-chat/video
    request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,         -- 请求参数（脱敏后）
    response_payload JSONB,                                     -- 响应结果（成功时）
    error_message   TEXT NOT NULL DEFAULT '',                   -- 错误信息（失败时）
    status          TEXT NOT NULL,                              -- success/failed/rate_limited/cancelled
    latency_ms      INTEGER NOT NULL DEFAULT 0,                 -- 总耗时（毫秒）
    token_input     INTEGER NOT NULL DEFAULT 0,                 -- 输入Token数
    token_output    INTEGER NOT NULL DEFAULT 0,                 -- 输出Token数
    token_cached    INTEGER NOT NULL DEFAULT 0,                 -- 缓存Token数
    cost_amount     NUMERIC(12,6) NOT NULL DEFAULT 0,           -- 本次调用成本
    cost_currency   TEXT NOT NULL DEFAULT 'CNY',                -- 成本币种
    job_id          TEXT NOT NULL DEFAULT '',                   -- 关联的Job ID（异步任务）
    provider_task_id TEXT NOT NULL DEFAULT '',                  -- 供应商任务ID
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()          -- 调用时间
);

-- 索引：按租户和时间查询
CREATE INDEX IF NOT EXISTS idx_gateway_audit_workspace_time
    ON gateway_audit_logs (workspace_id, created_at DESC);

-- 索引：按项目查询
CREATE INDEX IF NOT EXISTS idx_gateway_audit_project
    ON gateway_audit_logs (workspace_id, project_id, created_at DESC);

-- 索引：按模型查询
CREATE INDEX IF NOT EXISTS idx_gateway_audit_model
    ON gateway_audit_logs (workspace_id, model_id, created_at DESC);

-- 索引：按request_id唯一查询
CREATE UNIQUE INDEX IF NOT EXISTS idx_gateway_audit_request_id
    ON gateway_audit_logs (request_id);

-- 索引：按状态查询
CREATE INDEX IF NOT EXISTS idx_gateway_audit_status
    ON gateway_audit_logs (workspace_id, status, created_at DESC);

-- 表注释
COMMENT ON TABLE gateway_audit_logs IS '网关调用审计日志：记录每次AI模型调用的完整审计信息，不可变追加';
COMMENT ON COLUMN gateway_audit_logs.product IS '产品来源：comic=漫剧工坊, canvas=无限画布, create=智能创造';
COMMENT ON COLUMN gateway_audit_logs.mode IS '调用模式：text-chat/text-to-image/image-to-image/text-to-video/image-to-video/audio';
COMMENT ON COLUMN gateway_audit_logs.status IS '调用状态：success/failed/rate_limited/cancelled/timeout';
