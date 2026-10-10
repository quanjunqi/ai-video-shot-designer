-- 025: 逻辑模型（对外统一标识）—— 模型聚合网关路由层的基础
--
-- 背景（ADR-003）：原先 model_catalog 带 channel_id，即「一行模型只绑一个渠道」，
-- 无失败切换 —— 外部看到的是「一个模型 = 一个渠道」，某家上游故障即整体不可用。
-- 这只是在列渠道，不是聚合。聚合要求：对外是「逻辑模型」（能力型标识），
-- 内部再路由到具体渠道。
--
-- 本表只存「对外标识」；具体上游落点仍在 model_catalog（其 provider_model 为行级字段，
-- 因此同一个逻辑模型下各渠道的模型 id 可以互不相同 —— 见 026）。
--
-- 取值刻意与 model_catalog 现有约束保持一致（照抄实测结果，不引入新取值）：
--   type   : text / image / video   （注意：**暂无 audio** —— 未来接入音频模型时
--                                    需同时放宽本表与 model_catalog 的 type 约束）
--   status : enabled / disabled

CREATE TABLE IF NOT EXISTS logical_models (
    id          text PRIMARY KEY,
    label       text NOT NULL,
    type        text NOT NULL,
    capability  text,
    status      text NOT NULL DEFAULT 'enabled',
    sort        integer NOT NULL DEFAULT 100,
    note        text,
    created_by  text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT logical_models_type_check CHECK (type IN ('text', 'image', 'video')),
    CONSTRAINT logical_models_status_check CHECK (status IN ('enabled', 'disabled')),
    CONSTRAINT logical_models_sort_check CHECK (sort >= 0)
);

CREATE INDEX IF NOT EXISTS logical_models_status_idx ON logical_models (status, sort);

COMMENT ON TABLE logical_models IS
    '对外统一的「逻辑模型」（能力型标识）。调用方只认它，不感知实际渠道；具体上游落点在 model_catalog';
COMMENT ON COLUMN logical_models.id IS
    '对外稳定标识，能力型 kebab-case（如 image-t2i-high）。**一旦对外使用即为契约，不得改名**';
COMMENT ON COLUMN logical_models.label IS
    '展示名（如「文生图 · 高质量（对标 gpt-image-1）」）。可改，用于承载"对标模型"参考';
