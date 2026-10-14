package episode

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

// 剧集 CRUD 契约。与 projectcharacter/ruletemplate 的 testPostgresStore 写法一致。

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
	schema := "episode_test_" + hex.EncodeToString(suffix[:])
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

// seedProject 插入 projects 行以满足 episodes 的外键约束。
func seedProject(t *testing.T, s PostgresStore, ws, proj string) {
	t.Helper()
	ctx := context.Background()
	_, err := s.Pool.Exec(ctx, `INSERT INTO projects
		(workspace_id, id, title, style_id, style_version, aspect_ratio,
		 default_image_model, default_video_model, status, created_by)
		VALUES ($1,$2,'测试项目','style_x','1','16:9','m_img','m_vid','pending_parse','tester')`,
		ws, proj)
	if err != nil {
		t.Fatal(err)
	}
}

func TestIntegrationCreateGetUpdateDelete(t *testing.T) {
	s := testPostgresStore(t)
	ctx := context.Background()
	ws, proj := "ws_ep", "proj_ep"
	seedProject(t, s, ws, proj)

	created, err := s.Create(ctx, ws, proj, CreateInput{
		ID:    "ep_001",
		Index: 0,
		Title: "第一集",
	})
	if err != nil {
		t.Fatal(err)
	}
	if created.ID != "ep_001" || created.Title != "第一集" || created.Index != 0 {
		t.Fatalf("Create 应回显字段，实际 %+v", created)
	}

	got, err := s.Get(ctx, ws, proj, "ep_001")
	if err != nil {
		t.Fatal(err)
	}
	if got.Title != "第一集" {
		t.Fatalf("Get 应取回同名剧集，实际 %q", got.Title)
	}

	newTitle := "第一集·修订"
	updated, err := s.Update(ctx, ws, proj, "ep_001", UpdateInput{Title: &newTitle})
	if err != nil {
		t.Fatal(err)
	}
	if updated.Title != newTitle {
		t.Fatalf("Update 应改名，实际 %q", updated.Title)
	}

	if err := s.Delete(ctx, ws, proj, "ep_001"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Get(ctx, ws, proj, "ep_001"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("删除后 Get 应返回 ErrNotFound，实际 %v", err)
	}
}

func TestIntegrationListByProjectOrdered(t *testing.T) {
	s := testPostgresStore(t)
	ctx := context.Background()
	ws, proj := "ws_ep_list", "proj_ep_list"
	seedProject(t, s, ws, proj)

	if _, err := s.Create(ctx, ws, proj, CreateInput{ID: "ep_2", Index: 1, Title: "第二集"}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Create(ctx, ws, proj, CreateInput{ID: "ep_1", Index: 0, Title: "第一集"}); err != nil {
		t.Fatal(err)
	}

	list, err := s.ListByProject(ctx, ws, proj)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 {
		t.Fatalf("应列出 2 集，实际 %d", len(list))
	}
	if list[0].Index != 0 || list[1].Index != 1 {
		t.Fatalf("ListByProject 应按 index 排序，实际 %+v", list)
	}
}

func TestIntegrationGetNotFound(t *testing.T) {
	s := testPostgresStore(t)
	ctx := context.Background()
	if _, err := s.Get(ctx, "ws_x", "proj_x", "ep_none"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("不存在的剧集应返回 ErrNotFound，实际 %v", err)
	}
}
