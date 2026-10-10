package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func testServer(workspace, production *httptest.Server) *server {
	return &server{
		httpClient:      &http.Client{Timeout: time.Second},
		workspaceURL:    workspace.URL,
		productionURL:   production.URL,
		workspaceToken:  "workspace-secret",
		productionToken: "production-secret",
		devWorkspace:    "ws_dev",
		devActor:        "user_dev",
	}
}

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
		w.WriteHeader(http.StatusNoContent)
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
		w.WriteHeader(http.StatusNoContent)
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
		w.WriteHeader(http.StatusNoContent)
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
		seenPath = r.URL.Path
		seenMethod = r.Method
		seenAuth = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, `{"channelId":"grsai","stored":true}`)
	}))
	defer workspace.Close()
	production := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
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

func TestProjectsRejectsWorkspaceBeforeProduction(t *testing.T) {
	productionCalls := 0
	workspace := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer workspace.Close()
	production := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		productionCalls++
		w.WriteHeader(http.StatusCreated)
	}))
	defer production.Close()

	s := testServer(workspace, production)
	r := httptest.NewRequest(http.MethodGet, "/api/v1/comic-projects", nil)
	response := httptest.NewRecorder()
	s.projects(response, r)
	if response.Code != http.StatusForbidden || productionCalls != 0 {
		t.Fatalf("expected authorization rejection before production, code=%d calls=%d", response.Code, productionCalls)
	}
}

func TestProjectsReturnsUnavailableWhenWorkspaceCannotAuthorize(t *testing.T) {
	workspace := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
	}))
	defer workspace.Close()
	production := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
	}))
	defer production.Close()

	s := testServer(workspace, production)
	r := httptest.NewRequest(http.MethodGet, "/api/v1/comic-projects", nil)
	response := httptest.NewRecorder()
	s.projects(response, r)
	if response.Code != http.StatusServiceUnavailable || !strings.Contains(response.Body.String(), "UPSTREAM_UNAVAILABLE") {
		t.Fatalf("expected stable upstream error, code=%d body=%s", response.Code, response.Body.String())
	}
}

func TestProjectsInjectsTrustedContextAndIdempotency(t *testing.T) {
	keys := make([]string, 0, 2)
	workspace := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer workspace-secret" {
			t.Errorf("workspace token was not forwarded")
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer workspace.Close()
	production := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer production-secret" ||
			r.Header.Get("X-Workspace-Id") != "ws_dev" || r.Header.Get("X-Actor-Id") != "user_dev" {
			t.Errorf("trusted context was not injected: auth=%q workspace=%q actor=%q", r.Header.Get("Authorization"), r.Header.Get("X-Workspace-Id"), r.Header.Get("X-Actor-Id"))
		}
		keys = append(keys, r.Header.Get("Idempotency-Key"))
		if r.Header.Get("Idempotency-Key") == "" {
			t.Errorf("idempotency key must be present")
		}
		_, _ = io.Copy(io.Discard, r.Body)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = io.WriteString(w, `{"id":"proj_test"}`)
	}))
	defer production.Close()

	s := testServer(workspace, production)
	r := httptest.NewRequest(http.MethodPost, "/api/v1/comic-projects", strings.NewReader(`{"title":"test"}`))
	r.Header.Set("Idempotency-Key", "browser-key")
	r.Header.Set("X-Workspace-Id", "attacker-workspace")
	r.Header.Set("X-Actor-Id", "attacker-actor")
	response := httptest.NewRecorder()
	s.projects(response, r)
	if response.Code != http.StatusCreated {
		t.Fatalf("expected production response, got %d: %s", response.Code, response.Body.String())
	}

	delete(r.Header, "Idempotency-Key")
	response = httptest.NewRecorder()
	s.projects(response, r)
	if response.Code != http.StatusCreated {
		t.Fatalf("expected generated idempotency response, got %d", response.Code)
	}
	if len(keys) != 2 || keys[0] != "browser-key" || keys[1] == "browser-key" {
		t.Fatalf("unexpected idempotency forwarding: %#v", keys)
	}
}

func TestProjectsPreservesProductionValidationErrors(t *testing.T) {
	workspace := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer workspace.Close()
	production := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnprocessableEntity)
		_, _ = io.WriteString(w, `{"code":"INVALID_PROJECT","message":"script is too short"}`)
	}))
	defer production.Close()

	s := testServer(workspace, production)
	r := httptest.NewRequest(http.MethodPost, "/api/v1/comic-projects", strings.NewReader(`{"title":"short"}`))
	response := httptest.NewRecorder()
	s.projects(response, r)
	if response.Code != http.StatusUnprocessableEntity || !strings.Contains(response.Body.String(), "INVALID_PROJECT") {
		t.Fatalf("expected production validation response, code=%d body=%s", response.Code, response.Body.String())
	}
}

func TestProjectsReturnsUnavailableWhenProductionCannotRespond(t *testing.T) {
	workspace := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer workspace.Close()
	production := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	productionURL := production.URL
	production.Close()

	s := testServer(workspace, production)
	s.productionURL = productionURL
	r := httptest.NewRequest(http.MethodGet, "/api/v1/comic-projects", nil)
	response := httptest.NewRecorder()
	s.projects(response, r)
	if response.Code != http.StatusServiceUnavailable || !strings.Contains(response.Body.String(), "UPSTREAM_UNAVAILABLE") {
		t.Fatalf("expected production unavailable response, code=%d body=%s", response.Code, response.Body.String())
	}
}

func TestProjectDetailPathIsForwarded(t *testing.T) {
	workspace := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer workspace.Close()
	production := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/internal/v1/comic-projects/proj_12345678901234567890123456789012" {
			t.Fatalf("unexpected upstream path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, `{"id":"proj_12345678901234567890123456789012","source_text":"script"}`)
	}))
	defer production.Close()

	s := testServer(workspace, production)
	h := http.NewServeMux()
	h.HandleFunc("/api/v1/comic-projects/", s.projects)
	r := httptest.NewRequest(http.MethodGet, "/api/v1/comic-projects/proj_12345678901234567890123456789012", nil)
	response := httptest.NewRecorder()
	h.ServeHTTP(response, r)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "source_text") {
		t.Fatalf("expected forwarded detail response, code=%d body=%s", response.Code, response.Body.String())
	}
}

// logicalModelsMux mirrors the production route registration for the logical
// model proxy (collection + subtree prefixes).
func logicalModelsMux(s *server) *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/logical-models", s.logicalModels)
	mux.HandleFunc("/api/v1/logical-models/", s.logicalModels)
	return mux
}

func TestLogicalModelsListForwardsQueryAndInternalPath(t *testing.T) {
	seen := struct {
		path, query, method, auth, workspace, actor string
	}{}
	workspace := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer workspace-secret" {
			t.Errorf("workspace token was not forwarded")
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer workspace.Close()
	production := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen.path = r.URL.Path
		seen.query = r.URL.RawQuery
		seen.method = r.Method
		seen.auth = r.Header.Get("Authorization")
		seen.workspace = r.Header.Get("X-Workspace-Id")
		seen.actor = r.Header.Get("X-Actor-Id")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, `[{"id":"image-t2i-high","label":"高质文生图","type":"image","capability":"image.t2i","status":"enabled","sort":100,"note":"","createdBy":"user_dev","createdAt":"2026-10-10T00:00:00Z","updatedAt":"2026-10-10T00:00:00Z"}]`)
	}))
	defer production.Close()

	s := testServer(workspace, production)
	r := httptest.NewRequest(http.MethodGet, "/api/v1/logical-models?status=enabled&type=image", nil)
	response := httptest.NewRecorder()
	logicalModelsMux(s).ServeHTTP(response, r)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	if seen.path != "/internal/v1/logical-models" {
		t.Fatalf("expected internal collection path, got %q", seen.path)
	}
	if seen.query != "status=enabled&type=image" {
		t.Fatalf("expected query passthrough, got %q", seen.query)
	}
	if seen.method != http.MethodGet {
		t.Fatalf("expected GET, got %s", seen.method)
	}
	if seen.auth != "Bearer production-secret" {
		t.Fatalf("expected production token, got %q", seen.auth)
	}
	if seen.workspace != "ws_dev" || seen.actor != "user_dev" {
		t.Fatalf("trusted context was not injected: workspace=%q actor=%q", seen.workspace, seen.actor)
	}
	if !strings.Contains(response.Body.String(), "image-t2i-high") {
		t.Fatalf("expected upstream body passthrough, got %s", response.Body.String())
	}
}

func TestLogicalModelsCreateForwardsToInternalPath(t *testing.T) {
	seen := struct {
		path, method, contentType, body string
	}{}
	workspace := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer workspace.Close()
	production := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		payload, _ := io.ReadAll(r.Body)
		seen.path = r.URL.Path
		seen.method = r.Method
		seen.contentType = r.Header.Get("Content-Type")
		seen.body = string(payload)
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Location", "/internal/v1/logical-models/image-t2i-high")
		w.WriteHeader(http.StatusCreated)
		_, _ = io.WriteString(w, `{"id":"image-t2i-high","label":"高质文生图","type":"image","capability":"image.t2i","status":"enabled","sort":100,"note":"","createdBy":"user_dev","createdAt":"2026-10-10T00:00:00Z","updatedAt":"2026-10-10T00:00:00Z"}`)
	}))
	defer production.Close()

	s := testServer(workspace, production)
	r := httptest.NewRequest(http.MethodPost, "/api/v1/logical-models", strings.NewReader(`{"id":"image-t2i-high","label":"高质文生图","type":"image"}`))
	r.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	logicalModelsMux(s).ServeHTTP(response, r)
	if response.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", response.Code, response.Body.String())
	}
	if seen.path != "/internal/v1/logical-models" || seen.method != http.MethodPost {
		t.Fatalf("unexpected upstream request: %s %s", seen.method, seen.path)
	}
	if seen.contentType != "application/json" {
		t.Fatalf("expected content type passthrough, got %q", seen.contentType)
	}
	if !strings.Contains(seen.body, "image-t2i-high") {
		t.Fatalf("expected request body passthrough, got %q", seen.body)
	}
}

// TestLogicalModelsPreservesBusinessErrors pins the contract that the BFF is a
// transparent proxy: the production status code and error code must not be
// flattened into 500 / a generic error.
func TestLogicalModelsPreservesBusinessErrors(t *testing.T) {
	cases := []struct {
		name         string
		method       string
		path         string
		upstreamPath string
		status       int
		code         string
	}{
		{
			name:         "400 id immutable",
			method:       http.MethodPatch,
			path:         "/api/v1/logical-models/image-t2i-high",
			upstreamPath: "/internal/v1/logical-models/image-t2i-high",
			status:       http.StatusBadRequest,
			code:         "ID_IMMUTABLE",
		},
		{
			name:         "409 model already bound",
			method:       http.MethodPost,
			path:         "/api/v1/logical-models/image-t2i-high/candidates",
			upstreamPath: "/internal/v1/logical-models/image-t2i-high/candidates",
			status:       http.StatusConflict,
			code:         "MODEL_ALREADY_BOUND",
		},
		{
			name:         "404 model not found",
			method:       http.MethodPost,
			path:         "/api/v1/logical-models/image-t2i-high/candidates",
			upstreamPath: "/internal/v1/logical-models/image-t2i-high/candidates",
			status:       http.StatusNotFound,
			code:         "MODEL_NOT_FOUND",
		},
		{
			name:         "404 candidate not found",
			method:       http.MethodDelete,
			path:         "/api/v1/logical-models/image-t2i-high/candidates/mod_abc",
			upstreamPath: "/internal/v1/logical-models/image-t2i-high/candidates/mod_abc",
			status:       http.StatusNotFound,
			code:         "CANDIDATE_NOT_FOUND",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var seenPath string
			workspace := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			}))
			t.Cleanup(workspace.Close)
			production := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				seenPath = r.URL.Path
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(tc.status)
				_, _ = io.WriteString(w, `{"code":"`+tc.code+`","message":"upstream rejected the request"}`)
			}))
			t.Cleanup(production.Close)

			s := testServer(workspace, production)
			r := httptest.NewRequest(tc.method, tc.path, strings.NewReader(`{"modelIds":["mod_abc"]}`))
			response := httptest.NewRecorder()
			logicalModelsMux(s).ServeHTTP(response, r)
			if response.Code != tc.status {
				t.Fatalf("expected %d, got %d: %s", tc.status, response.Code, response.Body.String())
			}
			if !strings.Contains(response.Body.String(), `"code":"`+tc.code+`"`) {
				t.Fatalf("expected error code %s, got %s", tc.code, response.Body.String())
			}
			if !strings.Contains(response.Body.String(), "upstream rejected the request") {
				t.Fatalf("expected upstream message passthrough, got %s", response.Body.String())
			}
			if seenPath != tc.upstreamPath {
				t.Fatalf("expected upstream path %q, got %q", tc.upstreamPath, seenPath)
			}
		})
	}
}

func TestLogicalModelsUnbindForwardsDeleteAndReturnsNoContent(t *testing.T) {
	seen := struct {
		path, method string
	}{}
	workspace := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer workspace.Close()
	production := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen.path = r.URL.Path
		seen.method = r.Method
		w.WriteHeader(http.StatusNoContent)
	}))
	defer production.Close()

	s := testServer(workspace, production)
	r := httptest.NewRequest(http.MethodDelete, "/api/v1/logical-models/image-t2i-high/candidates/mod_abc", nil)
	response := httptest.NewRecorder()
	logicalModelsMux(s).ServeHTTP(response, r)
	if response.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", response.Code, response.Body.String())
	}
	if seen.method != http.MethodDelete || seen.path != "/internal/v1/logical-models/image-t2i-high/candidates/mod_abc" {
		t.Fatalf("unexpected upstream request: %s %s", seen.method, seen.path)
	}
	if response.Body.Len() != 0 {
		t.Fatalf("expected empty body, got %q", response.Body.String())
	}
}

func TestLogicalModelsRejectsUnsupportedMethod(t *testing.T) {
	productionCalls := 0
	workspace := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer workspace.Close()
	production := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		productionCalls++
		w.WriteHeader(http.StatusOK)
	}))
	defer production.Close()

	s := testServer(workspace, production)
	r := httptest.NewRequest(http.MethodPut, "/api/v1/logical-models/image-t2i-high", strings.NewReader(`{}`))
	response := httptest.NewRecorder()
	logicalModelsMux(s).ServeHTTP(response, r)
	if response.Code != http.StatusMethodNotAllowed || !strings.Contains(response.Body.String(), "METHOD_NOT_ALLOWED") {
		t.Fatalf("expected 405 METHOD_NOT_ALLOWED, code=%d body=%s", response.Code, response.Body.String())
	}
	if productionCalls != 0 {
		t.Fatalf("expected no upstream call, got %d", productionCalls)
	}
}

// TestChannelProbeRejectsEarlyWithoutUpstreamCalls 覆盖前转函数在触达 execution **之前**
// 的两条拒绝路径：路由不匹配（404）与 方法不是 POST（405）。
//
// 为什么要补这些用例（可复现的原因）：
//   B3a 用一段 41 行的前转函数替换了 BFF 内联探测（约 140 行、原本有测试覆盖）。
//   **删除"有覆盖的代码"会让总覆盖率下降** —— 实测 22.5% < 下限 23%，
//   触发了覆盖率棘轮门禁（.github/coverage-baseline.txt）。
//   相比调低下限（= 放松门禁），更正确的做法是把新代码的分支测全。
//
// 这些用例刻意**不注入任何上游 server**：两条拒绝都发生在 authorize 之前，
// 因此若将来实现被改成"先调用上游再校验"，本用例会因空 URL / 超时而失败。
func TestChannelProbeRejectsEarlyWithoutUpstreamCalls(t *testing.T) {
	cases := []struct {
		name   string
		path   string
		method string
		want   int
	}{
		{"path prefix mismatch", "/api/v1/other/minimax/probe", http.MethodPost, http.StatusNotFound},
		{"path suffix mismatch", "/api/v1/channels/minimax/probeX", http.MethodPost, http.StatusNotFound},
		{"method is get", "/api/v1/channels/minimax/probe", http.MethodGet, http.StatusMethodNotAllowed},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := &server{httpClient: &http.Client{Timeout: time.Second}}
			w := httptest.NewRecorder()
			s.channelProbe(w, httptest.NewRequest(tc.method, tc.path, nil))
			if w.Code != tc.want {
				t.Fatalf("path=%s method=%s: got %d, want %d", tc.path, tc.method, w.Code, tc.want)
			}
		})
	}
}
