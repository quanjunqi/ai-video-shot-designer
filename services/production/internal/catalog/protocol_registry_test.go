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
			// 008 原样：注意没有 pollPath（已知缺陷，见异步一致性测试台账）。
			async:        `{"enabled":true,"taskIdField":"task_id","statusField":"status","doneValue":"SUCCESS","failValue":"FAILED"}`,
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
			// 008 原样：注意没有 pollPath（已知缺陷，见异步一致性测试台账）。
			async:        `{"enabled":true,"taskIdField":"task_id","statusField":"status","doneValue":"Success","failValue":"Failed"}`,
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
	wantViolations := []string{
		"pt_builtin_jimeng_video: pollPath 为空（执行器退化到硬编码 /v1/images/tasks/{task_id}）",
		"pt_builtin_minimax_video: pollPath 为空（执行器退化到硬编码 /v1/images/tasks/{task_id}）",
	}

	var got []string
	for _, def := range ProtocolDefinitions() {
		if !def.Async.Enabled {
			continue
		}
		// enabled=true ⇒ taskIdField/statusField/doneValue 非空，pollPath 必须含 {task_id} 占位符。
		if strings.TrimSpace(def.Async.TaskIDField) == "" {
			got = append(got, def.ID+": taskIdField 为空")
		}
		if strings.TrimSpace(def.Async.StatusField) == "" {
			got = append(got, def.ID+": statusField 为空")
		}
		if strings.TrimSpace(def.Async.DoneValue) == "" {
			got = append(got, def.ID+": doneValue 为空")
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

func TestMergeTemplatesPrecedence(t *testing.T) {
	base := map[string]ProtocolTemplate{}
	for _, tmpl := range RegistryTemplates() {
		base[tmpl.ID] = tmpl
	}

	// DB 行：① 被管理员改过的内置行 ② 未改动的内置行 ③ 自定义模板；
	// 故意让 pt_builtin_jimeng_video 在 DB 中缺失，用于验证注册表补齐。
	editedOpenAI := base["pt_builtin_openai"]
	editedOpenAI.Label = "管理员覆盖的 OpenAI"
	editedOpenAI.RequestPath = "/v1/chat/completions/admin"
	editedOpenAI.Version = 9
	editedOpenAI.Source = ""
	custom := ProtocolTemplate{
		ID: "pt_custom_demo", Label: "自定义协议", Desc: "专家自定义", Type: "text",
		Method: "POST", RequestPath: "/custom", Params: json.RawMessage(`[]`),
		ResponseParams: json.RawMessage(`[]`), Async: json.RawMessage(`{}`),
		Capabilities: json.RawMessage(`{}`), Builtin: false, Enabled: true, Version: 4,
	}
	db := []ProtocolTemplate{editedOpenAI, base["pt_builtin_comfyui"], custom}

	merged := MergeTemplates(db)

	// 8 个内置 + 1 个自定义 = 9（DB 缺的 1 个内置由注册表补齐）。
	if len(merged) != 9 {
		t.Fatalf("merged length = %d, want 9", len(merged))
	}
	byID := map[string]ProtocolTemplate{}
	for _, tmpl := range merged {
		if _, dup := byID[tmpl.ID]; dup {
			t.Errorf("duplicate id %q in merged output", tmpl.ID)
		}
		byID[tmpl.ID] = tmpl
	}

	// 规则 1：DB 行优先（覆盖注册表默认值）。
	openai, ok := byID["pt_builtin_openai"]
	if !ok {
		t.Fatal("pt_builtin_openai missing from merged output")
	}
	if openai.Label != "管理员覆盖的 OpenAI" || openai.RequestPath != "/v1/chat/completions/admin" || openai.Version != 9 {
		t.Errorf("DB row did not win for pt_builtin_openai: %+v", openai)
	}
	if openai.Source != TemplateSourceBuiltin {
		t.Errorf("pt_builtin_openai source = %q, want %q", openai.Source, TemplateSourceBuiltin)
	}

	// 规则 2：DB 缺失的 id 由注册表补齐（builtin=true）。
	jimengVideo, ok := byID["pt_builtin_jimeng_video"]
	if !ok {
		t.Fatal("pt_builtin_jimeng_video was not backfilled from the registry")
	}
	if !jimengVideo.Builtin || jimengVideo.Source != TemplateSourceBuiltin {
		t.Errorf("backfilled template must be builtin: %+v", jimengVideo)
	}
	if !reflect.DeepEqual(jimengVideo, base["pt_builtin_jimeng_video"]) {
		t.Errorf("backfilled template differs from registry:\n got: %+v\nwant: %+v", jimengVideo, base["pt_builtin_jimeng_video"])
	}

	// 规则 3：自定义模板原样保留。
	gotCustom, ok := byID["pt_custom_demo"]
	if !ok {
		t.Fatal("custom template was dropped by the merge")
	}
	if gotCustom.Source != TemplateSourceCustom {
		t.Errorf("custom template source = %q, want %q", gotCustom.Source, TemplateSourceCustom)
	}
	custom.Source = TemplateSourceCustom // 合并只补 source，其余字段必须逐字段相等
	if !reflect.DeepEqual(gotCustom, custom) {
		t.Errorf("custom template was modified:\n got: %+v\nwant: %+v", gotCustom, custom)
	}

	// 规则 4：结果按 id 稳定排序，且多次调用输出一致。
	for i := 1; i < len(merged); i++ {
		if merged[i-1].ID >= merged[i].ID {
			t.Errorf("merged output not sorted by id: %q >= %q", merged[i-1].ID, merged[i].ID)
		}
	}
	if again := MergeTemplates(db); !reflect.DeepEqual(merged, again) {
		t.Error("MergeTemplates is not deterministic for identical input")
	}
	// 合并不得就地修改入参（Directory 里传的是刚扫描出来的行）。
	if db[0].Source != "" {
		t.Errorf("MergeTemplates mutated its input: source = %q", db[0].Source)
	}
	if again := MergeTemplates(nil); len(again) != len(builtinTemplateIDs) {
		t.Errorf("merge with empty DB: got %d templates, want %d", len(again), len(builtinTemplateIDs))
	}
}

func TestResolveTemplateByID(t *testing.T) {
	def, ok := ProtocolDefinitionByID("pt_builtin_openai")
	if !ok {
		t.Fatal("pt_builtin_openai missing from registry")
	}
	edited := def.Template()
	edited.Label = "覆盖后的标签"
	edited.Source = ""
	db := []ProtocolTemplate{edited}

	got, ok := ResolveTemplateByID(db, "pt_builtin_openai")
	if !ok || got.Label != "覆盖后的标签" || got.Source != TemplateSourceBuiltin {
		t.Errorf("DB hit should win and get builtin source: %+v (ok=%v)", got, ok)
	}

	got, ok = ResolveTemplateByID(db, "pt_builtin_jimeng_video")
	if !ok || !got.Builtin || got.RequestPath != "/v1/videos/generations" {
		t.Errorf("registry fallback failed: %+v (ok=%v)", got, ok)
	}

	if _, ok := ResolveTemplateByID(db, "pt_unknown"); ok {
		t.Error("unknown id unexpectedly resolved")
	}
}

// TestMergedTemplatesJSONCompatibility 保证新增的 source 字段是追加式的、
// 且非异步模板的 async 仍序列化为 {}（既有 JSON 消费者不受影响）。
func TestMergedTemplatesJSONCompatibility(t *testing.T) {
	encoded, err := json.Marshal(MergeTemplates(nil))
	if err != nil {
		t.Fatalf("marshal merged templates: %v", err)
	}
	var rows []map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &rows); err != nil {
		t.Fatalf("unmarshal merged templates: %v", err)
	}
	if len(rows) != len(builtinTemplateIDs) {
		t.Fatalf("encoded %d templates, want %d", len(rows), len(builtinTemplateIDs))
	}
	for _, row := range rows {
		var id string
		if err := json.Unmarshal(row["id"], &id); err != nil {
			t.Fatalf("template id invalid: %v (%s)", err, row["id"])
		}
		var source string
		if err := json.Unmarshal(row["source"], &source); err != nil {
			t.Fatalf("source missing or invalid: %v", err)
		}
		if source != TemplateSourceBuiltin {
			t.Errorf("source = %q, want %q", source, TemplateSourceBuiltin)
		}
		var async ProtocolAsync
		if err := json.Unmarshal(row["async"], &async); err != nil {
			t.Fatalf("async invalid: %v", err)
		}
		if !async.Enabled && string(row["async"]) != "{}" {
			t.Errorf("non-async template async = %s, want {}", row["async"])
		}
		// requestTemplate 是追加式 + omitempty：空模板不得出现该键（既有消费者不受影响），
		// 非空模板必须出现且逐字等于注册表值。
		raw, present := row["requestTemplate"]
		def, ok := ProtocolDefinitionByID(id)
		if !ok {
			t.Fatalf("encoded template id not in registry: %s", id)
		}
		if def.RequestTemplate == "" {
			if present {
				t.Errorf("%s: empty requestTemplate must be omitted from JSON, got %s", def.ID, raw)
			}
			continue
		}
		if !present {
			t.Errorf("%s: requestTemplate missing from JSON", def.ID)
			continue
		}
		var decoded string
		if err := json.Unmarshal(raw, &decoded); err != nil {
			t.Fatalf("%s: requestTemplate invalid: %v", def.ID, err)
		}
		if decoded != def.RequestTemplate {
			t.Errorf("%s: requestTemplate = %q, want %q", def.ID, decoded, def.RequestTemplate)
		}
	}
}

// TestProtocolDefinitionsRequestTemplate 是 ADR-007 D3（请求模板）的台账：
// 本切片只迁移**一个**内置定义用于等价性证明，其余 7 个必须保持 params[] 形态（空模板）。
//
// 断言形式与 TestProtocolDefinitionsAsyncConsistency 一致：把当前允许的迁移集合写死，
// 谁新增/删除一个模板形态都会失败并提示更新台账，避免「迁移悄悄扩散」。
func TestProtocolDefinitionsRequestTemplate(t *testing.T) {
	// 台账（唯一允许携带请求模板的内置定义 → 模板文本）。
	// 文本必须与 services/execution/internal/engine/request_template_test.go 里
	// 等价性用例使用的文本逐字一致：那边证明「渲染结果 ≡ params[] 组装结果」。
	want := map[string]string{
		"pt_builtin_minimax_text": `{"stream":{{stream}},"task_type":"sync"}`,
	}

	got := map[string]string{}
	for _, def := range ProtocolDefinitions() {
		if def.RequestTemplate == "" {
			continue
		}
		got[def.ID] = def.RequestTemplate
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("请求模板迁移台账发生变化，请同步更新本表：\n got: %v\nwant: %v", got, want)
	}

	// Template() 必须把模板透出（否则执行器永远收不到它）；空模板保持空串。
	for _, tmpl := range RegistryTemplates() {
		if tmpl.RequestTemplate != want[tmpl.ID] {
			t.Errorf("%s: Template().RequestTemplate = %q, want %q", tmpl.ID, tmpl.RequestTemplate, want[tmpl.ID])
		}
	}

	// 迁移到模板形态的定义必须**保留** params：占位符取值仍由 params 的三分类解析
	// （本切片不做「模板自带全部静态字面量」的形态）。
	def, ok := ProtocolDefinitionByID("pt_builtin_minimax_text")
	if !ok {
		t.Fatal("pt_builtin_minimax_text missing from registry")
	}
	if len(def.Params) == 0 {
		t.Error("pt_builtin_minimax_text: 迁移到请求模板后 params 不能为空（{{stream}} 取值来源）")
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
