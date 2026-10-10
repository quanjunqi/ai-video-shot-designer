package catalog

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestGetDecodesRequestTemplate 锁定跨服务 JSON 契约（ADR-007 D3）：
// production 的 protocol_templates 行（迁移 028 的 request_template）序列化为 JSON 键
// `requestTemplate`，执行器的目录客户端必须解出它——服务边界只有 JSON 契约，没有编译期约束，
// 键名/omitempty 任何一侧改动都会让模板形态在运行时**静默失效**（退回 params[] 组装）。
func TestGetDecodesRequestTemplate(t *testing.T) {
	const body = `{
	  "models": [],
	  "channels": [],
	  "templates": [
	    {
	      "id": "pt_builtin_minimax_text",
	      "label": "MiniMax 文本",
	      "method": "POST",
	      "requestPath": "/v1/text/chatcompletion_v2",
	      "params": [{"key": "stream", "value": "false"}],
	      "responseParams": [{"key": "choices.0.message.content"}],
	      "async": {},
	      "capabilities": {},
	      "requestTemplate": "{\"stream\":{{stream}},\"task_type\":\"sync\"}"
	    },
	    {
	      "id": "pt_no_template",
	      "label": "未迁移模板",
	      "method": "POST",
	      "requestPath": "/v1/x",
	      "params": [],
	      "responseParams": [],
	      "async": {},
	      "capabilities": {}
	    }
	  ]
	}`

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer tok" {
			t.Errorf("Authorization = %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(body))
	}))
	defer srv.Close()

	dir, err := NewClient(srv.URL, "tok").Get(context.Background(), "ws-1", "actor-1")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if len(dir.Templates) != 2 {
		t.Fatalf("templates = %d, want 2", len(dir.Templates))
	}
	if got, want := dir.Templates[0].RequestTemplate, `{"stream":{{stream}},"task_type":"sync"}`; got != want {
		t.Fatalf("requestTemplate = %q, want %q", got, want)
	}
	if dir.Templates[1].RequestTemplate != "" {
		t.Fatalf("absent requestTemplate must decode as empty (params[] form), got %q", dir.Templates[1].RequestTemplate)
	}
}
