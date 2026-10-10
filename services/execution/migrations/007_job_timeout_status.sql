-- 007: jobs / job_attempts 的 status 允许 'timeout'
--
-- 背景（2026-10-10 审计发现的不一致）：
--   Go 侧 engine.TaskStatus 有 **6** 个取值（executor.go:32-39）：
--     queued / running / succeeded / failed / cancelled / **timeout**
--   且 IsTerminal() 把 timeout 视为终态（executor.go:42-45）。
--   但 001_execution.sql 的 CHECK 只允许 **5** 个（不含 timeout）。
--   → 若执行器按 TaskStatusTimeout 如实持久化，会触发 CHECK 违反；映射为 failed 则丢失
--     「超时」这一可诊断信息（超时与业务失败的处理方式与告警完全不同）。
--
-- 约束名为 PostgreSQL 对内联列约束的自动命名（已用 pg_constraint 实证核实）。
-- 先 DROP IF EXISTS 再 ADD，使本文件可重复执行（迁移执行器无版本跟踪，会重跑全部文件）。
-- 本变更只放宽约束，不触碰任何既有数据。

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'timeout'));

ALTER TABLE job_attempts DROP CONSTRAINT IF EXISTS job_attempts_status_check;
ALTER TABLE job_attempts ADD CONSTRAINT job_attempts_status_check
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'timeout'));
