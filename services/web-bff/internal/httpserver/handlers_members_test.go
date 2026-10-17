package httpserver

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TASK-SETTINGS-P3A：BFF 成员列表代理。
// 断言三件事：admin+ 转发正确（路径/凭据头/透传 items 形状）、viewer 被矩阵 403、
// 上游不可用时 503 —— 把「成员列表仅 Admin+（纵深防御）」钉在测试里。

func TestWorkspaceMembersForwardsAndPassesThroughItems(t *testing.T) {
	var seenPath, seenAuth, seenWS, seenActor string
	workspace := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/authorize") {
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"role":"admin"}`)
			return
		}
		seenPath = r.URL.Path
		seenAuth = r.Header.Get("Authorization")
		seenWS = r.Header.Get("X-Workspace-Id")
		seenActor = r.Header.Get("X-Actor-Id")
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"items":[{"workspace_id":"ws_dev","actor_id":"user_dev","role":"owner"},{"workspace_id":"ws_dev","actor_id":"user_viewer","role":"viewer"}]}`)
	}))
	defer workspace.Close()
	production := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer production.Close()

	s := testServer(workspace, production)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/workspace/members", s.workspaceMembers)

	r := httptest.NewRequest(http.MethodGet, "/api/v1/workspace/members", nil)
	r.Header.Set("X-Workspace-Id", "ws_dev")
	r.Header.Set("X-Actor-Id", "user_dev")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, r)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if seenPath != "/internal/v1/workspaces/ws_dev/members" {
		t.Errorf("upstream path mismatch: %q", seenPath)
	}
	if seenAuth != "Bearer workspace-secret" {
		t.Errorf("workspace token not forwarded: %q", seenAuth)
	}
	if seenWS != "ws_dev" || seenActor != "user_dev" {
		t.Errorf("workspace/actor header mismatch: %q/%q", seenWS, seenActor)
	}
	if body := rec.Body.String(); !strings.Contains(body, `"actor_id":"user_dev"`) || !strings.Contains(body, `"role":"viewer"`) {
		t.Errorf("items not passed through: %s", body)
	}
}

func TestWorkspaceMembersRejectsViewerWith403(t *testing.T) {
	workspace := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"role":"viewer"}`) // authorize 返回 viewer
	}))
	defer workspace.Close()
	production := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer production.Close()

	s := testServer(workspace, production)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/workspace/members", s.workspaceMembers)

	r := httptest.NewRequest(http.MethodGet, "/api/v1/workspace/members", nil)
	r.Header.Set("X-Workspace-Id", "ws_dev")
	r.Header.Set("X-Actor-Id", "user_viewer")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, r)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for viewer, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "FORBIDDEN") {
		t.Errorf("expected FORBIDDEN error code, got %s", rec.Body.String())
	}
}

func TestWorkspaceMembersUnavailableWhenWorkspaceDown(t *testing.T) {
	workspace := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"role":"admin"}`)
	}))
	workspace.Close() // 关闭后 authorize 不可达 → 503
	production := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer production.Close()

	s := testServer(workspace, production)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/workspace/members", s.workspaceMembers)

	r := httptest.NewRequest(http.MethodGet, "/api/v1/workspace/members", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, r)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 when workspace down, got %d", rec.Code)
	}
}
