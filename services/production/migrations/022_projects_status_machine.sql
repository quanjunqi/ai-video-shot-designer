-- 022: 放宽 projects.status 的 CHECK，使项目状态机可用
--
-- 背景（2026-10-10 审计发现的不一致）：
--   001_projects.sql 的约束为 `CHECK (status = 'pending_parse')` —— **只允许一个取值**。
--   而前端 ProjectStatus 有 6 个状态（apps/web/src/types/index.ts）：
--     pending_parse / parsing / awaiting_confirm / in_production / review / archived
--   同时 project.Update 的 sets 里**根本没有 status**（postgres.go:104-137），
--   即服务端目前无法推进项目状态 —— 该列实际是「写入即冻结」。
--
-- 本迁移只解除约束层面的阻塞，使后续实现状态推进成为可能；
-- 服务端状态机本身（合法跃迁、权限、审计）仍需另行实现。
--
-- 既有数据无需清理：旧约束只允许 'pending_parse'，它属于新集合，恒满足。
-- 先 DROP IF EXISTS 再 ADD，保证可重复执行。

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects ADD CONSTRAINT projects_status_check
    CHECK (status IN ('pending_parse', 'parsing', 'awaiting_confirm',
                      'in_production', 'review', 'archived'));
