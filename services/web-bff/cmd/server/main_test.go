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

func TestChannelProbeOrchestratesRealCheck(t *testing.T) {
	// the probed channel's real HTTP endpoint
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer target.Close()

	workspace := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/internal/v1/workspaces/ws_dev/authorize":
			w.WriteHeader(http.StatusNoContent)
		case "/internal/v1/workspaces/ws_dev/credentials":
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"items":[{"channelId":"minimax","authType":"bearer","hasKey":false}]}`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer workspace.Close()
	production := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/internal/v1/catalog" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"channels":[{"id":"minimax","baseUrl":"`+target.URL+`"}],"models":[]}`)
	}))
	defer production.Close()

	s := testServer(workspace, production)
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/channels/", s.channelProbe)
	r := httptest.NewRequest(http.MethodPost, "/api/v1/channels/minimax/probe", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, r)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), `"reachable":true`) {
		t.Fatalf("expected real reachability result, got %q", rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"authConfigured":false`) {
		t.Fatalf("expected authConfigured false, got %q", rec.Body.String())
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
