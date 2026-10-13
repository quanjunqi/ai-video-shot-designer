package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

// T2-2：auditStatsProxy / auditTrendProxy 转发 T2 运营报表聚合到 execution。
// 守卫与透传语义必须与 auditLogs 一致（方法 405 → 鉴权 → 透传状态码与流）。

func TestAuditStatsProxyForwardsQueryAndStream(t *testing.T) {
	const body = `{"dimension":"channel","items":[{"key":"chan_a","calls":3}]}`
	execution := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/internal/v1/audit/stats" {
			t.Errorf("expected upstream /internal/v1/audit/stats, got %s", r.URL.Path)
		}
		if r.URL.RawQuery != "dimension=channel&since=2026-10-01T00%3A00%3A00Z" {
			t.Errorf("query not forwarded verbatim, got %q", r.URL.RawQuery)
		}
		if got := r.Header.Get("X-Workspace-Id"); got != "ws_dev" {
			t.Errorf("workspace header not set, got %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, body)
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
	mux.HandleFunc("/api/v1/audit/stats", s.auditStatsProxy)

	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet,
		"/api/v1/audit/stats?dimension=channel&since=2026-10-01T00%3A00%3A00Z", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body.String())
	}
	if rec.Body.String() != body {
		t.Fatalf("body not passed through, got %q", rec.Body.String())
	}
	if rec.Header().Get("Cache-Control") == "" {
		t.Error("audit responses must not be cached")
	}
}

func TestAuditTrendProxyForwardsGranularity(t *testing.T) {
	const body = `{"granularity":"day","items":[{"bucket":"2026-10-10","calls":5}]}`
	execution := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/internal/v1/audit/stats/trend" {
			t.Errorf("expected upstream /internal/v1/audit/stats/trend, got %s", r.URL.Path)
		}
		if r.URL.RawQuery != "granularity=day" {
			t.Errorf("granularity not forwarded, got %q", r.URL.RawQuery)
		}
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, body)
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
	mux.HandleFunc("/api/v1/audit/stats/trend", s.auditTrendProxy)

	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/audit/stats/trend?granularity=day", nil))

	if rec.Code != http.StatusOK || rec.Body.String() != body {
		t.Fatalf("trend passthrough failed: code=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestAuditStatsProxyMethodNotAllowed(t *testing.T) {
	workspace := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("workspace must not be called when method is rejected")
	}))
	defer workspace.Close()
	production := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer production.Close()

	s := testServer(workspace, production)
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/audit/stats", s.auditStatsProxy)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/v1/audit/stats", nil))
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", rec.Code)
	}
}
