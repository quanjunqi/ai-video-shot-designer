package engine

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// applyAuth 是鉴权写入的唯一出口。本表覆盖全部分支：
//   - 数据驱动路径（AuthHeader 非空）：空/非空前缀、自定义头名
//   - 兜底映射路径（AuthHeader 为空）：五种 auth_type + 未知值
//
// 兼容性底线：兜底映射必须与 ADR-007 D2 之前逐字一致（见 ADR-007 D2 前的实现）。
func TestApplyAuth_HeaderPerAuthType(t *testing.T) {
	cases := []struct {
		name       string
		authType   string
		authHeader string
		authPrefix string
		key        string
		wantHeader string // 期望被写入的头名；空 = 不应写任何头
		wantValue  string // 期望的头值
	}{
		// ① 数据驱动 + 非空前缀
		{
			name: "data-driven with prefix", authHeader: "Authorization", authPrefix: "Bearer ",
			key: "sk-1", wantHeader: "Authorization", wantValue: "Bearer sk-1",
		},
		// ② 数据驱动 + 空前缀（裸 Token）
		{
			name: "data-driven bare token", authHeader: "Authorization", authPrefix: "",
			key: "sk-1", wantHeader: "Authorization", wantValue: "sk-1",
		},
		// ⑤ 自定义头名必须真的生效（不是硬编码 Authorization）
		{
			name: "data-driven custom header", authHeader: "X-Api-Key", authPrefix: "",
			key: "sk-1", wantHeader: "X-Api-Key", wantValue: "sk-1",
		},
		{
			name: "data-driven custom header with prefix", authHeader: "X-Token", authPrefix: "Token ",
			key: "sk-9", wantHeader: "X-Token", wantValue: "Token sk-9",
		},

		// ③ 兜底映射：五种 auth_type 各一
		{name: "fallback bearer", authType: "bearer", key: "sk-2", wantHeader: "Authorization", wantValue: "Bearer sk-2"},
		{name: "fallback apikey", authType: "apikey", key: "sk-3", wantHeader: "Authorization", wantValue: "Bearer sk-3"},
		{name: "fallback sign", authType: "sign", key: "sk-4", wantHeader: "Authorization", wantValue: "Bearer sk-4"},
		{name: "fallback token", authType: "token", key: "sk-5", wantHeader: "Authorization", wantValue: "sk-5"},
		{name: "fallback none", authType: "none", key: "sk-6", wantHeader: "", wantValue: ""},
		{name: "fallback empty auth_type", authType: "", key: "sk-7", wantHeader: "", wantValue: ""},

		// ④ 未知 auth_type → 保持历史 default（Bearer）
		{name: "unknown auth_type falls back to bearer", authType: "no-such-mode", key: "sk-8", wantHeader: "Authorization", wantValue: "Bearer sk-8"},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			req, err := http.NewRequest(http.MethodPost, "https://example.com/x", nil)
			if err != nil {
				t.Fatal(err)
			}
			applyAuth(req, Credentials{
				AuthType: c.authType, AuthHeader: c.authHeader, AuthPrefix: c.authPrefix, APIKey: c.key,
			})

			if c.wantHeader == "" {
				// 不应写任何鉴权头；Authorization 必须为空以防默认行为漂移
				if got := req.Header.Get("Authorization"); got != "" {
					t.Fatalf("auth_type=%q 不应写入 Authorization，实际 %q", c.authType, got)
				}
				if got := req.Header.Get("X-Api-Key"); got != "" {
					t.Fatalf("auth_type=%q 不应写入 X-Api-Key，实际 %q", c.authType, got)
				}
				return
			}

			if got := req.Header.Get(c.wantHeader); got != c.wantValue {
				t.Fatalf("header %q = %q, want %q", c.wantHeader, got, c.wantValue)
			}
			// 写自定义头时不得顺带污染 Authorization
			if c.wantHeader != "Authorization" {
				if got := req.Header.Get("Authorization"); got != "" {
					t.Fatalf("自定义头场景不得写入 Authorization，实际 %q", got)
				}
			}
		})
	}
}

// auth_type 兜底映射在有无 AuthHeader 之间必须互斥：
// AuthHeader 非空时 auth_type 完全不参与决策（哪怕它是 none）。
func TestApplyAuth_DataDrivenOverridesAuthTypeNone(t *testing.T) {
	req, err := http.NewRequest(http.MethodGet, "https://example.com/x", nil)
	if err != nil {
		t.Fatal(err)
	}
	applyAuth(req, Credentials{AuthType: "none", AuthHeader: "Authorization", AuthPrefix: "", APIKey: "sk-bare"})
	if got := req.Header.Get("Authorization"); got != "sk-bare" {
		t.Fatalf("AuthHeader 非空时必须优先于 auth_type=none，实际 %q", got)
	}
}

// 端到端：数据驱动的裸 Token 必须真的落在出网请求上（同步链路）。
func TestAPIConnectorSubmitSyncUsesDataDrivenAuth(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "sk-bare" {
			t.Errorf("Authorization = %q, want %q", got, "sk-bare")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"ok"}}]}`))
	}))
	defer srv.Close()

	c := NewAPIConnector(ExecutorConfig{
		Type: ExecutorTypeAPI,
		Credentials: Credentials{
			BaseURL: srv.URL, AuthType: "none",
			AuthHeader: "Authorization", AuthPrefix: "", APIKey: "sk-bare",
		},
	})
	res, err := c.Submit(context.Background(), ExecutorRequest{
		ProviderModel: "provider-model-1",
		Input:         map[string]any{"prompt": "x"},
		ProtocolTemplate: Template{
			Label:          "dd-auth-sync",
			Method:         http.MethodPost,
			RequestPath:    "/v1/chat/completions",
			Params:         []Param{{Key: "prompt", Role: "runtime"}},
			ResponseParams: []Param{{Key: "choices.0.message.content", Type: "string"}},
		},
	})
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	if res.Status != TaskStatusSucceeded {
		t.Fatalf("status = %v", res.Status)
	}
}

// 端到端：自定义头名 + 非空前缀必须同时作用于 submit 与 poll 两个请求。
func TestAPIConnectorSubmitAsyncUsesDataDrivenAuthOnSubmitAndPoll(t *testing.T) {
	var submits, polls int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("X-Api-Key"); got != "Token sk-1" {
			t.Errorf("%s %s: X-Api-Key = %q, want %q", r.Method, r.URL.Path, got, "Token sk-1")
		}
		if got := r.Header.Get("Authorization"); got != "" {
			t.Errorf("custom header must not also set Authorization, got %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/v1/images/generations":
			submits++
			_, _ = w.Write([]byte(`{"task_id":"t-1","status":"queued"}`))
		case r.Method == http.MethodGet && r.URL.Path == "/v1/images/tasks/t-1":
			polls++
			_, _ = w.Write([]byte(`{"status":"SUCCESS","data":[{"url":"https://cdn.example.com/a.png"}]}`))
		default:
			t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	c := NewAPIConnector(ExecutorConfig{
		Type: ExecutorTypeAPI,
		Credentials: Credentials{
			BaseURL: srv.URL, AuthType: "bearer",
			AuthHeader: "X-Api-Key", AuthPrefix: "Token ", APIKey: "sk-1",
		},
	})
	res, err := c.Submit(context.Background(), ExecutorRequest{
		ProviderModel: "provider-model-1",
		Async:         true,
		Input:         map[string]any{"prompt": "x"},
		ProtocolTemplate: Template{
			Label:          "dd-auth-async",
			Method:         http.MethodPost,
			RequestPath:    "/v1/images/generations",
			Params:         []Param{{Key: "prompt", Role: "runtime"}},
			ResponseParams: []Param{{Key: "data.0.url", Type: "string"}},
			Async: json.RawMessage(`{"enabled":true,"taskIdField":"task_id","statusField":"status",` +
				`"doneValue":"SUCCESS","failValue":"FAILED","pollPath":"/v1/images/tasks/{task_id}"}`),
		},
	})
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	if res.Status != TaskStatusSucceeded {
		t.Fatalf("status = %v", res.Status)
	}
	if submits != 1 || polls == 0 {
		t.Fatalf("expected 1 submit and >=1 poll, got submits=%d polls=%d", submits, polls)
	}
}
