package httpapi

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"shotdesigner/services/execution/internal/job"
)

type fakeStore struct {
	created      job.Job
	createReplay bool
	createErr    error
	createInput  job.Input
	listItems    []job.Job
	getResult    job.Job
	getErr       error
}

func (s *fakeStore) Create(_ context.Context, _, _ string, in job.Input) (job.Job, bool, error) {
	s.createInput = in
	if string(in.Steps) == "null" {
		return job.Job{}, false, errors.New("steps must be a JSON array")
	}
	return s.created, s.createReplay, s.createErr
}
func (s *fakeStore) List(context.Context, string, string, string, int) ([]job.Job, error) {
	return s.listItems, nil
}
func (s *fakeStore) Get(context.Context, string, string) (job.Job, error) {
	return s.getResult, s.getErr
}
func (s *fakeStore) Cancel(context.Context, string, string) (job.Job, error) {
	return s.getResult, s.getErr
}
func (s *fakeStore) Retry(context.Context, string, string) (job.Job, error) {
	return s.getResult, s.getErr
}

func executionRequest(method, path, body string) *http.Request {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.Header.Set("Authorization", "Bearer test-token")
	r.Header.Set("X-Workspace-Id", "workspace-1")
	r.Header.Set("X-Actor-Id", "actor-1")
	return r
}

func TestIntentCreateRequiresAuthAndContext(t *testing.T) {
	store := &fakeStore{}
	h := Handler{Store: store, Token: "test-token"}.Routes()
	r := executionRequest(http.MethodPost, "/internal/v1/execution-intents", `{"intent_id":"i1","project_id":"p1","kind":"image","label":"角色","scope_epoch":1,"payload":{"prompt":"x"}}`)
	r.Header.Del("Authorization")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}

	r = executionRequest(http.MethodPost, "/internal/v1/execution-intents", `{}`)
	r.Header.Del("X-Workspace-Id")
	w = httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestIntentCreateSeparatesPayloadAndSteps(t *testing.T) {
	store := &fakeStore{created: job.Job{ID: "job-1"}}
	h := Handler{Store: store, Token: "test-token"}.Routes()
	r := executionRequest(http.MethodPost, "/internal/v1/execution-intents", `{"intent_id":"i1","project_id":"p1","kind":"image","label":"角色","scope_epoch":1,"payload":{"prompt":"x"}}`)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusCreated || string(store.createInput.Steps) != "" || string(store.createInput.IntentPayload) != `{"prompt":"x"}` {
		t.Fatalf("unexpected intent create: status=%d input=%+v", w.Code, store.createInput)
	}
	if w.Header().Get("X-Idempotent-Replay") != "false" {
		t.Fatalf("missing replay header")
	}
}

func TestIntentCreateMapsConflictAndReplay(t *testing.T) {
	store := &fakeStore{createErr: job.ErrIdempotencyConflict}
	h := Handler{Store: store, Token: "test-token"}.Routes()
	r := executionRequest(http.MethodPost, "/internal/v1/execution-intents", `{"intent_id":"i1","project_id":"p1","kind":"image","label":"角色","scope_epoch":1,"payload":{"prompt":"x"}}`)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusConflict {
		t.Fatalf("expected conflict, got %d", w.Code)
	}
	store.createErr = nil
	store.createReplay = true
	r = executionRequest(http.MethodPost, "/internal/v1/execution-intents", `{"intent_id":"i1","project_id":"p1","kind":"image","label":"角色","scope_epoch":1,"payload":{"prompt":"x"}}`)
	w = httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusOK || w.Header().Get("X-Idempotent-Replay") != "true" {
		t.Fatalf("expected replay, got %d headers=%v", w.Code, w.Header())
	}
}

func TestTaskCreateUsesSnakeCaseAndRejectsInvalidSteps(t *testing.T) {
	store := &fakeStore{created: job.Job{ID: "job-1"}}
	h := Handler{Store: store, Token: "test-token"}.Routes()
	r := executionRequest(http.MethodPost, "/internal/v1/tasks", `{"kind":"image","label":"角色","project_id":"p1","steps":[],"payload":{"prompt":"blue coat","model":"image-v1","parameters":{"ratio":"16:9"}},"idempotency_key":"k1"}`)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusCreated || store.createInput.ProjectID != "p1" || string(store.createInput.Steps) != "[]" {
		t.Fatalf("snake case mapping failed: status=%d input=%+v", w.Code, store.createInput)
	}
	if string(store.createInput.IntentPayload) != `{"prompt":"blue coat","model":"image-v1","parameters":{"ratio":"16:9"}}` {
		t.Fatalf("task payload was not preserved: %s", store.createInput.IntentPayload)
	}

	r = executionRequest(http.MethodPost, "/internal/v1/tasks", `{"kind":"image","label":"角色","steps":null,"idempotency_key":"k2"}`)
	w = httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected invalid steps to be rejected by store, got %d", w.Code)
	}
}

func TestTaskCreateReplayReturnsOK(t *testing.T) {
	store := &fakeStore{created: job.Job{ID: "job-1"}, createReplay: true}
	h := Handler{Store: store, Token: "test-token"}.Routes()
	r := executionRequest(http.MethodPost, "/internal/v1/tasks", `{"kind":"image","label":"角色","idempotency_key":"k1"}`)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 replay, got %d", w.Code)
	}
}
