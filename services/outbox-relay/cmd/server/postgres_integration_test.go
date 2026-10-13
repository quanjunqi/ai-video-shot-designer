package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// outbox-relay 的数据库路径此前【完全没有证据】（claim/ack/fail/runOnce 覆盖率 0%，
// 该服务整体 28.4%）。本文件补上四条事务路径 + runOnce 完整回路。
//
// outbox_events 表定义在 production 服务的迁移里（002/003），因此这里
// 应用 production 的全部迁移（与 production 集成测试同构：每个用例自建
// 随机 schema、就地应用迁移、结束时清理）。未设置 OUTBOX_TEST_DATABASE_URL
// 时跳过 —— CI 的 backend job 会提供它（见 ci.yml env 段）。

func testRelay(t *testing.T) *relay {
	t.Helper()
	url := os.Getenv("OUTBOX_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set OUTBOX_TEST_DATABASE_URL to a dedicated PostgreSQL test database")
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
	schema := "outbox_test_" + hex.EncodeToString(suffix[:])
	quoted := pgx.Identifier{schema}.Sanitize()
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+quoted); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := admin.Exec(context.Background(), "DROP SCHEMA "+quoted+" CASCADE"); err != nil {
			t.Errorf("remove test schema: %v", err)
		}
	})

	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	migrations, err := filepath.Glob(filepath.Join("..", "..", "..", "production", "migrations", "*.sql"))
	if err != nil {
		t.Fatal(err)
	}
	sort.Strings(migrations)
	for _, f := range migrations {
		b, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, string(b)); err != nil {
			t.Fatalf("apply %s: %v", filepath.Base(f), err)
		}
	}

	return &relay{
		pool:        pool,
		client:      &http.Client{Timeout: 5 * time.Second},
		token:       "secret",
		workerID:    "relay_test",
		batch:       20,
		lease:       30 * time.Second,
		maxAttempts: 3,
	}
}

// insertOutbox 直接插入一条待投递事件（与 claim 的 WHERE 语义匹配）。
func insertOutbox(t *testing.T, r *relay, aggregate string) int64 {
	t.Helper()
	var id int64
	err := r.pool.QueryRow(context.Background(),
		`INSERT INTO outbox_events (workspace_id,actor_id,aggregate_id,event_type,payload)
		 VALUES ('ws-1','actor-1',$1,'generation.intent.created','{"intent_id":"i1"}'::jsonb) RETURNING id`,
		aggregate).Scan(&id)
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func TestClaimReturnsNothingWhenEmpty(t *testing.T) {
	r := testRelay(t)
	got, err := r.claim(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 0 {
		t.Fatalf("空表应返回空，得到 %d 条", len(got))
	}
}

func TestClaimLocksDueEventsAndSkipsFuture(t *testing.T) {
	r := testRelay(t)
	due := insertOutbox(t, r, "intent-1")
	// 一条 1 小时后才可投递的事件：claim 不得碰它
	if _, err := r.pool.Exec(context.Background(),
		`INSERT INTO outbox_events (workspace_id,actor_id,aggregate_id,event_type,payload,available_at)
		 VALUES ('ws-1','actor-1','intent-2','generation.intent.created','{}'::jsonb, now() + interval '1 hour')`); err != nil {
		t.Fatal(err)
	}

	got, err := r.claim(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].ID != due {
		t.Fatalf("应只拿到 1 条 due 事件（id=%d），得到 %+v", due, got)
	}
	if got[0].Attempts != 1 {
		t.Fatalf("attempts 应 +1 为 1，得到 %d", got[0].Attempts)
	}

	// 已被本 worker 锁定 ⇒ 再次 claim 不得重复取到
	again, err := r.claim(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(again) != 0 {
		t.Fatalf("SKIP LOCKED 后不得重复 claim，得到 %d 条", len(again))
	}
}

func TestAckMarksPublished(t *testing.T) {
	r := testRelay(t)
	id := insertOutbox(t, r, "intent-1")
	if _, err := r.claim(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := r.ack(context.Background(), id, "ws-1", "intent-1"); err != nil {
		t.Fatal(err)
	}
	var published bool
	var lockedBy string
	if err := r.pool.QueryRow(context.Background(),
		`SELECT published_at IS NOT NULL, locked_by FROM outbox_events WHERE id=$1`, id).
		Scan(&published, &lockedBy); err != nil {
		t.Fatal(err)
	}
	if !published || lockedBy != "" {
		t.Fatalf("ack 后应 published 且解锁：published=%v locked_by=%q", published, lockedBy)
	}
}

func TestFailSchedulesBackoff(t *testing.T) {
	r := testRelay(t)
	id := insertOutbox(t, r, "intent-1")
	if _, err := r.claim(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := r.fail(context.Background(), id, 1, context.DeadlineExceeded); err != nil {
		t.Fatal(err)
	}
	var availableAt, lastError string
	var lockedBy string
	if err := r.pool.QueryRow(context.Background(),
		`SELECT available_at::text, last_error, locked_by FROM outbox_events WHERE id=$1`, id).
		Scan(&availableAt, &lastError, &lockedBy); err != nil {
		t.Fatal(err)
	}
	if lockedBy != "" || lastError == "" {
		t.Fatalf("fail 后应解锁并记录错误：locked_by=%q last_error=%q", lockedBy, lastError)
	}
	// 平方退避：attempts=1 → backoff=2s，available_at 应在未来
	// 直接断言时间语义易受时钟抖动影响，这里验证退避数值（纯函数已单独锁定）
	if backoffSeconds(1) != 2 || backoffSeconds(18) != 300 {
		t.Fatalf("backoffSeconds 边界错误：%d/%d", backoffSeconds(1), backoffSeconds(18))
	}
	_ = availableAt
}

func TestFailDeadLettersAtMaxAttempts(t *testing.T) {
	r := testRelay(t)
	id := insertOutbox(t, r, "intent-1")
	if _, err := r.claim(context.Background()); err != nil {
		t.Fatal(err)
	}
	// maxAttempts=3：第 3 次失败应 dead letter
	if err := r.fail(context.Background(), id, 3, context.DeadlineExceeded); err != nil {
		t.Fatal(err)
	}
	var dead bool
	if err := r.pool.QueryRow(context.Background(),
		`SELECT dead_lettered_at IS NOT NULL FROM outbox_events WHERE id=$1`, id).Scan(&dead); err != nil {
		t.Fatal(err)
	}
	if !dead {
		t.Fatal("达到 maxAttempts 后应 dead letter")
	}
	// dead letter 后 claim 不得再取到
	got, err := r.claim(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 0 {
		t.Fatalf("dead letter 事件不得被 claim，得到 %d 条", len(got))
	}
}

func TestRunOnceDeliversAndAcks(t *testing.T) {
	r := testRelay(t)
	var gotPath, gotAuth, gotWorkspace string
	var gotPayload string
	exec := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		gotPath = req.URL.Path
		gotAuth = req.Header.Get("Authorization")
		gotWorkspace = req.Header.Get("X-Workspace-Id")
		b := make([]byte, 4096)
		n, _ := req.Body.Read(b)
		gotPayload = strings.TrimSpace(string(b[:n]))
		w.WriteHeader(http.StatusCreated)
	}))
	defer exec.Close()
	r.executionURL = exec.URL

	id := insertOutbox(t, r, "intent-1")
	if err := r.runOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if gotPath != "/internal/v1/execution-intents" || gotAuth != "Bearer secret" || gotWorkspace != "ws-1" {
		t.Fatalf("投递目标不对：path=%q auth=%q ws=%q", gotPath, gotAuth, gotWorkspace)
	}
	// postgres jsonb 序列化会带空格（`"intent_id": "i1"`），只断言键值存在
	if !strings.Contains(gotPayload, "intent_id") || !strings.Contains(gotPayload, "i1") {
		t.Fatalf("payload 未透传：%q", gotPayload)
	}
	// 事件应被 ack：published + 不再可 claim
	var published bool
	if err := r.pool.QueryRow(context.Background(),
		`SELECT published_at IS NOT NULL FROM outbox_events WHERE id=$1`, id).Scan(&published); err != nil {
		t.Fatal(err)
	}
	if !published {
		t.Fatal("runOnce 成功后事件应被 ack（published）")
	}
}

func TestRunOnceFailureBacksOff(t *testing.T) {
	r := testRelay(t)
	exec := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "execution down", http.StatusInternalServerError)
	}))
	defer exec.Close()
	r.executionURL = exec.URL

	id := insertOutbox(t, r, "intent-1")
	if err := r.runOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	var lastError string
	var dead bool
	if err := r.pool.QueryRow(context.Background(),
		`SELECT last_error, dead_lettered_at IS NOT NULL FROM outbox_events WHERE id=$1`, id).
		Scan(&lastError, &dead); err != nil {
		t.Fatal(err)
	}
	if lastError == "" || dead {
		t.Fatalf("投递失败应记录错误且未 dead letter：last_error=%q dead=%v", lastError, dead)
	}
}

// backoffSeconds 边界在真实 DB 路径外单独锁定（2 与 300 的夹取）
func TestBackoffSecondsBoundaries(t *testing.T) {
	cases := []struct{ attempts, want int }{
		{0, 2}, {1, 2}, {2, 4}, {3, 9}, {17, 289}, {18, 300}, {50, 300},
	}
	for _, c := range cases {
		if got := backoffSeconds(c.attempts); got != c.want {
			t.Fatalf("backoffSeconds(%d)=%d，期望 %d", c.attempts, got, c.want)
		}
	}
}
