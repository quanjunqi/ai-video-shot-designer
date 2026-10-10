-- Model catalog (platform-shared default): channels (L1) + models (L2) + capability/billing (L3)
-- Mirrors apps/web/src/config/models/model-catalog.ts defaults; seeded idempotently.
-- Editing a model writes an append-only version row (versioned archive) for auditability.

CREATE TABLE IF NOT EXISTS model_channels (
    id text PRIMARY KEY,
    name text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('official','aggregator','local')),
    base_url text NOT NULL DEFAULT '',
    auth_type text NOT NULL DEFAULT 'none' CHECK (auth_type IN ('bearer','apikey','sign','none')),
    enabled boolean NOT NULL DEFAULT true,
    note text NOT NULL DEFAULT '',
    sort integer NOT NULL DEFAULT 100,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS model_catalog (
    id text PRIMARY KEY,
    channel_id text NOT NULL REFERENCES model_channels(id),
    family text NOT NULL,
    name text NOT NULL,
    type text NOT NULL CHECK (type IN ('text','image','video')),
    status text NOT NULL DEFAULT 'enabled' CHECK (status IN ('enabled','disabled')),
    sort integer NOT NULL DEFAULT 100,
    note text NOT NULL DEFAULT '',
    capability jsonb NOT NULL DEFAULT '{}'::jsonb,
    version integer NOT NULL DEFAULT 1,
    created_by text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (family, channel_id)
);
CREATE INDEX IF NOT EXISTS model_catalog_type_sort_idx ON model_catalog (type, sort, name);

-- Append-only version history for model capability changes (directory edits are archived)
CREATE TABLE IF NOT EXISTS model_catalog_versions (
    id text NOT NULL,
    version integer NOT NULL,
    channel_id text NOT NULL,
    family text NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    status text NOT NULL,
    sort integer NOT NULL,
    note text NOT NULL,
    capability jsonb NOT NULL,
    changed_by text NOT NULL,
    changed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (id, version),
    FOREIGN KEY (id) REFERENCES model_catalog(id)
);

CREATE OR REPLACE FUNCTION archive_model_catalog_version() RETURNS trigger AS $$
BEGIN
    INSERT INTO model_catalog_versions (id, version, channel_id, family, name, type, status, sort, note, capability, changed_by, changed_at)
    VALUES (OLD.id, OLD.version, OLD.channel_id, OLD.family, OLD.name, OLD.type, OLD.status, OLD.sort, OLD.note, OLD.capability, COALESCE(OLD.created_by, ''), now());
    NEW.version := OLD.version + 1;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS model_catalog_archive ON model_catalog;
CREATE TRIGGER model_catalog_archive BEFORE UPDATE ON model_catalog
    FOR EACH ROW EXECUTE FUNCTION archive_model_catalog_version();

-- ===== Seed (idempotent; aligned with front-end catalog defaults) =====
INSERT INTO model_channels (id, name, kind, base_url, auth_type, enabled, note, sort) VALUES
    ('jimeng',  '即梦',             'official',   'https://open.volcengine.com/api/v1',            'sign',   true, '字节官方：Seedream 图片 / Seedance 视频（真实鉴权待接入）', 1),
    ('minimax', 'MiniMax',          'official',   'https://api.minimax.chat/v1',                  'bearer', true, 'MiniMax 官方：H3 视频 / Text-01 文本（真实鉴权待接入）',     2),
    ('grsai',   'Grsai 聚合',       'aggregator', 'https://api.grsai.com/v1',                     'apikey', true, '聚合渠道：特价版模型（MiniMax H3 特价 / Seedance 2.0 特价 / deepseek-v4-pro 等）', 3),
    ('google',  'Google Gemini',    'official',   'https://generativelanguage.googleapis.com/v1beta', 'apikey', true, 'Gemini 文本与图片（nano-banana 系列）', 4),
    ('openai',  'OpenAI',           'official',   'https://api.openai.com/v1',                    'bearer', true, 'OpenAI：gpt-image-2 图片 / GPT 文本', 5),
    ('comfy',   'ComfyUI 本地/云端','local',      'http://127.0.0.1:8188',                        'none',   true, '本地工作流：SDXL / Flux 图片', 6)
ON CONFLICT (id) DO NOTHING;

INSERT INTO model_catalog (id, channel_id, family, name, type, status, sort, note, capability) VALUES
    -- video (sort = start price low to high)
    ('minimax-h3',         'minimax', 'MiniMax H3',  'MiniMax H3',          'video', 'enabled', 1, 'MiniMax 官方 H3：需同时提供 1 张参考图和 1 条参考音频，单次视频时长 1-15 秒。',
        '{"modes":["i2v","multi_ref","audio_ref"],"minDurationSeconds":1,"maxDurationSeconds":15,"maxRefImages":1,"maxRefAudios":1,"qualityTiers":2,"billing":{"perSecondStart":0.5}}'::jsonb),
    ('minimax-h3-grsai',   'grsai',   'MiniMax H3',  'MiniMax H3（特价版）','video', 'enabled', 2, 'Grsai 平台 MiniMax H3 视频模型，支持文生视频、图生视频、首尾帧、图片和音频参考，不支持视频参考。',
        '{"modes":["t2v","i2v","first_last_frame","multi_ref"],"minDurationSeconds":1,"maxDurationSeconds":15,"maxRefImages":1,"maxRefAudios":0,"qualityTiers":3,"billing":{"perSecondStart":1}}'::jsonb),
    ('seedance-2.0',       'jimeng',  'Seedance 2.0','Seedance 2.0',        'video', 'enabled', 3, '即梦官方 Seedance 2.0，支持文生视频、参考图、首尾帧及多模态参考，时长 4-15 秒。',
        '{"modes":["t2v","i2v","first_last_frame","multi_ref"],"minDurationSeconds":4,"maxDurationSeconds":15,"maxRefImages":9,"maxRefAudios":0,"qualityTiers":3,"billing":{"perSecondStart":0}}'::jsonb),
    ('seedance-2.0-grsai', 'grsai',   'Seedance 2.0','Seedance 2.0（特价版）','video','enabled', 4, 'Seedance 2.0 特价版视频生成，支持文生视频、参考图、首尾帧及多模态参考，时长 4-15 秒。',
        '{"modes":["t2v","i2v","first_last_frame","multi_ref"],"minDurationSeconds":4,"maxDurationSeconds":15,"maxRefImages":9,"maxRefAudios":0,"qualityTiers":3,"billing":{"perSecondStart":2}}'::jsonb),
    ('seedance-2.5',       'jimeng',  'Seedance 2.5','Seedance 2.5',        'video', 'enabled', 5, '即梦官方 Seedance 2.5，支持 4-30 秒生成，可容纳完整对话轮次与动作链。',
        '{"modes":["t2v","i2v","first_last_frame","multi_ref"],"minDurationSeconds":4,"maxDurationSeconds":30,"maxRefImages":9,"maxRefAudios":0,"qualityTiers":3,"billing":{"perSecondStart":0}}'::jsonb),
    ('kling-1.6',          'grsai',   'Kling 1.6',   'Kling 1.6',           'video', 'enabled', 6, '快手可灵经 Grsai 聚合接入，文生/图生视频，上限 15 秒。',
        '{"modes":["t2v","i2v"],"minDurationSeconds":5,"maxDurationSeconds":15,"maxRefImages":1,"maxRefAudios":0,"qualityTiers":2,"billing":{"perSecondStart":0}}'::jsonb),
    -- image (sort = price per image low to high)
    ('nano-banana-2-lite', 'google',  'nano-banana-lite', 'nano-banana-2-lite',  'image', 'enabled', 1, '谷歌香蕉高清出图，支持参考图生图与 4 种比例。',
        '{"refImage":true,"aspectRatioCount":4,"qualityTiers":2,"billing":{"perImage":2}}'::jsonb),
    ('gpt-image-2',        'openai',  'gpt-image',   'gpt-image-2',         'image', 'enabled', 2, 'openai 最强图片模型 gpt-image-2，支持参考图生图与 6 种比例。',
        '{"refImage":true,"aspectRatioCount":6,"qualityTiers":2,"billing":{"perImage":2}}'::jsonb),
    ('nano-banana',        'google',  'nano-banana', 'nano-banana',         'image', 'enabled', 3, '谷歌香蕉高清出图，支持参考图生图与 3 种比例。',
        '{"refImage":true,"aspectRatioCount":3,"qualityTiers":2,"billing":{"perImage":3}}'::jsonb),
    ('seedream-5.0',       'jimeng',  'Seedream 5.0','Seedream 5.0',        'image', 'enabled', 4, '即梦官方 Seedream 5.0 图片模型（定价待渠道接入后校准）。',
        '{"refImage":true,"aspectRatioCount":4,"qualityTiers":2,"billing":{"perImage":0}}'::jsonb),
    ('sdxl-comfy',         'comfy',   'SDXL',        'SDXL',                'image', 'enabled', 5, 'ComfyUI 本地 SDXL 工作流（0 积分）。',
        '{"refImage":true,"aspectRatioCount":3,"qualityTiers":1,"billing":{"perImage":0}}'::jsonb),
    ('flux-comfy',         'comfy',   'Flux',        'Flux.1',              'image', 'enabled', 6, 'ComfyUI 本地 Flux.1 工作流（0 积分）。',
        '{"refImage":true,"aspectRatioCount":3,"qualityTiers":1,"billing":{"perImage":0}}'::jsonb),
    -- text (sort = input price low to high)
    ('gemini-3.1-flash-lite', 'google', 'Gemini 3.1', 'gemini-3.1-flash-lite', 'text', 'enabled', 1, 'gemini-3.1-flash-lite 推理模型 · 短文本推理',
        '{"isReasoning":true,"streaming":true,"systemPrompt":true,"maxTokens":8000,"temperature":0.7,"billing":{"inputPerMTok":3.75,"outputPerMTok":22.5,"minCharge":1}}'::jsonb),
    ('gemini-2.5-flash',   'google',  'Gemini 2.5',  'gemini-2.5-flash',    'text', 'enabled', 2, 'gemini-2.5-flash 通用文本',
        '{"isReasoning":false,"streaming":true,"systemPrompt":true,"maxTokens":10000,"temperature":0.7,"billing":{"inputPerMTok":4.5,"outputPerMTok":30,"minCharge":1}}'::jsonb),
    ('minimax-text-01',    'minimax', 'MiniMax-Text','MiniMax-Text-01',    'text', 'enabled', 3, 'MiniMax 官方文本模型（定价待渠道接入后校准）。',
        '{"isReasoning":false,"streaming":true,"systemPrompt":true,"maxTokens":12000,"temperature":0.7,"billing":{"inputPerMTok":0,"outputPerMTok":0,"minCharge":0}}'::jsonb),
    ('deepseek-v4-pro',    'grsai',   'DeepSeek V4', 'deepseek-v4-pro',     'text', 'enabled', 4, '后台暂未补充描述',
        '{"isReasoning":true,"streaming":false,"systemPrompt":true,"maxTokens":16000,"temperature":0.7,"billing":{"inputPerMTok":133.65,"outputPerMTok":400.95,"minCharge":1}}'::jsonb)
ON CONFLICT (id) DO NOTHING;
