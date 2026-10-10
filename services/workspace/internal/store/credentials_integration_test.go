package store

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

// testStore 沿用 production 服务的既有集成测试写法：未设置
// WORKSPACE_TEST_DATABASE_URL 时跳过；每个用例自建随机 schema，结束时清理，
// 并在该 schema 内按文件名顺序执行 services/workspace/migrations/*.sql。
// 因为 workspace 之前没有任何集成测试，这里新建的是同一套模式的 workspace 版本。
func testStore(t *testing.T) (Store, context.Context) {
	t.Helper()
	url := os.Getenv("WORKSPACE_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set WORKSPACE_TEST_DATABASE_URL to a dedicated PostgreSQL test database")
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
	schema := "workspace_test_" + hex.EncodeToString(suffix[:])
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
	return Store{Pool: pool}, ctx
}

// testCredKey 让加密路径可用；store 的加解密只依赖这一个环境变量。
func testCredKey(t *testing.T) {
	t.Helper()
	t.Setenv("WORKSPACE_CRED_KEY", "integration-test-key")
}

func strptr(s string) *string { return &s }

// 写入 auth_header/auth_prefix → 读出必须逐字一致（含空前缀的裸 Token 形态）。
func TestPostgresCredentialAuthKnobsRoundTrip(t *testing.T) {
	testCredKey(t)
	store, ctx := testStore(t)

	in := Credential{
		WorkspaceID: "ws_dev", ChannelID: "autodl",
		BaseURL: "https://api.autodl.com", AuthType: "token",
		AuthHeader: strptr("Authorization"), AuthPrefix: strptr(""), // 裸 Token
		APIKey: "sk-bare", Actor: "test",
	}
	if err := store.PutCredential(ctx, in); err != nil {
		t.Fatalf("put credential: %v", err)
	}

	// Status 是非机密投影，也必须带上两个新列
	items, err := store.Status(ctx, "ws_dev")
	if err != nil {
		t.Fatalf("status: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 credential, got %d", len(items))
	}
	if items[0].AuthHeader == nil || *items[0].AuthHeader != "Authorization" {
		t.Fatalf("status authHeader = %v", items[0].AuthHeader)
	}
	if items[0].AuthPrefix == nil || *items[0].AuthPrefix != "" {
		t.Fatalf("status authPrefix = %v (empty string must survive, not become NULL)", items[0].AuthPrefix)
	}

	revealed, err := store.RevealKey(ctx, "ws_dev", "autodl")
	if err != nil {
		t.Fatalf("reveal: %v", err)
	}
	if AuthHeaderValue(revealed.AuthHeader) != "Authorization" || AuthHeaderValue(revealed.AuthPrefix) != "" {
		t.Fatalf("reveal knobs = %q/%q", AuthHeaderValue(revealed.AuthHeader), AuthHeaderValue(revealed.AuthPrefix))
	}
	if revealed.APIKey != "sk-bare" || revealed.AuthType != "token" || revealed.BaseURL != "https://api.autodl.com" {
		t.Fatalf("reveal payload = %+v", revealed)
	}
}

// 存量行（两列为 NULL）必须能读出，不得 panic，且空值语义为 ""（走 auth_type 兜底）。
func TestPostgresCredentialNullAuthKnobsReadAsEmpty(t *testing.T) {
	testCredKey(t)
	store, ctx := testStore(t)

	// 直接插入 NULL 行，模拟 007 迁移之前的存量数据
	if _, err := store.Pool.Exec(ctx, `INSERT INTO channel_credentials
        (workspace_id, channel_id, base_url, auth_type, key_ciphertext, enabled)
        VALUES ('ws_dev', 'legacy', 'https://legacy.example', 'bearer', $1, true)`,
		[]byte("not-a-real-ciphertext")); err != nil {
		t.Fatalf("seed legacy row: %v", err)
	}

	items, err := store.Status(ctx, "ws_dev")
	if err != nil {
		t.Fatalf("status over NULL knobs must not fail: %v", err)
	}
	if len(items) != 1 || items[0].AuthHeader != nil || items[0].AuthPrefix != nil {
		t.Fatalf("NULL knobs must stay nil in status, got %+v", items)
	}

	// ProbeKey 会尝试解密；这里只要求它不因 NULL 扫描而 panic。
	// 密文是伪造的，故容忍解密错误，但基字段必须已正确读出。
	revealed, err := store.ProbeKey(ctx, "ws_dev", "legacy")
	if err == nil {
		t.Fatal("expected decryption failure for fake ciphertext")
	}
	if revealed.BaseURL != "https://legacy.example" || revealed.AuthType != "bearer" {
		t.Fatalf("base fields must survive NULL knobs, got %+v", revealed)
	}
	if AuthHeaderValue(revealed.AuthHeader) != "" || AuthHeaderValue(revealed.AuthPrefix) != "" {
		t.Fatalf("NULL knobs must flatten to empty, got %q/%q",
			AuthHeaderValue(revealed.AuthHeader), AuthHeaderValue(revealed.AuthPrefix))
	}
}

// PUT 省略两个新字段时必须保留既有值（nil = 不改），而显式 "" = 清空。
func TestPostgresPutCredentialKeepsOrClearsAuthKnobs(t *testing.T) {
	testCredKey(t)
	store, ctx := testStore(t)

	if err := store.PutCredential(ctx, Credential{
		WorkspaceID: "ws_dev", ChannelID: "ch",
		BaseURL: "https://x.example", AuthType: "bearer",
		AuthHeader: strptr("X-Api-Key"), AuthPrefix: strptr("Token "),
		APIKey: "sk-1", Actor: "test",
	}); err != nil {
		t.Fatalf("seed: %v", err)
	}

	// 只换 key：两个 knob 为 nil → 保留
	if err := store.PutCredential(ctx, Credential{
		WorkspaceID: "ws_dev", ChannelID: "ch",
		BaseURL: "https://x.example", AuthType: "bearer",
		APIKey: "sk-2", Actor: "test",
	}); err != nil {
		t.Fatalf("put without knobs: %v", err)
	}
	revealed, err := store.RevealKey(ctx, "ws_dev", "ch")
	if err != nil {
		t.Fatalf("reveal: %v", err)
	}
	if AuthHeaderValue(revealed.AuthHeader) != "X-Api-Key" || AuthHeaderValue(revealed.AuthPrefix) != "Token " {
		t.Fatalf("omitted knobs must be preserved, got %q/%q",
			AuthHeaderValue(revealed.AuthHeader), AuthHeaderValue(revealed.AuthPrefix))
	}
	if revealed.APIKey != "sk-2" {
		t.Fatalf("key should have rotated, got %q", revealed.APIKey)
	}

	// 显式清空 header → 行内为 ''（非 NULL 也非旧值），运行时回到 auth_type 兜底
	if err := store.PutCredential(ctx, Credential{
		WorkspaceID: "ws_dev", ChannelID: "ch",
		BaseURL: "https://x.example", AuthType: "bearer",
		AuthHeader: strptr(""), AuthPrefix: strptr(""), APIKey: "sk-3", Actor: "test",
	}); err != nil {
		t.Fatalf("clear knobs: %v", err)
	}
	revealed, err = store.RevealKey(ctx, "ws_dev", "ch")
	if err != nil {
		t.Fatalf("reveal after clear: %v", err)
	}
	if AuthHeaderValue(revealed.AuthHeader) != "" || AuthHeaderValue(revealed.AuthPrefix) != "" {
		t.Fatalf("explicit clear must blank the knobs, got %q/%q",
			AuthHeaderValue(revealed.AuthHeader), AuthHeaderValue(revealed.AuthPrefix))
	}
}

// user_channels 的两个新列同样必须 NULL 安全，并能往返。
func TestPostgresUserChannelAuthKnobsRoundTrip(t *testing.T) {
	store, ctx := testStore(t)

	// 1) 存量形态：不带 knob（nil）→ 两列为 NULL
	plain, err := store.UpsertUserChannel(ctx, "ws_dev", UserChannel{
		ID: "plain", Name: "无 knob", Kind: "aggregator", Protocol: "api",
		BaseURL: "https://plain.example", AuthType: "bearer", Enabled: true,
	})
	if err != nil {
		t.Fatalf("upsert plain: %v", err)
	}
	if plain.AuthHeader != nil || plain.AuthPrefix != nil {
		t.Fatalf("NULL knobs must round-trip as nil, got %+v", plain)
	}

	// 2) 数据驱动形态：空前缀（裸 token）
	withKnobs, err := store.UpsertUserChannel(ctx, "ws_dev", UserChannel{
		ID: "autodl", Name: "AutoDL", Kind: "aggregator", Protocol: "api",
		BaseURL: "https://api.autodl.com", AuthType: "token",
		AuthHeader: strptr("Authorization"), AuthPrefix: strptr(""), Enabled: true,
	})
	if err != nil {
		t.Fatalf("upsert with knobs: %v", err)
	}
	if AuthHeaderValue(withKnobs.AuthHeader) != "Authorization" || AuthHeaderValue(withKnobs.AuthPrefix) != "" {
		t.Fatalf("upsert returned %q/%q", AuthHeaderValue(withKnobs.AuthHeader), AuthHeaderValue(withKnobs.AuthPrefix))
	}

	got, err := store.GetUserChannel(ctx, "ws_dev", "autodl")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if AuthHeaderValue(got.AuthHeader) != "Authorization" || AuthHeaderValue(got.AuthPrefix) != "" {
		t.Fatalf("get returned %q/%q", AuthHeaderValue(got.AuthHeader), AuthHeaderValue(got.AuthPrefix))
	}

	// 3) 列表同时含 NULL 行与非 NULL 行，不得因 NULL 扫描失败
	items, err := store.ListUserChannels(ctx, "ws_dev")
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("expected 2 channels, got %d", len(items))
	}
}
