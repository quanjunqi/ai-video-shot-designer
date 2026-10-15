package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sort"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"shotdesigner/services/execution/internal/alert"
	"shotdesigner/services/execution/internal/audit"
)

// 真库脚手架（httpapi 包内）：随机 schema + 应用 migrations + 清理。
// 未设置 EXECUTION_TEST_DATABASE_URL 时跳过。
func healthTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("EXECUTION_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set EXECUTION_TEST_DATABASE_URL to a dedicated PostgreSQL test database")
	}
	ctx := context.Background()
	admin, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(admin.Close)
	var suffix [8]byte
	if _, err := rand.Read(suffix[:]); err != nil {
		t.Fatal(err)
	}
	schema := "httpapi_health_" + hex.EncodeToString(suffix[:])
	quoted := pgx.Identifier{schema}.Sanitize()
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+quoted); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := admin.Exec(context.Background(), "DROP SCHEMA "+quoted+" CASCADE"); err != nil {
			t.Errorf("remove test schema: %v", err)
		}
	})
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	migrations, err := filepath.Glob(filepath.Join("..", "..", "migrations", "*.sql"))
	if err != nil {
		t.Fatal(err)
	}
	sort.Strings(migrations)
	for _, f := range migrations {
		b, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, string(b), pgx.QueryExecModeSimpleProtocol); err != nil {
			t.Fatalf("apply %s: %v", filepath.Base(f), err)
		}
	}
	return pool
}

// newHealthHandler 装配带真库的健康/告警 Handler（webhook 打到 httptest server）。
func newHealthHandler(t *testing.T) (Handler, string, *atomic.Int32) {
	t.Helper()
	pool := healthTestPool(t)
	ctx := context.Background()
	ws := "ws-h-" + hex.EncodeToString(randBytesH(t))

	var webhookHits atomic.Int32
	hook := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		webhookHits.Add(1)
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(hook.Close)

	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	auditStore := &audit.Store{Pool: pool}
	alertStore := alert.New(pool, log)
	eval := alert.NewEvaluator(alertStore, alert.NewWebhookClient(log), log)
	// 默认配置带 webhook URL
	if err := alertStore.Upsert(ctx, *alert.DefaultConfig(ws)); err != nil {
		t.Fatalf("seed alert config: %v", err)
	}
	cfg, _ := alertStore.Get(ctx, ws)
	cfg.WebhookURL = hook.URL
	if err := alertStore.Upsert(ctx, *cfg); err != nil {
		t.Fatalf("seed webhook url: %v", err)
	}
	h := Handler{Token: "test-token", AuditStore: auditStore, Alert: eval}
	return h, ws, &webhookHits
}

func randBytesH(t *testing.T) []byte {
	t.Helper()
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		t.Fatal(err)
	}
	return b
}

func TestListHealthHandler(t *testing.T) {
	h, ws, _ := newHealthHandler(t)
	ctx := context.Background()
	now := time.Now()

	// 造 2 个单元：a 成功2+失败1(503)；b 成功1+失败1(429)
	for i, r := range []struct {
		channel, status string
		code            *int
	}{
		{"ch-a", "success", intP(200)},
		{"ch-a", "success", intP(200)},
		{"ch-a", "failed", intP(503)},
		{"ch-b", "success", intP(200)},
		{"ch-b", "rate_limited", intP(429)},
	} {
		_, err := h.AuditStore.Pool.Exec(ctx, `
			INSERT INTO gateway_audit_logs
				(request_id, workspace_id, project_id, model_id, channel_id, provider_model, mode, status, status_code, created_at)
			VALUES ($1, $2, 'p', 'm', $3, 'm', 'text-chat', $4, $5, $6)`,
			fmt.Sprintf("req-%s-%d", ws, i), ws, r.channel, r.status, r.code, now)
		if err != nil {
			t.Fatalf("insert audit: %v", err)
		}
	}

	req := executionRequest(http.MethodGet, "/internal/v1/audit/health", "")
	req.Header.Set("X-Workspace-Id", ws)
	rec := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("listHealth status = %d, body=%s", rec.Code, rec.Body.String())
	}
	var body struct {
		Units []map[string]any `json:"units"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(body.Units) != 2 {
		t.Fatalf("expected 2 units, got %d", len(body.Units))
	}
	first := body.Units[0]
	if first["channel_id"] != "ch-a" || first["calls"] != float64(3) || first["success_calls"] != float64(2) {
		t.Fatalf("unit a mismatch: %v", first)
	}
	if first["breaker_state"] != "normal" {
		t.Fatalf("unit a breaker state = %v, want normal", first["breaker_state"])
	}
}

func TestAlertConfigHandlers(t *testing.T) {
	h, ws, _ := newHealthHandler(t)

	// GET 未配置 → 默认值（enabled/20/5/10）
	req := executionRequest(http.MethodGet, "/internal/v1/alerts/config", "")
	req.Header.Set("X-Workspace-Id", ws)
	rec := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("get default status = %d", rec.Code)
	}
	var def map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &def); err != nil {
		t.Fatalf("decode default: %v", err)
	}
	if def["error_rate_threshold_pct"] != float64(20) || def["error_rate_window_min"] != float64(5) ||
		def["cooldown_min"] != float64(10) || def["enabled"] != true {
		t.Fatalf("default config mismatch: %v", def)
	}

	// PUT 更新阈值 + 非法阈值 400
	put := executionRequest(http.MethodPut, "/internal/v1/alerts/config",
		`{"error_rate_threshold_pct":35,"error_rate_window_min":7,"cooldown_min":12,"webhook_url":"https://x/h"}`)
	put.Header.Set("X-Workspace-Id", ws)
	rec2 := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec2, put)
	if rec2.Code != 200 {
		t.Fatalf("put status = %d, body=%s", rec2.Code, rec2.Body.String())
	}
	bad := executionRequest(http.MethodPut, "/internal/v1/alerts/config", `{"error_rate_threshold_pct":0}`)
	bad.Header.Set("X-Workspace-Id", ws)
	rec3 := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec3, bad)
	if rec3.Code != 400 {
		t.Fatalf("invalid threshold status = %d, want 400", rec3.Code)
	}

	// GET 更新后
	req2 := executionRequest(http.MethodGet, "/internal/v1/alerts/config", "")
	req2.Header.Set("X-Workspace-Id", ws)
	rec4 := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec4, req2)
	var updated map[string]any
	_ = json.Unmarshal(rec4.Body.Bytes(), &updated)
	if updated["error_rate_threshold_pct"] != float64(35) {
		t.Fatalf("updated threshold = %v, want 35", updated["error_rate_threshold_pct"])
	}
}

func TestNotifySyncFailureHandler(t *testing.T) {
	h, ws, hits := newHealthHandler(t)
	req := executionRequest(http.MethodPost, "/internal/v1/alerts/sync-failure", `{"channel_id":"ch-sync"}`)
	req.Header.Set("X-Workspace-Id", ws)
	rec := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("sync-failure status = %d, body=%s", rec.Code, rec.Body.String())
	}
	// 异步发送，稍候断言 webhook 至少一次
	deadline := time.Now().Add(3 * time.Second)
	for hits.Load() == 0 && time.Now().Before(deadline) {
		time.Sleep(50 * time.Millisecond)
	}
	if hits.Load() == 0 {
		t.Fatal("expected webhook hit for sync failure")
	}

	// 缺 channel_id → 400
	bad := executionRequest(http.MethodPost, "/internal/v1/alerts/sync-failure", `{}`)
	bad.Header.Set("X-Workspace-Id", ws)
	rec2 := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec2, bad)
	if rec2.Code != 400 {
		t.Fatalf("missing channel status = %d, want 400", rec2.Code)
	}
}

func intP(v int) *int { return &v }
