-- 009: 成本上限判定所需索引
--
-- 背景（能力体检发现）：gateway_audit_logs.cost_amount 一直被写入，
-- 但**从未被任何地方用于拦截** —— 成本无上限。008/本项加固引入
-- 「日/月成本上限」后，需要在每次判定时聚合该租户当期花费。
--
-- 该聚合按 (workspace_id, created_at) 过滤；006 已有 5 个索引但无此组合，
-- 故补一个覆盖索引，避免全表扫描（审计表是增长最快的表之一）。

CREATE INDEX IF NOT EXISTS gateway_audit_logs_ws_created_idx
    ON gateway_audit_logs (workspace_id, created_at DESC);

COMMENT ON INDEX gateway_audit_logs_ws_created_idx IS
    '成本上限聚合查询用：按租户 + 时间范围求 SUM(cost_amount)';
