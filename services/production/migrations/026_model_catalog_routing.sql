-- 026: model_catalog 支持「多渠道候选」—— 路由层的核心
--
-- 关键设计（ADR-003 §3.1）：model_catalog 的一行**天然就是一个上游实现**
-- （渠道 + 协议模板 + provider_model）。因此多行共享同一 logical_model_id
-- 即为该逻辑模型的**候选渠道集合** —— 无需新增绑定表。
--
-- 不同渠道的 provider_model 不一致**不是问题**：它是行级字段，各候选可互不相同
-- （例：gpt-image-1 / openai/gpt-image-1 / gpt-image-1-2025-04-23）。
--
-- 向后兼容：logical_model_id 可为 NULL。NULL 行保持既有行为
-- （外部仍按 model_catalog.id 直接调用），存量 16 行与全部执行器不受影响。

ALTER TABLE model_catalog ADD COLUMN IF NOT EXISTS logical_model_id text;
ALTER TABLE model_catalog ADD COLUMN IF NOT EXISTS route_priority integer NOT NULL DEFAULT 100;

-- 外键：逻辑模型被删除时，候选行保留但解绑（不级联删除，避免误删上游配置）
ALTER TABLE model_catalog DROP CONSTRAINT IF EXISTS model_catalog_logical_model_fk;
ALTER TABLE model_catalog ADD CONSTRAINT model_catalog_logical_model_fk
    FOREIGN KEY (logical_model_id) REFERENCES logical_models(id) ON DELETE SET NULL;

ALTER TABLE model_catalog DROP CONSTRAINT IF EXISTS model_catalog_route_priority_check;
ALTER TABLE model_catalog ADD CONSTRAINT model_catalog_route_priority_check CHECK (route_priority >= 0);

-- 路由解析按 (逻辑模型, 启用状态, 优先级) 取候选；部分索引避免为 NULL 行付代价
CREATE INDEX IF NOT EXISTS model_catalog_routing_idx
    ON model_catalog (logical_model_id, status, route_priority)
    WHERE logical_model_id IS NOT NULL;

COMMENT ON COLUMN model_catalog.logical_model_id IS
    '所属逻辑模型；同一 logical_model_id 的多行为候选渠道（路由顺序由 route_priority 决定）。NULL = 未纳入路由，行为同改动前';
COMMENT ON COLUMN model_catalog.route_priority IS
    '路由优先级，**小者优先**。默认 100；建议留出间隔（10/20/30）便于插入';
