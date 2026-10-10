-- 034: 供给池 —— 中转站/渠道同步来的模型清单（ADR-004 §3.1、D1/D2）
--
-- 定位（ADR-004 D1 三层分离）：供给池 / 产品面 / 执行候选。本表只属于【供给池】。
--
-- ★ 结构性约束（ADR-004 §9 第 4 项，Owner 未提出异议，按强烈建议执行）：
--   本表【不被任何前端或执行路径读取】。同步只写本表；
--   只有经人工【策展】写入 model_catalog 后，模型才可能对外可见。
--   因此这里允许存"上游原样"的脏数据（见下）。
--
-- 号段说明：ADR §6 原计划 027–030，但截至实现时这些号已被占用（仓库到 033）；
--   故顺延为 034–037 —— 仍在 AGENTS.md §12.3 分配给"模型中心/网关"的 024–039 之内。

CREATE TABLE IF NOT EXISTS channel_models (
    channel_id        text NOT NULL REFERENCES model_channels(id) ON DELETE CASCADE,
    provider_model    text NOT NULL,                      -- 上游模型标识（原样）
    display_name      text,
    -- 上游【原样】标签。刻意不加 CHECK（ADR-004 §3.1）：
    --   约束在策展进 model_catalog 时施加；否则上游多一个 audio 标签就会让同步整批失败。
    model_type        text,
    tags              text,
    endpoint_types    jsonb NOT NULL DEFAULT '[]',
    vendor            text,
    raw               jsonb NOT NULL DEFAULT '{}',
    pricing           jsonb NOT NULL DEFAULT '{}',
    remote_created_at timestamptz,
    first_seen_at     timestamptz NOT NULL DEFAULT now(),
    last_seen_at      timestamptz NOT NULL DEFAULT now(),
    -- 非 NULL 表示"上次同步没再看到它"（下架信号）；不删除行，保留历史
    missing_since     timestamptz,
    PRIMARY KEY (channel_id, provider_model)
);

COMMENT ON TABLE channel_models IS
    'ADR-004 供给池：渠道同步来的模型清单。只写不读（前端与执行路径均不读）；经人工策展写入 model_catalog 后才可能对外。';
COMMENT ON COLUMN channel_models.model_type IS
    '上游原样标签（chat/image/video/audio…）。刻意不加 CHECK：约束在策展时施加，避免上游多一个标签就让同步整批失败。';
COMMENT ON COLUMN channel_models.missing_since IS
    '非 NULL = 最近一次同步未再见到该模型（下架信号）。不物理删除，保留历史以支持审计与回溯。';
COMMENT ON COLUMN channel_models.raw IS '上游原始条目原样留存，便于上游字段演进后回溯。';

-- 索引（ADR 未指定，按真实查询选择并说明理由）：
--   1) "这个模型有哪些渠道供得上" —— 策展时的主要查询方向（PK 只覆盖 channel_id 前缀）
CREATE INDEX IF NOT EXISTS channel_models_provider_model_idx
    ON channel_models (provider_model);
--   2) "哪些模型疑似下架" —— 部分索引，只覆盖非 NULL 行，体积可忽略
CREATE INDEX IF NOT EXISTS channel_models_missing_idx
    ON channel_models (channel_id) WHERE missing_since IS NOT NULL;
