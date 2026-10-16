-- 066: 协议模板 capabilities 补齐（TASK-PROTOCOL-002 · 服务 TASK-MODEL-006 判据 4）
--
-- 号段：production 模型中心 060-069（060-065 已用，066 = 段内下一号）
--
-- ============================================================================
-- 背景
-- ============================================================================
-- MODEL-006 判据 4「能力声明覆盖」要求协议模板具备能力声明。真库现状（2026-10-16）：
-- 9 个模板仅 3 个有能力声明（pt_builtin_openai / openai_img / openai_video——061 已补），
-- 6 个 EMPTY：comfyui / grsai / jimeng_image / jimeng_video / minimax_text / minimax_video。
-- 本迁移补齐其中 **5 个可静态声明能力** 的模板；comfyui 例外（理由见下）。
--
-- ============================================================================
-- ★ 能力键枚举（061 已确立，本迁移同源——064 教训：词表必须与调用方同源）
-- ============================================================================
--   text-chat                 （openai）
--   text-to-image / image-to-image   （openai_img）
--   text-to-video / image-to-video   （openai_video）
--
-- ============================================================================
-- ★ 6 个 EMPTY 模板逐项裁定（执行器语义实证，非推测）
-- ============================================================================
-- 执行器最小消费契约（mapping/engine.go + catalog/resolve.go）：
--   · capabilities 空/null → 空 Engine，不报错（渐进补齐；「未声明 ≠ 不支持」）
--   · HasCapability(mode) 按能力键命中检查 ⇒ **能力键是核心消费**
--   · param_mapping 缺失 → 空映射，走默认 __passthrough，不破坏
--
-- | 模板 | 能力键 | request_path | required | response_extract（注册表派生） | 裁定 |
-- |---|---|---|---|---|---|
-- | grsai | text-chat | /v1/chat/completions | messages | text=choices.0.message.content, usage=usage | ✅ 补 |
-- | jimeng_image | text-to-image, image-to-image | /v1/images/generations | prompt | image_url=data.0.url（同 openai_img 惯例） | ✅ 补 |
-- | jimeng_video | text-to-video, image-to-video | /v1/videos/generations | prompt | task_id, status, video=data.0.url | ✅ 补 |
-- | minimax_text | text-chat | /v1/text/chatcompletion_v2 | messages | text=choices.0.message.content, usage=usage | ✅ 补 |
-- | minimax_video | text-to-video, image-to-video | /v1/video_generation | prompt | task_id, status, file_id | ✅ 补 |
-- | comfyui | （例外，不补） | /prompt | — | prompt_id | ❌ 例外 |
--
-- ★ comfyui 例外理由（客观事实，非主观选择）：
--   comfyui 是本地工作流（端口直连）：/prompt 提交任意工作流 JSON，能力完全由导入的
--   工作流定义，协议层**无法静态声明**「支持 text-to-image 还是 text-to-video」。
--   硬填伪能力会误导 HasCapability 过滤（把不支持的 mode 放进来或把支持的过滤掉）。
--   ⇒ 不填；MODEL-006 判据 4 达成口径 = **8/9**（9 个模板 8 个有能力声明）。
--
-- ★ param_mapping 刻意省略：
--   grsai/jimeng/minimax 是 mock 渠道时代的既有定义，无实测/官方文档证据支撑字段名
--   （061 的 openai_video 有只读探测 + 豆包插件实测才写 param_mapping）。
--   「无依据不填」——字段名留待真实接入渠道时验证后补（届时走新迁移）。
--
-- ============================================================================
-- 兼容性 / 幂等
-- ============================================================================
-- UPDATE 单列 capabilities，不触碰其它列、不改任何既有行为；UPDATE 天然幂等。
-- 只补能力声明，不改变各模板的 params/async/request_path 等既有定义。

UPDATE protocol_templates SET capabilities = '{
  "text-chat": {
    "method": "POST",
    "request_path": "/v1/chat/completions",
    "required_params": ["messages"],
    "response_extract": {
      "text": "choices.0.message.content",
      "usage": "usage"
    }
  }
}'::jsonb WHERE id = 'pt_builtin_grsai';

UPDATE protocol_templates SET capabilities = '{
  "text-to-image": {
    "method": "POST",
    "request_path": "/v1/images/generations",
    "required_params": ["prompt"],
    "response_extract": {
      "image_url": "data.0.url",
      "image_b64": "data.0.b64_json"
    }
  },
  "image-to-image": {
    "method": "POST",
    "request_path": "/v1/images/generations",
    "required_params": ["prompt"],
    "response_extract": {
      "image_url": "data.0.url",
      "image_b64": "data.0.b64_json"
    }
  }
}'::jsonb WHERE id = 'pt_builtin_jimeng_image';

UPDATE protocol_templates SET capabilities = '{
  "text-to-video": {
    "method": "POST",
    "request_path": "/v1/videos/generations",
    "required_params": ["prompt"],
    "response_extract": {
      "task_id": "task_id",
      "status": "status",
      "video": "data.0.url"
    }
  },
  "image-to-video": {
    "method": "POST",
    "request_path": "/v1/videos/generations",
    "required_params": ["prompt"],
    "response_extract": {
      "task_id": "task_id",
      "status": "status",
      "video": "data.0.url"
    }
  }
}'::jsonb WHERE id = 'pt_builtin_jimeng_video';

UPDATE protocol_templates SET capabilities = '{
  "text-chat": {
    "method": "POST",
    "request_path": "/v1/text/chatcompletion_v2",
    "required_params": ["messages"],
    "response_extract": {
      "text": "choices.0.message.content",
      "usage": "usage"
    }
  }
}'::jsonb WHERE id = 'pt_builtin_minimax_text';

UPDATE protocol_templates SET capabilities = '{
  "text-to-video": {
    "method": "POST",
    "request_path": "/v1/video_generation",
    "required_params": ["prompt"],
    "response_extract": {
      "task_id": "task_id",
      "status": "status",
      "file_id": "file_id"
    }
  },
  "image-to-video": {
    "method": "POST",
    "request_path": "/v1/video_generation",
    "required_params": ["prompt"],
    "response_extract": {
      "task_id": "task_id",
      "status": "status",
      "file_id": "file_id"
    }
  }
}'::jsonb WHERE id = 'pt_builtin_minimax_video';

COMMENT ON COLUMN protocol_templates.capabilities IS
'协议能力声明（按能力键分键：text-chat / text-to-image / image-to-image / text-to-video / image-to-video，词表与调用方同源）。'
'执行器 HasCapability 按能力键过滤；param_mapping 是参数映射引擎的增强配置（无实测依据不写，缺失走默认 __passthrough）。'
'补全策略见迁移 066 注释（TASK-PROTOCOL-002：5 模板补齐 + comfyui 工作流自定义例外；渐进补齐，「未声明≠不支持」）。';
