-- TASK-AUTH-001：开发走查三角色种子（T13 判据 5 需要 owner/admin/viewer 身份切换）。
-- 与 001 中 user_dev(owner) 幂等共存；Admin 视角复用 user_admin，Viewer 视角复用 user_viewer。
INSERT INTO workspace_members (workspace_id, actor_id, role)
VALUES
  ('ws_dev', 'user_dev', 'owner'),
  ('ws_dev', 'user_admin', 'admin'),
  ('ws_dev', 'user_viewer', 'viewer')
ON CONFLICT (workspace_id, actor_id) DO NOTHING;
