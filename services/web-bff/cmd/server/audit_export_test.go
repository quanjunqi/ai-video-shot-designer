package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// D8b 的测试：auditExport 此前【没有任何测试】，把 web-bff 覆盖率压到 22.4%（门槛 23）
// ⇒ CI 的 Coverage floor (ratchet) 失败。本文件补齐它的四条路径。
//
// 其中第 2 条同时把 D8b 的一个真实缺陷钉成回归：
//   copyHeaders 原先只透传 Content-Type 与 Location ⇒ 导出【丢 Content-Disposition】。
//   该缺陷不表现为"下载失败"，只表现为"浏览器拿不到文件名"，
//   若只断言响应体内容就会漏掉 ⇒ 必须断言响应头。

func TestAuditExportMethodNotAllowed(t *testing.T) {
	workspace := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("workspace must not be called when method is rejected")
	}))
	defer workspace.Close()
	production := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer production.Close()

	s := testServer(workspace, production)
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/audit/export", s.auditExport)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/v1/audit/export", nil))

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d body=%s", rec.Code, rec.Body.String())
	}
}

func TestAuditExportPassesThroughCSVAndDisposition(t *testing.T) {
	const body = "id,status\n1,success\n"
	execution := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="audit-export.csv"`)
		w.Header().Set("Cache-Control", "no-store")
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
	mux.HandleFunc("/api/v1/audit/export", s.auditExport)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/audit/export", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if rec.Body.String() != body {
		t.Fatalf("CSV 响应体未被原样透传：%q", rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); !strings.Contains(ct, "text/csv") {
		t.Fatalf("Content-Type 未透传：%q", ct)
	}
	// ★ 这条锁住 D8b 的修复：缺了它，浏览器拿不到文件名（而下载本身仍会成功）
	if cd := rec.Header().Get("Content-Disposition"); !strings.Contains(cd, "audit-export.csv") {
		t.Fatalf("Content-Disposition 未透传（D8b 回归）：%q", cd)
	}
}

func TestAuditExportForwardsFiltersAndIdentity(t *testing.T) {
	var gotPath, gotAuth, gotWS, gotActor string
	execution := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path + "?" + r.URL.RawQuery
		gotAuth = r.Header.Get("Authorization")
		gotWS = r.Header.Get("X-Workspace-Id")
		gotActor = r.Header.Get("X-Actor-Id")
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.WriteHeader(http.StatusOK)
	}))
	defer execution.Close()
	workspace := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	defer workspace.Close()
	production := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer production.Close()

	s := testServer(workspace, production)
	s.executionURL = execution.URL
	s.executionToken = "execution-secret"
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/audit/export", s.auditExport)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/audit/export?status=failed&model_id=m1", nil))

	if gotPath != "/internal/v1/audit/export?status=failed&model_id=m1" {
		t.Fatalf("上游路径/筛选未透传：%q", gotPath)
	}
	if gotAuth != "Bearer execution-secret" || gotWS != "ws_dev" || gotActor != "user_dev" {
		t.Fatalf("身份头未按约定设置：auth=%q ws=%q actor=%q", gotAuth, gotWS, gotActor)
	}
}

func TestAuditExportUnavailableWhenExecutionDown(t *testing.T) {
	workspace := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	defer workspace.Close()
	production := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer production.Close()

	s := testServer(workspace, production)
	s.executionURL = "http://127.0.0.1:1" // 不可达
	s.executionToken = "execution-secret"
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/audit/export", s.auditExport)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/audit/export", nil))

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d body=%s", rec.Code, rec.Body.String())
	}
}
