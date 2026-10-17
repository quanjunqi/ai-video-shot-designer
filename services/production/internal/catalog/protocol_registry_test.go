package catalog

import (
	"encoding/json"
	"reflect"
	"sort"
	"strings"
	"testing"
)

// 迁移 007/008/009/010/012/013/021 播种的 8 个内置模板 id（权威清单）。
var builtinTemplateIDs = []string{
	"pt_builtin_comfyui",
	"pt_builtin_grsai",
	"pt_builtin_jimeng_image",
	"pt_builtin_jimeng_video",
	"pt_builtin_minimax_text",
	"pt_builtin_minimax_video",
	"pt_builtin_openai",
	"pt_builtin_openai_img",
	"pt_builtin_openai_responses", // TASK-PROTOCOL-006：protocol-gen 实战新增（内置定义 = 10）
	"pt_builtin_openai_video",     // TASK-PROTOCOL-005：注册表补 canonical 定义后，内置定义 = 9
}

func TestProtocolDefinitionsIntegrity(t *testing.T) {
	defs := ProtocolDefinitions()
	if len(defs) != len(builtinTemplateIDs) {
		t.Fatalf("expected %d builtin definitions, got %d", len(builtinTemplateIDs), len(defs))
	}
	seen := map[string]bool{}
	gotIDs := make([]string, 0, len(defs))
	for _, def := range defs {
		if seen[def.ID] {
			t.Errorf("duplicate builtin definition id %q", def.ID)
		}
		seen[def.ID] = true
		gotIDs = append(gotIDs, def.ID)
		if !def.Builtin {
			t.Errorf("%s: builtin definition must set Builtin=true", def.ID)
		}
		if !def.Enabled {
			t.Errorf("%s: builtin definition must set Enabled=true", def.ID)
		}
		if _, ok := ProtocolDefinitionByID(def.ID); !ok {
			t.Errorf("%s: ProtocolDefinitionByID lookup failed", def.ID)
		}
	}
	sort.Strings(gotIDs)
	if !reflect.DeepEqual(gotIDs, builtinTemplateIDs) {
		t.Errorf("builtin id set mismatch:\n got: %v\nwant: %v", gotIDs, builtinTemplateIDs)
	}
	if _, ok := ProtocolDefinitionByID("pt_builtin_missing"); ok {
		t.Error("unknown id unexpectedly resolved from registry")
	}

	// RegistryTemplates 必须与定义一一对应，且每个都是可用的内置行。
	templates := RegistryTemplates()
	if len(templates) != len(defs) {
		t.Fatalf("expected %d registry templates, got %d", len(defs), len(templates))
	}
	for _, tmpl := range templates {
		if !tmpl.Builtin || !tmpl.Enabled {
			t.Errorf("%s: registry template must be builtin+enabled", tmpl.ID)
		}
		if tmpl.Source != TemplateSourceBuiltin {
			t.Errorf("%s: registry template source = %q, want %q", tmpl.ID, tmpl.Source, TemplateSourceBuiltin)
		}
		if tmpl.RefCount != 0 {
			t.Errorf("%s: registry template refCount = %d, want 0", tmpl.ID, tmpl.RefCount)
		}
	}
}

func TestProtocolDefinitionsShape(t *testing.T) {
	for _, tmpl := range RegistryTemplates() {
		if tmpl.Method != "POST" && tmpl.Method != "GET" {
			t.Errorf("%s: method %q not in {POST,GET} (DB CHECK)", tmpl.ID, tmpl.Method)
		}
		if strings.TrimSpace(tmpl.RequestPath) == "" {
			t.Errorf("%s: request_path must not be empty", tmpl.ID)
		}
		switch tmpl.Type {
		case "text", "image", "video", "all":
		default:
			t.Errorf("%s: type %q violates the protocol_templates type CHECK", tmpl.ID, tmpl.Type)
		}
		if strings.TrimSpace(tmpl.Label) == "" {
			t.Errorf("%s: label must not be empty (NOT NULL column)", tmpl.ID)
		}
		if tmpl.Version < 1 {
			t.Errorf("%s: version = %d, want >= 1", tmpl.ID, tmpl.Version)
		}
		// params / response_params / async / capabilities 必须是合法 JSON，且与 DB 列类型一致。
		assertJSONArray(t, tmpl.ID+" params", tmpl.Params)
		assertJSONArray(t, tmpl.ID+" responseParams", tmpl.ResponseParams)
		assertJSONObject(t, tmpl.ID+" async", tmpl.Async)
		assertJSONObject(t, tmpl.ID+" capabilities", tmpl.Capabilities)
	}
}

// TestProtocolDefinitionsMatchMigrations 是把「等价搬迁」固化成断言的金标准：
// 每一行的期望值直接来自迁移 007/008/009/010/012/013/021 的最终状态。
// 任何一处数值被改动（无论有意还是手滑）都会在这里失败。
func TestProtocolDefinitionsMatchMigrations(t *testing.T) {
	cases := []struct {
		id             string
		label          string
		desc           string
		typ            string
		method         string
		requestPath    string
		params         string
		responseParams string
		async          string
		capabilities   string
		version        int
	}{
		{
			// 007 播种 + 008 重写响应 + 012 定类型。
			id:    "pt_builtin_comfyui",
			label: "ComfyUI 本地工作流（端口直连）",
			desc:  "本地端口直连（无需鉴权）：提交 /prompt 返回 prompt_id，轮询 /history 取成品。",
			typ:   "image", method: "POST", requestPath: "/prompt",
			params:         `[{"key":"client_id","value":"漫剧工坊"}]`,
			responseParams: `[{"key":"prompt_id","type":"string","value":"工作流执行 ID（轮询 /history）"}]`,
			async:          `{}`,
			capabilities:   `{}`,
			version:        1,
		},
		{
			// 007 播种；012 未改 type，保持 'all'。
			id:    "pt_builtin_grsai",
			label: "聚合网关转发（OpenAI 兼容）",
			desc:  "Grsai 等聚合渠道统一 OpenAI 兼容协议，按厂商转发；响应取 choices[0].message.content。",
			typ:   "all", method: "POST", requestPath: "/v1/chat/completions",
			params:         `[]`,
			responseParams: `[{"key":"choices.0.message.content","type":"string","value":"文本正文"}]`,
			async:          `{}`,
			capabilities:   `{}`,
			version:        1,
		},
		{
			// 007 播种 + 008 重写响应 + 012 定类型。
			id:    "pt_builtin_jimeng_image",
			label: "即梦图片",
			desc:  "即梦图片生成（images/generations 兼容形态），响应取 data[].url。",
			typ:   "image", method: "POST", requestPath: "/v1/images/generations",
			params:         `[]`,
			responseParams: `[{"key":"data.0.url","type":"string","value":"图片地址"}]`,
			async:          `{}`,
			capabilities:   `{}`,
			version:        1,
		},
		{
			// 007 播种 + 008 重写响应与 async + 012 定类型。
			id:    "pt_builtin_jimeng_video",
			label: "即梦视频（异步任务）",
			desc:  "即梦视频生成走异步任务，提交返回任务 ID，完成后取成品地址。",
			typ:   "video", method: "POST", requestPath: "/v1/videos/generations",
			params: `[]`,
			responseParams: `[{"key":"task_id","type":"string","value":"任务 ID（轮询查询进度）"},` +
				`{"key":"status","type":"string","value":"任务状态（轮询判断完成/失败）"},` +
				`{"key":"data.0.url","type":"string","value":"视频地址"}]`,
			// 008 原样 + 029 补 pollPath（GET /v1/video/generations/<id> 实测 401 ⇒ 路径存在）。
			async:        `{"enabled":true,"taskIdField":"task_id","statusField":"status","doneValue":"SUCCESS","failValue":"FAILED","pollPath":"/v1/video/generations/{task_id}"}`,
			capabilities: `{}`,
			version:      1,
		},
		{
			// 007 播种 + 008 重写响应 + 012 定类型。
			id:    "pt_builtin_minimax_text",
			label: "MiniMax 文本",
			desc:  "MiniMax 文本对话（chatcompletion_v2），响应结构与 OpenAI 兼容。",
			typ:   "text", method: "POST", requestPath: "/v1/text/chatcompletion_v2",
			params:         `[{"key":"stream","value":"false"}]`,
			responseParams: `[{"key":"choices.0.message.content","type":"string","value":"文本正文"}]`,
			async:          `{}`,
			capabilities:   `{}`,
			version:        1,
		},
		{
			// 007 播种 + 008 重写响应与 async + 012 定类型。
			id:    "pt_builtin_minimax_video",
			label: "MiniMax 视频（异步任务）",
			desc:  "视频生成走异步任务：提交返回 task_id，轮询查询进度与成品。",
			typ:   "video", method: "POST", requestPath: "/v1/video_generation",
			params: `[]`,
			responseParams: `[{"key":"task_id","type":"string","value":"任务 ID（轮询查询进度）"},` +
				`{"key":"status","type":"string","value":"任务状态（轮询判断完成/失败）"},` +
				`{"key":"file_id","type":"string","value":"成品文件 ID"}]`,
			// 008 原样 + 029 补 pollPath（GET /v1/query/video_generation?task_id=<id>
			// 实测 200+base_resp.status_code=1004 鉴权失败签名，同前缀近邻路径 404 ⇒ 路由存在）。
			// 030：doneValue/failValue 改为 MiniMax 官方顶层 status 枚举的确切值
			// completed / failed（008 写的 Success/Failed 与枚举都不相等，成功与失败都检测不到，
			// 必然空转到 6 分钟超时）。执行器按逗号分隔 + 大小写不敏感匹配，queued/in_progress
			// 是有意的「继续轮询」态。
			async:        `{"enabled":true,"taskIdField":"task_id","statusField":"status","doneValue":"completed","failValue":"failed","pollPath":"/v1/query/video_generation?task_id={task_id}"}`,
			capabilities: `{}`,
			version:      1,
		},
		{
			// 007 播种 + 009 重写响应（v+1）+ 010 升级 params（v+1）+ 012 定类型 + 021 能力声明 → v3。
			id:    "pt_builtin_openai",
			label: "OpenAI 兼容（Chat / Images）",
			desc:  "标准 chat/completions 与 images/generations，响应按 choices 提取文本、data[].url 提取图片。",
			typ:   "text", method: "POST", requestPath: "/v1/chat/completions",
			params: `[{"key":"model","value":"","type":"string","role":"model","required":true,"desc":"对话模型 ID（执行器注入模型标识 providerModel）"},` +
				`{"key":"messages","value":"","type":"array","role":"runtime","required":true,"desc":"对话消息数组，按时间顺序排列（执行器按会话/剧本构造）"},` +
				`{"key":"temperature","value":"0.7","type":"number","role":"static","desc":"采样温度，>= 0 <= 2，默认 1"},` +
				`{"key":"top_p","value":"1","type":"number","role":"static","desc":"核采样，>= 0 <= 1，默认 1"},` +
				`{"key":"max_tokens","value":"1024","type":"number","role":"static","desc":"最大输出 token 数，>= 1"},` +
				`{"key":"n","value":"1","type":"number","role":"static","desc":"生成候选数，>= 1，默认 1"},` +
				`{"key":"stream","value":"false","type":"bool","role":"static","desc":"是否 SSE 流式返回，默认 false"},` +
				`{"key":"presence_penalty","value":"0","type":"number","role":"static","desc":"话题新鲜度惩罚，>= -2 <= 2，默认 0"},` +
				`{"key":"frequency_penalty","value":"0","type":"number","role":"static","desc":"频率惩罚，>= -2 <= 2，默认 0"},` +
				`{"key":"stop","value":"[\"\\n\"]","type":"array","role":"static","desc":"停止序列数组（JSON 字符串）"},` +
				`{"key":"tools","value":"","type":"array","role":"runtime","desc":"Function Calling 工具列表（OpenAI 格式，平台按需注入）"},` +
				`{"key":"tool_choice","value":"auto","type":"string","role":"static","desc":"工具选择策略：auto / none / 指定函数"},` +
				`{"key":"response_format","value":"{\"type\":\"json_object\"}","type":"object","role":"static","desc":"强制输出格式（JSON 字符串）"},` +
				`{"key":"user","value":"","type":"string","role":"runtime","desc":"终端用户标识，用于审计与风控"}]`,
			responseParams: `[{"key":"choices.0.message.content","type":"string","value":"文本正文（无工具调用时）"},` +
				`{"key":"choices.0.message.tool_calls","type":"array","value":"工具调用列表（函数名/参数）"},` +
				`{"key":"choices.0.finish_reason","type":"string","value":"结束原因（stop / tool_calls / length）"},` +
				`{"key":"usage.prompt_tokens","type":"number","value":"输入 Token 数"},` +
				`{"key":"usage.completion_tokens","type":"number","value":"输出 Token 数"},` +
				`{"key":"usage.total_tokens","type":"number","value":"总 Token 数"},` +
				`{"key":"id","type":"string","value":"会话 ID"},` +
				`{"key":"model","type":"string","value":"实际使用的模型"},` +
				`{"key":"created","type":"number","value":"生成时间戳"}]`,
			async: `{}`,
			capabilities: `{"text-chat":{"request_path":"/v1/chat/completions","method":"POST",` +
				`"required_params":["messages"],` +
				`"param_mapping":{"messages":"messages","temperature":"temperature","top_p":"top_p","max_tokens":"max_tokens",` +
				`"stream":"stream","presence_penalty":"presence_penalty","frequency_penalty":"frequency_penalty"},` +
				`"response_extract":{"text":"choices.0.message.content","usage":"usage"}}}`,
			version: 3,
		},
		{
			// 009 新增 + 013 升级 params（v+1）+ 012 定类型 + 021 能力声明 → v2。
			id:    "pt_builtin_openai_img",
			label: "OpenAI 兼容图片（Images API）",
			desc:  "images/generations 形态，响应取 data[].url 提取图片地址。",
			typ:   "image", method: "POST", requestPath: "/v1/images/generations",
			params: `[{"key":"model","role":"model","type":"string","required":true,"desc":"图片生成模型 ID（执行器注入 providerModel）"},` +
				`{"key":"prompt","role":"runtime","type":"string","required":true,"desc":"图片描述（执行器按业务构造）"},` +
				`{"key":"n","role":"static","value":"1","type":"number","desc":"生成张数"},` +
				`{"key":"size","role":"static","value":"1024x1024","type":"string","desc":"图片尺寸"},` +
				`{"key":"quality","role":"static","value":"standard","type":"string","desc":"质量档（standard/hd）"},` +
				`{"key":"response_format","role":"static","value":"url","type":"string","desc":"返回格式（url/b64_json）"}]`,
			responseParams: `[{"key":"data.0.url","type":"string","value":"图片地址"}]`,
			async:          `{}`,
			capabilities: `{"text-to-image":{"request_path":"/v1/images/generations","method":"POST",` +
				`"required_params":["prompt"],` +
				`"param_mapping":{"prompt":"prompt","negative_prompt":"negative_prompt","aspect_ratio":"aspect_ratio",` +
				`"n":"n","seed":"seed","response_format":"response_format"},` +
				`"response_extract":{"image_url":"data.0.url","image_b64":"data.0.b64_json"}},` +
				`"image-to-image":{"request_path":"/v1/images/edits","method":"POST",` +
				`"required_params":["prompt","image"],` +
				`"param_mapping":{"prompt":"prompt","reference_images[0].url":"image","strength":"strength",` +
				`"aspect_ratio":"aspect_ratio","n":"n","response_format":"response_format"},` +
				`"response_extract":{"image_url":"data.0.url","image_b64":"data.0.b64_json"}}}`,
			version: 2,
		},
		{
			// TASK-PROTOCOL-005：迁移 061 生成器产出 + 201 落 DB；注册表补 canonical 定义；
			// 迁移 067 修 pollPath 占位符 {id}→{task_id}（执行器 ReplaceAll 硬约束）。→ v1。
			id:    "pt_builtin_openai_video",
			label: "OpenAI 兼容 · 视频生成（PearAPI/openai-video）",
			desc:  "videos/generations 形态，异步轮询，响应取 task_id 跟踪任务。",
			typ:   "video", method: "POST", requestPath: "/v1/videos/generations",
			params:         `[]`,
			responseParams: `[]`,
			async: `{"enabled":true,"taskIdField":"id","statusField":"status","doneValue":"completed","failValue":"failed",` +
				`"pollPath":"/v1/videos/{task_id}","timeoutMinutes":1440,"pollIntervalSeconds":15}`,
			capabilities: `{"text-to-video":{"method":"POST","request_path":"/v1/videos/generations",` +
				`"param_mapping":{"model":"model","prompt":"prompt","metadata.duration":"metadata.duration",` +
				`"metadata.resolution":"metadata.resolution","metadata.generate_audio":"metadata.generate_audio"},` +
				`"required_params":["prompt"],` +
				`"response_extract":{"status":"status","task_id":"task_id"}},` +
				`"image-to-video":{"method":"POST","request_path":"/v1/videos/generations",` +
				`"param_mapping":{"model":"model","prompt":"prompt","metadata.duration":"metadata.duration",` +
				`"metadata.resolution":"metadata.resolution","metadata.generate_audio":"metadata.generate_audio",` +
				`"reference_images[0].url":"metadata.content[0].image_url"},` +
				`"required_params":["prompt"],` +
				`"response_extract":{"status":"status","task_id":"task_id"}}}`,
			version: 1,
		},
		{
			// 068 播种（TASK-PROTOCOL-006）：OpenAI Responses API，protocol-gen 实战首战。
			id:    "pt_builtin_openai_responses",
			label: "OpenAI Responses API（text-chat）",
			desc:  "OpenAI 新一代 Responses API：POST /v1/responses 同步返回（可 stream）。协议定义由 protocol-gen 从 OpenAI 官方 openapi.json（v2.3.0）确定性生成。",
			typ:   "text", method: "POST", requestPath: "/v1/responses",
			params:         `[{"key":"metadata","type":"object"},{"key":"prompt_cache_key","type":"object"},{"key":"prompt_cache_retention","type":"object"},{"key":"safety_identifier","type":"object"},{"key":"temperature","type":"object"},{"key":"top_logprobs","type":"object"},{"key":"top_p","type":"object"},{"key":"user","type":"object","desc":"This field is being replaced by 'safety_identifier' and 'prompt_cache_key'. Use 'prompt_cache_key' instead to maintain caching optimizations.\nA stable identifier for your end-users.\nUsed to boost cache hit rates by better bucketing similar requests and  to help OpenAI detect and prevent abuse. [Learn more](https://developers.openai.com/api/docs/guides/safety-best-practices#implement-safety-identifiers).\n"},{"key":"prompt_cache_options","type":"object"},{"key":"background","type":"object"},{"key":"max_tool_calls","type":"object"},{"key":"model","type":"object","role":"model","desc":"Model ID used to generate the response, like 'gpt-6-astra'. OpenAI\noffers a wide range of models with different capabilities, performance\ncharacteristics, and price points. Refer to the [model guide](https://developers.openai.com/api/docs/models)\nto browse and compare available models.\n"},{"key":"previous_response_id","type":"object"},{"key":"prompt","type":"object"},{"key":"text","type":"object"},{"key":"tool_choice","type":"object"},{"key":"tools","type":"object"},{"key":"access_programs","type":"object"},{"key":"context_management","type":"object"},{"key":"conversation","type":"object"},{"key":"include","type":"object"},{"key":"input","type":"object"},{"key":"instructions","type":"object"},{"key":"max_output_tokens","type":"object"},{"key":"moderation","type":"object"},{"key":"parallel_tool_calls","type":"object"},{"key":"reasoning","type":"object"},{"key":"service_tier","type":"object"},{"key":"store","type":"object"},{"key":"stream","type":"object"},{"key":"stream_options","type":"object"},{"key":"truncation","type":"object"}]`,
			responseParams: `[{"key":"metadata","type":"object"},{"key":"prompt_cache_key","type":"object"},{"key":"prompt_cache_retention","type":"object"},{"key":"safety_identifier","type":"object"},{"key":"temperature","type":"object"},{"key":"top_logprobs","type":"object"},{"key":"top_p","type":"object"},{"key":"user","type":"object"},{"key":"background","type":"object"},{"key":"max_tool_calls","type":"object"},{"key":"model","type":"object"},{"key":"previous_response_id","type":"object"},{"key":"prompt","type":"object"},{"key":"text","type":"object"},{"key":"tool_choice","type":"object"},{"key":"tools","type":"object"},{"key":"access_programs","type":"object"},{"key":"completed_at","type":"object"},{"key":"conversation","type":"object"},{"key":"created_at","type":"number"},{"key":"error","type":"object"},{"key":"id","type":"string"},{"key":"incomplete_details","type":"object"},{"key":"instructions","type":"object"},{"key":"max_output_tokens","type":"object"},{"key":"moderation","type":"object"},{"key":"object","type":"string"},{"key":"output_text","type":"object"},{"key":"parallel_tool_calls","type":"boolean"},{"key":"prompt_cache_diagnostics","type":"object"},{"key":"prompt_cache_options","type":"object"},{"key":"reasoning","type":"object"},{"key":"service_tier","type":"object"},{"key":"status","type":"string"},{"key":"truncation","type":"object"},{"key":"usage","type":"object"},{"key":"output.0.","type":"object"}]`,
			async:          `{}`,
			capabilities: `{"text-chat":{"request_path":"/v1/responses","method":"POST",` +
				`"required_params":["model"],` +
				`"param_mapping":{"model":"model","prompt":"prompt","instructions":"instructions",` +
				`"max_output_tokens":"max_output_tokens","temperature":"temperature","top_p":"top_p",` +
				`"stream":"stream","tools":"tools","tool_choice":"tool_choice","store":"store",` +
				`"metadata":"metadata","user":"user"},` +
				`"response_extract":{"text":"output_text","usage":"usage"}}}`,
			version: 1,
		},
	}

	if len(cases) != len(builtinTemplateIDs) {
		t.Fatalf("golden table has %d rows, want one per builtin id (%d)", len(cases), len(builtinTemplateIDs))
	}
	for _, tc := range cases {
		def, ok := ProtocolDefinitionByID(tc.id)
		if !ok {
			t.Errorf("%s: missing from registry", tc.id)
			continue
		}
		if def.Label != tc.label {
			t.Errorf("%s label:\n got: %q\nwant: %q", tc.id, def.Label, tc.label)
		}
		if def.Desc != tc.desc {
			t.Errorf("%s desc:\n got: %q\nwant: %q", tc.id, def.Desc, tc.desc)
		}
		if def.Type != tc.typ || def.Method != tc.method || def.RequestPath != tc.requestPath {
			t.Errorf("%s shape: got type=%q method=%q path=%q, want type=%q method=%q path=%q",
				tc.id, def.Type, def.Method, def.RequestPath, tc.typ, tc.method, tc.requestPath)
		}
		if def.Version != tc.version {
			t.Errorf("%s version = %d, want %d (migration-final)", tc.id, def.Version, tc.version)
		}
		tmpl := def.Template()
		// params/response_params 用「空值 ≡ 缺省」的规范化比较：迁移 010 显式写
		// "value":""、迁移 013 直接省略 value 键；Go 的 Param.Value 无 omitempty，
		// 统一输出 "value":""。两者对执行器（缺省视为空串）语义相同。
		jsonParamsEqual(t, tc.id+" params", tmpl.Params, tc.params)
		jsonParamsEqual(t, tc.id+" responseParams", tmpl.ResponseParams, tc.responseParams)
		jsonEqual(t, tc.id+" async", tmpl.Async, tc.async)
		jsonEqual(t, tc.id+" capabilities", tmpl.Capabilities, tc.capabilities)
	}
}

// TestProtocolDefinitionsAsyncConsistency 记录「异步声明」的已知缺陷台账。
//
// 断言形式：不是让当前测试失败的硬断言，而是把「当前已知违规集合」显式写死。
// 一旦有人修好某个缺陷，或新增一个违规，本测试就会失败并提示更新台账 —— 缺陷
// 因此始终是「有记录的」而不是「悄悄存在的」。
func TestProtocolDefinitionsAsyncConsistency(t *testing.T) {
	// 台账（唯一允许的违规集合）。修复数据后请同步缩减本表；新增违规则必须显式加行。
	// 2026-10-10 / 迁移 029：即梦视频与 MiniMax 视频的 pollPath 均已按探测证据补齐，
	// 台账由 2 条清空为 0 条。空切片而非 nil：与「零违规」时 got 的形态保持一致
	// （reflect.DeepEqual(nil, []string{}) == false，用 nil 会让零违规反而判失败）。
	wantViolations := []string{}

	got := []string{}
	for _, def := range ProtocolDefinitions() {
		if !def.Async.Enabled {
			continue
		}
		// enabled=true ⇒ taskIdField/statusField/doneValue/failValue 非空，pollPath 必须含
		// {task_id} 占位符。failValue 与 doneValue 同等重要：它决定失败态能否被识别
		// （识别不了就会空转到超时，并使重试机制失效）。
		if strings.TrimSpace(def.Async.TaskIDField) == "" {
			got = append(got, def.ID+": taskIdField 为空")
		}
		if strings.TrimSpace(def.Async.StatusField) == "" {
			got = append(got, def.ID+": statusField 为空")
		}
		if strings.TrimSpace(def.Async.DoneValue) == "" {
			got = append(got, def.ID+": doneValue 为空")
		}
		if strings.TrimSpace(def.Async.FailValue) == "" {
			got = append(got, def.ID+": failValue 为空")
		}
		switch {
		case strings.TrimSpace(def.Async.PollPath) == "":
			got = append(got, def.ID+": pollPath 为空（执行器退化到硬编码 /v1/images/tasks/{task_id}）")
		case !strings.Contains(def.Async.PollPath, "{task_id}"):
			got = append(got, def.ID+": pollPath 缺少 {task_id} 占位符")
		}
	}
	sort.Strings(got)
	if !reflect.DeepEqual(got, wantViolations) {
		t.Fatalf("异步声明违规集合发生变化，请同步更新台账：\n got: %v\nwant: %v", got, wantViolations)
	}
}

// TestProtocolDefinitionsPollPathShape 校验已填 pollPath 的形状满足执行器拼 URL 的硬要求。
//
// execution/internal/engine/engine.go 的异步轮询是
//
//	pollURL := strings.TrimRight(creds.BaseURL, "/") + strings.ReplaceAll(async.PollPath, "{task_id}", taskID)
//
// 因此 pollPath 非空时：① 必须以 "/" 开头（否则与 BaseURL 拼成 "...aisome/path" 这种坏 URL）；
// ② 必须含 "{task_id}" 占位符（否则 ReplaceAll 无目标，所有任务轮询同一个 URL）。
// 空值不在此处判违规 —— 那属于上面的缺陷台账管辖，本测试只保证「一旦填了就不能填坏」。
func TestProtocolDefinitionsPollPathShape(t *testing.T) {
	checked := 0
	for _, def := range ProtocolDefinitions() {
		if !def.Async.Enabled {
			continue
		}
		pollPath := strings.TrimSpace(def.Async.PollPath)
		if pollPath == "" {
			continue
		}
		checked++
		if !strings.HasPrefix(pollPath, "/") {
			t.Errorf("%s: pollPath %q 必须以 \"/\" 开头（执行器按 BaseURL+pollPath 直接拼接）",
				def.ID, pollPath)
		}
		if !strings.Contains(pollPath, "{task_id}") {
			t.Errorf("%s: pollPath %q 必须包含 {task_id} 占位符（执行器用 ReplaceAll 替换）",
				def.ID, pollPath)
		}
	}
	// 防止断言变成空转：至少要有异步定义确实填了 pollPath 才谈得上校验。
	if checked == 0 {
		t.Fatal("没有任何 async 定义带非空 pollPath，本断言形同虚设")
	}
}

func assertJSONArray(t *testing.T, what string, raw json.RawMessage) {
	t.Helper()
	var probe []any
	if err := json.Unmarshal(raw, &probe); err != nil {
		t.Errorf("%s: not a JSON array: %v (%s)", what, err, raw)
	}
}

func assertJSONObject(t *testing.T, what string, raw json.RawMessage) {
	t.Helper()
	var probe map[string]any
	if err := json.Unmarshal(raw, &probe); err != nil {
		t.Errorf("%s: not a JSON object: %v (%s)", what, err, raw)
	}
}

func jsonEqual(t *testing.T, what string, got json.RawMessage, want string) {
	t.Helper()
	var gotValue, wantValue any
	if err := json.Unmarshal(got, &gotValue); err != nil {
		t.Errorf("%s: cannot decode actual value: %v (%s)", what, err, got)
		return
	}
	if err := json.Unmarshal([]byte(want), &wantValue); err != nil {
		t.Fatalf("%s: invalid expectation json: %v (%s)", what, err, want)
	}
	if !reflect.DeepEqual(gotValue, wantValue) {
		t.Errorf("%s mismatch:\n got: %s\nwant: %s", what, got, want)
	}
}

// jsonParamsEqual 比较参数数组，语义上把「空值」与「缺省」视为等价
// （迁移 010 写 "value":""，迁移 013 省略 value；执行器两者都按空串处理）。
func jsonParamsEqual(t *testing.T, what string, got json.RawMessage, want string) {
	t.Helper()
	gotParams := canonicalParams(t, what, got)
	wantParams := canonicalParams(t, what, json.RawMessage(want))
	if !reflect.DeepEqual(gotParams, wantParams) {
		t.Errorf("%s mismatch:\n got: %s\nwant: %s", what, got, want)
	}
}

func canonicalParams(t *testing.T, what string, raw json.RawMessage) []map[string]any {
	t.Helper()
	var entries []map[string]any
	if err := json.Unmarshal(raw, &entries); err != nil {
		t.Fatalf("%s: not a JSON array: %v (%s)", what, err, raw)
	}
	for _, entry := range entries {
		for key, value := range entry {
			switch typed := value.(type) {
			case string:
				if typed == "" {
					delete(entry, key)
				}
			case bool:
				if !typed {
					delete(entry, key)
				}
			case nil:
				delete(entry, key)
			}
		}
	}
	return entries
}
