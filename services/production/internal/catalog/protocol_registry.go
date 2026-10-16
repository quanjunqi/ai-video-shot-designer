package catalog

import (
	"bytes"
	"encoding/json"
	"sort"
)

// 本文件是 ADR-007 D1「内置接入方式定义搬进 Go 代码注册表」的注册表本身。
//
// 背景：内置协议模板此前只靠迁移 SQL 播种进 protocol_templates 表，且 UI 可编辑，
// 带来两个问题：① 用户可编辑内置协议 → 复杂度（407 行页面 / 30 个交互容器）；
// ② UI 表达不了 pollPath → 内置视频模板漏配、异步轮询全部失败。
//
// 本切片的语义是**等价搬迁**：把迁移 007/008/009/010/012/013/021 的最终值逐条搬到 Go，
// 不修正、不补全任何数值。已知缺陷（例如两个视频模板缺 pollPath）只在测试
// TestProtocolDefinitionsAsyncConsistency 里作为「已知违规台账」记录，不在此处改数据。
//
// DB 表保留（向后兼容 + 专家覆盖）：读取路径合并时 DB 行优先，DB 缺失的 id 由注册表补齐。

// Source 标识（写入 ProtocolTemplate.Source，仅读取路径填充）。
const (
	TemplateSourceBuiltin = "builtin"
	TemplateSourceCustom  = "custom"
)

// Param 是 params / response_params 中单条参数声明的强类型视图。
// 字段名与 JSON 形状对齐 services/execution/internal/engine.Param（执行器的解析形状）。
type Param struct {
	Key      string `json:"key"`
	Value    string `json:"value"`
	Type     string `json:"type,omitempty"`
	Role     string `json:"role,omitempty"` // static | model | runtime（缺省 static）
	Required bool   `json:"required,omitempty"`
	Desc     string `json:"desc,omitempty"`
}

// ProtocolAsync 是 async 列的强类型视图，形状对齐执行器 engine.go 中的匿名结构。
// 零值序列化为 {}，与 DB 中非异步模板的 async 默认值 '{}' 一致。
type ProtocolAsync struct {
	Enabled             bool   `json:"enabled,omitempty"`
	TaskIDField         string `json:"taskIdField,omitempty"`
	StatusField         string `json:"statusField,omitempty"`
	DoneValue           string `json:"doneValue,omitempty"`
	FailValue           string `json:"failValue,omitempty"`
	PollPath            string `json:"pollPath,omitempty"`
	TimeoutMinutes      int    `json:"timeoutMinutes,omitempty"`
	PollIntervalSeconds int    `json:"pollIntervalSeconds,omitempty"`
}

// ProtocolDefinition 是一个内置接入方式的完整定义。
// 字段与 protocol_templates 行同形（命名沿用 model.go 的 ProtocolTemplate：Desc/Builtin），
// 由 Template() 转成 ProtocolTemplate 供既有消费者使用。
type ProtocolDefinition struct {
	ID             string          `json:"id"`
	Label          string          `json:"label"`
	Desc           string          `json:"desc"`
	Type           string          `json:"type"`
	Method         string          `json:"method"`
	RequestPath    string          `json:"requestPath"`
	Params         []Param         `json:"params"`
	ResponseParams []Param         `json:"responseParams"`
	Async          ProtocolAsync   `json:"async"`
	Capabilities   json.RawMessage `json:"capabilities"`
	Builtin        bool            `json:"builtin"`
	Enabled        bool            `json:"enabled"`
	Version        int             `json:"version"`
	// RequestTemplate 是 ADR-007 D3 的请求模板（{{占位符}} 语法，迁移 028 的列）。
	// 空 = 未迁移，执行器沿用 params[] 组装（既有行为）。可选字段，不影响既有定义。
	RequestTemplate string `json:"requestTemplate,omitempty"`
}

// Template 把注册表定义转成与 DB 行同形的 ProtocolTemplate。
// 注册表定义天然是内置且启用的（Builtin/Enabled 由这里统一置位，不取定义里的零值）。
func (d ProtocolDefinition) Template() ProtocolTemplate {
	return ProtocolTemplate{
		ID:             d.ID,
		Label:          d.Label,
		Desc:           d.Desc,
		Type:           d.Type,
		Method:         d.Method,
		RequestPath:    d.RequestPath,
		Params:         marshalJSON(d.Params, "[]"),
		ResponseParams: marshalJSON(d.ResponseParams, "[]"),
		Async:          marshalJSON(d.Async, "{}"),
		Capabilities:   capabilitiesOrEmpty(d.Capabilities),
		Builtin:        true,
		Enabled:        true,
		Version:        d.Version,
		Source:         TemplateSourceBuiltin,

		RequestTemplate: d.RequestTemplate,
	}
}

// ProtocolDefinitions 返回全部内置接入方式定义（每次调用返回全新切片，调用方可安全修改）。
func ProtocolDefinitions() []ProtocolDefinition {
	return []ProtocolDefinition{
		// 迁移 007 播种 + 012 定类型（image）：本地 ComfyUI 端口直连。
		{
			ID:          "pt_builtin_comfyui",
			Label:       "ComfyUI 本地工作流（端口直连）",
			Desc:        "本地端口直连（无需鉴权）：提交 /prompt 返回 prompt_id，轮询 /history 取成品。",
			Type:        "image",
			Method:      "POST",
			RequestPath: "/prompt",
			Params: []Param{
				{Key: "client_id", Value: "漫剧工坊"},
			},
			// 迁移 008 重写（带 type 标注）。
			ResponseParams: []Param{
				{Key: "prompt_id", Type: "string", Value: "工作流执行 ID（轮询 /history）"},
			},
			Async:        ProtocolAsync{},
			Capabilities: nil, // DB 默认 '{}'
			Builtin:      true,
			Enabled:      true,
			Version:      1,
		},
		// 迁移 007 播种；012 未改 type → 保持 'all'（聚合网关跨类型转发）。
		{
			ID:          "pt_builtin_grsai",
			Label:       "聚合网关转发（OpenAI 兼容）",
			Desc:        "Grsai 等聚合渠道统一 OpenAI 兼容协议，按厂商转发；响应取 choices[0].message.content。",
			Type:        "all",
			Method:      "POST",
			RequestPath: "/v1/chat/completions",
			Params:      []Param{},
			ResponseParams: []Param{
				{Key: "choices.0.message.content", Type: "string", Value: "文本正文"},
			},
			Async:        ProtocolAsync{},
			Capabilities: nil, // DB 默认 '{}'
			Builtin:      true,
			Enabled:      true,
			Version:      1,
		},
		// 迁移 007 播种 + 008 重写响应 + 012 定类型（image）。
		{
			ID:          "pt_builtin_jimeng_image",
			Label:       "即梦图片",
			Desc:        "即梦图片生成（images/generations 兼容形态），响应取 data[].url。",
			Type:        "image",
			Method:      "POST",
			RequestPath: "/v1/images/generations",
			Params:      []Param{},
			ResponseParams: []Param{
				{Key: "data.0.url", Type: "string", Value: "图片地址"},
			},
			Async:        ProtocolAsync{},
			Capabilities: nil, // DB 默认 '{}'
			Builtin:      true,
			Enabled:      true,
			Version:      1,
		},
		// 迁移 007 播种 + 008 重写响应与 async + 012 定类型（video）+ 029 补 pollPath。
		// pollPath 证据：无鉴权 GET https://api.pearapi.ai/v1/video/generations/<id> → HTTP 401
		// （路径存在）。此前 async 缺 pollPath，执行器退化到硬编码 /v1/images/tasks/{task_id}，
		// 视频异步任务必然失败；029 已补齐。
		{
			ID:          "pt_builtin_jimeng_video",
			Label:       "即梦视频（异步任务）",
			Desc:        "即梦视频生成走异步任务，提交返回任务 ID，完成后取成品地址。",
			Type:        "video",
			Method:      "POST",
			RequestPath: "/v1/videos/generations",
			Params:      []Param{},
			ResponseParams: []Param{
				{Key: "task_id", Type: "string", Value: "任务 ID（轮询查询进度）"},
				{Key: "status", Type: "string", Value: "任务状态（轮询判断完成/失败）"},
				{Key: "data.0.url", Type: "string", Value: "视频地址"},
			},
			Async: ProtocolAsync{
				Enabled:     true,
				TaskIDField: "task_id",
				StatusField: "status",
				DoneValue:   "SUCCESS",
				FailValue:   "FAILED",
				PollPath:    "/v1/video/generations/{task_id}",
			},
			Capabilities: nil, // DB 默认 '{}'
			Builtin:      true,
			Enabled:      true,
			Version:      1,
		},
		// 迁移 007 播种 + 008 重写响应 + 012 定类型（text）。
		//
		// ADR-007 D3：本定义是**唯一**改用「请求模板」形态的内置定义，用作等价性证明的样本
		// （它只有一个静态参数，模板能完整表达请求体且不依赖可选 runtime 字段，因此可以做到
		// 全输入空间等价）。params 保留：模板里的 {{stream}} 仍由 params 的三分类解析取值。
		//   - 旧形态组装结果： {"stream":false,"task_type":"sync"}（task_type 由执行器按 async
		//     声明非空注入；异步路径会覆盖为 "async"，与旧行为一致——模板里写 sync 只是把
		//     请求体写成一眼可见的完整形状）。
		//   - 等价性断言： services/execution/internal/engine/request_template_test.go
		//     的 TestRequestTemplateEquivalenceBuiltinMinimaxText（两边 json.Unmarshal 后
		//     reflect.DeepEqual，避免键序/空白误报）。
		// 注意：DB 行优先于注册表（MergeTemplates），而迁移 028 按规格不回填任何行，因此本行
		// 在存量库上仍是「能力已就绪但未生效」；生效需要后续切片的回填/新建迁移。
		{
			ID:          "pt_builtin_minimax_text",
			Label:       "MiniMax 文本",
			Desc:        "MiniMax 文本对话（chatcompletion_v2），响应结构与 OpenAI 兼容。",
			Type:        "text",
			Method:      "POST",
			RequestPath: "/v1/text/chatcompletion_v2",
			Params: []Param{
				{Key: "stream", Value: "false"},
			},
			ResponseParams: []Param{
				{Key: "choices.0.message.content", Type: "string", Value: "文本正文"},
			},
			Async:           ProtocolAsync{},
			Capabilities:    nil, // DB 默认 '{}'
			Builtin:         true,
			Enabled:         true,
			Version:         1,
			RequestTemplate: `{"stream":{{stream}},"task_type":"sync"}`,
		},
		// 迁移 007 播种 + 008 重写响应与 async + 012 定类型（video）+ 029 补 pollPath
		// + 030 修正 doneValue/failValue。
		// pollPath 证据：GET https://api.minimax.chat/v1/query/video_generation?task_id=<id>
		// 无鉴权返回 HTTP 200 + base_resp.status_code=1004（"login fail: Please carry the API
		// secret key in the 'Authorization' field"）；同前缀近邻路径 404，且平台注册的提交路径
		// POST /v1/video_generation 返回同一 200+1004 签名 ⇒ 路由存在、仅缺鉴权。
		// 与官方 OpenAPI 一致（GET /v1/query/video_generation，task_id 为 query 参数）。
		//
		// failValue/doneValue = "failed" / "completed"：MiniMax 官方文档的顶层 status 枚举是
		// queued | in_progress | completed | failed（迁移 008 写的 Success/Failed 与它都不相等，
		// 导致成功与失败都检测不到、空转到超时）。注意枚举取自国际站文档 platform.minimax.io，
		// 而渠道 base_url 是 api.minimax.chat；值有据、域名差异未证实，且执行器已支持
		// 逗号分隔候选 + 大小写不敏感匹配，届时只需一条 jsonb_set 数据修正。必须与迁移 030 一致。
		// 另一套接口用嵌套 task.status（枚举含 succeeded/cancelled）；本模板取顶层 status，
		// 万一是后者，把 doneValue 补为 "completed,succeeded" 即可，无需改代码。
		{
			ID:          "pt_builtin_minimax_video",
			Label:       "MiniMax 视频（异步任务）",
			Desc:        "视频生成走异步任务：提交返回 task_id，轮询查询进度与成品。",
			Type:        "video",
			Method:      "POST",
			RequestPath: "/v1/video_generation",
			Params:      []Param{},
			ResponseParams: []Param{
				{Key: "task_id", Type: "string", Value: "任务 ID（轮询查询进度）"},
				{Key: "status", Type: "string", Value: "任务状态（轮询判断完成/失败）"},
				{Key: "file_id", Type: "string", Value: "成品文件 ID"},
			},
			Async: ProtocolAsync{
				Enabled:     true,
				TaskIDField: "task_id",
				StatusField: "status",
				DoneValue:   "completed",
				FailValue:   "failed",
				PollPath:    "/v1/query/video_generation?task_id={task_id}",
			},
			Capabilities: nil, // DB 默认 '{}'
			Builtin:      true,
			Enabled:      true,
			Version:      1,
		},
		// 迁移 007 播种 + 009 重写响应（version+1）+ 010 升级 params（version+1）+ 012 定类型（text）
		// + 021 初始化 capabilities。最终 version = 3。
		{
			ID:          "pt_builtin_openai",
			Label:       "OpenAI 兼容（Chat / Images）",
			Desc:        "标准 chat/completions 与 images/generations，响应按 choices 提取文本、data[].url 提取图片。",
			Type:        "text",
			Method:      "POST",
			RequestPath: "/v1/chat/completions",
			// 迁移 010：参数来源三分类（static 静态默认 / model 模型注入 / runtime 运行时注入）。
			Params: []Param{
				{Key: "model", Value: "", Type: "string", Role: "model", Required: true, Desc: "对话模型 ID（执行器注入模型标识 providerModel）"},
				{Key: "messages", Value: "", Type: "array", Role: "runtime", Required: true, Desc: "对话消息数组，按时间顺序排列（执行器按会话/剧本构造）"},
				{Key: "temperature", Value: "0.7", Type: "number", Role: "static", Desc: "采样温度，>= 0 <= 2，默认 1"},
				{Key: "top_p", Value: "1", Type: "number", Role: "static", Desc: "核采样，>= 0 <= 1，默认 1"},
				{Key: "max_tokens", Value: "1024", Type: "number", Role: "static", Desc: "最大输出 token 数，>= 1"},
				{Key: "n", Value: "1", Type: "number", Role: "static", Desc: "生成候选数，>= 1，默认 1"},
				{Key: "stream", Value: "false", Type: "bool", Role: "static", Desc: "是否 SSE 流式返回，默认 false"},
				{Key: "presence_penalty", Value: "0", Type: "number", Role: "static", Desc: "话题新鲜度惩罚，>= -2 <= 2，默认 0"},
				{Key: "frequency_penalty", Value: "0", Type: "number", Role: "static", Desc: "频率惩罚，>= -2 <= 2，默认 0"},
				{Key: "stop", Value: "[\"\\n\"]", Type: "array", Role: "static", Desc: "停止序列数组（JSON 字符串）"},
				{Key: "tools", Value: "", Type: "array", Role: "runtime", Desc: "Function Calling 工具列表（OpenAI 格式，平台按需注入）"},
				{Key: "tool_choice", Value: "auto", Type: "string", Role: "static", Desc: "工具选择策略：auto / none / 指定函数"},
				{Key: "response_format", Value: "{\"type\":\"json_object\"}", Type: "object", Role: "static", Desc: "强制输出格式（JSON 字符串）"},
				{Key: "user", Value: "", Type: "string", Role: "runtime", Desc: "终端用户标识，用于审计与风控"},
			},
			// 迁移 009 重写（含工具调用 / usage / 会话元信息）。
			ResponseParams: []Param{
				{Key: "choices.0.message.content", Type: "string", Value: "文本正文（无工具调用时）"},
				{Key: "choices.0.message.tool_calls", Type: "array", Value: "工具调用列表（函数名/参数）"},
				{Key: "choices.0.finish_reason", Type: "string", Value: "结束原因（stop / tool_calls / length）"},
				{Key: "usage.prompt_tokens", Type: "number", Value: "输入 Token 数"},
				{Key: "usage.completion_tokens", Type: "number", Value: "输出 Token 数"},
				{Key: "usage.total_tokens", Type: "number", Value: "总 Token 数"},
				{Key: "id", Type: "string", Value: "会话 ID"},
				{Key: "model", Type: "string", Value: "实际使用的模型"},
				{Key: "created", Type: "number", Value: "生成时间戳"},
			},
			Async:        ProtocolAsync{},
			Capabilities: json.RawMessage(openaiChatCapabilities),
			Builtin:      true,
			Enabled:      true,
			Version:      3,
		},
		// 迁移 009 新增 + 013 升级 params（version+1）+ 012 定类型（image）+ 021 初始化 capabilities。
		// 最终 version = 2。
		{
			ID:          "pt_builtin_openai_img",
			Label:       "OpenAI 兼容图片（Images API）",
			Desc:        "images/generations 形态，响应取 data[].url 提取图片地址。",
			Type:        "image",
			Method:      "POST",
			RequestPath: "/v1/images/generations",
			// 迁移 013：此前 params 为空导致装配请求缺 model → 上游 400。
			Params: []Param{
				{Key: "model", Role: "model", Type: "string", Required: true, Desc: "图片生成模型 ID（执行器注入 providerModel）"},
				{Key: "prompt", Role: "runtime", Type: "string", Required: true, Desc: "图片描述（执行器按业务构造）"},
				{Key: "n", Role: "static", Value: "1", Type: "number", Desc: "生成张数"},
				{Key: "size", Role: "static", Value: "1024x1024", Type: "string", Desc: "图片尺寸"},
				{Key: "quality", Role: "static", Value: "standard", Type: "string", Desc: "质量档（standard/hd）"},
				{Key: "response_format", Role: "static", Value: "url", Type: "string", Desc: "返回格式（url/b64_json）"},
			},
			ResponseParams: []Param{
				{Key: "data.0.url", Type: "string", Value: "图片地址"},
			},
			Async:        ProtocolAsync{},
			Capabilities: json.RawMessage(openaiImageCapabilities),
			Builtin:      true,
			Enabled:      true,
			Version:      2,
		},
		// 迁移 061 由协议生成器（cmd/protocol-gen，OpenAI 官方 OpenAPI 3.1）产出；201 迁移写入 DB 行。
		// 迁移 067 修正 pollPath 占位符 {id}→{task_id}（执行器 ReplaceAll 硬约束，061 写入 {id} 是轮询 URL bug）。
		// 注册表补定义 = canonical 兜底（MergeTemplates：DB 行优先，注册表在 DB 缺行时兜底）；
		// 修 TASK-PROTOCOL-004 检出的漂移（此前 openai_video 只在 DB、不在注册表）。
		{
			ID:          "pt_builtin_openai_video",
			Label:       "OpenAI 兼容 · 视频生成（PearAPI/openai-video）",
			Desc:        "videos/generations 形态，异步轮询，响应取 task_id 跟踪任务。",
			Type:        "video",
			Method:      "POST",
			RequestPath: "/v1/videos/generations",
			// params 为空：由 capabilities.param_mapping 装配（与 DB 行一致）。
			Params:         []Param{},
			ResponseParams: []Param{},
			Async: ProtocolAsync{
				Enabled:             true,
				TaskIDField:         "id",
				StatusField:         "status",
				DoneValue:           "completed",
				FailValue:           "failed",
				PollPath:            "/v1/videos/{task_id}",
				TimeoutMinutes:      1440,
				PollIntervalSeconds: 15,
			},
			Capabilities: json.RawMessage(openaiVideoCapabilities),
			Builtin:      true,
			Enabled:      true,
			Version:      1,
		},

		// openai_responses（TASK-PROTOCOL-006）：OpenAI Responses API，同步返回（可 stream）。
		// 生成：protocol-gen 官方 openapi.json v2.3.0 确定性输出 params（31 键）；
		// 审查：capabilities=text-chat，param_mapping 官方语义 identity，未实测（observed_evidence 标注）。
		{
			ID:          "pt_builtin_openai_responses",
			Label:       "OpenAI Responses API（text-chat）",
			Desc:        "OpenAI 新一代 Responses API：POST /v1/responses 同步返回（可 stream）。协议定义由 protocol-gen 从 OpenAI 官方 openapi.json（v2.3.0）确定性生成。",
			Type:        "text",
			Method:      "POST",
			RequestPath: "/v1/responses",
			// params 为空：由 capabilities.param_mapping 装配（与 DB 行一致）。
			Params:         []Param{},
			ResponseParams: []Param{},
			Async:          ProtocolAsync{Enabled: false},
			Capabilities:   json.RawMessage(openaiResponsesCapabilities),
			Builtin:        true,
			Enabled:        true,
			Version:        1,
		},
	}
}

// ProtocolDefinitionByID 按 id 查内置定义。
func ProtocolDefinitionByID(id string) (ProtocolDefinition, bool) {
	for _, def := range ProtocolDefinitions() {
		if def.ID == id {
			return def, true
		}
	}
	return ProtocolDefinition{}, false
}

// RegistryTemplates 把注册表转成与 ProtocolTemplate（DB 行）同形的切片。
func RegistryTemplates() []ProtocolTemplate {
	defs := ProtocolDefinitions()
	out := make([]ProtocolTemplate, 0, len(defs))
	for _, def := range defs {
		out = append(out, def.Template())
	}
	return out
}

// MergeTemplates 把 DB 行与内置注册表合并成最终列表：
//  1. DB 中已存在的模板（按 id）→ DB 行优先（允许管理员覆盖注册表默认值）；
//  2. 注册表中存在、DB 中缺失的 id → 由注册表补齐（builtin=true）；
//  3. DB 中非内置的自定义模板 → 原样保留；
//  4. 结果按 id 稳定排序（同一输入多次调用输出一致）。
func MergeTemplates(db []ProtocolTemplate) []ProtocolTemplate {
	out := make([]ProtocolTemplate, 0, len(db))
	seen := make(map[string]bool, len(db))
	for _, t := range db {
		if seen[t.ID] {
			continue // DB 主键保证唯一；防御性去重，先到者优先
		}
		seen[t.ID] = true
		out = append(out, withSource(t))
	}
	for _, t := range RegistryTemplates() {
		if seen[t.ID] {
			continue
		}
		seen[t.ID] = true
		out = append(out, t)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// ResolveTemplateByID 供「只读单个 id」的调用方使用：DB 行优先，DB 无该行时落到注册表。
func ResolveTemplateByID(db []ProtocolTemplate, id string) (ProtocolTemplate, bool) {
	for _, t := range db {
		if t.ID == id {
			return withSource(t), true
		}
	}
	def, ok := ProtocolDefinitionByID(id)
	if !ok {
		return ProtocolTemplate{}, false
	}
	return def.Template(), true
}

// withSource 补全来源标识（DB 行不带 source 列，由 builtin 派生）。
func withSource(t ProtocolTemplate) ProtocolTemplate {
	if t.Source == "" {
		if t.Builtin {
			t.Source = TemplateSourceBuiltin
		} else {
			t.Source = TemplateSourceCustom
		}
	}
	return t
}

// marshalJSON 把注册表里的强类型声明序列化为 jsonb 落库/透传时使用的 RawMessage。
// Params/Async 只有字符串与 bool 字段，序列化不会失败；fallback 仅覆盖 nil 切片
// 与零值 Async（json.Marshal 会给出 null，而 DB 的规范默认值是 [] / {}）。
func marshalJSON(value any, fallback string) json.RawMessage {
	raw, err := json.Marshal(value)
	if err != nil || string(raw) == "null" {
		return json.RawMessage(fallback)
	}
	return raw
}

func capabilitiesOrEmpty(raw json.RawMessage) json.RawMessage {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || string(trimmed) == "null" {
		return json.RawMessage("{}")
	}
	return json.RawMessage(trimmed)
}
