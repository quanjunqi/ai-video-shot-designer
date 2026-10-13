package projectcharacter

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

// ADR-008 角色库：项目级角色是身份唯一事实源（全剧通用）。
// 本文件锁住 PostgresStore 的 CRUD 契约与 ErrNotFound 语义，
// 与 internal/catalog 的 testPostgresStore 写法一致（随机 schema + 全量迁移）。

// testPostgresStore 未设置 PRODUCTION_TEST_DATABASE_URL 时跳过；
// 每个用例自建随机 schema 并在结束时清理。
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
	schema := "projectcharacter_test_" + hex.EncodeToString(suffix[:])
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

// seedProject 插入 projects 行以满足 project_characters 的外键约束。
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
	ws, proj := "ws_char", "proj_char"
	seedProject(t, s, ws, proj)

	in := CreateInput{
		ID:          "char_001",
		Name:        "沈清弦",
		Gender:      "女",
		ImageStatus: "not_generated",
	}
	created, err := s.Create(ctx, ws, proj, in)
	if err != nil {
		t.Fatal(err)
	}
	if created.ID != "char_001" || created.WorkspaceID != ws || created.ProjectID != proj {
		t.Fatalf("Create 应回显主键与作用域，实际 %+v", created)
	}
	if created.ImageStatus != "not_generated" {
		t.Fatalf("ImageStatus 默认值应生效，实际 %q", created.ImageStatus)
	}
	if created.ImageAspectRatio != "9:16" {
		t.Fatalf("ImageAspectRatio 默认值应为 9:16，实际 %q", created.ImageAspectRatio)
	}

	got, err := s.Get(ctx, ws, proj, "char_001")
	if err != nil {
		t.Fatal(err)
	}
	if got.Name != "沈清弦" {
		t.Fatalf("Get 应取回同名角色，实际 %q", got.Name)
	}

	// 部分更新：只改名字，其余字段保留
	newName := "沈清弦·改"
	updName := newName
	updated, err := s.Update(ctx, ws, proj, "char_001", UpdateInput{Name: &updName})
	if err != nil {
		t.Fatal(err)
	}
	if updated.Name != newName {
		t.Fatalf("Update 应改名，实际 %q", updated.Name)
	}
	if updated.Gender != "女" {
		t.Fatalf("Update 不应清空未更新的字段，实际 %q", updated.Gender)
	}

	if err := s.Delete(ctx, ws, proj, "char_001"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Get(ctx, ws, proj, "char_001"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("删除后 Get 应返回 ErrNotFound，实际 %v", err)
	}
}

func TestIntegrationListByProjectScope(t *testing.T) {
	s := testPostgresStore(t)
	ctx := context.Background()

	// 两个项目各建一个角色：ListByProject 必须按 workspace+project 隔离
	seedProject(t, s, "ws_a", "proj_a")
	seedProject(t, s, "ws_a", "proj_b")
	if _, err := s.Create(ctx, "ws_a", "proj_a", CreateInput{ID: "char_a1", Name: "A1"}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Create(ctx, "ws_a", "proj_b", CreateInput{ID: "char_b1", Name: "B1"}); err != nil {
		t.Fatal(err)
	}

	list, err := s.ListByProject(ctx, "ws_a", "proj_a")
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].ID != "char_a1" {
		t.Fatalf("ListByProject 应只返回本项目角色，实际 %+v", list)
	}

	empty, err := s.ListByProject(ctx, "ws_none", "proj_none")
	if err != nil {
		t.Fatal(err)
	}
	if len(empty) != 0 {
		t.Fatalf("无数据项目应返回空列表，实际 %d", len(empty))
	}
}

func TestIntegrationGetNotFound(t *testing.T) {
	s := testPostgresStore(t)
	ctx := context.Background()
	if _, err := s.Get(ctx, "ws_x", "proj_x", "char_none"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("不存在的角色应返回 ErrNotFound，实际 %v", err)
	}
	if err := s.Delete(ctx, "ws_x", "proj_x", "char_none"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("删除不存在的角色应返回 ErrNotFound，实际 %v", err)
	}
}
