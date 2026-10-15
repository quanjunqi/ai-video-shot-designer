package budget

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"os"
	"path/filepath"
	"sort"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// testStore 建一个带 budget_holds 表的隔离 schema 预算 Store。
// 未设置 EXECUTION_TEST_DATABASE_URL 时整组跳过（与 breaker/job/audit 的集成测试同一约定）。
func testStore(t *testing.T) *Store {
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
	if err := admin.Ping(ctx); err != nil {
		t.Fatal(err)
	}
	var suffix [8]byte
	if _, err := rand.Read(suffix[:]); err != nil {
		t.Fatal(err)
	}
	schema := "budget_test_" + hex.EncodeToString(suffix[:])
	quotedSchema := pgx.Identifier{schema}.Sanitize()
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+quotedSchema); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := admin.Exec(context.Background(), "DROP SCHEMA "+quotedSchema+" CASCADE"); err != nil {
			t.Errorf("remove test schema: %v", err)
		}
	})
	config, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	config.ConnConfig.RuntimeParams["search_path"] = schema
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	migrations, err := filepath.Glob(filepath.Join("..", "..", "migrations", "*.sql"))
	if err != nil {
		t.Fatal(err)
	}
	sort.Strings(migrations)
	for _, migrationPath := range migrations {
		migration, err := os.ReadFile(migrationPath)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, string(migration), pgx.QueryExecModeSimpleProtocol); err != nil {
			t.Fatalf("apply migration %s: %v", migrationPath, err)
		}
	}
	return &Store{Pool: pool}
}

// 判据 5 状态机：Hold(pending) → Settle(settled, 退差额) 与 Hold → Release(released, 全退)。
// 判据 6 原子性：Settle/Release 仅当 status=pending 生效；重复结算/退扣幂等返回 false。
func TestBudgetHoldsStateMachine(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	// Hold：日周期预扣
	hold, err := s.Hold(ctx, HoldRecord{JobID: "job_a", WorkspaceID: "ws_dev", Period: "day", HoldAmount: 100, FailOpen: true})
	if err != nil {
		t.Fatalf("hold: %v", err)
	}
	if hold.Status != StatusPending {
		t.Fatalf("new hold must be pending, got %s", hold.Status)
	}

	// 同 job 再 Hold：幂等不覆盖（hold_amount 仍是 100）
	again, err := s.Hold(ctx, HoldRecord{JobID: "job_a", WorkspaceID: "ws_dev", Period: "day", HoldAmount: 999, FailOpen: true})
	if err != nil {
		t.Fatalf("idempotent hold: %v", err)
	}
	if again.ID != hold.ID || again.HoldAmount != 100 {
		t.Fatalf("idempotent hold must keep original row, got %+v vs %+v", again, hold)
	}

	// Outstanding：预扣在窗口内
	day, month, err := s.Outstanding(ctx, "ws_dev")
	if err != nil {
		t.Fatalf("outstanding: %v", err)
	}
	if day != 100 || month < 100 {
		t.Fatalf("outstanding must count pending hold, got day=%v month=%v", day, month)
	}

	// Settle：实际 60 → 退 40
	ok, err := s.Settle(ctx, hold.ID, 60)
	if err != nil {
		t.Fatalf("settle: %v", err)
	}
	if !ok {
		t.Fatal("settle must update pending row")
	}
	day, _, _ = s.Outstanding(ctx, "ws_dev")
	if day != 0 {
		t.Fatalf("settled hold must leave outstanding, got %v", day)
	}

	// Settle 幂等：已 settled 不再动作
	ok, err = s.Settle(ctx, hold.ID, 999)
	if err != nil {
		t.Fatalf("idempotent settle: %v", err)
	}
	if ok {
		t.Fatal("settle on settled row must be no-op")
	}

	// Release：全退
	hold2, err := s.Hold(ctx, HoldRecord{JobID: "job_b", WorkspaceID: "ws_dev", Period: "day", HoldAmount: 80, FailOpen: false})
	if err != nil {
		t.Fatalf("hold b: %v", err)
	}
	ok, err = s.Release(ctx, hold2.ID)
	if err != nil {
		t.Fatalf("release: %v", err)
	}
	if !ok {
		t.Fatal("release must update pending row")
	}
	ok, err = s.Release(ctx, hold2.ID)
	if err != nil {
		t.Fatalf("idempotent release: %v", err)
	}
	if ok {
		t.Fatal("release on released row must be no-op")
	}
}

// 判据 6 例外：预扣行缺失时 Settle/Release 幂等返回 false 而非报错。
func TestBudgetHoldsMissingRowNoError(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	ok, err := s.Settle(ctx, "hold_missing", 10)
	if err != nil {
		t.Fatalf("settle missing must not error: %v", err)
	}
	if ok {
		t.Fatal("settle missing row must be no-op")
	}
	ok, err = s.Release(ctx, "hold_missing")
	if err != nil {
		t.Fatalf("release missing must not error: %v", err)
	}
	if ok {
		t.Fatal("release missing row must be no-op")
	}
}
