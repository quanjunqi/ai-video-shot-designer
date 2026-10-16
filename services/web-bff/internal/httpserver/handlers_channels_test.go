// 渠道探测与凭据域测试（TASK-PROC-008：BE-SIZE-001「一个文件一个域」拆分）。
//
// 从 main_test.go（764 行超上限）按域拆出：BFF 转发渠道探测的四种结局（无体转发、
// 上游错误码透传、上游不可用、工作区授权失败）与凭据路径改写。
// **纯搬移**：测试函数体与断言逐字未改；共享的 testServer 辅助仍在 main_test.go（同包可见）。
package httpserver

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestChannelProbeForwardsToExecutionWithoutBody 锁定本片的两条关键变化：
//  1. BFF 不再自己在边缘发探测请求，而是转发给 execution 的唯一实现；
//  2. 请求体里的 baseUrl **不被接受、也不被转发** —— 那正是原来的 SSRF 面。
//
// production 目录不再被 BFF 触碰（catalogCalls 必须为 0）。
func TestChannelProbeForwardsToExecutionWithoutBody(t *testing.T) {
	var (
		seenPath, seenMethod, seenAuth, seenWorkspace, seenActor, seenBody string
		seenContentType                                                    string
		catalogCalls                                                       int
	)
	execution := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenPath, seenMethod = r.URL.Path, r.Method
		seenAuth = r.Header.Get("Authorization")
		seenWorkspace, seenActor = r.Header.Get("X-Workspace-Id"), r.Header.Get("X-Actor-Id")
		seenContentType = r.Header.Get("Content-Type")
		raw, _ := io.ReadAll(r.Body)
		seenBody = string(raw)
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"channelId":"chan-muo4b9zo","reachable":true,"authConfigured":true,"detail":"网络可达","probedAt":"2026-10-10T00:00:00Z"}`)
	}))
	defer execution.Close()

	workspace := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"role":"owner"}`)
	}))
	defer workspace.Close()
	production := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		catalogCalls++
		w.WriteHeader(http.StatusOK)
	}))
	defer production.Close()

	s := testServer(workspace, production)
	s.executionURL = execution.URL
	s.executionToken = "execution-secret"
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/channels/", s.channelProbe)
	r := httptest.NewRequest(http.MethodPost, "/api/v1/channels/chan-muo4b9zo/probe",
		strings.NewReader(`{"baseUrl":"http://169.254.169.254/latest/meta-data/","authType":"bearer"}`))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, r)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body.String())
	}
	if seenPath != "/internal/v1/channels/chan-muo4b9zo/probe" || seenMethod != http.MethodPost {
		t.Fatalf("forwarded %s %s", seenMethod, seenPath)
	}
	if seenAuth != "Bearer execution-secret" {
		t.Fatalf("execution token not forwarded: %q", seenAuth)
	}
	if seenWorkspace != "ws_dev" || seenActor != "user_dev" {
		t.Fatalf("trusted context not forwarded: workspace=%q actor=%q", seenWorkspace, seenActor)
	}
	if seenBody != "" {
		t.Fatalf("请求体必须被丢弃（SSRF 面），实际转发 %q", seenBody)
	}
	if seenContentType != "" {
		t.Fatalf("转发请求不应带 Content-Type: %q", seenContentType)
	}
	if catalogCalls != 0 {
		t.Fatalf("BFF 不得再触碰 production 目录，实际 %d 次", catalogCalls)
	}
	if !strings.Contains(rec.Body.String(), `"reachable":true`) {
		t.Fatalf("execution 的结果必须原样透传: %s", rec.Body.String())
	}
}

// TestChannelProbeForwardsExecutionErrorStatus：execution 的错误码与状态码原样透传
// （不再出现旧的 400 INVALID_CHANNEL 之类边缘判定）。
func TestChannelProbeForwardsExecutionErrorStatus(t *testing.T) {
	execution := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		_, _ = io.WriteString(w, `{"code":"NOT_FOUND","message":"channel not found"}`)
	}))
	defer execution.Close()
	workspace := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"role":"owner"}`)
	}))
	defer workspace.Close()
	production := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("production must not be called")
	}))
	defer production.Close()

	s := testServer(workspace, production)
	s.executionURL = execution.URL
	s.executionToken = "execution-secret"
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/channels/", s.channelProbe)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/v1/channels/nope/probe", nil))

	if rec.Code != http.StatusNotFound || !strings.Contains(rec.Body.String(), "NOT_FOUND") {
		t.Fatalf("expected 404 passthrough, got %d body=%s", rec.Code, rec.Body.String())
	}
}

// TestChannelProbeUnavailableWhenExecutionDown：execution 不可用时如实 503。
func TestChannelProbeUnavailableWhenExecutionDown(t *testing.T) {
	workspace := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"role":"owner"}`)
	}))
	defer workspace.Close()
	production := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer production.Close()

	s := testServer(workspace, production)
	s.executionURL = "http://127.0.0.1:1"
	s.executionToken = "execution-secret"
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/channels/", s.channelProbe)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/v1/channels/comfy/probe", nil))

	if rec.Code != http.StatusServiceUnavailable || !strings.Contains(rec.Body.String(), "UPSTREAM_UNAVAILABLE") {
		t.Fatalf("expected 503, got %d body=%s", rec.Code, rec.Body.String())
	}
}

// TestChannelProbeRejectsWhenWorkspaceAuthorizationFails：授权失败不得触达 execution。
func TestChannelProbeRejectsWhenWorkspaceAuthorizationFails(t *testing.T) {
	executionCalls := 0
	execution := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		executionCalls++
		w.WriteHeader(http.StatusOK)
	}))
	defer execution.Close()
	workspace := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer workspace.Close()
	production := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer production.Close()

	s := testServer(workspace, production)
	s.executionURL = execution.URL
	s.executionToken = "execution-secret"
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/channels/", s.channelProbe)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/v1/channels/comfy/probe", nil))

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", rec.Code)
	}
	if executionCalls != 0 {
		t.Fatalf("授权失败时不得转发到 execution，实际 %d 次", executionCalls)
	}
}

func TestWorkspaceCredentialsRewritesPath(t *testing.T) {
	var seenPath, seenMethod, seenAuth string
	workspace := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// TASK-AUTH-001：authorize 探测命中同一 URL 时返回角色 JSON
		if strings.Contains(r.URL.Path, "/authorize") {
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"role":"owner"}`)
			return
		}
		seenPath = r.URL.Path
		seenMethod = r.Method
		seenAuth = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, `{"channelId":"grsai","stored":true}`)
	}))
	defer workspace.Close()
	production := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"role":"owner"}`)
	}))
	defer production.Close()

	s := testServer(workspace, production)
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/workspace/credentials", s.workspaceCredentials)
	mux.HandleFunc("/api/v1/workspace/credentials/", s.workspaceCredentials)
	r := httptest.NewRequest(http.MethodPut, "/api/v1/workspace/credentials/grsai", strings.NewReader(`{"channelId":"grsai","baseUrl":"https://api.grsai.com/v1","authType":"apikey","apiKey":"sk-x"}`))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, r)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if seenPath != "/internal/v1/workspaces/ws_dev/credentials/grsai" {
		t.Fatalf("expected rewritten workspace path, got %q", seenPath)
	}
	if seenMethod != http.MethodPut {
		t.Fatalf("expected PUT, got %s", seenMethod)
	}
	if seenAuth != "Bearer workspace-secret" {
		t.Fatalf("expected workspace token, got %q", seenAuth)
	}
}
