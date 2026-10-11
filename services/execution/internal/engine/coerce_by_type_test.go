package engine

import (
	"encoding/json"
	"testing"
)

// T7 回归护栏：界面把参数当字符串发（Record<string,string>），引擎必须按模板声明的 type
// 规范成正确的 JSON 类型 —— 否则严格上游会因类型不符拒绝。
//
// 真机事故：某中转站对 `"max_tokens":"32"` / `"temperature":"0.7"` / `"stream":"false"`
// 一律返回 503「请求参数有误」，数字/布尔形式返回 200。
func TestResolveParamsCoercesTypedBusinessStrings(t *testing.T) {
	tpl := Template{
		ID: "pt_builtin_openai", Method: "POST", RequestPath: "/v1/chat/completions",
		Params: []Param{
			{Key: "model", Role: "model", Type: "string"},
			{Key: "messages", Role: "runtime", Type: "array", Required: true},
			{Key: "max_tokens", Role: "static", Type: "number", Value: "1024"},
			{Key: "temperature", Role: "static", Type: "number", Value: "0.7"},
			{Key: "stream", Role: "static", Type: "bool", Value: "false"},
			{Key: "stop", Role: "static", Type: "array", Value: `["\n"]`},
			{Key: "response_format", Role: "static", Type: "object", Value: `{"type":"json_object"}`},
			{Key: "user", Role: "runtime", Type: "string"},
		},
	}
	req := RunRequest{
		ProviderModel:    "deepseek-v4-pro-0813",
		ProtocolTemplate: tpl,
		Runtime: map[string]any{
			"messages": []any{map[string]any{"role": "user", "content": "hi"}},
			// 界面发来的就是字符串（覆盖 static 默认值）
			"__max_tokens":  "32",
			"__temperature": "0.3",
			"__stream":      "true",
			"user":          "007", // 声明为 string ⇒ 必须保持字符串（不得被"看起来像数字"改写）
		},
	}
	body := assembleParamsBody(req)
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("实际请求体: %s", raw)

	if v, ok := body["max_tokens"].(float64); !ok || v != 32 {
		t.Fatalf("max_tokens 必须是数字 32（字符串会被严格上游拒绝），实际 %T %v", body["max_tokens"], body["max_tokens"])
	}
	if v, ok := body["temperature"].(float64); !ok || v != 0.3 {
		t.Fatalf("temperature 必须是数字 0.3，实际 %T %v", body["temperature"], body["temperature"])
	}
	if v, ok := body["stream"].(bool); !ok || v != true {
		t.Fatalf("stream 必须是布尔 true，实际 %T %v", body["stream"], body["stream"])
	}
	if _, ok := body["messages"].([]any); !ok {
		t.Fatalf("messages 必须保持数组，实际 %T", body["messages"])
	}
	if v, ok := body["user"].(string); !ok || v != "007" {
		t.Fatalf("声明为 string 的字段不得被改写：期望 \"007\"，实际 %T %v", body["user"], body["user"])
	}
	if v, ok := body["stop"].([]any); !ok || len(v) != 1 {
		t.Fatalf("stop 必须是数组，实际 %T %v", body["stop"], body["stop"])
	}
	if _, ok := body["response_format"].(map[string]any); !ok {
		t.Fatalf("response_format 必须是对象，实际 %T", body["response_format"])
	}
}

// 保守边界：未声明 type 时不得做"看起来像数字就转"的推断。
func TestCoerceByTypeIsConservative(t *testing.T) {
	cases := []struct {
		in   any
		typ  string
		want any
	}{
		{"32", "number", float64(32)},
		{"0.7", "number", 0.7},
		{"true", "bool", true},
		{"false", "boolean", false},
		{`[1,2]`, "array", []any{float64(1), float64(2)}},
		{`{"a":1}`, "object", map[string]any{"a": float64(1)}},
		{"007", "string", "007"},
		{"007", "", "007"},       // 未声明 ⇒ 不猜
		{"abc", "number", "abc"}, // 解析失败 ⇒ 原样（让上游如实报错）
		{42, "number", 42},       // 已是数字 ⇒ 不动
		{true, "bool", true},     // 已是布尔 ⇒ 不动
		{nil, "number", nil},     // nil ⇒ 不动
	}
	for _, c := range cases {
		got := coerceByType(c.in, c.typ)
		if !jsonEqual(got, c.want) {
			t.Errorf("coerceByType(%#v, %q) = %#v，期望 %#v", c.in, c.typ, got, c.want)
		}
	}
}

func jsonEqual(a, b any) bool {
	ra, _ := json.Marshal(a)
	rb, _ := json.Marshal(b)
	return string(ra) == string(rb)
}

// ★ T7 的第二处（第一版修复漏掉的地方）：动态参数（__passthrough）在组装**之后**覆盖 body，
// 因此必须在这里也做类型规范化 —— 否则参数映射引擎产出的字符串会直接上线。
func TestInjectDynamicCoercesPassthrough(t *testing.T) {
	tpl := Template{
		ID: "pt_builtin_openai",
		Params: []Param{
			{Key: "max_tokens", Role: "static", Type: "number", Value: "1024"},
			{Key: "stream", Role: "static", Type: "bool", Value: "false"},
			{Key: "user", Role: "runtime", Type: "string"},
		},
	}
	req := RunRequest{
		ProviderModel:    "m",
		ProtocolTemplate: tpl,
		Runtime: map[string]any{
			"__passthrough": map[string]any{
				"max_tokens": "64",   // 界面字符串 ⇒ 必须变数字
				"stream":     "true", // 必须变布尔
				"user":       "007",  // 声明 string ⇒ 保持字符串
				"undeclared": "5",    // 未声明类型 ⇒ 保持原样（不猜）
			},
		},
	}
	body := map[string]any{}
	injectDynamic(body, "sync", req)
	if v, ok := body["max_tokens"].(float64); !ok || v != 64 {
		t.Fatalf("passthrough 的 max_tokens 必须是数字 64，实际 %T %v", body["max_tokens"], body["max_tokens"])
	}
	if v, ok := body["stream"].(bool); !ok || v != true {
		t.Fatalf("passthrough 的 stream 必须是布尔 true，实际 %T %v", body["stream"], body["stream"])
	}
	if v, ok := body["user"].(string); !ok || v != "007" {
		t.Fatalf("声明为 string 的字段不得被改写，实际 %T %v", body["user"], body["user"])
	}
	if v, ok := body["undeclared"].(string); !ok || v != "5" {
		t.Fatalf("未声明类型的字段必须原样保留，实际 %T %v", body["undeclared"], body["undeclared"])
	}
	if body["task_type"] != "sync" {
		t.Fatalf("task_type 应被注入，实际 %v", body["task_type"])
	}
}
