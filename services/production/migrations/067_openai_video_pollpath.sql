-- 067: 修正 pt_builtin_openai_video 异步轮询 pollPath 占位符（TASK-PROTOCOL-005）
--
-- 背景（执行器硬约束）：execution/internal/engine/engine.go 异步轮询拼 URL 是
--   pollURL := strings.TrimRight(creds.BaseURL, "/") + strings.ReplaceAll(async.PollPath, "{task_id}", taskID)
-- 因此 pollPath 必须含 "{task_id}" 字面量，否则 ReplaceAll 无目标，
-- 所有任务的轮询 URL 都是同一个（/v1/videos/{id}）——真 bug（061 迁移写入 {id}）。
--
-- 修复：pollPath 改为 /v1/videos/{task_id}（执行器替换 {task_id} 为任务 id）。
-- 幂等：WHERE 限定旧值，重复执行零影响。只改 openai_video 一行，号段 060-069（production 模型中心）。
UPDATE protocol_templates
SET async = jsonb_set(async, '{pollPath}', '"/v1/videos/{task_id}"', false)
WHERE id = 'pt_builtin_openai_video'
  AND async->>'pollPath' = '/v1/videos/{id}';
