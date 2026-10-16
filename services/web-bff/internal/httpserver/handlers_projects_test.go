// 项目域测试（TASK-PROC-008：BE-SIZE-001「一个文件一个域」拆分）。
//
// 从 main_test.go（764 行超上限）按域拆出：项目创建的前置校验顺序、可信上下文与
// 幂等键注入、生产侧校验错误透传、生产不可用，以及详情路径转发。
// **纯搬移**：测试函数体与断言逐字未改。
package httpserver

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

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
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"role":"owner"}`)
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
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"role":"owner"}`)
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
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"role":"owner"}`)
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
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"role":"owner"}`)
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
