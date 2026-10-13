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

// TestGetDecodesCostFields 锁定 T0 价格契约：production 目录投影的权威成本四字段
// （costAmount/costUnit/priceSource/priceSyncedAt）必须被 execution 解出。
// 服务边界只有 JSON 契约，键名任何一侧改动都会让审计成本**静默回退为 0**（ADR-004 §1 的 33 倍差价问题复发）。
// 例外（合法）：无校准价的模型省略 costAmount → 解出 nil，即"预估"口径，不得报错。
func TestGetDecodesCostFields(t *testing.T) {
	const body = `{
	  "channels": [],
	  "models": [
	    {
	      "id": "mod_a",
	      "channelId": "ch_1",
	      "type": "text",
	      "name": "校准模型",
	      "providerModel": "p-a",
	      "protocolTemplateId": "pt_1",
	      "requestPath": "/v1/x",
	      "method": "POST",
	      "params": [],
	      "capability": {},
	      "logicalModelId": "lm_1",
	      "routePriority": 10,
	      "status": "enabled",
	      "costAmount": 0.06,
	      "costUnit": "per_call",
	      "priceSource": "synced",
	      "priceSyncedAt": "2026-10-10T08:00:00Z"
	    },
	    {
	      "id": "mod_b",
	      "channelId": "ch_2",
	      "type": "image",
	      "name": "未校准模型",
	      "providerModel": "p-b",
	      "protocolTemplateId": "pt_2",
	      "requestPath": "/v1/y",
	      "method": "POST",
	      "params": [],
	      "capability": {},
	      "logicalModelId": "lm_2",
	      "routePriority": 20,
	      "status": "enabled"
	    }
	  ],
	  "templates": []
	}`

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(body))
	}))
	defer srv.Close()

	dir, err := NewClient(srv.URL, "tok").Get(context.Background(), "ws-1", "actor-1")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if len(dir.Models) != 2 {
		t.Fatalf("models = %d, want 2", len(dir.Models))
	}
	a := dir.Models[0]
	if a.CostAmount == nil || *a.CostAmount != 0.06 {
		t.Fatalf("mod_a costAmount = %v, want 0.06", a.CostAmount)
	}
	if a.CostUnit != "per_call" {
		t.Fatalf("mod_a costUnit = %q, want per_call", a.CostUnit)
	}
	if a.PriceSource != "synced" {
		t.Fatalf("mod_a priceSource = %q, want synced", a.PriceSource)
	}
	if a.PriceSyncedAt.IsZero() {
		t.Fatalf("mod_a priceSyncedAt = zero, want parsed time")
	}
	b := dir.Models[1]
	if b.CostAmount != nil {
		t.Fatalf("mod_b costAmount must be nil (uncalibrated), got %v", b.CostAmount)
	}
	if b.CostUnit != "" || b.PriceSource != "" {
		t.Fatalf("mod_b must decode absent cost fields as zero values, got unit=%q source=%q", b.CostUnit, b.PriceSource)
	}
}
