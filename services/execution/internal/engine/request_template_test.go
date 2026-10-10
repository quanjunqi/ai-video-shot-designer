package engine

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
)

// ---- 渲染器单测（ADR-007 D3 语义表） ----

func TestRenderRequestTemplate(t *testing.T) {
	cases := []struct {
		name   string
		tpl    string
		values map[string]any
		want   string
	}{
		{
			name:   "字符串原样插入（不加引号，引号由模板作者写）",
			tpl:    `{"prompt":"{{prompt}}"}`,
			values: map[string]any{"prompt": "一只猫"},
			want:   `{"prompt":"一只猫"}`,
		},
		{
			name:   "数字为 JSON 字面量",
			tpl:    `{"n":{{n}},"ratio":{{ratio}}}`,
			values: map[string]any{"n": 1, "ratio": 1.5},
			want:   `{"n":1,"ratio":1.5}`,
		},
		{
			name:   "整数值的 float64 不渲染成 1.0",
			tpl:    `{"n":{{n}}}`,
			values: map[string]any{"n": float64(3)},
			want:   `{"n":3}`,
		},
		{
			name:   "布尔为 JSON 字面量",
			tpl:    `{"stream":{{stream}}}`,
			values: map[string]any{"stream": false},
			want:   `{"stream":false}`,
		},
		{
			name:   "对象为 JSON 文本",
			tpl:    `{"input_reference":{{ref}}}`,
			values: map[string]any{"ref": map[string]any{"image_url": "https://cdn/x.png", "strength": 0.6}},
			want:   `{"input_reference":{"image_url":"https://cdn/x.png","strength":0.6}}`,
		},
		{
			name:   "数组为 JSON 文本",
			tpl:    `{"stop":{{stop}}}`,
			values: map[string]any{"stop": []any{"\n", "###"}},
			want:   `{"stop":["\n","###"]}`,
		},
		{
			name:   "嵌套结构：数组里放对象（模板能表达的形态）",
			tpl:    `{"messages":{{messages}}}`,
			values: map[string]any{"messages": []any{map[string]any{"role": "user", "content": "你好"}}},
			want:   `{"messages":[{"content":"你好","role":"user"}]}`,
		},
		{
			name:   "占位符两侧允许空格",
			tpl:    `{"stream":{{ stream }},"p":"{{  prompt  }}"}`,
			values: map[string]any{"stream": false, "prompt": "x"},
			want:   `{"stream":false,"p":"x"}`,
		},
		{
			name:   "同一占位符出现多次",
			tpl:    `{"a":"{{v}}","b":"{{v}}"}`,
			values: map[string]any{"v": "z"},
			want:   `{"a":"z","b":"z"}`,
		},
		{
			name:   "nil 渲染为 null",
			tpl:    `{"tools":{{tools}}}`,
			values: map[string]any{"tools": nil},
			want:   `{"tools":null}`,
		},
		{
			name:   "空模板返回空串（是否回退由调用方决定）",
			tpl:    "",
			values: map[string]any{"a": 1},
			want:   "",
		},
		{
			name:   "无占位符的模板原样返回（不做任何改写）",
			tpl:    "{\n  \"stream\": false\n}",
			values: map[string]any{"stream": true},
			want:   "{\n  \"stream\": false\n}",
		},
		{
			name:   "未闭合的 {{ 视为普通文本（不误伤请求体里的合法内容）",
			tpl:    `{"text":"a {{ b"}`,
			values: map[string]any{},
			want:   `{"text":"a {{ b"}`,
		},
		{
			name:   "空 key（{{}} / {{ }}）视为普通文本",
			tpl:    `{"a":{{}},"b":{{  }}}`,
			values: map[string]any{"": "x"},
			want:   `{"a":{{}},"b":{{  }}}`,
		},
		{
			name:   "multipart 形态：模板文本即请求体（渲染器不假设 JSON）",
			tpl:    "--B\r\nContent-Disposition: form-data; name=\"prompt\"\r\n\r\n{{prompt}}\r\n--B--\r\n",
			values: map[string]any{"prompt": "一只猫"},
			want:   "--B\r\nContent-Disposition: form-data; name=\"prompt\"\r\n\r\n一只猫\r\n--B--\r\n",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := RenderRequestTemplate(tc.tpl, tc.values)
			if err != nil {
				t.Fatalf("RenderRequestTemplate: %v", err)
			}
			if got != tc.want {
				t.Fatalf("RenderRequestTemplate:\n got: %q\nwant: %q", got, tc.want)
			}
		})
	}
}

// TestRenderRequestTemplateMissingValue 锁定「缺失 key → 明确错误」的选择：
// 既不静默替换成空串（会生成 "model":, 这类残缺 JSON），也不把 {{key}} 原样留在请求体里。
func TestRenderRequestTemplateMissingValue(t *testing.T) {
	_, err := RenderRequestTemplate(`{"model":"{{model}}","n":{{n}}}`, map[string]any{"model": "m"})
	if err == nil {
		t.Fatal("missing placeholder value must return an error, got nil")
	}
	if !errors.Is(err, ErrTemplateMissingValue) {
		t.Fatalf("err = %v, want ErrTemplateMissingValue", err)
	}
	if !strings.Contains(err.Error(), "{{n}}") {
		t.Fatalf("error must name the missing placeholder, got: %v", err)
	}
}

// TestRenderRequestTemplateRawStringIsCallerResponsibility 锁定字符串「原样插入」的后果：
// 值里含引号/换行时，插入后的请求体不再是合法 JSON —— 这是模板作者的责任（模板里写引号；
// 需要插入任意字符串时应放入已 JSON 编码的值，且模板不要再额外写引号）。
func TestRenderRequestTemplateRawStringIsCallerResponsibility(t *testing.T) {
	// ① 原样插入的裸字符串会破坏 JSON：渲染本身成功（渲染器不猜作者意图、不做转义）。
	rendered, err := RenderRequestTemplate(`{"prompt":"{{prompt}}"}`, map[string]any{"prompt": "he said \"hi\"\nbye"})
	if err != nil {
		t.Fatalf("RenderRequestTemplate: %v", err)
	}
	var probe map[string]any
	if err := json.Unmarshal([]byte(rendered), &probe); err == nil {
		t.Fatalf("裸字符串插入含引号/换行的值本应破坏 JSON，实际可解析：%s", rendered)
	}

	// ② 调用方承担转义：取值表里放已 JSON 编码的字符串，模板不再写引号 → 合法 JSON。
	quoted, err := json.Marshal("he said \"hi\"\nbye")
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	rendered, err = RenderRequestTemplate(`{"prompt":{{prompt}}}`, map[string]any{"prompt": string(quoted)})
	if err != nil {
		t.Fatalf("RenderRequestTemplate: %v", err)
	}
	if err := json.Unmarshal([]byte(rendered), &probe); err != nil {
		t.Fatalf("已编码的值不应破坏 JSON: %v (%s)", err, rendered)
	}
	if probe["prompt"] != "he said \"hi\"\nbye" {
		t.Fatalf("prompt = %q", probe["prompt"])
	}
}

// ---- 装配点：兼容性 + 共享语义 ----

// legacyBodyReference 复刻重构前同步路径（Run 内联）的完整装配：
// params 合并 → role 三分类 → task_type 注入（async 声明非空）→ __passthrough 注入 → marshal。
//
// 与改动前源码逐字一致，唯一差别是删掉了从未被读取的 order 切片（对返回值无影响）。
// 它的作用是**锁定重构后字节完全一致**：assembleBody 必须与它输出同样的字节。
func legacyBodyReference(req RunRequest) ([]byte, error) {
	byKey := map[string]Param{}
	for _, p := range req.ProtocolTemplate.Params {
		byKey[p.Key] = p
	}
	for _, p := range req.ModelParams {
		if p.Key != "" {
			byKey[p.Key] = p
		}
	}
	body := map[string]any{}
	for _, p := range req.ProtocolTemplate.Params {
		spec, ok := byKey[p.Key]
		if !ok {
			continue
		}
		if p.Key == "" {
			continue
		}
		switch spec.Role {
		case "model":
			body[p.Key] = req.ProviderModel
		case "runtime":
			if v, has := req.Runtime[p.Key]; has {
				body[p.Key] = v
			}
		default:
			if v, has := req.Runtime["__"+p.Key]; has {
				body[p.Key] = v
				continue
			}
			val := strings.TrimSpace(spec.Value)
			if val == "" {
				continue
			}
			body[p.Key] = parseJSONValue(val)
		}
	}
	if len(req.ProtocolTemplate.Async) > 0 {
		body["task_type"] = "sync"
	}
	if pt, ok := req.Runtime["__passthrough"].(map[string]any); ok {
		for k, v := range pt {
			if k != "" && v != nil {
				body[k] = v
			}
		}
	}
	return json.Marshal(body)
}

// TestAssembleBodyLegacyBytesUnchanged 锁定兼容底线：
// RequestTemplate 为空时，assembleBody 与改动前的装配实现输出**同样的字节**（键序/类型/省略规则）。
func TestAssembleBodyLegacyBytesUnchanged(t *testing.T) {
	openAIParams := []Param{
		{Key: "model", Value: "", Type: "string", Role: "model", Required: true},
		{Key: "messages", Value: "", Type: "array", Role: "runtime", Required: true},
		{Key: "temperature", Value: "0.7", Type: "number", Role: "static"},
		{Key: "stream", Value: "false", Type: "bool", Role: "static"},
		{Key: "stop", Value: `["\n"]`, Type: "array", Role: "static"},
		{Key: "response_format", Value: `{"type":"json_object"}`, Type: "object", Role: "static"},
		{Key: "tools", Value: "", Type: "array", Role: "runtime"},
		{Key: "user", Value: "", Type: "string", Role: "runtime"},
	}
	cases := []struct {
		name string
		req  RunRequest
	}{
		{
			name: "完整三分类",
			req: RunRequest{
				ProviderModel: "gpt-4o",
				ProtocolTemplate: Template{
					ID: "t", Method: "POST", RequestPath: "/v1/chat/completions",
					Params: openAIParams, Async: json.RawMessage(`{}`),
				},
				Runtime: map[string]any{
					"messages": []any{map[string]any{"role": "user", "content": "hi"}},
					"user":     "u-1",
				},
			},
		},
		{
			name: "runtime 字段缺失 → 省略（不写空值）",
			req: RunRequest{
				ProviderModel: "gpt-4o",
				ProtocolTemplate: Template{
					ID: "t", Params: openAIParams, Async: json.RawMessage(`{}`),
				},
				Runtime: map[string]any{},
			},
		},
		{
			name: "模型级 params 覆盖模板默认值（仅覆盖已声明 key）",
			req: RunRequest{
				ProviderModel: "gpt-4o",
				ProtocolTemplate: Template{
					ID: "t", Params: openAIParams, Async: json.RawMessage(`{}`),
				},
				ModelParams: []Param{{Key: "temperature", Value: "1.2", Role: "static"}},
				Runtime:     map[string]any{"__temperature": 0.1},
			},
		},
		{
			name: "静态空默认值不发送 + __key 覆盖优先",
			req: RunRequest{
				ProviderModel: "m",
				ProtocolTemplate: Template{
					ID: "t", Params: openAIParams, Async: json.RawMessage(`{}`),
				},
				Runtime: map[string]any{"__stream": true},
			},
		},
		{
			name: "async 声明非空 → 注入 task_type=sync",
			req: RunRequest{
				ProviderModel: "m",
				ProtocolTemplate: Template{
					ID: "t", Params: []Param{{Key: "model", Role: "model"}},
					Async: json.RawMessage(`{"enabled":true}`),
				},
				Runtime: map[string]any{},
			},
		},
		{
			name: "async 声明为空串 → 不注入 task_type",
			req: RunRequest{
				ProviderModel:    "m",
				ProtocolTemplate: Template{ID: "t", Params: []Param{{Key: "model", Role: "model"}}},
				Runtime:          map[string]any{},
			},
		},
		{
			name: "passthrough 注入并覆盖模板字段",
			req: RunRequest{
				ProviderModel: "m",
				ProtocolTemplate: Template{
					ID: "t", Params: openAIParams, Async: json.RawMessage(`{}`),
				},
				Runtime: map[string]any{
					"__passthrough": map[string]any{"stream": true, "seed": 42, "empty": nil, "": "skip"},
				},
			},
		},
		{
			name: "无模板参数（自定义/空定义）",
			req: RunRequest{
				ProviderModel:    "m",
				ProtocolTemplate: Template{ID: "t", Params: []Param{}, Async: json.RawMessage(`{}`)},
				Runtime:          map[string]any{"prompt": "x"},
			},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			taskType := ""
			if len(tc.req.ProtocolTemplate.Async) > 0 {
				taskType = "sync"
			}
			want, err := legacyBodyReference(tc.req)
			if err != nil {
				t.Fatalf("reference: %v", err)
			}
			got, err := assembleBody(tc.req, taskType)
			if err != nil {
				t.Fatalf("assembleBody: %v", err)
			}
			if string(got) != string(want) {
				t.Fatalf("legacy bytes changed:\n got: %s\nwant: %s", got, want)
			}
		})
	}
}

// TestBuildURLShared 锁定 URL 组装的共用实现（同步/异步曾各写一份）。
func TestBuildURLShared(t *testing.T) {
	cases := []struct {
		name  string
		creds Credentials
		req   RunRequest
		want  string
	}{
		{"模板路径", Credentials{BaseURL: "https://api.example.com/"}, RunRequest{ProtocolTemplate: Template{RequestPath: "/v1/chat/completions"}}, "https://api.example.com/v1/chat/completions"},
		{"模型级路径优先", Credentials{BaseURL: "https://api.example.com"}, RunRequest{ModelRequestPath: "/v1/images/edits", ProtocolTemplate: Template{RequestPath: "/v1/images/generations"}}, "https://api.example.com/v1/images/edits"},
		{"路径不以斜杠开头时补斜杠", Credentials{BaseURL: "https://api.example.com/"}, RunRequest{ProtocolTemplate: Template{RequestPath: "prompt"}}, "https://api.example.com/prompt"},
		{"无路径", Credentials{BaseURL: "https://api.example.com"}, RunRequest{}, "https://api.example.com"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := buildURL(tc.creds, tc.req); got != tc.want {
				t.Fatalf("buildURL = %q, want %q", got, tc.want)
			}
		})
	}
}

// TestAssembleBodyTemplateVerbatimWithoutInjection 锁定模板形态的「所见即所得」：
// 没有 task_type / __passthrough 需要注入时，渲染结果**逐字**就是请求体（不重新序列化、
// 不排序键、不压缩空白），multipart 等非 JSON 形态因此可用。
func TestAssembleBodyTemplateVerbatimWithoutInjection(t *testing.T) {
	tpl := "{\n\t\"model\": \"{{model}}\",\n\t\"z\": 1,\n\t\"a\": 2\n}"
	req := RunRequest{
		ProviderModel: "m-1",
		ProtocolTemplate: Template{
			ID: "t", Params: []Param{{Key: "model", Role: "model"}}, RequestTemplate: tpl,
		},
		Runtime: map[string]any{},
	}
	got, err := assembleBody(req, "")
	if err != nil {
		t.Fatalf("assembleBody: %v", err)
	}
	want := "{\n\t\"model\": \"m-1\",\n\t\"z\": 1,\n\t\"a\": 2\n}"
	if string(got) != want {
		t.Fatalf("template body must be verbatim:\n got: %q\nwant: %q", got, want)
	}

	// multipart：模板文本即字节，不需要是 JSON。
	multipart := RunRequest{
		ProviderModel: "m-1",
		ProtocolTemplate: Template{
			ID: "mp", RequestTemplate: "--B\r\nname=\"prompt\"\r\n\r\n{{prompt}}\r\n--B--\r\n",
		},
		Runtime: map[string]any{"prompt": "一只猫"},
	}
	got, err = assembleBody(multipart, "")
	if err != nil {
		t.Fatalf("assembleBody (multipart): %v", err)
	}
	if string(got) != "--B\r\nname=\"prompt\"\r\n\r\n一只猫\r\n--B--\r\n" {
		t.Fatalf("multipart body = %q", got)
	}
}

// TestAssembleBodyTemplateDynamicInjection 锁定模板形态下动态注入的规则：
// task_type 先写、__passthrough 后写（passthrough 可覆盖）；nil/空 key 跳过。
// 若模板渲染结果不是 JSON 对象却需要注入，必须返回明确错误（不能静默发出残缺请求体）。
func TestAssembleBodyTemplateDynamicInjection(t *testing.T) {
	req := RunRequest{
		ProviderModel: "m-1",
		ProtocolTemplate: Template{
			ID: "t", Params: []Param{{Key: "model", Role: "model"}},
			RequestTemplate: `{"model":"{{model}}"}`,
		},
		Runtime: map[string]any{
			"__passthrough": map[string]any{"seed": 7, "task_type": "custom", "nil": nil, "": "skip"},
		},
	}
	got, err := assembleBody(req, "sync")
	if err != nil {
		t.Fatalf("assembleBody: %v", err)
	}
	var doc map[string]any
	if err := json.Unmarshal(got, &doc); err != nil {
		t.Fatalf("unmarshal: %v (%s)", err, got)
	}
	// passthrough 在 task_type 之后写入 → 覆盖掉 "sync"，与改动前 params 形态的顺序一致。
	want := map[string]any{"model": "m-1", "seed": float64(7), "task_type": "custom"}
	if !reflect.DeepEqual(doc, want) {
		t.Fatalf("body = %v, want %v", doc, want)
	}
	if _, has := doc["nil"]; has {
		t.Fatalf("nil passthrough value must be skipped: %v", doc)
	}
	if _, has := doc[""]; has {
		t.Fatalf("empty passthrough key must be skipped: %v", doc)
	}

	// 需要注入但不是 JSON 对象 → 明确报错（渲染本身成功：占位符有值）。
	bad := RunRequest{
		ProviderModel: "m-1",
		ProtocolTemplate: Template{
			ID: "mp", Params: []Param{{Key: "model", Role: "model"}},
			RequestTemplate: "not json {{model}}",
		},
		Runtime: map[string]any{"__passthrough": map[string]any{"seed": 1}},
	}
	if _, err := assembleBody(bad, ""); err == nil {
		t.Fatal("non-JSON template body with passthrough injection must fail loudly")
	}
}

// ---- 等价性证明（ADR-007 D3 的核心测试） ----

// minimaxTextLegacyParams / minimaxTextRequestTemplate 逐字来自 production 注册表里
// pt_builtin_minimax_text 的两个形态：
//
//	services/production/internal/catalog/protocol_registry.go
//	（golden 台账 services/production/internal/catalog/protocol_registry_test.go::TestProtocolDefinitionsRequestTemplate
//	 锁定该模板文本；本文件从**执行器**一侧证明它与 params 形态等价。）
var minimaxTextLegacyParams = []Param{{Key: "stream", Value: "false"}}

const minimaxTextRequestTemplate = `{"stream":{{stream}},"task_type":"sync"}`

// TestRequestTemplateEquivalenceBuiltinMinimaxText 是本切片的金标准测试：
// 对**同一组输入**，新模板形态渲染出的请求体与旧 params[] 组装结果语义相等
// （两边 json.Unmarshal 成 map 后 reflect.DeepEqual，避免键序/空白差异误报）。
//
// 覆盖：默认取值、模型级覆盖、__key 覆盖、业务 runtime 字段、__passthrough 动态参数
// （含覆盖模板字段与 task_type）、以及同步/异步两条装配入口。
func TestRequestTemplateEquivalenceBuiltinMinimaxText(t *testing.T) {
	legacyTemplate := func() Template {
		return Template{
			ID:    "pt_builtin_minimax_text",
			Label: "MiniMax 文本",
			// params 形态：Async 为 "{}" ⇒ 同步路径会注入 task_type=sync（执行器既有行为）。
			Method: "POST", RequestPath: "/v1/text/chatcompletion_v2",
			Params: minimaxTextLegacyParams, Async: json.RawMessage(`{}`),
		}
	}
	templateForm := func() Template {
		tmpl := legacyTemplate()
		tmpl.RequestTemplate = minimaxTextRequestTemplate
		return tmpl
	}

	cases := []struct {
		name        string
		modelParams []Param
		runtime     map[string]any
	}{
		{
			name:    "默认取值",
			runtime: map[string]any{},
		},
		{
			name:    "业务 runtime 字段（模板未引用，两边都不应出现）",
			runtime: map[string]any{"messages": []any{map[string]any{"role": "user", "content": "你好"}}, "user": "u-1"},
		},
		{
			name:        "模型级覆盖静态值",
			modelParams: []Param{{Key: "stream", Value: "true", Role: "static"}},
			runtime:     map[string]any{},
		},
		{
			name:    "__key 运行时覆盖",
			runtime: map[string]any{"__stream": true},
		},
		{
			name:    "__passthrough 新增动态参数",
			runtime: map[string]any{"__passthrough": map[string]any{"top_k": 5, "seed": 42, "model": "abab6.5s-chat"}},
		},
		{
			name:    "__passthrough 覆盖模板字段（stream）与 task_type",
			runtime: map[string]any{"__passthrough": map[string]any{"stream": true, "task_type": "custom"}},
		},
		{
			name:        "全部输入叠加",
			modelParams: []Param{{Key: "stream", Value: "false", Role: "static"}},
			runtime: map[string]any{
				"messages":      []any{map[string]any{"role": "user", "content": "hi"}},
				"__passthrough": map[string]any{"seed": 1.0, "stop": []any{"###"}},
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			legacyReq := RunRequest{
				ChannelID: "ch-1", ProviderModel: "abab6.5s-chat",
				ProtocolTemplate: legacyTemplate(), ModelParams: tc.modelParams, Runtime: tc.runtime,
			}
			newReq := RunRequest{
				ChannelID: "ch-1", ProviderModel: "abab6.5s-chat",
				ProtocolTemplate: templateForm(), ModelParams: tc.modelParams, Runtime: tc.runtime,
			}

			// ① 同步装配入口（Run 用的是 assembleBody(req, "sync")）。
			legacyBody, err := assembleBody(legacyReq, "sync")
			if err != nil {
				t.Fatalf("legacy assembleBody: %v", err)
			}
			newBody, err := assembleBody(newReq, "sync")
			if err != nil {
				t.Fatalf("template assembleBody: %v", err)
			}
			assertJSONSemanticallyEqual(t, "sync body", legacyBody, newBody)

			// ② 异步装配入口（RunAsync → buildRequest：不注入 task_type，之后由 RunAsync 注入 async）。
			creds := Credentials{BaseURL: "https://api.example.com/"}
			legacyURL, legacySubmit, err := buildRequest(creds, legacyReq)
			if err != nil {
				t.Fatalf("legacy buildRequest: %v", err)
			}
			newURL, newSubmit, err := buildRequest(creds, newReq)
			if err != nil {
				t.Fatalf("template buildRequest: %v", err)
			}
			if legacyURL != newURL {
				t.Fatalf("url changed: %q vs %q", legacyURL, newURL)
			}
			// buildRequest 之后的 task_type=async 注入由 RunAsync 完成（本切片未改动）。
			// 这里复刻那一步，比较**上线时的字节语义**。
			assertJSONSemanticallyEqual(t, "async wire body", asyncWireBody(t, legacySubmit), asyncWireBody(t, newSubmit))
		})
	}
}

// TestRequestTemplateEquivalenceSyntheticNested 用合成定义证明「模板不是另一种东西」：
// 当模板逐字复刻 params[] 形态的形状时，任何输入下两边语义相等；同时证明模板能表达
// params[] 表达不了的嵌套形态（input_reference 对象、参考图放进字段里）。
//
// 已知差异（如实记录，不强行等价）：params[] 形态会**省略**缺失的 runtime 字段，
// 模板形态对缺失的占位符**报错**（ErrTemplateMissingValue）—— 这是有意的响亮失败，
// 见 TestRenderRequestTemplateMissingValue 的理由。
func TestRequestTemplateEquivalenceSyntheticNested(t *testing.T) {
	params := []Param{
		{Key: "model", Role: "model", Type: "string", Required: true},
		{Key: "prompt", Role: "runtime", Type: "string", Required: true},
		{Key: "n", Role: "static", Value: "1", Type: "number"},
		{Key: "seed", Role: "static", Value: "7", Type: "number"},
		{Key: "stop", Role: "static", Value: `["\n"]`, Type: "array"},
		{Key: "response_format", Role: "static", Value: `{"type":"url"}`, Type: "object"},
	}
	// 逐字复刻 params[] 形状的模板（同一输入 ⇒ 同一请求体）。
	flatTemplate := `{"model":"{{model}}","prompt":"{{prompt}}","n":{{n}},"seed":{{seed}},"stop":{{stop}},"response_format":{{response_format}},"task_type":"sync"}`
	// params[] 表达不了的形态：参考图放进嵌套字段 input_reference。
	nestedTemplate := `{"model":"{{model}}","input_reference":{"image_url":"{{prompt}}","strength":0.6},"n":{{n}},"seed":{{seed}},"stop":{{stop}},"response_format":{{response_format}},"task_type":"sync"}`

	base := func() Template {
		return Template{
			ID: "synthetic", Method: "POST", RequestPath: "/v1/images/generations",
			Params: params, Async: json.RawMessage(`{}`),
		}
	}
	inputs := []map[string]any{
		{"prompt": "一只猫"},
		{"prompt": "一只猫", "seed": 11},
		{"prompt": "一只猫", "__passthrough": map[string]any{"size": "1024x1024"}},
	}
	for i, runtime := range inputs {
		legacyReq := RunRequest{ProviderModel: "img-1", ProtocolTemplate: base(), Runtime: runtime}
		legacyBody, err := assembleBody(legacyReq, "sync")
		if err != nil {
			t.Fatalf("case %d: legacy assembleBody: %v", i, err)
		}

		flat := base()
		flat.RequestTemplate = flatTemplate
		flatBody, err := assembleBody(RunRequest{ProviderModel: "img-1", ProtocolTemplate: flat, Runtime: runtime}, "sync")
		if err != nil {
			t.Fatalf("case %d: flat template assembleBody: %v", i, err)
		}
		assertJSONSemanticallyEqual(t, "flat template body", legacyBody, flatBody)

		nested := base()
		nested.RequestTemplate = nestedTemplate
		nestedBody, err := assembleBody(RunRequest{ProviderModel: "img-1", ProtocolTemplate: nested, Runtime: runtime}, "sync")
		if err != nil {
			t.Fatalf("case %d: nested template assembleBody: %v", i, err)
		}
		var doc map[string]any
		if err := json.Unmarshal(nestedBody, &doc); err != nil {
			t.Fatalf("case %d: nested body invalid JSON: %v (%s)", i, err, nestedBody)
		}
		ref, ok := doc["input_reference"].(map[string]any)
		if !ok {
			t.Fatalf("case %d: nested body missing input_reference object: %v", i, doc)
		}
		if ref["image_url"] != runtime["prompt"] || ref["strength"] != 0.6 {
			t.Fatalf("case %d: input_reference = %v", i, ref)
		}
	}

	// 已知差异：缺失 runtime 占位符 → 模板形态报错，params[] 形态省略该字段。
	missingRuntime := map[string]any{}
	legacyReq := RunRequest{ProviderModel: "img-1", ProtocolTemplate: base(), Runtime: missingRuntime}
	if _, err := assembleBody(legacyReq, "sync"); err != nil {
		t.Fatalf("params form should omit the absent runtime field, got: %v", err)
	}
	flat := base()
	flat.RequestTemplate = flatTemplate
	if _, err := assembleBody(RunRequest{ProviderModel: "img-1", ProtocolTemplate: flat, Runtime: missingRuntime}, "sync"); !errors.Is(err, ErrTemplateMissingValue) {
		t.Fatalf("template form must fail loudly on absent placeholder value, got: %v", err)
	}
}

// TestRequestTemplateAsyncSubmitEndToEnd 证明模板形态在**异步真实链路**上可用：
// 渲染出的请求体原样提交（含嵌套字段），RunAsync 仍按既有行为注入 task_type=async。
func TestRequestTemplateAsyncSubmitEndToEnd(t *testing.T) {
	var submitBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/v1/videos/generations":
			if err := json.NewDecoder(r.Body).Decode(&submitBody); err != nil {
				t.Errorf("decode submit body: %v", err)
			}
			_, _ = w.Write([]byte(`{"task_id":"t-9","status":"queued"}`))
		case r.Method == http.MethodGet && r.URL.Path == "/v1/tasks/t-9":
			_, _ = w.Write([]byte(`{"status":"SUCCESS","output":{"url":"https://cdn.example.com/v.mp4"}}`))
		default:
			t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	c := NewAPIConnector(ExecutorConfig{
		Type:        ExecutorTypeAPI,
		Credentials: Credentials{BaseURL: srv.URL, AuthType: "bearer", APIKey: testAPIKey},
	})
	res, err := c.Submit(context.Background(), ExecutorRequest{
		ProviderModel: "video-1",
		Async:         true,
		Input:         map[string]any{"prompt": "一只猫"},
		ProtocolTemplate: Template{
			ID: "tpl-async", Label: "async-template", Method: http.MethodPost,
			RequestPath: "/v1/videos/generations",
			Async:       json.RawMessage(`{"enabled":true,"taskIdField":"task_id","statusField":"status","doneValue":"SUCCESS","failValue":"FAILED","pollPath":"/v1/tasks/{task_id}"}`),
			Params:      []Param{{Key: "model", Role: "model"}, {Key: "prompt", Role: "runtime"}},
			// 模板里写 task_type=sync，RunAsync 必须按既有行为覆盖为 async。
			RequestTemplate: `{"model":"{{model}}","input":{"prompt":"{{prompt}}"},"task_type":"sync"}`,
			ResponseParams:  []Param{{Key: "output.url", Type: "string"}},
		},
	})
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	if res.Status != TaskStatusSucceeded {
		t.Fatalf("status = %v, want succeeded", res.Status)
	}
	want := map[string]any{
		"model":     "video-1",
		"task_type": "async",
		"input":     map[string]any{"prompt": "一只猫"},
	}
	if !reflect.DeepEqual(submitBody, want) {
		t.Fatalf("submit body = %v, want %v", submitBody, want)
	}
	if got := res.Extracted["output.url"]; got != "https://cdn.example.com/v.mp4" {
		t.Fatalf("extracted = %v", got)
	}
}

// asyncWireBody 复刻 RunAsync 在 buildRequest 之后的既有行为：解析提交体、注入
// task_type=async、重新序列化。该行为本切片未改动，并由 TestRequestTemplateAsyncSubmitEndToEnd
// （模板形态）与既有的 TestAPIConnectorSubmitAsync（params 形态）端到端锁定。
func asyncWireBody(t *testing.T, raw []byte) []byte {
	t.Helper()
	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatalf("async submit body is not a JSON object: %v (%s)", err, raw)
	}
	doc["task_type"] = "async"
	out, err := json.Marshal(doc)
	if err != nil {
		t.Fatalf("marshal async body: %v", err)
	}
	return out
}

// assertJSONSemanticallyEqual 比较两个请求体的 JSON 语义（键序/空白无关）。
func assertJSONSemanticallyEqual(t *testing.T, what string, got, want []byte) {
	t.Helper()
	var gotDoc, wantDoc any
	if err := json.Unmarshal(got, &gotDoc); err != nil {
		t.Fatalf("%s: invalid actual JSON: %v (%s)", what, err, got)
	}
	if err := json.Unmarshal(want, &wantDoc); err != nil {
		t.Fatalf("%s: invalid expected JSON: %v (%s)", what, err, want)
	}
	if !reflect.DeepEqual(gotDoc, wantDoc) {
		t.Fatalf("%s not equivalent:\n got: %s\nwant: %s", what, got, want)
	}
}
