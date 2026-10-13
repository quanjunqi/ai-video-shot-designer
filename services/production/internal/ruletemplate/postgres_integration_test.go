package ruletemplate

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

// 规则模板 CRUD 契约（拆集规则 + 环节提示词规则统一存储）。
// 与 internal/projectcharacter 的 testPostgresStore 写法一致（随机 schema + 全量迁移）。

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
	schema := "ruletemplate_test_" + hex.EncodeToString(suffix[:])
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
	ws := "ws_rules"

	created, err := s.Create(ctx, ws, CreateInput{
		ID:      "rt_001",
		Kind:    "split",
		Name:    "默认拆集规则",
		Content: "scenePattern: *",
		Config:  map[string]interface{}{"maxScenesPerEpisode": 8},
	})
	if err != nil {
		t.Fatal(err)
	}
	if created.ID != "rt_001" || created.Kind != "split" {
		t.Fatalf("Create 应回显主键与 kind，实际 %+v", created)
	}
	if !created.Enabled {
		t.Fatalf("新建模板应默认启用，实际 %+v", created)
	}
	if created.Version != 1 {
		t.Fatalf("新建模板版本应为 1，实际 %d", created.Version)
	}

	got, err := s.Get(ctx, ws, "rt_001")
	if err != nil {
		t.Fatal(err)
	}
	if got.Name != "默认拆集规则" {
		t.Fatalf("Get 应取回同名模板，实际 %q", got.Name)
	}

	// 部分更新
	newName := "拆集规则·改"
	disabled := false
	updated, err := s.Update(ctx, ws, "rt_001", UpdateInput{Name: &newName, Enabled: &disabled})
	if err != nil {
		t.Fatal(err)
	}
	if updated.Name != newName || updated.Enabled {
		t.Fatalf("Update 应改名并禁用，实际 %+v", updated)
	}

	if err := s.Delete(ctx, ws, "rt_001"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Get(ctx, ws, "rt_001"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("删除后 Get 应返回 ErrNotFound，实际 %v", err)
	}
}

func TestIntegrationListByKind(t *testing.T) {
	s := testPostgresStore(t)
	ctx := context.Background()
	ws := "ws_rules_list"

	if _, err := s.Create(ctx, ws, CreateInput{ID: "rt_a", Kind: "split", Name: "A"}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Create(ctx, ws, CreateInput{ID: "rt_b", Kind: "prompt", Name: "B", Stage: "character"}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Create(ctx, "ws_other", CreateInput{ID: "rt_c", Kind: "split", Name: "C"}); err != nil {
		t.Fatal(err)
	}

	// kind 过滤 + workspace 隔离
	splitList, err := s.List(ctx, ws, "split")
	if err != nil {
		t.Fatal(err)
	}
	if len(splitList) != 1 || splitList[0].ID != "rt_a" {
		t.Fatalf("List(split) 应只返回本 workspace 的 split 规则，实际 %+v", splitList)
	}

	promptList, err := s.List(ctx, ws, "prompt")
	if err != nil {
		t.Fatal(err)
	}
	if len(promptList) != 1 || promptList[0].ID != "rt_b" {
		t.Fatalf("List(prompt) 应返回 1 条，实际 %+v", promptList)
	}
}

func TestIntegrationCreateInvalidInputRejected(t *testing.T) {
	s := testPostgresStore(t)
	ctx := context.Background()
	// Create 内部会先 Validate：非法 kind 必须拒绝且不落库
	if _, err := s.Create(ctx, "ws_bad", CreateInput{ID: "rt_x", Kind: "nope", Name: "X"}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("非法 kind 应返回 ErrInvalid，实际 %v", err)
	}
}
