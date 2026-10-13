package episodeasset

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// 单集资产 CRUD 契约（角色/道具/场景引用 + 变体立绘状态）。
// 与 projectcharacter/ruletemplate/episode 的 testPostgresStore 写法一致。

// testPostgresStore 未设置 PRODUCTION_TEST_DATABASE_URL 时跳过。
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
	schema := "episodeasset_test_" + hex.EncodeToString(suffix[:])
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

func TestIntegrationCreateGetUpdateDelete(t *testing.T) {
	s := testPostgresStore(t)
	ctx := context.Background()
	ws, proj, ep := "ws_asset", "proj_asset", "ep_asset"

	created, err := s.Create(ctx, ws, proj, ep, CreateInput{
		ID:   "ast_001",
		Kind: "character",
		Name: "沈清弦",
	})
	if err != nil {
		t.Fatal(err)
	}
	if created.ID != "ast_001" || created.Name != "沈清弦" {
		t.Fatalf("Create 应回显字段，实际 %+v", created)
	}
	if created.Scope != "episode" {
		t.Fatalf("Scope 默认应为 episode，实际 %q", created.Scope)
	}
	if created.Status != "DRAFT" {
		t.Fatalf("Status 默认应为 DRAFT，实际 %q", created.Status)
	}
	if created.CurrentVersion != 1 {
		t.Fatalf("CurrentVersion 默认应为 1，实际 %d", created.CurrentVersion)
	}

	got, err := s.Get(ctx, ws, proj, ep, "ast_001")
	if err != nil {
		t.Fatal(err)
	}
	if got.Name != "沈清弦" {
		t.Fatalf("Get 应取回同名资产，实际 %q", got.Name)
	}

	newName := "沈清弦·定稿"
	updated, err := s.Update(ctx, ws, proj, ep, "ast_001", UpdateInput{Name: &newName})
	if err != nil {
		t.Fatal(err)
	}
	if updated.Name != newName {
		t.Fatalf("Update 应改名，实际 %q", updated.Name)
	}

	if err := s.Delete(ctx, ws, proj, ep, "ast_001"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Get(ctx, ws, proj, ep, "ast_001"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("删除后 Get 应返回 ErrNotFound，实际 %v", err)
	}
}

func TestIntegrationListByEpisodeAndProject(t *testing.T) {
	s := testPostgresStore(t)
	ctx := context.Background()
	ws, proj := "ws_ast", "proj_ast"

	if _, err := s.Create(ctx, ws, proj, "ep_a", CreateInput{ID: "a1", Kind: "character", Name: "A1"}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Create(ctx, ws, proj, "ep_a", CreateInput{ID: "a2", Kind: "prop", Name: "A2"}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Create(ctx, ws, proj, "ep_b", CreateInput{ID: "b1", Kind: "scene", Name: "B1"}); err != nil {
		t.Fatal(err)
	}

	byEp, err := s.ListByEpisode(ctx, ws, proj, "ep_a")
	if err != nil {
		t.Fatal(err)
	}
	if len(byEp) != 2 {
		t.Fatalf("ListByEpisode 应返回 2 条，实际 %d", len(byEp))
	}

	byProj, err := s.ListByProject(ctx, ws, proj)
	if err != nil {
		t.Fatal(err)
	}
	if len(byProj) != 3 {
		t.Fatalf("ListByProject 应返回 3 条，实际 %d", len(byProj))
	}
}

func TestIntegrationGetNotFoundAndDeleteByEpisode(t *testing.T) {
	s := testPostgresStore(t)
	ctx := context.Background()
	ws, proj, ep := "ws_ast", "proj_ast", "ep_x"

	if _, err := s.Get(ctx, ws, proj, ep, "ast_none"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("不存在的资产应返回 ErrNotFound，实际 %v", err)
	}
	if _, err := s.Create(ctx, ws, proj, ep, CreateInput{ID: "ast_d1", Kind: "other", Name: "D1"}); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteByEpisode(ctx, ws, proj, ep); err != nil {
		t.Fatal(err)
	}
	empty, err := s.ListByEpisode(ctx, ws, proj, ep)
	if err != nil {
		t.Fatal(err)
	}
	if len(empty) != 0 {
		t.Fatalf("DeleteByEpisode 后应清空，实际 %d", len(empty))
	}
}
