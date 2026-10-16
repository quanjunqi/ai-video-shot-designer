// 模板等价性与异步端到端域测试（TASK-PROC-008：BE-SIZE-001「一个文件一个域」拆分）。
//
// 从 request_template_test.go（745 行超上限）按域拆出：内建模板等价性、嵌套模板等价性、
// 异步提交端到端，以及两处本域专用断言辅助。**纯搬移**：函数体与断言逐字未改。
package engine

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
)

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
