package alert

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

// fakeConfigStore 是 configStore 接口替身（配置读取 + 冷却占位可编程）。
type fakeConfigStore struct {
	cfg        *Config
	getErr     error
	claimed    bool
	claimErr   error
	claimCalls atomic.Int32
}

func (f *fakeConfigStore) Get(_ context.Context, _ string) (*Config, error) { return f.cfg, f.getErr }
func (f *fakeConfigStore) ClaimCooldown(_ context.Context, _ string, _ int) (bool, error) {
	f.claimCalls.Add(1)
	return f.claimed, f.claimErr
}

// 编译期断言：fakeConfigStore 满足 configStore 接口。
var _ configStore = (*fakeConfigStore)(nil)

// fakeWindow 是错误率窗口查询替身。
type fakeWindow struct {
	total, failed int
	err           error
}

func (f fakeWindow) ErrorRate(_ context.Context, _ string, _ int) (int, int, error) {
	return f.total, f.failed, f.err
}

// newTestEvaluator 组装一个可注入的 Evaluator（fake store + fake window + httptest webhook）。
// webhookURL 注入 fake store 的 cfg.WebhookURL（nil cfg 时忽略）。
func newTestEvaluator(t *testing.T, st *fakeConfigStore, wnd windowQuerier) (*Evaluator, *atomic.Int32) {
	t.Helper()
	var received atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		received.Add(1)
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(srv.Close)
	if st.cfg != nil && st.cfg.WebhookURL == "" {
		st.cfg.WebhookURL = srv.URL
	}
	e := &Evaluator{
		Store:   st,
		window:  wnd,
		Webhook: NewWebhookClient(slog.New(slog.NewTextHandler(io.Discard, nil))),
		Now:     func() time.Time { return time.Date(2026, 10, 15, 12, 0, 0, 0, time.UTC) },
		Log:     slog.New(slog.NewTextHandler(io.Discard, nil)),
	}
	return e, &received
}

func TestWebhookSendRetriesOnFailure(t *testing.T) {
	var attempts atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if attempts.Add(1) < 3 {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	w := NewWebhookClient(slog.New(slog.NewTextHandler(io.Discard, nil)))
	if !w.Send(context.Background(), srv.URL, Payload{Kind: "test", WorkspaceID: "ws1"}) {
		t.Fatal("expected webhook to succeed after retries")
	}
	if got := attempts.Load(); got != 3 {
		t.Fatalf("expected 3 attempts (2 fail + 1 ok), got %d", got)
	}
}

func TestWebhookSendGivesUpAfterMax(t *testing.T) {
	var attempts atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts.Add(1)
		w.WriteHeader(http.StatusBadGateway)
	}))
	defer srv.Close()

	w := NewWebhookClient(slog.New(slog.NewTextHandler(io.Discard, nil)))
	if w.Send(context.Background(), srv.URL, Payload{Kind: "test", WorkspaceID: "ws1"}) {
		t.Fatal("expected failure after max retries")
	}
	if got := attempts.Load(); got != maxWebhookAttempts {
		t.Fatalf("expected exactly %d attempts, got %d", maxWebhookAttempts, got)
	}
}

func TestEvaluateErrorRateThresholdHit(t *testing.T) {
	st := &fakeConfigStore{cfg: &Config{
		WorkspaceID: "ws1", Enabled: true, ErrorRateThresholdPct: 20,
		ErrorRateWindowMin: 5, CooldownMin: 10,
	}, claimed: true}
	e, received := newTestEvaluator(t, st, fakeWindow{total: 10, failed: 5}) // 50% > 20%
	e.EvaluateErrorRate(context.Background(), "ws1")
	if got := received.Load(); got != 1 {
		t.Fatalf("expected webhook fired, got %d", got)
	}
	if got := st.claimCalls.Load(); got != 1 {
		t.Fatalf("expected 1 cooldown claim, got %d", got)
	}
}

func TestEvaluateErrorRateBelowThreshold(t *testing.T) {
	st := &fakeConfigStore{cfg: &Config{
		WorkspaceID: "ws1", Enabled: true, ErrorRateThresholdPct: 50,
		ErrorRateWindowMin: 5, CooldownMin: 10,
	}, claimed: true}
	e, received := newTestEvaluator(t, st, fakeWindow{total: 10, failed: 2}) // 20% < 50%
	e.EvaluateErrorRate(context.Background(), "ws1")
	if got := received.Load(); got != 0 {
		t.Fatalf("expected no webhook, got %d", got)
	}
}

func TestEvaluateErrorRateCooldownSkips(t *testing.T) {
	st := &fakeConfigStore{cfg: &Config{
		WorkspaceID: "ws1", Enabled: true, ErrorRateThresholdPct: 1,
		ErrorRateWindowMin: 5, CooldownMin: 10,
	}, claimed: false} // 冷却期内：占位失败
	e, received := newTestEvaluator(t, st, fakeWindow{total: 10, failed: 10})
	e.EvaluateErrorRate(context.Background(), "ws1")
	if got := received.Load(); got != 0 {
		t.Fatalf("expected no webhook in cooldown, got %d", got)
	}
}

func TestEvaluateErrorRateDisabled(t *testing.T) {
	st := &fakeConfigStore{cfg: &Config{WorkspaceID: "ws1", Enabled: false}}
	e, received := newTestEvaluator(t, st, fakeWindow{total: 10, failed: 10})
	e.EvaluateErrorRate(context.Background(), "ws1")
	if got := received.Load(); got != 0 {
		t.Fatalf("expected no webhook when disabled, got %d", got)
	}
}

func TestEvaluateErrorRateNoConfig(t *testing.T) {
	st := &fakeConfigStore{cfg: nil}
	e, received := newTestEvaluator(t, st, fakeWindow{total: 10, failed: 10})
	e.EvaluateErrorRate(context.Background(), "ws1")
	if got := received.Load(); got != 0 {
		t.Fatalf("expected no webhook without config, got %d", got)
	}
}

func TestEvaluateErrorRateEmptyWindow(t *testing.T) {
	st := &fakeConfigStore{cfg: &Config{
		WorkspaceID: "ws1", Enabled: true, ErrorRateThresholdPct: 20,
		ErrorRateWindowMin: 5, CooldownMin: 10,
	}, claimed: true}
	e, received := newTestEvaluator(t, st, fakeWindow{total: 0, failed: 0}) // 窗口无调用
	e.EvaluateErrorRate(context.Background(), "ws1")
	if got := received.Load(); got != 0 {
		t.Fatalf("expected no webhook on empty window, got %d", got)
	}
}

func TestNotifyBreaker(t *testing.T) {
	st := &fakeConfigStore{cfg: &Config{WorkspaceID: "ws1", Enabled: true, CooldownMin: 10}, claimed: true}
	e, received := newTestEvaluator(t, st, nil)
	e.NotifyBreaker(context.Background(), "ws1", "chan|model")
	if got := received.Load(); got != 1 {
		t.Fatalf("expected breaker webhook, got %d", got)
	}
}

func TestNotifySyncFailure(t *testing.T) {
	st := &fakeConfigStore{cfg: &Config{WorkspaceID: "ws1", Enabled: true, CooldownMin: 10}, claimed: true}
	e, received := newTestEvaluator(t, st, nil)
	e.NotifySyncFailure(context.Background(), "ws1", "chan_1")
	if got := received.Load(); got != 1 {
		t.Fatalf("expected sync-failure webhook, got %d", got)
	}
}

func TestNotifyDisabledNoWebhook(t *testing.T) {
	st := &fakeConfigStore{cfg: &Config{WorkspaceID: "ws1", Enabled: false}}
	e, received := newTestEvaluator(t, st, nil)
	e.NotifyBreaker(context.Background(), "ws1", "chan|model")
	e.NotifySyncFailure(context.Background(), "ws1", "chan_1")
	if got := received.Load(); got != 0 {
		t.Fatalf("expected no webhook when disabled, got %d", got)
	}
}
