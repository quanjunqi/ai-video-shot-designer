package project

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func testPostgresStore(t *testing.T) PostgresStore {
	t.Helper()
	url := os.Getenv("PRODUCTION_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set PRODUCTION_TEST_DATABASE_URL to a dedicated PostgreSQL test database")
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
	schema := "production_test_" + hex.EncodeToString(suffix[:])
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
	return PostgresStore{Pool: pool}
}

func TestPostgresCreateReplayIsolationAndImmutability(t *testing.T) {
	store := testPostgresStore(t)
	ctx := context.Background()
	input := validInput()
	first, replay, err := store.Create(ctx, "workspace-a", "actor-a", "key-1", input)
	if err != nil || replay || first.ID == "" || first.CurrentSourceVersion != 1 || first.Status != "pending_parse" {
		t.Fatalf("first create: project=%+v replay=%v err=%v", first, replay, err)
	}
	if first.SourceVersion.SHA256 != SHA256([]byte(input.SourceText)) {
		t.Fatal("source digest does not match the stored source")
	}
	second, replay, err := store.Create(ctx, "workspace-a", "actor-b", "key-1", input)
	if err != nil || !replay || second.ID != first.ID {
		t.Fatalf("replay: project=%+v replay=%v err=%v", second, replay, err)
	}
	changed := input
	changed.SourceText += "修改"
	if _, _, err := store.Create(ctx, "workspace-a", "actor-a", "key-1", changed); err != ErrIdempotencyConflict {
		t.Fatalf("changed request should conflict, got %v", err)
	}
	other, replay, err := store.Create(ctx, "workspace-b", "actor-b", "key-1", input)
	if err != nil || replay || other.ID == first.ID {
		t.Fatalf("same key in another workspace: project=%+v replay=%v err=%v", other, replay, err)
	}
	if _, err := store.Get(ctx, "workspace-b", first.ID); err != ErrNotFound {
		t.Fatalf("cross-workspace lookup should be hidden, got %v", err)
	}
	if _, err := store.Get(ctx, "workspace-a", other.ID); err != ErrNotFound {
		t.Fatalf("reverse cross-workspace lookup should be hidden, got %v", err)
	}
	// UPDATE 必须被拒 —— 迁移 001 建立、015 保留的"版本不可变"契约。
	if _, err := store.Pool.Exec(ctx,
		"UPDATE source_versions SET content = 'overwritten' WHERE workspace_id = $1 AND project_id = $2",
		"workspace-a", first.ID); err == nil || !strings.Contains(err.Error(), "source versions are append-only") {
		t.Fatalf("source version UPDATE should fail: %v", err)
	}
	var content string
	if err := store.Pool.QueryRow(ctx, "SELECT content FROM source_versions WHERE workspace_id = $1 AND project_id = $2 AND version = 1", "workspace-a", first.ID).Scan(&content); err != nil || content != input.SourceText {
		t.Fatalf("original source changed: err=%v", err)
	}

	// ★ DELETE 【允许】—— 迁移 015 的原文："允许删除 source_versions（项目删除时级联清理需要），
	//   仍禁止 UPDATE 保证版本不可变"。
	//   本文件此前把 DELETE 也断言为"必须失败"，那是 **015 之前**的契约（陈旧断言）：
	//   它会让"级联清理"这条正当路径在任何有测试库的环境里都被判成回归。
	//   语义因此收窄为：**不可改**（UPDATE 拒），但**可随项目删除而清理**（DELETE 放行）。
	if _, err := store.Pool.Exec(ctx,
		"DELETE FROM source_versions WHERE workspace_id = $1 AND project_id = $2",
		"workspace-a", first.ID); err != nil {
		t.Fatalf("自迁移 015 起 DELETE 应被允许（项目删除的级联清理），实际失败：%v", err)
	}
}

func TestPostgresConcurrentIdempotency(t *testing.T) {
	store := testPostgresStore(t)
	const workers = 8
	type result struct {
		project Project
		replay  bool
		err     error
	}
	results := make(chan result, workers)
	var start sync.WaitGroup
	start.Add(workers)
	ready := make(chan struct{})
	for range workers {
		go func() {
			start.Done()
			<-ready
			p, replay, err := store.Create(context.Background(), "workspace-a", "actor-a", "concurrent-key", validInput())
			results <- result{p, replay, err}
		}()
	}
	start.Wait()
	close(ready)
	var id string
	created := 0
	for range workers {
		r := <-results
		if r.err != nil || r.project.ID == "" {
			t.Fatalf("concurrent create: %+v", r)
		}
		if id != "" && id != r.project.ID {
			t.Fatalf("same key created multiple projects: %s and %s", id, r.project.ID)
		}
		id = r.project.ID
		if !r.replay {
			created++
		}
	}
	if created != 1 {
		t.Fatalf("expected exactly one creator, got %d", created)
	}
	var count int
	if err := store.Pool.QueryRow(context.Background(), "SELECT count(*) FROM projects WHERE workspace_id = $1", "workspace-a").Scan(&count); err != nil || count != 1 {
		t.Fatalf("expected one persisted project, got count=%d err=%v", count, err)
	}
}
