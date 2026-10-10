package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"shotdesigner/services/production/internal/project"
)

type fakeStore struct {
	creates   int
	workspace string
	id        string
	result    project.Project
	replay    bool
	err       error
}

func (s *fakeStore) Create(_ context.Context, workspace, _, _ string, _ project.CreateInput) (project.Project, bool, error) {
	s.creates++
	s.workspace = workspace
	return s.result, s.replay, s.err
}

func (s *fakeStore) Get(_ context.Context, workspace, id string) (project.Project, error) {
	s.workspace, s.id = workspace, id
	return s.result, s.err
}

func (s *fakeStore) List(_ context.Context, workspace string, _ int) (project.ListResult, error) {
	s.workspace = workspace
	return project.ListResult{Items: []project.Project{s.result}}, s.err
}

func (s *fakeStore) Delete(_ context.Context, _, _ string) error {
	return s.err
}

func (s *fakeStore) Update(_ context.Context, _, _ string, _ project.UpdateInput) (project.Project, error) {
	return s.result, s.err
}

func request(method, path, body string) *http.Request {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.Header.Set("Authorization", "Bearer test-token")
	r.Header.Set("X-Workspace-Id", "workspace-1")
	r.Header.Set("X-Actor-Id", "user-1")
	r.Header.Set("Idempotency-Key", "request-1")
	return r
}

func validJSON() string {
	data, _ := json.Marshal(project.CreateInput{
		Title: "测试", StyleID: "style-1", StyleVersion: "v1", AspectRatio: "16:9",
		DefaultTextModel: "text-1", DefaultImageModel: "image-1", DefaultVideoModel: "video-1", SourceText: strings.Repeat("字", 100),
	})
	return string(data)
}

func TestCreateRequiresInternalIdentity(t *testing.T) {
	store := &fakeStore{}
	handler := Handler{Store: store, Token: "test-token"}.Routes()
	r := request(http.MethodPost, "/internal/v1/comic-projects", validJSON())
	r.Header.Del("Authorization")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, r)
	if response.Code != http.StatusUnauthorized || store.creates != 0 {
		t.Fatalf("unauthorized request: code=%d creates=%d", response.Code, store.creates)
	}
	r = request(http.MethodPost, "/internal/v1/comic-projects", validJSON())
	r.Header.Del("X-Workspace-Id")
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, r)
	if response.Code != http.StatusBadRequest || store.creates != 0 {
		t.Fatalf("missing workspace: code=%d creates=%d", response.Code, store.creates)
	}
}

func TestCreateSuccessAndReplay(t *testing.T) {
	store := &fakeStore{result: project.Project{ID: "proj_123"}}
	handler := Handler{Store: store, Token: "test-token"}.Routes()
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request(http.MethodPost, "/internal/v1/comic-projects", validJSON()))
	if response.Code != http.StatusCreated || store.workspace != "workspace-1" || store.creates != 1 {
		t.Fatalf("create failed: code=%d store=%+v", response.Code, store)
	}
	store.replay = true
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request(http.MethodPost, "/internal/v1/comic-projects", validJSON()))
	if response.Code != http.StatusOK {
		t.Fatalf("expected replay, got %d", response.Code)
	}
}

func TestCreateRejectsInvalidAndConflictingRequests(t *testing.T) {
	store := &fakeStore{err: project.ErrIdempotencyConflict}
	handler := Handler{Store: store, Token: "test-token"}.Routes()
	for _, tc := range []struct {
		body   string
		status int
	}{
		{"{}", http.StatusUnprocessableEntity},
		{validJSON() + "{}", http.StatusBadRequest},
		{validJSON(), http.StatusConflict},
	} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request(http.MethodPost, "/internal/v1/comic-projects", tc.body))
		if response.Code != tc.status {
			t.Fatalf("expected %d, got %d: %s", tc.status, response.Code, response.Body.String())
		}
	}
	if store.creates != 1 {
		t.Fatalf("invalid input reached database: %d calls", store.creates)
	}
}

func TestGetScopedToWorkspace(t *testing.T) {
	store := &fakeStore{err: project.ErrNotFound}
	handler := Handler{Store: store, Token: "test-token"}.Routes()
	id := "proj_" + strings.Repeat("a", 32)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request(http.MethodGet, "/internal/v1/comic-projects/"+id, ""))
	if response.Code != http.StatusNotFound || store.workspace != "workspace-1" || store.id != id {
		t.Fatalf("workspace lookup failed: code=%d store=%+v", response.Code, store)
	}
	store.err = errors.New("database offline")
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request(http.MethodGet, "/internal/v1/comic-projects/"+id, ""))
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected service unavailable, got %d", response.Code)
	}
}
