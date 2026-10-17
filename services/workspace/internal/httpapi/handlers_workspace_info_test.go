package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"shotdesigner/services/workspace/internal/store"
)

// TASK-SETTINGS-P3B：workspace 详情端点（信息卡真实化）——独立文件保持 handler_test.go ≤500 行（BE-SIZE-001）。

func TestWorkspaceInfoReturnsProfile(t *testing.T) {
	fake := &fakeStore{workspace: store.WorkspaceInfo{ID: "ws_dev", Name: "开发工作区", CreatedAt: time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)}}
	h := Handler{Store: fake, Token: "test-token"}.Routes()

	response := httptest.NewRecorder()
	h.ServeHTTP(response, workspaceRequest(http.MethodGet, "/internal/v1/workspaces/ws_dev"))
	if response.Code != http.StatusOK {
		t.Fatalf("workspace info: expected 200, got %d", response.Code)
	}
	var got store.WorkspaceInfo
	if err := json.NewDecoder(response.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.ID != "ws_dev" || got.Name != "开发工作区" || got.CreatedAt.IsZero() {
		t.Fatalf("workspace info body mismatch: %+v", got)
	}
	if fake.lastWorkspace != "ws_dev" {
		t.Fatalf("store called with workspace %q, want ws_dev", fake.lastWorkspace)
	}
}

func TestWorkspaceInfoMapsNotFoundAndUnavailable(t *testing.T) {
	fake := &fakeStore{workspaceErr: store.ErrNotFound}
	h := Handler{Store: fake, Token: "test-token"}.Routes()
	response := httptest.NewRecorder()
	h.ServeHTTP(response, workspaceRequest(http.MethodGet, "/internal/v1/workspaces/ws_dev"))
	if response.Code != http.StatusNotFound {
		t.Fatalf("not found: expected 404, got %d", response.Code)
	}

	fake.workspaceErr = errors.New("db down")
	response = httptest.NewRecorder()
	h.ServeHTTP(response, workspaceRequest(http.MethodGet, "/internal/v1/workspaces/ws_dev"))
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("unavailable: expected 503, got %d", response.Code)
	}
}
