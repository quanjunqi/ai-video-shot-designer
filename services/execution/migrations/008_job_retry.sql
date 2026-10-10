-- 008: jobs 支持自动重试与死信
--
-- 背景（能力体检发现）：
--   worker 在 executeJob 中遇到任何失败都直接 Complete(false) → **进入终态**。
--   jobs.attempt 字段存在但从不被写入，job_attempts 也无法体现重试历史。
--   后果：上游抖动一次（超时/5xx/限流）= 任务永久失败，用户只能手动重试；
--   且没有任何地方记录「放弃重试」，无法区分「刚失败待重试」与「已耗尽」。
--
-- 本迁移只加列与索引，不改既有语义；重试策略由应用层实现。
--
-- 先 DROP IF EXISTS 再 ADD 约束，保证迁移可重复执行
-- （执行器已有版本跟踪，但保持与 007 一致的习惯）。

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS dead_lettered_at timestamptz;

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_max_attempts_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_max_attempts_check CHECK (max_attempts > 0);

-- 认领查询按 (status, next_attempt_at) 过滤：退避等待中的任务不应被立即认领
CREATE INDEX IF NOT EXISTS jobs_claim_idx ON jobs (status, next_attempt_at);

-- 死信可单独查询（排障与告警）
CREATE INDEX IF NOT EXISTS jobs_dead_letter_idx ON jobs (dead_lettered_at) WHERE dead_lettered_at IS NOT NULL;

COMMENT ON COLUMN jobs.next_attempt_at IS '下次可被认领时间；退避重试时后移（worker 只认领 <= now() 的任务）';
COMMENT ON COLUMN jobs.max_attempts IS '最大尝试次数（含首次）';
COMMENT ON COLUMN jobs.dead_lettered_at IS '重试耗尽、进入死信的时间；NULL 表示未进死信';
