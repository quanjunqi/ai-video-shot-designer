package httpserver

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// 回归护栏：catalog 代理必须把查询串透传给上游。
//
// 真实事故：本仓其它 9 个代理都有 `upstreamPath += "?" + r.URL.RawQuery`，
// 唯独 catalogProxy 漏了 ⇒ 新加的 /api/v1/catalog/supply?channel_id=… 到上游后
// 变成"没带 channel_id"，用户看到 400 MISSING_CHANNEL（**只有真机会发现**）。
func TestCatalogProxyForwardsQueryString(t *testing.T) {
	var seenPath, seenQuery string
	production := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenPath, seenQuery = r.URL.Path, r.URL.RawQuery
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"items":[]}`))
	}))
	defer production.Close()
	workspace := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK) // authorize 放行
	}))
	defer workspace.Close()

	s := &server{
		httpClient:      &http.Client{Timeout: 2 * time.Second},
		workspaceURL:    workspace.URL,
		workspaceToken:  "wt",
		productionURL:   production.URL,
		productionToken: "pt",
		devWorkspace:    "ws_a",
		devActor:        "user_a",
	}
	rec := httptest.NewRecorder()
	s.catalogProxy(rec, httptest.NewRequest(http.MethodGet, "/api/v1/catalog/supply?channel_id=ch_1&include_missing=1", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("期望 200，得到 %d：%s", rec.Code, rec.Body.String())
	}
	if seenPath != "/internal/v1/catalog/supply" {
		t.Fatalf("上游路径不对：%q", seenPath)
	}
	if seenQuery != "channel_id=ch_1&include_missing=1" {
		t.Fatalf("上游查询串被丢了：%q（这正是线上 400 MISSING_CHANNEL 的原因）", seenQuery)
	}
}

// 没有查询串时不得凭空加一个 "?"（否则上游会收到空 query，行为可能不同）
func TestCatalogProxyKeepsPathCleanWithoutQuery(t *testing.T) {
	var seenURL string
	production := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenURL = r.URL.RequestURI()
		_, _ = w.Write([]byte(`{"channels":[],"models":[],"templates":[]}`))
	}))
	defer production.Close()
	workspace := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }))
	defer workspace.Close()
	s := &server{
		httpClient:      &http.Client{Timeout: 2 * time.Second},
		workspaceURL:    workspace.URL,
		workspaceToken:  "wt",
		productionURL:   production.URL,
		productionToken: "pt",
		devWorkspace:    "ws_a",
		devActor:        "user_a",
	}
	rec := httptest.NewRecorder()
	s.catalogProxy(rec, httptest.NewRequest(http.MethodGet, "/api/v1/catalog", nil))
	if seenURL != "/internal/v1/catalog" {
		t.Fatalf("无 query 时上游 URI 应保持干净，实际 %q", seenURL)
	}
}
