// capabilities 常量：builtin 协议模板的能力声明（键必须 ∈ 061 枚举，与 061 迁移同源）。
// 独立文件：按域拆分（BE-SIZE-001），protocol_registry.go 只留定义与合并逻辑。

package catalog

// 迁移 021 为 pt_builtin_openai 初始化的 capabilities（text-chat）。
// openai_video capabilities（TASK-PROTOCOL-005）：text-to-video + image-to-video（061 同源）。
const openaiVideoCapabilities = `{
  "text-to-video": {
    "method": "POST",
    "request_path": "/v1/videos/generations",
    "param_mapping": {
      "model": "model",
      "prompt": "prompt",
      "metadata.duration": "metadata.duration",
      "metadata.resolution": "metadata.resolution",
      "metadata.generate_audio": "metadata.generate_audio"
    },
    "required_params": ["prompt"],
    "response_extract": {"status": "status", "task_id": "task_id"}
  },
  "image-to-video": {
    "method": "POST",
    "request_path": "/v1/videos/generations",
    "param_mapping": {
      "model": "model",
      "prompt": "prompt",
      "metadata.duration": "metadata.duration",
      "metadata.resolution": "metadata.resolution",
      "metadata.generate_audio": "metadata.generate_audio",
      "reference_images[0].url": "metadata.content[0].image_url"
    },
    "required_params": ["prompt"],
    "response_extract": {"status": "status", "task_id": "task_id"}
  }
}`

const openaiChatCapabilities = `{
  "text-chat": {
    "request_path": "/v1/chat/completions",
    "method": "POST",
    "required_params": ["messages"],
    "param_mapping": {
      "messages": "messages",
      "temperature": "temperature",
      "top_p": "top_p",
      "max_tokens": "max_tokens",
      "stream": "stream",
      "presence_penalty": "presence_penalty",
      "frequency_penalty": "frequency_penalty"
    },
    "response_extract": {
      "text": "choices.0.message.content",
      "usage": "usage"
    }
  }
}`

// 迁移 021 为 pt_builtin_openai_img 初始化的 capabilities（text-to-image / image-to-image）。
const openaiImageCapabilities = `{
  "text-to-image": {
    "request_path": "/v1/images/generations",
    "method": "POST",
    "required_params": ["prompt"],
    "param_mapping": {
      "prompt": "prompt",
      "negative_prompt": "negative_prompt",
      "aspect_ratio": "aspect_ratio",
      "n": "n",
      "seed": "seed",
      "response_format": "response_format"
    },
    "response_extract": {
      "image_url": "data.0.url",
      "image_b64": "data.0.b64_json"
    }
  },
  "image-to-image": {
    "request_path": "/v1/images/edits",
    "method": "POST",
    "required_params": ["prompt", "image"],
    "param_mapping": {
      "prompt": "prompt",
      "reference_images[0].url": "image",
      "strength": "strength",
      "aspect_ratio": "aspect_ratio",
      "n": "n",
      "response_format": "response_format"
    },
    "response_extract": {
      "image_url": "data.0.url",
      "image_b64": "data.0.b64_json"
    }
  }
}`

// openai_responses capabilities（TASK-PROTOCOL-006）：text-chat（Responses API 官方语义）。
// 生成：protocol-gen 从 OpenAI 官方 openapi.json（v2.3.0）确定性输出 params（31 键）；
// 审查：param_mapping 官方语义 identity 映射，未真实渠道实测（observed_evidence 标注）。
const openaiResponsesCapabilities = `{
  "text-chat": {
    "request_path": "/v1/responses",
    "method": "POST",
    "required_params": ["model"],
    "param_mapping": {
      "model": "model",
      "prompt": "prompt",
      "instructions": "instructions",
      "max_output_tokens": "max_output_tokens",
      "temperature": "temperature",
      "top_p": "top_p",
      "stream": "stream",
      "tools": "tools",
      "tool_choice": "tool_choice",
      "store": "store",
      "metadata": "metadata",
      "user": "user"
    },
    "response_extract": {
      "text": "output_text",
      "usage": "usage"
    }
  }
}`
