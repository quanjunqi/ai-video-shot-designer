package engine

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// TestRunAsyncPollStateMachine 覆盖 async 协议 submit→poll→done 状态机：
// 提交返回 task_id，轮询先 running 后 SUCCESS，最终按 ResponseParams 提取结果。
func TestRunAsyncPollStateMachine(t *testing.T) {
	var polls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/v1/images/generations"):
			_ = json.NewEncoder(w).Encode(map[string]any{"task_id": "t-1"})
		case r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/v1/images/tasks/t-1"):
			if polls.Add(1) <= 1 {
				_ = json.NewEncoder(w).Encode(map[string]any{"status": "RUNNING"})
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"status": "SUCCESS",
				"result": map[string]any{"url": "https://cdn.example/img.png"},
			})
		default:
			http.Error(w, "not found", http.StatusNotFound)
		}
	}))
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	creds := Credentials{BaseURL: srv.URL, APIKey: "test-key", AuthType: "bearer"}
	req := RunRequest{
		ChannelID:     "ch-img",
		ProviderModel: "boogu-image-0.1",
		ProtocolTemplate: Template{
			ID: "pt_img", Label: "OpenAI 兼容图片", Method: "POST", RequestPath: "/v1/images/generations",
			Async:          json.RawMessage(`{"enabled":true,"taskIdField":"task_id","statusField":"status","doneValue":"SUCCESS","failValue":"FAILED","pollPath":"/v1/images/tasks/{task_id}"}`),
			ResponseParams: []Param{{Key: "result.url"}},
		},
		Runtime: map[string]any{"prompt": "a cat"},
	}
	out, err := RunAsync(ctx, creds, req, &http.Client{Timeout: 10 * time.Second})
	if err != nil {
		t.Fatalf("RunAsync failed: %v", err)
	}
	if out.Status != 200 {
		t.Errorf("status = %d, want 200", out.Status)
	}
	if out.ProviderTaskID != "t-1" {
		t.Errorf("ProviderTaskID = %q, want t-1", out.ProviderTaskID)
	}
	if got := out.Extracted["result.url"]; got != "https://cdn.example/img.png" {
		t.Errorf("Extracted[result.url] = %v, want https://cdn.example/img.png", got)
	}
	if polls.Load() < 2 {
		t.Errorf("polls = %d, want >= 2（至少一次 running 后终态）", polls.Load())
	}
}

// TestRunAsyncPollFail 覆盖轮询到 FAILED 终态：返回明确失败，不做空转。
func TestRunAsyncPollFail(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/v1/images/generations"):
			_ = json.NewEncoder(w).Encode(map[string]any{"task_id": "t-fail"})
		case r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/v1/images/tasks/t-fail"):
			_ = json.NewEncoder(w).Encode(map[string]any{"status": "FAILED", "error": "upstream exploded"})
		default:
			http.Error(w, "not found", http.StatusNotFound)
		}
	}))
	defer srv.Close()

	creds := Credentials{BaseURL: srv.URL, APIKey: "k", AuthType: "bearer"}
	req := RunRequest{
		ChannelID: "ch", ProviderModel: "m",
		ProtocolTemplate: Template{
			Method: "POST", RequestPath: "/v1/images/generations",
			Async: json.RawMessage(`{"enabled":true,"statusField":"status","doneValue":"SUCCESS","failValue":"FAILED","pollPath":"/v1/images/tasks/{task_id}"}`),
		},
		Runtime: map[string]any{"prompt": "x"},
	}
	_, err := RunAsync(context.Background(), creds, req, &http.Client{Timeout: 5 * time.Second})
	if err == nil || !strings.Contains(err.Error(), "async task failed") {
		t.Fatalf("want async task failed error, got: %v", err)
	}
}

// TestRunAsyncDisabled 覆盖 async 模板未启用时明确拒绝（与 sync 路径语义一致）。
func TestRunAsyncDisabled(t *testing.T) {
	creds := Credentials{BaseURL: "http://127.0.0.1:1", APIKey: "k", AuthType: "bearer"}
	req := RunRequest{
		ChannelID: "ch", ProviderModel: "m",
		ProtocolTemplate: Template{Async: json.RawMessage(`{"enabled":false}`)},
	}
	_, err := RunAsync(context.Background(), creds, req, &http.Client{Timeout: 2 * time.Second})
	if err == nil || !strings.Contains(err.Error(), "async mode not enabled") {
		t.Fatalf("want async mode not enabled error, got: %v", err)
	}
}
