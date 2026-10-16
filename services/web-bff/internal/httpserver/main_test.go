package httpserver

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
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"role":"owner"}`)
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
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"role":"owner"}`)
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
				w.Header().Set("Content-Type", "application/json")
				_, _ = io.WriteString(w, `{"role":"owner"}`)
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
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"role":"owner"}`)
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
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"role":"owner"}`)
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
