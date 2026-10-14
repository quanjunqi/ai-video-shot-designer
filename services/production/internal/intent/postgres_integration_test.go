package intent

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// 生成意图幂等契约（ADR：intent 是 job 去重的第一道闸）：
// 同 key 同输入 → 返回已存在的 intent（replayed=true）；
// 同 key 不同输入 → ErrIdempotencyConflict；
// 事务内写 outbox_events（generation.intent.created）。

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
	schema := "intent_test_" + hex.EncodeToString(suffix[:])
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

// seedProject 插入 projects 行以满足 generation_intents 的外键约束。
func seedProject(t *testing.T, s PostgresStore, ws, proj string) {
	t.Helper()
	ctx := context.Background()
	_, err := s.Pool.Exec(ctx, `INSERT INTO projects
		(workspace_id, id, title, style_id, style_version, aspect_ratio,
		 default_text_model, default_image_model, default_video_model, status, created_by)
		VALUES ($1,$2,'测试项目','style_x','1','16:9','m_txt','m_img','m_vid','pending_parse','tester')`,
		ws, proj)
	if err != nil {
		t.Fatal(err)
	}
}

func TestIntegrationCreateAndIdempotentReplay(t *testing.T) {
	s := testPostgresStore(t)
	ctx := context.Background()
	ws, actor, key := "ws_intent", "actor_1", "key_create_1"
	seedProject(t, s, ws, "proj_1")
	in := CreateInput{
		ProjectID: "proj_1",
		Kind:      "image",
		Label:     "生成首帧",
		Payload:   json.RawMessage(`{"prompt":"x"}`),
	}

	out, replayed, err := s.Create(ctx, ws, actor, key, in)
	if err != nil {
		t.Fatal(err)
	}
	if replayed {
		t.Fatal("首次创建不应标记 replayed")
	}
	if out.ID == "" || out.Status != "pending" && out.Status == "" {
		t.Fatalf("Create 应返回含 ID 的 intent，实际 %+v", out)
	}

	// 同 key 同输入 → replay（不新建）
	out2, replayed2, err := s.Create(ctx, ws, actor, key, in)
	if err != nil {
		t.Fatal(err)
	}
	if !replayed2 {
		t.Fatal("同 key 同输入应标记 replayed")
	}
	if out2.ID != out.ID {
		t.Fatalf("replay 应返回同一 intent，实际 %s vs %s", out2.ID, out.ID)
	}

	// Get 可取回
	got, err := s.Get(ctx, ws, out.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Label != "生成首帧" {
		t.Fatalf("Get 应取回同 label，实际 %q", got.Label)
	}

	// outbox 事件已写入（事务内）
	var n int
	if err := s.Pool.QueryRow(ctx, `SELECT count(*) FROM outbox_events WHERE workspace_id=$1 AND aggregate_id=$2 AND event_type='generation.intent.created'`, ws, out.ID).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("应写入 1 条 outbox 事件，实际 %d", n)
	}
}

func TestIntegrationIdempotencyConflict(t *testing.T) {
	s := testPostgresStore(t)
	ctx := context.Background()
	ws, actor, key := "ws_intent", "actor_1", "key_conflict_1"
	seedProject(t, s, ws, "proj_1")
	in := CreateInput{ProjectID: "proj_1", Kind: "image", Label: "A", Payload: json.RawMessage(`{"prompt":"x"}`)}

	if _, _, err := s.Create(ctx, ws, actor, key, in); err != nil {
		t.Fatal(err)
	}
	// 同 key 不同输入 → 必须冲突
	in2 := in
	in2.Label = "B"
	if _, _, err := s.Create(ctx, ws, actor, key, in2); !errors.Is(err, ErrIdempotencyConflict) {
		t.Fatalf("同 key 不同输入应返回 ErrIdempotencyConflict，实际 %v", err)
	}
}

func TestIntegrationInvalidInputRejected(t *testing.T) {
	s := testPostgresStore(t)
	ctx := context.Background()
	bad := CreateInput{ProjectID: "", Kind: "image", Label: "x", Payload: json.RawMessage(`{}`)}
	if _, _, err := s.Create(ctx, "ws", "actor", "key_bad", bad); !errors.Is(err, ErrInvalid) {
		t.Fatalf("非法输入应返回 ErrInvalid，实际 %v", err)
	}
}

func TestIntegrationGetNotFound(t *testing.T) {
	s := testPostgresStore(t)
	ctx := context.Background()
	if _, err := s.Get(ctx, "ws_x", "intent_none"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("不存在的 intent 应返回 ErrNotFound，实际 %v", err)
	}
}
