package httpserver

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// T11：auditHealthProxy / alertConfigProxy / reportSyncFailure（同步失败告警上报）。
// 守卫与透传语义与 auditStatsProxy 一致（方法限制 → 鉴权 → 透传状态码与流）。

func TestAuditHealthProxyForwardsQueryAndStream(t *testing.T) {
	const body = `{"workspace_id":"ws_dev","units":[{"channel_id":"chan_a","calls":3,"success_rate":66.7}]}`
	execution := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/internal/v1/audit/health" {
			t.Errorf("expected upstream /internal/v1/audit/health, got %s", r.URL.Path)
		}
		if r.URL.RawQuery != "limit=20" {
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
	mux.HandleFunc("/api/v1/audit/health", s.auditHealthProxy)

	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/audit/health?limit=20", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body.String())
	}
	if rec.Body.String() != body {
		t.Fatalf("body not passed through, got %q", rec.Body.String())
	}
}

func TestAuditHealthProxyMethodNotAllowed(t *testing.T) {
	workspace := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"role":"owner"}`)
	}))
	defer workspace.Close()
	production := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer production.Close()
	s := testServer(workspace, production)
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/audit/health", s.auditHealthProxy)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/v1/audit/health", nil))
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", rec.Code)
	}
}

func TestAlertConfigProxyGet(t *testing.T) {
	const body = `{"workspace_id":"ws_dev","enabled":true,"error_rate_threshold_pct":20,"webhook_url":""}`
	execution := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/internal/v1/alerts/config" {
			t.Errorf("expected upstream /internal/v1/alerts/config, got %s", r.URL.Path)
		}
		if r.Method != http.MethodGet {
			t.Errorf("expected GET, got %s", r.Method)
		}
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, body)
	}))
	defer execution.Close()
	workspace := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"role":"owner"}`)
	}))
	defer workspace.Close()
	production := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer production.Close()

	s := testServer(workspace, production)
	s.executionURL = execution.URL
	s.executionToken = "execution-secret"
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/alerts/config", s.alertConfigProxy)

	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/alerts/config", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if rec.Body.String() != body {
		t.Fatalf("body not passed through, got %q", rec.Body.String())
	}
}

func TestAlertConfigProxyPutForwardsBody(t *testing.T) {
	const putBody = `{"enabled":false,"webhook_url":"https://hooks.example.com/x"}`
	execution := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			t.Errorf("expected PUT, got %s", r.Method)
		}
		if ct := r.Header.Get("Content-Type"); ct != "application/json" {
			t.Errorf("expected json content-type, got %q", ct)
		}
		b, _ := io.ReadAll(r.Body)
		if string(b) != putBody {
			t.Errorf("body not forwarded verbatim, got %q", string(b))
		}
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, `{"enabled":false}`)
	}))
	defer execution.Close()
	workspace := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"role":"owner"}`)
	}))
	defer workspace.Close()
	production := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer production.Close()

	s := testServer(workspace, production)
	s.executionURL = execution.URL
	s.executionToken = "execution-secret"
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/alerts/config", s.alertConfigProxy)

	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodPut, "/api/v1/alerts/config", strings.NewReader(putBody)))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

// TestChannelSyncFailureReportsAlert：同步失败（上游 4xx/5xx）时，BFF 必须上报
// execution /internal/v1/alerts/sync-failure（T11），同时透传原始状态码给前端。
func TestChannelSyncFailureReportsAlert(t *testing.T) {
	production := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/internal/v1/channels/ch_1/sync" {
			t.Errorf("expected sync upstream, got %s", r.URL.Path)
		}
		w.WriteHeader(http.StatusBadGateway) // 上游抓取失败
	}))
	defer production.Close()
	var alertCalled bool
	execution := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/internal/v1/alerts/sync-failure" && r.Method == http.MethodPost {
			alertCalled = true
			b, _ := io.ReadAll(r.Body)
			if !strings.Contains(string(b), "ch_1") {
				t.Errorf("alert body must contain channel id, got %q", string(b))
			}
			w.WriteHeader(http.StatusOK)
			return
		}
		t.Errorf("unexpected execution call: %s %s", r.Method, r.URL.Path)
	}))
	defer execution.Close()
	workspace := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"role":"owner"}`)
	}))
	defer workspace.Close()

	s := testServer(workspace, production)
	s.executionURL = execution.URL
	s.executionToken = "execution-secret"
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/v1/channels/{id}/sync", s.channelSync)

	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/v1/channels/ch_1/sync", nil))

	if rec.Code != http.StatusBadGateway {
		t.Fatalf("expected 502 passthrough, got %d", rec.Code)
	}
	if !alertCalled {
		t.Error("expected sync-failure alert reported to execution")
	}
}

// TestChannelSyncSuccessNoAlert：同步成功（2xx）不上报告警。
func TestChannelSyncSuccessNoAlert(t *testing.T) {
	production := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer production.Close()
	execution := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("alert must not be reported on success, got %s %s", r.Method, r.URL.Path)
	}))
	defer execution.Close()
	workspace := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"role":"owner"}`)
	}))
	defer workspace.Close()

	s := testServer(workspace, production)
	s.executionURL = execution.URL
	s.executionToken = "execution-secret"
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/v1/channels/{id}/sync", s.channelSync)

	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/v1/channels/ch_1/sync", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}
