-- 017: 审计日志补 HTTP 状态码（供 T11 错误码分布聚合）
--
-- 背景（TASK-OBS-002 / dev-plan T11）：健康面板需要「按单元的错误码分布」，
-- 但 gateway_audit_logs 只有业务 status（success/failed/rate_limited/...），
-- 没有上游 HTTP 状态码 ⇒ 无法区分硬 4xx / 软 4xx / 5xx / 网络层（breaker.Classify 表 3-1）。
-- 本迁移新增 status_code INTEGER 列，由 worker 失败路径写入 result.Status（HTTP 状态码），
-- 0 = 网络层失败（无 HTTP 响应，语义与 breaker.Classify(status==0) 一致）；NULL = 未回填/成功。
--
-- 字段语义：
--   · NULL      ：成功行或尚未回填（成功行不需要状态码，分布聚合按 status 归 success）
--   · 0         ：网络层失败（连接失败/超时无响应）
--   · 400-599   ：上游 HTTP 状态码（401/403/404/422=硬4xx；408/409/425/429=软4xx；5xx=服务端错误）
--   · 其他      ：保守归软 4xx（与 breaker.Classify 默认分支一致）
--
-- 归属：**完成字段**（与 status/channel_id/provider_model 同列，允许异步终态回填），
-- 身份字段判定保持不变（guard 函数 CREATE OR REPLACE 追加 status_code 到允许回填集）。

ALTER TABLE gateway_audit_logs
    ADD COLUMN IF NOT EXISTS status_code INTEGER;

COMMENT ON COLUMN gateway_audit_logs.status_code IS
    '上游 HTTP 状态码（T11 错误码分布）。NULL=成功或未回填；0=网络层失败（无 HTTP 响应）；'
    '400-599=上游状态码。完成字段，由 worker 失败路径回填（与 breaker.Classify 表 3-1 配套）。';

-- guard 更新：status_code 属于完成字段，允许回填（其余身份字段判定不变）
CREATE OR REPLACE FUNCTION audit_logs_guard() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF current_setting('app.allow_audit_purge', true) IS DISTINCT FROM 'on' THEN
            RAISE EXCEPTION 'audit_logs is append-only: DELETE requires SET LOCAL app.allow_audit_purge = ''on'' (retention job only)';
        END IF;
        RETURN OLD;
    END IF;

    -- UPDATE：身份字段一律不得改动（完成字段允许回填：status/response/error/latency/token/cost/
    -- channel/provider/provider_task_id/status_code）
    IF NEW.request_id   IS DISTINCT FROM OLD.request_id
    OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
    OR NEW.user_id      IS DISTINCT FROM OLD.user_id
    OR NEW.product      IS DISTINCT FROM OLD.product
    OR NEW.model_id     IS DISTINCT FROM OLD.model_id
    OR NEW.mode         IS DISTINCT FROM OLD.mode
    OR NEW.project_id   IS DISTINCT FROM OLD.project_id
    OR NEW.episode_id   IS DISTINCT FROM OLD.episode_id
    OR NEW.asset_id     IS DISTINCT FROM OLD.asset_id
    OR NEW.request_payload IS DISTINCT FROM OLD.request_payload
    OR NEW.job_id       IS DISTINCT FROM OLD.job_id
    OR NEW.created_at   IS DISTINCT FROM OLD.created_at
    THEN
        RAISE EXCEPTION 'audit_logs: identity columns are immutable (only status/response/error/latency/token/cost/channel/provider/provider_task_id/status_code may be filled in)';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_guard ON gateway_audit_logs;
CREATE TRIGGER trg_audit_logs_guard
    BEFORE UPDATE OR DELETE ON gateway_audit_logs
    FOR EACH ROW EXECUTE FUNCTION audit_logs_guard();

-- 索引：健康聚合按 (workspace_id, channel_id, provider_model, created_at) 查错误码分布。
-- 供给单元列是终态回填（014 后）——此前从未建过单元级索引，健康面板按单元聚合
-- 若无索引会全表扫（gateway_audit_logs 是最大表，行数持续增长）。
-- 同时服务错误率突增告警的滚动窗口查询（同索引命中 created_at 前缀）。
CREATE INDEX IF NOT EXISTS idx_gateway_audit_supply_time
    ON gateway_audit_logs (workspace_id, channel_id, provider_model, created_at DESC);
