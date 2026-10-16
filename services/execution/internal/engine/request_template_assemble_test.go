// 请求体组装域测试（TASK-PROC-008：BE-SIZE-001「一个文件一个域」拆分）。
//
// 从 request_template_test.go（745 行超上限）按域拆出：真实字节兼容、URL 组装、
// 模板逐字透传与动态注入。**纯搬移**：测试函数体与断言逐字未改。
package engine

import (
	"encoding/json"
	"reflect"
	"testing"
)

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
