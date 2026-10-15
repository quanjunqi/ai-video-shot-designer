package alert

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// 真库脚手架：与 audit 包一致 —— 随机 schema + 就地应用 migrations + 结束清理。
// 未设置 EXECUTION_TEST_DATABASE_URL 时跳过。
func alertTestPool(t *testing.T) *pgxpool.Pool {
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
	schema := "alert_test_" + hex.EncodeToString(suffix[:])
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

func TestDefaultConfig(t *testing.T) {
	c := DefaultConfig("ws-a")
	if !c.Enabled || c.ErrorRateThresholdPct != 20 || c.ErrorRateWindowMin != 5 || c.CooldownMin != 10 {
		t.Fatalf("default config mismatch: %+v", c)
	}
	if c.WorkspaceID != "ws-a" {
		t.Fatalf("workspace id mismatch: %q", c.WorkspaceID)
	}
}

func TestNew(t *testing.T) {
	pool := alertTestPool(t)
	st := New(pool, nil)
	if st == nil || st.Pool == nil {
		t.Fatal("New with nil log should produce usable store")
	}
}

func TestStore_GetUpsertDelete(t *testing.T) {
	pool := alertTestPool(t)
	st := New(pool, slog.New(slog.NewTextHandler(os.Stderr, nil)))
	ctx := context.Background()
	ws := "ws-cfg-" + hex.EncodeToString(randBytes(t))

	// 未配置 → nil（调用方回退默认值）
	got, err := st.Get(ctx, ws)
	if err != nil {
		t.Fatalf("Get missing: %v", err)
	}
	if got != nil {
		t.Fatalf("expected nil for missing config, got %+v", got)
	}

	// Upsert 新建
	cfg := DefaultConfig(ws)
	cfg.ErrorRateThresholdPct = 35
	cfg.ErrorRateWindowMin = 7
	cfg.CooldownMin = 12
	cfg.WebhookURL = "https://example.com/hook"
	if err := st.Upsert(ctx, *cfg); err != nil {
		t.Fatalf("Upsert: %v", err)
	}
	got, err = st.Get(ctx, ws)
	if err != nil {
		t.Fatalf("Get after upsert: %v", err)
	}
	if got == nil || !got.Enabled || got.ErrorRateThresholdPct != 35 || got.ErrorRateWindowMin != 7 ||
		got.CooldownMin != 12 || got.WebhookURL != "https://example.com/hook" {
		t.Fatalf("upserted config mismatch: %+v", got)
	}

	// Upsert 全量覆盖（ON CONFLICT DO UPDATE 覆盖全部业务字段）
	overwrite := &Config{WorkspaceID: ws, Enabled: true, ErrorRateThresholdPct: 50,
		ErrorRateWindowMin: 7, CooldownMin: 12, WebhookURL: ""}
	if err := st.Upsert(ctx, *overwrite); err != nil {
		t.Fatalf("Upsert overwrite: %v", err)
	}
	got, _ = st.Get(ctx, ws)
	if got.ErrorRateThresholdPct != 50 || got.WebhookURL != "" || got.ErrorRateWindowMin != 7 || got.CooldownMin != 12 {
		t.Fatalf("overwrite should replace all fields: %+v", got)
	}

	// Delete
	if err := st.Delete(ctx, ws); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	got, err = st.Get(ctx, ws)
	if err != nil {
		t.Fatalf("Get after delete: %v", err)
	}
	if got != nil {
		t.Fatalf("expected nil after delete, got %+v", got)
	}
}

func TestClaimCooldown(t *testing.T) {
	pool := alertTestPool(t)
	st := New(pool, slog.New(slog.NewTextHandler(os.Stderr, nil)))
	ctx := context.Background()
	ws := "ws-cool-" + hex.EncodeToString(randBytes(t))
	// ClaimCooldown 是 UPDATE 语义：需要先有配置行
	if err := st.Upsert(ctx, *DefaultConfig(ws)); err != nil {
		t.Fatalf("seed config: %v", err)
	}

	// 首次占位成功
	ok, err := st.ClaimCooldown(ctx, ws, 10)
	if err != nil || !ok {
		t.Fatalf("first claim: ok=%v err=%v", ok, err)
	}
	// 冷却期内再次占位失败
	ok, err = st.ClaimCooldown(ctx, ws, 10)
	if err != nil || ok {
		t.Fatalf("second claim should be denied: ok=%v err=%v", ok, err)
	}
	// 过期后释放（把 last_triggered_at 拨回过去再 claim 成功）
	if _, err := pool.Exec(ctx,
		`UPDATE alert_config SET last_triggered_at = now() - interval '20 minutes' WHERE workspace_id = $1`, ws); err != nil {
		t.Fatalf("backdate: %v", err)
	}
	ok, err = st.ClaimCooldown(ctx, ws, 10)
	if err != nil || !ok {
		t.Fatalf("claim after cooldown expiry: ok=%v err=%v", ok, err)
	}
}

// TestAuditWindowErrorRate 覆盖默认错误率窗口查询（017 迁移后按 status 聚合）。
func TestAuditWindowErrorRate(t *testing.T) {
	pool := alertTestPool(t)
	ctx := context.Background()
	ws := "ws-window-" + hex.EncodeToString(randBytes(t))
	now := time.Now()

	// 造 4 行：2 成功 + 1 failed + 1 rate_limited（失败）
	for i, status := range []string{"success", "success", "failed", "rate_limited"} {
		if _, err := pool.Exec(ctx, `
			INSERT INTO gateway_audit_logs
				(request_id, workspace_id, project_id, model_id, channel_id, provider_model, mode, status, created_at)
			VALUES ($1, $2, 'p', 'm', 'ch', 'm', 'text-chat', $3, $4)`,
			fmt.Sprintf("req-%s-%d", ws, i), ws, status, now.Add(-time.Duration(i)*time.Minute)); err != nil {
			t.Fatalf("insert audit: %v", err)
		}
	}
	w := auditWindow{pool: pool}
	total, failed, err := w.ErrorRate(ctx, ws, 10)
	if err != nil {
		t.Fatalf("ErrorRate: %v", err)
	}
	if total != 4 || failed != 2 {
		t.Fatalf("ErrorRate = (%d,%d), want (4,2)", total, failed)
	}
}

func randBytes(t *testing.T) []byte {
	t.Helper()
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		t.Fatal(err)
	}
	return b
}
