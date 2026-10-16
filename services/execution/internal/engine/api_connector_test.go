// APIConnector 提交/轮询域测试（TASK-PROC-008：BE-SIZE-001「一个文件一个域」拆分）。
//
// 从 engine_test.go（550 行超上限）按域拆出：同步提交、异步提交、MiniMax 状态枚举、
// 上游错误与超时。**纯搬移**：测试函数体与断言逐字未改。
package engine

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// TestAPIConnectorSubmitSync 走通同步链路：模板参数注入（model/runtime）+ 提取响应字段。
func TestAPIConnectorSubmitSync(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/v1/chat/completions" {
			t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		if auth := r.Header.Get("Authorization"); auth != "Bearer "+testAPIKey {
			t.Errorf("Authorization = %q", auth)
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Errorf("decode body: %v", err)
		}
		if body["model"] != "provider-model-1" {
			t.Errorf("model not injected from ProviderModel: %v", body["model"])
		}
		if body["prompt"] != "一只猫" {
			t.Errorf("runtime prompt not injected: %v", body["prompt"])
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"hello"}}]}`))
	}))
	defer srv.Close()

	c := NewAPIConnector(ExecutorConfig{
		Type:        ExecutorTypeAPI,
		Credentials: Credentials{BaseURL: srv.URL, AuthType: "bearer", APIKey: testAPIKey},
	})
	res, err := c.Submit(context.Background(), ExecutorRequest{
		ProviderModel: "provider-model-1",
		Input:         map[string]any{"prompt": "一只猫"},
		ProtocolTemplate: Template{
			Label:       "test-sync",
			Method:      http.MethodPost,
			RequestPath: "/v1/chat/completions",
			Params: []Param{
				{Key: "model", Role: "model"},
				{Key: "prompt", Role: "runtime"},
			},
			ResponseParams: []Param{{Key: "choices.0.message.content", Type: "string"}},
		},
	})
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	if res.Status != TaskStatusSucceeded {
		t.Fatalf("status = %v, want succeeded", res.Status)
	}
	if res.HTTPStatus != http.StatusOK {
		t.Fatalf("HTTPStatus = %d, want 200", res.HTTPStatus)
	}
	if got := res.Extracted["choices.0.message.content"]; got != "hello" {
		t.Fatalf("extracted = %v, want hello", got)
	}
	if res.SubmittedAt.IsZero() || res.CompletedAt == nil {
		t.Fatalf("timing not populated: %+v", res)
	}
	if res.Duration <= 0 {
		t.Fatalf("duration = %v", res.Duration)
	}
}

// TestAPIConnectorSubmitAsync 走通异步链路：提交取 task_id → 轮询至终态 → 提取成品地址。
// 注意：现有实现轮询间隔固定 3s，故本用例耗时约 3s。
func TestAPIConnectorSubmitAsync(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/v1/images/generations":
			_, _ = w.Write([]byte(`{"task_id":"t-1","status":"queued"}`))
		case r.Method == http.MethodGet && r.URL.Path == "/v1/images/tasks/t-1":
			_, _ = w.Write([]byte(`{"status":"SUCCESS","data":[{"url":"https://cdn.example.com/a.png"}]}`))
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
		ProviderModel: "provider-model-1",
		Async:         true,
		Input:         map[string]any{"prompt": "一只猫"},
		ProtocolTemplate: Template{
			Label:       "test-async",
			Method:      http.MethodPost,
			RequestPath: "/v1/images/generations",
			Params: []Param{
				{Key: "model", Role: "model"},
				{Key: "prompt", Role: "runtime"},
			},
			ResponseParams: []Param{{Key: "data.0.url", Type: "string"}},
			Async: json.RawMessage(`{"enabled":true,"taskIdField":"task_id","statusField":"status",` +
				`"doneValue":"SUCCESS","failValue":"FAILED","pollPath":"/v1/images/tasks/{task_id}"}`),
		},
	})
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	if res.Status != TaskStatusSucceeded {
		t.Fatalf("status = %v, want succeeded", res.Status)
	}
	if got := res.Extracted["data.0.url"]; got != "https://cdn.example.com/a.png" {
		t.Fatalf("extracted = %v", got)
	}
	if res.TaskID != "t-1" || res.ProviderTaskID != "t-1" {
		t.Fatalf("task id = %q / %q, want t-1", res.TaskID, res.ProviderTaskID)
	}
}

// TestAPIConnectorSubmitAsyncMiniMaxStatusEnum 回归锁定 MiniMax 顶层 status 枚举
// （queued | in_progress | completed | failed，迁移 030）下的端到端轮询行为：
//   - in_progress 是有意的「继续轮询」态，不得被当成终态而中止轮询；
//   - completed 才结束轮询并提取成品。
//
// 轮询间隔固定 3s，故本用例耗时约 6s。原缺陷下（doneValue=Success）本用例会一直
// 轮询到 120 次上限后报超时。
func TestAPIConnectorSubmitAsyncMiniMaxStatusEnum(t *testing.T) {
	var polls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/v1/video_generation":
			_, _ = w.Write([]byte(`{"task_id":"mm-ok-1"}`))
		case r.Method == http.MethodGet && r.URL.Path == "/v1/query/video_generation":
			switch atomic.AddInt32(&polls, 1) {
			case 1:
				_, _ = w.Write([]byte(`{"status":"in_progress"}`))
			default:
				_, _ = w.Write([]byte(`{"status":"completed","file_id":"file-ok-1"}`))
			}
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
		ProviderModel: "provider-model-1",
		Async:         true,
		Input:         map[string]any{"prompt": "一只猫"},
		ProtocolTemplate: Template{
			Label:       "test-async-minimax-enum",
			Method:      http.MethodPost,
			RequestPath: "/v1/video_generation",
			Params: []Param{
				{Key: "model", Role: "model"},
				{Key: "prompt", Role: "runtime"},
			},
			ResponseParams: []Param{{Key: "file_id", Type: "string"}},
			Async: json.RawMessage(`{"enabled":true,"taskIdField":"task_id","statusField":"status",` +
				`"doneValue":"completed","failValue":"failed",` +
				`"pollPath":"/v1/query/video_generation?task_id={task_id}"}`),
		},
	})
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	if res.Status != TaskStatusSucceeded {
		t.Fatalf("status = %v, want succeeded（in_progress 必须继续轮询，completed 必须识别为完成）", res.Status)
	}
	if got := res.Extracted["file_id"]; got != "file-ok-1" {
		t.Fatalf("extracted file_id = %v, want file-ok-1", got)
	}
	if got := atomic.LoadInt32(&polls); got != 2 {
		t.Fatalf("轮询次数 = %d, want 2（in_progress 不得提前判为终态）", got)
	}
}

// TestAPIConnectorSubmitAsyncMiniMaxFailed 回归锁定 failed 与 queued：
//   - queued 是「继续轮询」态，不得判为终态；
//   - failed 必须被判为失败并立刻返回错误，而不是当成未完成、空转到 6 分钟超时
//     （超时与失败在语义及重试策略上不同，误判会让阶段 1 的重试机制失效）。
//
// 轮询间隔固定 3s，故本用例耗时约 6s。
func TestAPIConnectorSubmitAsyncMiniMaxFailed(t *testing.T) {
	var polls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/v1/video_generation":
			_, _ = w.Write([]byte(`{"task_id":"mm-fail-1"}`))
		case r.Method == http.MethodGet && r.URL.Path == "/v1/query/video_generation":
			switch atomic.AddInt32(&polls, 1) {
			case 1:
				_, _ = w.Write([]byte(`{"status":"queued"}`))
			default:
				_, _ = w.Write([]byte(`{"status":"failed","base_resp":{"status_msg":"boom"}}`))
			}
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
		ProviderModel: "provider-model-1",
		Async:         true,
		Input:         map[string]any{"prompt": "一只猫"},
		ProtocolTemplate: Template{
			Label:       "test-async-minimax-failed",
			Method:      http.MethodPost,
			RequestPath: "/v1/video_generation",
			Params: []Param{
				{Key: "model", Role: "model"},
				{Key: "prompt", Role: "runtime"},
			},
			ResponseParams: []Param{{Key: "file_id", Type: "string"}},
			Async: json.RawMessage(`{"enabled":true,"taskIdField":"task_id","statusField":"status",` +
				`"doneValue":"completed","failValue":"failed",` +
				`"pollPath":"/v1/query/video_generation?task_id={task_id}"}`),
		},
	})
	if err == nil {
		t.Fatal("expected error for failed async task")
	}
	if res.Status != TaskStatusFailed {
		t.Fatalf("status = %v, want failed", res.Status)
	}
	if !strings.Contains(err.Error(), "async task failed") {
		t.Fatalf("err = %v, want 含 %q（失败态被识别，而不是空转到超时）", err, "async task failed")
	}
	if got := atomic.LoadInt32(&polls); got != 2 {
		t.Fatalf("轮询次数 = %d, want 2（queued 继续轮询，failed 立即终止）", got)
	}
}

// TestAPIConnectorSyncOnAsyncTemplate 校验适配器忠实透传既有行为：
// 异步模板走同步路径时必须报 ErrAsyncUnsupported，而不是静默降级。
func TestAPIConnectorSyncOnAsyncTemplate(t *testing.T) {
	c := NewAPIConnector(ExecutorConfig{
		Type:        ExecutorTypeAPI,
		Credentials: Credentials{BaseURL: "https://example.invalid", AuthType: "bearer", APIKey: testAPIKey},
	})
	_, err := c.Submit(context.Background(), ExecutorRequest{
		ProviderModel: "provider-model-1",
		Async:         false,
		ProtocolTemplate: Template{
			Label:          "test-async-template",
			Method:         http.MethodPost,
			RequestPath:    "/v1/images/generations",
			ResponseParams: []Param{{Key: "data.0.url"}},
			Async:          json.RawMessage(`{"enabled":true,"taskIdField":"task_id"}`),
		},
	})
	if !errors.Is(err, ErrAsyncUnsupported) {
		t.Fatalf("err = %v, want ErrAsyncUnsupported", err)
	}
}

// TestAPIConnectorSubmitUpstreamError 校验上游非 2xx 时映射为 failed 且带错误信息。
func TestAPIConnectorSubmitUpstreamError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"error":"rate limited"}`))
	}))
	defer srv.Close()

	c := NewAPIConnector(ExecutorConfig{
		Type:        ExecutorTypeAPI,
		Credentials: Credentials{BaseURL: srv.URL, AuthType: "bearer", APIKey: testAPIKey},
	})
	res, err := c.Submit(context.Background(), ExecutorRequest{
		ProviderModel: "provider-model-1",
		ProtocolTemplate: Template{
			Label:       "test-upstream-error",
			Method:      http.MethodPost,
			RequestPath: "/v1/chat/completions",
			Params:      []Param{{Key: "model", Role: "model"}},
		},
	})
	if err == nil {
		t.Fatal("expected error for upstream 429")
	}
	if res.Status != TaskStatusFailed {
		t.Fatalf("status = %v, want failed", res.Status)
	}
	if res.Error == "" {
		t.Fatal("error message should be populated")
	}
	if res.HTTPStatus != http.StatusTooManyRequests {
		t.Fatalf("HTTPStatus = %d, want 429", res.HTTPStatus)
	}
}

// TestAPIConnectorUnsupportedCapabilities 明确执行器能力边界，
// 避免调用方误以为 HTTP 协议支持独立轮询/取消。
func TestAPIConnectorUnsupportedCapabilities(t *testing.T) {
	c := NewAPIConnector(ExecutorConfig{Type: ExecutorTypeAPI})

	if _, err := c.Poll(context.Background(), "t-1", ExecutorRequest{}); !errors.Is(err, ErrExecutorNotImplemented) {
		t.Fatalf("Poll err = %v, want ErrExecutorNotImplemented", err)
	}
	if _, err := c.GetResult(context.Background(), "t-1", ExecutorRequest{}); !errors.Is(err, ErrExecutorNotImplemented) {
		t.Fatalf("GetResult err = %v, want ErrExecutorNotImplemented", err)
	}
	if err := c.Cancel(context.Background(), "t-1", ExecutorRequest{}); !errors.Is(err, ErrCancelUnsupported) {
		t.Fatalf("Cancel err = %v, want ErrCancelUnsupported", err)
	}
}

// TestAPIConnectorSubmitHonoursTimeout 校验 ExecutorRequest.Timeout 生效。
func TestAPIConnectorSubmitHonoursTimeout(t *testing.T) {
	blocked := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-blocked:
		case <-r.Context().Done():
		}
	}))
	defer func() {
		close(blocked)
		srv.Close()
	}()

	c := NewAPIConnector(ExecutorConfig{
		Type:        ExecutorTypeAPI,
		Credentials: Credentials{BaseURL: srv.URL, AuthType: "bearer", APIKey: testAPIKey},
	})
	res, err := c.Submit(context.Background(), ExecutorRequest{
		ProviderModel: "provider-model-1",
		Timeout:       200 * time.Millisecond,
		ProtocolTemplate: Template{
			Label:       "test-timeout",
			Method:      http.MethodPost,
			RequestPath: "/v1/chat/completions",
			Params:      []Param{{Key: "model", Role: "model"}},
		},
	})
	if err == nil {
		t.Fatal("expected timeout error")
	}
	if res.Status != TaskStatusFailed {
		t.Fatalf("status = %v, want failed", res.Status)
	}
}
