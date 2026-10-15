package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"shotdesigner/services/production/internal/catalog"
)

type fakeLogicalModelStore struct {
	models           []catalog.LogicalModel
	model            catalog.LogicalModel
	candidates       []catalog.Candidate
	err              error
	createErr        error
	getErr           error
	listErr          error
	bindErr          error
	updateErr        error
	unbindErr        error
	gotCreateActor   string
	gotCreate        catalog.LogicalModelCreate
	gotPatchID       string
	gotPatch         catalog.LogicalModelPatch
	gotBindID        string
	gotBind          catalog.BindCandidatesInput
	gotUnbindID      string
	gotUnbindModelID string
	gotListStatus    string
	gotListType      string
	gotCandidatesID  string
	createCalls      int
	updateCalls      int
	bindCalls        int
	unbindCalls      int
}

func (s *fakeLogicalModelStore) ListLogicalModels(_ context.Context, status, modelType string) ([]catalog.LogicalModel, error) {
	s.gotListStatus, s.gotListType = status, modelType
	return s.models, s.listErr
}

func (s *fakeLogicalModelStore) GetLogicalModel(_ context.Context, _ string) (catalog.LogicalModel, error) {
	return s.model, s.getErr
}

func (s *fakeLogicalModelStore) CreateLogicalModel(_ context.Context, actor string, input catalog.LogicalModelCreate) (catalog.LogicalModel, error) {
	s.createCalls++
	s.gotCreateActor, s.gotCreate = actor, input
	if s.createErr != nil {
		return catalog.LogicalModel{}, s.createErr
	}
	return s.model, nil
}

func (s *fakeLogicalModelStore) UpdateLogicalModel(_ context.Context, id string, patch catalog.LogicalModelPatch) (catalog.LogicalModel, error) {
	s.updateCalls++
	s.gotPatchID, s.gotPatch = id, patch
	if s.updateErr != nil {
		return catalog.LogicalModel{}, s.updateErr
	}
	return s.model, nil
}

func (s *fakeLogicalModelStore) ListCandidates(_ context.Context, id string) ([]catalog.Candidate, error) {
	s.gotCandidatesID = id
	return s.candidates, s.err
}

func (s *fakeLogicalModelStore) BindCandidates(_ context.Context, id string, input catalog.BindCandidatesInput) ([]catalog.Candidate, error) {
	s.bindCalls++
	s.gotBindID, s.gotBind = id, input
	if s.bindErr != nil {
		return nil, s.bindErr
	}
	return s.candidates, nil
}

func (s *fakeLogicalModelStore) UnbindCandidate(_ context.Context, id, modelID string) error {
	s.unbindCalls++
	s.gotUnbindID, s.gotUnbindModelID = id, modelID
	return s.unbindErr
}

func TestLogicalModelListFilters(t *testing.T) {
	store := &fakeLogicalModelStore{models: []catalog.LogicalModel{{
		ID: "image-t2i-high", Label: "文生图 · 高质量", Type: "image", Status: "enabled", Sort: 10,
		Capability: "{}", Note: "note", CreatedBy: "usr_1", CreatedAt: time.Unix(0, 0).UTC(), UpdatedAt: time.Unix(0, 0).UTC(),
	}}}
	h := Handler{Token: "secret", LogicalModelStore: store}
	rec := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, logicalModelRequest(http.MethodGet, "/internal/v1/logical-models?status=enabled&type=image", ""))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body.String())
	}
	if store.gotListStatus != "enabled" || store.gotListType != "image" {
		t.Fatalf("filters not forwarded: status=%q type=%q", store.gotListStatus, store.gotListType)
	}
	var models []catalog.LogicalModel
	if err := json.Unmarshal(rec.Body.Bytes(), &models); err != nil {
		t.Fatalf("invalid json: %v", err)
	}
	if len(models) != 1 || models[0].ID != "image-t2i-high" || models[0].Sort != 10 {
		t.Fatalf("unexpected list payload: %+v", models)
	}
}

func TestLogicalModelListRejectsUnknownFilters(t *testing.T) {
	h := Handler{Token: "secret", LogicalModelStore: &fakeLogicalModelStore{}}
	for _, target := range []string{"/internal/v1/logical-models?status=paused", "/internal/v1/logical-models?type=audio"} {
		rec := httptest.NewRecorder()
		h.Routes().ServeHTTP(rec, logicalModelRequest(http.MethodGet, target, ""))
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("%s: expected 400, got %d", target, rec.Code)
		}
	}
}

func TestLogicalModelCreateValidatesAndReportsDuplicate(t *testing.T) {
	store := &fakeLogicalModelStore{}
	h := Handler{Token: "secret", LogicalModelStore: store}
	cases := []struct {
		name string
		body string
	}{
		{"bad id", `{"id":"Image-T2I","label":"x","type":"image"}`},
		{"empty id", `{"id":"","label":"x","type":"image"}`},
		{"blank label", `{"id":"image-t2i-high","label":"   ","type":"image"}`},
		{"unknown type", `{"id":"image-t2i-high","label":"x","type":"audio"}`},
	}
	for _, tc := range cases {
		rec := httptest.NewRecorder()
		h.Routes().ServeHTTP(rec, logicalModelRequest(http.MethodPost, "/internal/v1/logical-models", tc.body))
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("%s: expected 400, got %d body=%s", tc.name, rec.Code, rec.Body.String())
		}
		if store.createCalls != 0 {
			t.Fatalf("%s: store must not be called for invalid input", tc.name)
		}
	}

	// id 重复 → 409
	store.createErr = catalog.ErrDuplicate
	rec := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, logicalModelRequest(http.MethodPost, "/internal/v1/logical-models",
		`{"id":"image-t2i-high","label":"文生图 · 高质量","type":"image","sort":10}`))
	if rec.Code != http.StatusConflict {
		t.Fatalf("expected 409 for duplicate id, got %d body=%s", rec.Code, rec.Body.String())
	}
	if store.createCalls != 1 || store.gotCreate.ID != "image-t2i-high" || store.gotCreateActor != "usr_1" {
		t.Fatalf("unexpected create call: calls=%d input=%+v actor=%q", store.createCalls, store.gotCreate, store.gotCreateActor)
	}
}

func TestLogicalModelCreateReturnsCreated(t *testing.T) {
	store := &fakeLogicalModelStore{model: catalog.LogicalModel{
		ID: "image-t2i-high", Label: "文生图 · 高质量", Type: "image", Status: "enabled", Sort: 10,
	}}
	h := Handler{Token: "secret", LogicalModelStore: store}
	rec := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, logicalModelRequest(http.MethodPost, "/internal/v1/logical-models",
		`{"id":"image-t2i-high","label":"文生图 · 高质量","type":"image"}`))
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d body=%s", rec.Code, rec.Body.String())
	}
	if location := rec.Header().Get("Location"); location != "/internal/v1/logical-models/image-t2i-high" {
		t.Fatalf("unexpected Location: %q", location)
	}
	var model catalog.LogicalModel
	if err := json.Unmarshal(rec.Body.Bytes(), &model); err != nil || model.ID != "image-t2i-high" {
		t.Fatalf("unexpected payload: %s err=%v", rec.Body.String(), err)
	}
}

func TestLogicalModelGetMapsNotFoundTo404(t *testing.T) {
	h := Handler{Token: "secret", LogicalModelStore: &fakeLogicalModelStore{getErr: catalog.ErrNotFound}}
	rec := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, logicalModelRequest(http.MethodGet, "/internal/v1/logical-models/missing-model", ""))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d body=%s", rec.Code, rec.Body.String())
	}
	if body := rec.Body.String(); !strings.Contains(body, "LOGICAL_MODEL_NOT_FOUND") {
		t.Fatalf("unexpected error code: %s", body)
	}
}

// 对外契约：id 不可修改。请求体若含 id 且与路径不同 → 400。
func TestLogicalModelPatchRejectsDifferentID(t *testing.T) {
	for _, body := range []string{
		`{"id":"image-t2i-low"}`,
		`{"id":"image-t2i-low","label":"新名字"}`,
	} {
		store := &fakeLogicalModelStore{}
		h := Handler{Token: "secret", LogicalModelStore: store}
		rec := httptest.NewRecorder()
		h.Routes().ServeHTTP(rec, logicalModelRequest(http.MethodPatch, "/internal/v1/logical-models/image-t2i-high", body))
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("body %s: expected 400, got %d body=%s", body, rec.Code, rec.Body.String())
		}
		if !strings.Contains(rec.Body.String(), "ID_IMMUTABLE") {
			t.Fatalf("body %s: expected ID_IMMUTABLE, got %s", body, rec.Body.String())
		}
		if store.updateCalls != 0 {
			t.Fatalf("body %s: store must not be called when id differs", body)
		}
	}
}

func TestLogicalModelPatchSameIDIsAccepted(t *testing.T) {
	store := &fakeLogicalModelStore{model: catalog.LogicalModel{ID: "image-t2i-high", Label: "新名字", Type: "image", Status: "enabled"}}
	h := Handler{Token: "secret", LogicalModelStore: store}
	rec := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, logicalModelRequest(http.MethodPatch, "/internal/v1/logical-models/image-t2i-high",
		`{"id":"image-t2i-high","label":"新名字"}`))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body.String())
	}
	if store.updateCalls != 1 || store.gotPatchID != "image-t2i-high" {
		t.Fatalf("unexpected update call: calls=%d id=%q", store.updateCalls, store.gotPatchID)
	}
	if store.gotPatch.Label == nil || *store.gotPatch.Label != "新名字" {
		t.Fatalf("label not forwarded: %+v", store.gotPatch)
	}
}

func TestLogicalModelPatchValidatesFields(t *testing.T) {
	for _, body := range []string{`{"label":"  "}`, `{"type":"audio"}`, `{"status":"paused"}`} {
		store := &fakeLogicalModelStore{}
		h := Handler{Token: "secret", LogicalModelStore: store}
		rec := httptest.NewRecorder()
		h.Routes().ServeHTTP(rec, logicalModelRequest(http.MethodPatch, "/internal/v1/logical-models/image-t2i-high", body))
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("body %s: expected 400, got %d body=%s", body, rec.Code, rec.Body.String())
		}
	}
}

func TestLogicalModelCandidatesListAndNotFound(t *testing.T) {
	store := &fakeLogicalModelStore{candidates: []catalog.Candidate{
		{ID: "mod_a", LogicalModelID: "image-t2i-high", Name: "A", RoutePriority: 10},
		{ID: "mod_b", LogicalModelID: "image-t2i-high", Name: "B", RoutePriority: 20},
	}}
	h := Handler{Token: "secret", LogicalModelStore: store}
	rec := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, logicalModelRequest(http.MethodGet, "/internal/v1/logical-models/image-t2i-high/candidates", ""))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var candidates []catalog.Candidate
	if err := json.Unmarshal(rec.Body.Bytes(), &candidates); err != nil || len(candidates) != 2 {
		t.Fatalf("unexpected candidates payload: %s err=%v", rec.Body.String(), err)
	}
	if candidates[0].RoutePriority != 10 || candidates[1].RoutePriority != 20 {
		t.Fatalf("priority order lost: %+v", candidates)
	}

	missing := &fakeLogicalModelStore{err: catalog.ErrNotFound}
	h = Handler{Token: "secret", LogicalModelStore: missing}
	rec = httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, logicalModelRequest(http.MethodGet, "/internal/v1/logical-models/nope/candidates", ""))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for unknown logical model, got %d", rec.Code)
	}
}

func TestLogicalModelBindValidationAndConflict(t *testing.T) {
	store := &fakeLogicalModelStore{}
	h := Handler{Token: "secret", LogicalModelStore: store}
	for _, body := range []string{`{"modelIds":[]}`, `{"modelIds":["  "]}`, `{"modelIds":["mod_a"],"routePriority":-1}`} {
		rec := httptest.NewRecorder()
		h.Routes().ServeHTTP(rec, logicalModelRequest(http.MethodPost, "/internal/v1/logical-models/image-t2i-high/candidates", body))
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("body %s: expected 400, got %d body=%s", body, rec.Code, rec.Body.String())
		}
		if store.bindCalls != 0 {
			t.Fatalf("body %s: store must not be called for invalid input", body)
		}
	}

	conflict := &fakeLogicalModelStore{bindErr: catalog.ErrModelsBoundElsewhere([]catalog.ErrModelBoundElsewhere{
		{ModelID: "mod_b", LogicalModelID: "image-t2i-low"},
	})}
	h = Handler{Token: "secret", LogicalModelStore: conflict}
	rec := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, logicalModelRequest(http.MethodPost, "/internal/v1/logical-models/image-t2i-high/candidates",
		`{"modelIds":["mod_a","mod_b"],"routePriority":20}`))
	if rec.Code != http.StatusConflict {
		t.Fatalf("expected 409 for already-bound model, got %d body=%s", rec.Code, rec.Body.String())
	}
	if body := rec.Body.String(); !strings.Contains(body, "mod_b") || !strings.Contains(body, "image-t2i-low") {
		t.Fatalf("409 must name the model and the owning logical model: %s", body)
	}
	if conflict.bindCalls != 1 || conflict.gotBindID != "image-t2i-high" || conflict.gotBind.RoutePriority == nil || *conflict.gotBind.RoutePriority != 20 {
		t.Fatalf("unexpected bind call: calls=%d id=%q input=%+v", conflict.bindCalls, conflict.gotBindID, conflict.gotBind)
	}
}

func TestLogicalModelBindReturnsCandidates(t *testing.T) {
	store := &fakeLogicalModelStore{candidates: []catalog.Candidate{{ID: "mod_a", RoutePriority: 20}}}
	h := Handler{Token: "secret", LogicalModelStore: store}
	rec := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, logicalModelRequest(http.MethodPost, "/internal/v1/logical-models/image-t2i-high/candidates",
		`{"modelIds":["mod_a"]}`))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body.String())
	}
	if store.gotBind.RoutePriority != nil {
		t.Fatalf("routePriority should stay unset so the store applies the default: %+v", store.gotBind)
	}
}

func TestLogicalModelUnbindMapsErrors(t *testing.T) {
	store := &fakeLogicalModelStore{}
	h := Handler{Token: "secret", LogicalModelStore: store}
	rec := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, logicalModelRequest(http.MethodDelete, "/internal/v1/logical-models/image-t2i-high/candidates/mod_a", ""))
	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d body=%s", rec.Code, rec.Body.String())
	}
	if store.unbindCalls != 1 || store.gotUnbindID != "image-t2i-high" || store.gotUnbindModelID != "mod_a" {
		t.Fatalf("unexpected unbind call: calls=%d id=%q model=%q", store.unbindCalls, store.gotUnbindID, store.gotUnbindModelID)
	}

	unknownModel := &fakeLogicalModelStore{unbindErr: catalog.ErrModelNotFound{ModelIDs: []string{"mod_missing"}}}
	h = Handler{Token: "secret", LogicalModelStore: unknownModel}
	rec = httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, logicalModelRequest(http.MethodDelete, "/internal/v1/logical-models/image-t2i-high/candidates/mod_missing", ""))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for unknown model, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "mod_missing") {
		t.Fatalf("404 must name the missing modelId: %s", rec.Body.String())
	}

	otherOwner := &fakeLogicalModelStore{unbindErr: catalog.ErrModelBoundElsewhere{ModelID: "mod_a", LogicalModelID: "image-t2i-low"}}
	h = Handler{Token: "secret", LogicalModelStore: otherOwner}
	rec = httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, logicalModelRequest(http.MethodDelete, "/internal/v1/logical-models/image-t2i-high/candidates/mod_a", ""))
	if rec.Code != http.StatusConflict {
		t.Fatalf("expected 409 when the model belongs to another logical model, got %d", rec.Code)
	}
}

func TestLogicalModelRequiresInternalIdentity(t *testing.T) {
	h := Handler{Token: "secret", LogicalModelStore: &fakeLogicalModelStore{}}
	req := httptest.NewRequest(http.MethodGet, "/internal/v1/logical-models", nil)
	req.Header.Set("X-Actor-Role", "owner") // TASK-AUTH-001：角色头通过 authz，由 handler 的 identity 校验返回 401
	rec := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without internal token, got %d", rec.Code)
	}
}

func TestLogicalModelUnavailableWithoutStore(t *testing.T) {
	h := Handler{Token: "secret"}
	rec := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, logicalModelRequest(http.MethodGet, "/internal/v1/logical-models", ""))
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 without a store, got %d", rec.Code)
	}
}

func logicalModelRequest(method, path, body string) *http.Request {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer secret")
	req.Header.Set("X-Workspace-Id", "ws_1")
	req.Header.Set("X-Actor-Id", "usr_1")
	req.Header.Set("X-Actor-Role", "owner")
	return req
}
