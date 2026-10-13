-- 013 审计业务归因列（T1，dev-plan §7 T1 / 方案 §3.7）
-- 目标：gateway_audit_logs 可回答「钱花在哪个项目/分镜/功能」。
-- 只增不改：audit 补 shot_id/feature（project/episode/asset 已存在）；jobs 补 feature（与 episode/shot 同构）。

ALTER TABLE gateway_audit_logs
    ADD COLUMN shot_id   TEXT NOT NULL DEFAULT '',  -- 分镜ID（业务归因）
    ADD COLUMN feature   TEXT NOT NULL DEFAULT '';  -- 功能点（如 storyboard/text-to-image）

ALTER TABLE jobs
    ADD COLUMN feature   TEXT NOT NULL DEFAULT '';  -- 功能点（intent 上下文透传）

COMMENT ON COLUMN gateway_audit_logs.shot_id IS '分镜ID（业务归因；缺失置空容忍，不阻塞主流程）';
COMMENT ON COLUMN gateway_audit_logs.feature IS '功能点（业务归因，如 storyboard / text-to-image；与产品 UI 功能名同源）';
COMMENT ON COLUMN jobs.feature IS '功能点（intent 上下文透传 → audit；缺失置空容忍）';
