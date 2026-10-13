-- 014: 供给单元（channel_id / provider_model）由「身份字段」转为「可回填完成字段」
--
-- 背景（T1 验收暴露的真实矛盾）：
--   迁移 011 把 channel_id / provider_model 归为**身份字段**（永不可改），
--   理由是「改了就不是那条历史」。但 T1（审计业务归因）的异步路径设计是：
--   submit-time 审计行在【任务提交时】创建 —— 此时调用方只声明了逻辑模型
--   （model_id，身份字段，提交即锁定），而**实际命中哪条渠道、哪个上游模型
--   （供给单元）是 execution 运行时 PickForAttempt 的结果，提交时未知**。
--   ⇒ worker 终态回填 channel_id / provider_model 是「补全运行事实」，
--     被 011 触发器拦截（真机验证：ERROR: identity columns are immutable）。
--
-- 语义澄清（两类字段各归其位）：
--   · 身份字段（仍不可改）：request_id / workspace_id / user_id / product /
--     model_id / mode / project_id / episode_id / asset_id / request_payload /
--     job_id / created_at —— 调用方提交时声明的事实，改了就不是那条记录。
--   · 完成字段（允许回填）：status / response_payload / error_message /
--     latency_ms / token_* / cost_* / provider_task_id —— 新增：
--     **channel_id / provider_model**（运行时命中结果，与 status 同步回填）。
--
-- 只增不改：011 保持原样，本迁移 CREATE OR REPLACE 覆盖 guard 函数与注释。

CREATE OR REPLACE FUNCTION audit_logs_guard() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF current_setting('app.allow_audit_purge', true) IS DISTINCT FROM 'on' THEN
            RAISE EXCEPTION 'audit_logs is append-only: DELETE requires SET LOCAL app.allow_audit_purge = ''on'' (retention job only)';
        END IF;
        RETURN OLD;
    END IF;

    -- UPDATE：身份字段一律不得改动（channel_id / provider_model 已于 014 移出，
    -- 作为运行时命中结果允许终态回填 —— 见下方注释）
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
        RAISE EXCEPTION 'audit_logs: identity columns are immutable (only status/response/error/latency/token/cost/channel/provider/provider_task_id may be filled in)';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_guard ON gateway_audit_logs;
CREATE TRIGGER trg_audit_logs_guard
    BEFORE UPDATE OR DELETE ON gateway_audit_logs
    FOR EACH ROW EXECUTE FUNCTION audit_logs_guard();

-- 修正注释：供给单元属于完成字段（014）
COMMENT ON TABLE gateway_audit_logs IS
    '网关调用审计日志。约定（由 trg_audit_logs_guard 强制，见迁移 011/014）：'
    '① 身份字段（request_id/workspace_id/user_id/product/model_id/mode/'
    'project_id/episode_id/asset_id/request_payload/job_id/created_at）【永不可改】；'
    '② 完成字段（status/response_payload/error_message/latency_ms/token_*/cost_*/'
    'provider_task_id/**channel_id/provider_model**）可由异步任务回填终态'
    '（channel/provider 为运行时命中结果，与 status 同步回填，014）；'
    '③ DELETE 默认拒绝，仅保留期清理任务在 SET LOCAL app.allow_audit_purge = ''on'' 下可删。';
