-- 011: 审计日志的「身份不可变」约束 + 修正误导性表注释（④ D8a）
--
-- 背景（真实矛盾，必须先说清）：
--   表注释写着「网关审计日志…**不可变追加**」，但
--     (a) 表上【没有任何触发器】，且
--     (b) 代码里确实存在 UPDATE —— D2/D3 用 UpdateResultByJobID 回填**任务终态**
--         （status / response_payload / latency_ms / token_* / cost_* / provider_task_id）。
--   ⇒ **"禁止一切修改"会直接打掉 D2**。所以本迁移不写"绝对不可变"，
--     而是区分两类字段：
--       · **身份字段**：永不可改（改了就不是"那条历史"了）
--       · **完成字段**：允许回填（这正是异步任务把终态写回去的方式）
--
-- DELETE 的处理：
--   保留期清理（D6）需要 DELETE。故 DELETE 默认【拒绝】，
--   仅当会话显式打开开关时放行：
--       SET LOCAL app.allow_audit_purge = 'on';
--   这样"清理任务"能删，"顺手删一条"不能删 —— 而删除动作本身应被审计（D6 再做）。

CREATE OR REPLACE FUNCTION audit_logs_guard() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF current_setting('app.allow_audit_purge', true) IS DISTINCT FROM 'on' THEN
            RAISE EXCEPTION 'audit_logs is append-only: DELETE requires SET LOCAL app.allow_audit_purge = ''on'' (retention job only)';
        END IF;
        RETURN OLD;
    END IF;

    -- UPDATE：身份字段一律不得改动
    IF NEW.request_id   IS DISTINCT FROM OLD.request_id
    OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
    OR NEW.user_id      IS DISTINCT FROM OLD.user_id
    OR NEW.product      IS DISTINCT FROM OLD.product
    OR NEW.model_id     IS DISTINCT FROM OLD.model_id
    OR NEW.channel_id   IS DISTINCT FROM OLD.channel_id
    OR NEW.provider_model IS DISTINCT FROM OLD.provider_model
    OR NEW.mode         IS DISTINCT FROM OLD.mode
    OR NEW.project_id   IS DISTINCT FROM OLD.project_id
    OR NEW.episode_id   IS DISTINCT FROM OLD.episode_id
    OR NEW.asset_id     IS DISTINCT FROM OLD.asset_id
    OR NEW.request_payload IS DISTINCT FROM OLD.request_payload
    OR NEW.job_id       IS DISTINCT FROM OLD.job_id
    OR NEW.created_at   IS DISTINCT FROM OLD.created_at
    THEN
        RAISE EXCEPTION 'audit_logs: identity columns are immutable (only status/response/error/latency/token/cost/provider_task_id may be filled in)';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_guard ON gateway_audit_logs;
CREATE TRIGGER trg_audit_logs_guard
    BEFORE UPDATE OR DELETE ON gateway_audit_logs
    FOR EACH ROW EXECUTE FUNCTION audit_logs_guard();

-- 修正误导性注释：把"不可变追加"改成【实际约定】
COMMENT ON TABLE gateway_audit_logs IS
    '网关调用审计日志。约定（由 trg_audit_logs_guard 强制，见迁移 011）：'
    '① 身份字段（request_id/workspace_id/user_id/product/model_id/channel_id/provider_model/mode/'
    'project_id/episode_id/asset_id/request_payload/job_id/created_at）【永不可改】；'
    '② 完成字段（status/response_payload/error_message/latency_ms/token_*/cost_*/provider_task_id）'
    '可由异步任务回填终态；'
    '③ DELETE 默认拒绝，仅保留期清理任务在 SET LOCAL app.allow_audit_purge = ''on'' 下可删。';
