package job

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

func testStore(t *testing.T) Store {
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
	schema := "execution_test_" + hex.EncodeToString(suffix[:])
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
	for _, path := range migrations {
		migration, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, string(migration), pgx.QueryExecModeSimpleProtocol); err != nil {
			t.Fatalf("apply migration %s: %v", path, err)
		}
	}
	return Store{Pool: pool}
}

func TestIntentPayloadIsNotTaskStepsAndParticipatesInIdempotency(t *testing.T) {
	store := testStore(t)
	ctx := context.Background()
	in := Input{
		IntentID: "intent-1", IdempotencyKey: "intent:intent-1", Kind: "image", Label: "角色立绘",
		ProjectID: "project-1", ScopeEpoch: 2,
		IntentPayload: []byte(`{"prompt":"blue coat","model":"image-v1"}`),
	}
	first, replay, err := store.Create(ctx, "workspace-a", "actor-a", in)
	if err != nil || replay {
		t.Fatalf("first create: job=%+v replay=%v err=%v", first, replay, err)
	}
	// jsonb 会规范化空白与键序（真库读回 `{"model": "image-v1", ...}`），故按语义比较而非字节。
	if string(first.Steps) != "[]" || !jsonEqual(first.IntentPayload, in.IntentPayload) {
		t.Fatalf("intent fields were mixed: steps=%s payload=%s", first.Steps, first.IntentPayload)
	}
	second, replay, err := store.Create(ctx, "workspace-a", "actor-a", in)
	if err != nil || !replay || second.ID != first.ID {
		t.Fatalf("idempotent replay: job=%+v replay=%v err=%v", second, replay, err)
	}
	changed := in
	changed.IntentPayload = []byte(`{"prompt":"red coat","model":"image-v1"}`)
	if _, _, err := store.Create(ctx, "workspace-a", "actor-a", changed); err != ErrIdempotencyConflict {
		t.Fatalf("changed intent payload should conflict, got %v", err)
	}
	other, replay, err := store.Create(ctx, "workspace-b", "actor-b", in)
	if err != nil || replay || other.ID == first.ID {
		t.Fatalf("workspace-scoped create: job=%+v replay=%v err=%v", other, replay, err)
	}
	if _, err := store.Get(ctx, "workspace-b", first.ID); err != ErrNotFound {
		t.Fatalf("cross-workspace get should be hidden, got %v", err)
	}
}

func TestCreateRejectsNonArraySteps(t *testing.T) {
	if validSteps([]byte(`{"prompt":"must not be steps"}`)) {
		t.Fatal("expected object-valued steps to be rejected")
	}
	if !validSteps([]byte(`[{"label":"等待生成","done":false}]`)) {
		t.Fatal("expected array-valued steps to be accepted")
	}
}
