-- 010: 任务结果与原始意图分离（jobs.result_payload）
--
-- 背景（真机验收发现）：job.Store.Complete 曾把**结果** payload 写进 intent_payload，
-- 于是任务成功后原始意图参数被覆盖，/api/v1/tasks 返回里出现
-- "intent_payload":{"result":{...}} —— 意图（模型/提示词/参数）不可再读，
-- 且重试时 worker 从 intent_payload 解析 modelId 会失败。
--
-- 本迁移**只新增列、不回填**：历史行的结果仍留在 intent_payload 的 "result" 键下，
-- 由读取路径归一化（store.go: normalizeLegacyResult）在返回时提升为 result_payload，
-- 因此新旧行在 API 上表现一致，无需数据搬迁、也不改写任何历史行的 intent_payload。

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS result_payload jsonb;

COMMENT ON COLUMN jobs.result_payload IS
    '任务完成后由 worker 写入的结果 payload（模型输出与提取产物）；与 intent_payload（原始意图，永不被结果覆盖）分离。为 NULL 表示无结果；010 之前的历史行结果仍在 intent_payload 的 "result" 键下，由读取路径归一化兼容。';
