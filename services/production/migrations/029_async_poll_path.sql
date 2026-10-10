-- 029: 补齐异步协议模板的 pollPath（轮询路径）
--
-- 背景（真实故障）：008 给两个内置视频模板写了 async.enabled=true，但没写 pollPath。
-- 执行器 engine.go 在 pollPath 为空时会退化到硬编码兜底
--   if async.PollPath == "" { async.PollPath = "/v1/images/tasks/{task_id}" }
-- 于是视频异步任务全部轮询到 /v1/images/tasks/{task_id}（图片任务路径）→ 必然失败。
--
-- 修法：只补 pollPath，其余字段逐字保留。
--   jsonb_set(async, '{pollPath}', ...) 只新增/覆盖 pollPath 一个键，
--   enabled / taskIdField / statusField / doneValue / failValue 原样不动
--   （两个模板的 doneValue/failValue 本就不同：SUCCESS/FAILED vs Success/Failed，不得统一）。
--   管理员若已自定义该行 async 的其它字段，也不会被本迁移覆盖。
--
-- 路径依据（无鉴权 GET 探测，证据见 PR 报告）：
--   pt_builtin_jimeng_video  GET https://api.pearapi.ai/v1/video/generations/<id>       → HTTP 401 （路径存在）
--   pt_builtin_minimax_video GET https://api.minimax.chat/v1/query/video_generation?task_id=<id>
--                            → HTTP 200 + {"base_resp":{"status_code":1004,"status_msg":"login fail: ..."}}
--                              （1004 = 鉴权失败；同前缀近邻路径 /v1/query/video_generation_xyz、
--                                同查询串的 /v1/query/totally-bogus-xyz 均 404，且平台注册的提交路径
--                                POST /v1/video_generation 返回同一 200+1004 签名 ⇒ 该路由确实存在）
--                              与官方 OpenAPI 一致：GET /v1/query/video_generation，task_id 为 query 参数。
--
-- 约束：执行器按 BaseURL + ReplaceAll(pollPath, "{task_id}", id) 拼 URL，
--       故 pollPath 必须以 "/" 开头且包含 "{task_id}" 占位符。
-- 只改这两行数据，不改表结构、不删列、不动其它模板。

-- 即梦视频：/v1/video/generations/{task_id}（401 证据）
UPDATE protocol_templates
SET async = jsonb_set(async, '{pollPath}', to_jsonb('/v1/video/generations/{task_id}'::text), true),
    updated_at = now()
WHERE id = 'pt_builtin_jimeng_video';

-- MiniMax 视频：/v1/query/video_generation?task_id={task_id}（200+1004 鉴权签名 + 官方 OpenAPI）
UPDATE protocol_templates
SET async = jsonb_set(async, '{pollPath}', to_jsonb('/v1/query/video_generation?task_id={task_id}'::text), true),
    updated_at = now()
WHERE id = 'pt_builtin_minimax_video';
