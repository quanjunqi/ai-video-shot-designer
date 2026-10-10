package audit

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync/atomic"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// 真库测试脚手架：与 production/execution 既有做法一致 —— 每个用例自建随机 schema、
// 就地应用 migrations、结束时清理。未设置 EXECUTION_TEST_DATABASE_URL 时跳过。
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
	schema := "audit_test_" + hex.EncodeToString(suffix[:])
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
	migrations, err := filepath.Glob(filepath.Join("..", "..", "migrations", "*.sql"))
	if err != nil {
		t.Fatal(err)
	}
	sort.Strings(migrations)
	for _, f := range migrations {
		b, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, string(b), pgx.QueryExecModeSimpleProtocol); err != nil {
			t.Fatalf("apply %s: %v", filepath.Base(f), err)
		}
	}
	return Store{Pool: pool}
}

// seedSeq 保证 request_id 唯一：库里对 request_id 有唯一索引，
// 用 (status, latency) 拼 id 会在"同 status 同耗时"时撞（我第一版就是这么写的）。
var seedSeq atomic.Int64

func seedAudit(t *testing.T, s Store, workspace, status string, latency int) {
	t.Helper()
	id := fmt.Sprintf("req_%s_%d", workspace, seedSeq.Add(1))
	if _, err := s.Pool.Exec(context.Background(), `
		INSERT INTO gateway_audit_logs (request_id, workspace_id, user_id, product, model_id, channel_id,
			mode, status, latency_ms, token_input, token_output, token_cached, cost_amount, cost_currency, created_at)
		VALUES ($1,$2,'u','image','m','','text-chat',$3,$4,0,0,0,0,'CNY', now())`,
		id, workspace, status, latency); err != nil {
		t.Fatal(err)
	}
}

// ★ 核心判据：P50/P95 是【筛选后全集】上的百分位，且**排除零耗时**
// （latency_ms 是 NOT NULL DEFAULT 0，0 表示"没测到"，不是"瞬时完成"）
func TestIntegrationAggregateLatencyPercentiles(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	// 1..100 的耗时（P50=50 / P95=95），再加 2 行"未测到"的 0
	for i := 1; i <= 100; i++ {
		seedAudit(t, s, "ws_a", "success", i)
	}
	seedAudit(t, s, "ws_a", "queued", 0)
	seedAudit(t, s, "ws_a", "queued", 0)

	got, err := s.Aggregate(ctx, "ws_a", Filter{})
	if err != nil {
		t.Fatal(err)
	}
	if got.P50LatencyMs != 50 {
		t.Errorf("P50 应为 50（连续插值取整），实际 %d", got.P50LatencyMs)
	}
	if got.P95LatencyMs != 95 {
		t.Errorf("P95 应为 95，实际 %d", got.P95LatencyMs)
	}
	// 若把两行 0 计入，P50 会被拉到 0/1 —— 这条断言就是防那个的
	if got.P50LatencyMs == 0 {
		t.Error("零耗时应被排除：它们会把 P50 拉成 0，让耗时分布变成假象")
	}
	if got.ByStatus["success"] != 100 || got.ByStatus["queued"] != 2 {
		t.Errorf("byStatus 应仍为全集计数，实际 %v", got.ByStatus)
	}
	if got.AvgLatencyMs <= 0 {
		t.Errorf("平均值应大于 0，实际 %d", got.AvgLatencyMs)
	}
}

// 筛选条件必须对百分位同样生效（否则"筛选后的耗时"是假的）
func TestIntegrationAggregatePercentilesRespectFilters(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	for i := 1; i <= 10; i++ {
		seedAudit(t, s, "ws_a", "success", i*10) // 10..100
	}
	for i := 1; i <= 10; i++ {
		seedAudit(t, s, "ws_b", "success", i) // 另一个租户：绝不能混进来
	}
	got, err := s.Aggregate(ctx, "ws_a", Filter{Status: "success"})
	if err != nil {
		t.Fatal(err)
	}
	// ★ 钉住【连续插值】的语义：样本是 10,20,…,100（10 个等距点），P50 落在第 5/6 个样本之间。
	//   P50=55 是【二进制可精确表示】的值，所以它稳定可钉。
	if got.P50LatencyMs != 55 {
		t.Fatalf("ws_a 的 P50 应为 55（连续插值），实际 %d", got.P50LatencyMs)
	}
	//   但 P95 不能钉死：0.95 处插值得 95.5，而 percentile_cont 返回 double precision，
	//   `::int` 对 95.5 的取整受浮点表示影响 —— **实测按平台不同**：
	//     本地 arm64 → 96 ；CI x86_64 → 95 。
	//   ⇒ 断言【语义区间】而不是那个数：换成 percentile_disc 会落到 90/100 上，仍会被这条抓住。
	if got.P95LatencyMs < 95 || got.P95LatencyMs > 96 {
		t.Fatalf("ws_a 的 P95 应落在 [95,96]（95.5 的取整平台相关），实际 %d", got.P95LatencyMs)
	}
	// 锁住"不是取样本"这一点：55 并不存在于样本集合 {10,20,…,100} 中
	if got.P50LatencyMs%10 == 0 {
		t.Errorf("P50=%d 恰好落在样本上，看起来像 percentile_disc 而非连续插值", got.P50LatencyMs)
	}
	// 顺序性：P95 必须不小于 P50（这条与平台无关）
	if got.P95LatencyMs < got.P50LatencyMs {
		t.Errorf("P95(%d) 不应小于 P50(%d)", got.P95LatencyMs, got.P50LatencyMs)
	}
	if got.ByStatus["success"] != 10 {
		t.Fatalf("只应统计 ws_a 的 10 行，实际 %v", got.ByStatus)
	}
}

// 空集：不得返回错误，归 0（前端要能安全渲染）
func TestIntegrationAggregateOnEmptySet(t *testing.T) {
	s := testStore(t)
	got, err := s.Aggregate(context.Background(), "ws_none", Filter{})
	if err != nil {
		t.Fatal(err)
	}
	if got.P50LatencyMs != 0 || got.P95LatencyMs != 0 || got.AvgLatencyMs != 0 {
		t.Fatalf("空集应全为 0，实际 %+v", got)
	}
	if len(got.ByStatus) != 0 {
		t.Fatalf("空集的 byStatus 应为空，实际 %v", got.ByStatus)
	}
}
