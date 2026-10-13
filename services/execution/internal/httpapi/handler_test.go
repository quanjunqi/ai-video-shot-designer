package httpapi

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"shotdesigner/services/execution/internal/catalog"
	"shotdesigner/services/execution/internal/creds"
	"shotdesigner/services/execution/internal/job"
	"shotdesigner/services/execution/internal/quota"
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

// TestAuditCostFor 锁定 T0 验收 #2 的成本提取语义：
// 命中模型带权威价 → 返回 (金额, 单位)；未校准（nil）→ (0, "") 的"预估"口径。
func TestAuditCostFor(t *testing.T) {
	cost := 0.06
	cases := []struct {
		name       string
		m          catalog.Model
		wantAmount float64
		wantUnit   string
	}{
		{"已校准（同步价）", catalog.Model{CostAmount: &cost, CostUnit: "per_call"}, 0.06, "per_call"},
		{"已校准但无单位", catalog.Model{CostAmount: &cost}, 0.06, ""},
		{"未校准（nil）", catalog.Model{}, 0, ""},
	}
	for _, c := range cases {
		amt, unit := auditCostFor(c.m)
		if amt != c.wantAmount || unit != c.wantUnit {
			t.Fatalf("%s: auditCostFor = (%v,%q), want (%v,%q)", c.name, amt, unit, c.wantAmount, c.wantUnit)
		}
	}
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

// TestGenerateRejectsWhenRateLimited 验证「超限拒绝并返回 429」作用于真实 HTTP 路径。
// 配额检查位于任何下游调用（Catalog/Creds/Engine）之前，因此这里只需非 nil 的零值客户端 ——
// 若检查位置被后人挪到下游之后，本用例会因 nil 报错或非 429 而失败。
func TestGenerateRejectsWhenRateLimited(t *testing.T) {
	lim := quota.New(quota.Config{QPS: 1, Burst: 1}, nil)
	// 先耗尽令牌桶
	if d := lim.Check(context.Background(), "workspace-1"); !d.Allowed {
		t.Fatalf("预置令牌应放行: %s", d.Reason)
	}

	h := Handler{
		Store:        &fakeStore{},
		Token:        "test-token",
		Catalog:      &catalog.Client{},
		Creds:        &creds.Client{},
		EngineClient: &http.Client{},
		Quota:        lim,
	}.Routes()

	r := executionRequest(http.MethodPost, "/v1/generate", `{"modelId":"m","mode":"text-to-image","input":{"prompt":"x"}}`)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)

	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("超限应返回 429，实际 %d，body=%s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "RATE_LIMITED") {
		t.Fatalf("响应应带 RATE_LIMITED 标记，实际 %s", w.Body.String())
	}
}

// TestGenerateUnaffectedWhenQuotaDisabled 对照：未启用配额时**不得**被 429 拦截。
// 这里刻意把 Catalog 指向一个必然连不上的地址：请求应当**穿过**配额门、
// 在下游以 503 CATALOG_UNAVAILABLE 失败 —— 由此证明「未被限流」，
// 而不是像零值客户端那样直接 panic。
func TestGenerateUnaffectedWhenQuotaDisabled(t *testing.T) {
	h := Handler{
		Store:        &fakeStore{},
		Token:        "test-token",
		Catalog:      catalog.NewClient("http://127.0.0.1:1", "t"),
		Creds:        creds.NewClient("http://127.0.0.1:1", "t"),
		EngineClient: &http.Client{Timeout: 2 * time.Second},
	}.Routes()
	r := executionRequest(http.MethodPost, "/v1/generate", `{"modelId":"m","mode":"text-to-image","input":{"prompt":"x"}}`)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code == http.StatusTooManyRequests {
		t.Fatalf("未启用配额时不应返回 429，body=%s", w.Body.String())
	}
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("应穿过配额门并在下游失败(503)，实际 %d，body=%s", w.Code, w.Body.String())
	}
}
