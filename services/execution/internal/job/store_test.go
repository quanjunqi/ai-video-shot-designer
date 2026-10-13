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

// TestCreatePersistsAttribution 锁定 T1 归因贯穿：Input.ShotID/Feature 持久化并经
// Get 读回（scanJob 列序与 fields() 一致，任何一侧错位都会让归因静默丢失/错位）。
func TestCreatePersistsAttribution(t *testing.T) {
	store := testStore(t)
	ctx := context.Background()
	in := Input{
		IdempotencyKey: "attr-1", Kind: "video", Label: "分镜生成",
		ProjectID: "project-1", EpisodeID: "episode-1", AssetID: "asset-1", ShotID: "shot-1",
		Feature:       "storyboard",
		IntentPayload: []byte(`{"modelId":"lm-video-standard","prompt":"x"}`),
	}
	created, replay, err := store.Create(ctx, "workspace-a", "actor-a", in)
	if err != nil || replay {
		t.Fatalf("create: job=%+v replay=%v err=%v", created, replay, err)
	}
	got, err := store.Get(ctx, "workspace-a", created.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.ShotID != "shot-1" || got.Feature != "storyboard" || got.ProjectID != "project-1" || got.EpisodeID != "episode-1" {
		t.Fatalf("attribution not persisted through scan: %+v", got)
	}
	// 缺失归因不报错：仅 shot/feature 缺省时 Create 仍成功且读回空
	minimal := Input{IdempotencyKey: "attr-2", Kind: "text", Label: "无归因", IntentPayload: []byte(`{"modelId":"m"}`)}
	created2, _, err := store.Create(ctx, "workspace-a", "actor-a", minimal)
	if err != nil {
		t.Fatalf("minimal create should succeed without attribution: %v", err)
	}
	got2, err := store.Get(ctx, "workspace-a", created2.ID)
	if err != nil {
		t.Fatalf("get minimal: %v", err)
	}
	if got2.ShotID != "" || got2.Feature != "" {
		t.Fatalf("missing attribution must decode as empty, got shot=%q feature=%q", got2.ShotID, got2.Feature)
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
