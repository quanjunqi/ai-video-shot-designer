package breaker

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// testStore 建一个带 channel_health 表的隔离 schema 熔断 Store。
// 未设置 EXECUTION_TEST_DATABASE_URL 时整组跳过（与 job/audit 的集成测试同一约定）。
func testStore(t *testing.T) *Store {
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
	schema := "breaker_test_" + hex.EncodeToString(suffix[:])
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
	return New(pool, DefaultConfig(), slog.New(slog.DiscardHandler))
}

// 失败计数原子累积：连续 RecordFailure 后 fail_count 递增；未达阈值不冷却
func TestRecordFailureCountsUntilThreshold(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := Unit{ChannelID: "ch_a", ProviderModel: "gpt-4o"}

	s.RecordFailure(ctx, u)
	s.RecordFailure(ctx, u) // 2 次，未达阈值 3

	cooling, until, err := s.Health(ctx, u)
	if err != nil {
		t.Fatal(err)
	}
	if cooling {
		t.Fatalf("2 次失败不应冷却（阈值 3），cooldown_until=%v", until)
	}
	if until != nil {
		t.Fatalf("未达阈值时 cooldown_until 应为 NULL，实际 %v", until)
	}
}

// 达阈值进入冷却；冷却中单元被 FilterHealthy 剔除（不消耗尝试次数）
func TestThresholdEntersCooldownAndFiltered(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := Unit{ChannelID: "ch_a", ProviderModel: "gpt-4o"}

	s.RecordFailure(ctx, u)
	s.RecordFailure(ctx, u)
	s.RecordFailure(ctx, u) // 第 3 次 → 冷却

	cooling, until, err := s.Health(ctx, u)
	if err != nil || !cooling {
		t.Fatalf("第 3 次失败应进入冷却：cooling=%v until=%v err=%v", cooling, until, err)
	}
	if until == nil || !until.After(time.Now()) {
		t.Fatalf("冷却截止应在未来，实际 %v", until)
	}

	// FilterHealthy：冷却中剔除，其余保留
	healthy, err := s.FilterHealthy(ctx, []Unit{u, {ChannelID: "ch_b", ProviderModel: "sd3"}})
	if err != nil {
		t.Fatal(err)
	}
	if len(healthy) != 1 || healthy[0].ChannelID != "ch_b" {
		t.Fatalf("冷却单元应被剔除，剩余 %+v", healthy)
	}

	// 全部冷却 ⇒ ErrUnitCooling
	only, err := s.FilterHealthy(ctx, []Unit{u})
	if !errors.Is(err, ErrUnitCooling) {
		t.Fatalf("全部冷却应返回 ErrUnitCooling，实际 %v", err)
	}
	if len(only) != 0 {
		t.Fatalf("全部冷却时应无健康候选，实际 %+v", only)
	}
}

// 成功恢复：RecordSuccess 重置计数并清冷却
func TestRecordSuccessResets(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := Unit{ChannelID: "ch_a", ProviderModel: "gpt-4o"}

	s.RecordFailure(ctx, u)
	s.RecordFailure(ctx, u)
	s.RecordFailure(ctx, u)
	if cooling, _, _ := s.Health(ctx, u); !cooling {
		t.Fatal("前置：应已冷却")
	}
	s.RecordSuccess(ctx, u)
	cooling, until, err := s.Health(ctx, u)
	if err != nil || cooling {
		t.Fatalf("成功应清冷却：cooling=%v until=%v err=%v", cooling, until, err)
	}
	if until != nil {
		t.Fatalf("成功应清 cooldown_until，实际 %v", until)
	}
}

// 半开探活单飞：冷却到期后可占位，同时只有一个实例能拿到探活权
func TestTryAcquireProbeSingleFlight(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := Unit{ChannelID: "ch_a", ProviderModel: "gpt-4o"}

	// 进入冷却
	s.RecordFailure(ctx, u)
	s.RecordFailure(ctx, u)
	s.RecordFailure(ctx, u)

	// 冷却未到期：不可占位（防御：条件含 cooldown_until <= now）
	if got := s.TryAcquireProbe(ctx, u); got {
		t.Fatal("冷却未到期不应拿到探活权")
	}

	// 手动把 cooldown_until 拨到过去，模拟冷却到期
	if _, err := s.Pool.Exec(ctx, `UPDATE channel_health SET cooldown_until = now() - interval '1 second' WHERE channel_id=$1 AND provider_model=$2`, u.ChannelID, u.ProviderModel); err != nil {
		t.Fatal(err)
	}

	// 单飞：第一个实例占位成功，第二个（不同 owner）失败
	s1 := New(s.Pool, Config{Disabled: false, AllowedFails: 3, Cooldown: 60 * time.Second, HealthCheck: 30 * time.Second, ProbeOwner: "inst-1"}, slog.New(slog.DiscardHandler))
	s2 := New(s.Pool, Config{Disabled: false, AllowedFails: 3, Cooldown: 60 * time.Second, HealthCheck: 30 * time.Second, ProbeOwner: "inst-2"}, slog.New(slog.DiscardHandler))
	if !s1.TryAcquireProbe(ctx, u) {
		t.Fatal("第一个实例应拿到探活权")
	}
	if s2.TryAcquireProbe(ctx, u) {
		t.Fatal("已被占位的单元，第二个实例不应拿到探活权（单飞）")
	}
	// 同一实例再次占位：probe_owner = 自己 允许（续探）
	if !s1.TryAcquireProbe(ctx, u) {
		t.Fatal("同一实例应能续探（probe_owner=自己 允许）")
	}
}

// 同渠道不同模型互不影响（单元级唯一键生效）
func TestUnitIsolationSameChannel(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	a := Unit{ChannelID: "ch_a", ProviderModel: "gpt-4o"}
	b := Unit{ChannelID: "ch_a", ProviderModel: "sd3"} // 同渠道不同模型

	s.RecordFailure(ctx, a)
	s.RecordFailure(ctx, a)
	s.RecordFailure(ctx, a) // a 熔断

	if cooling, _, _ := s.Health(ctx, a); !cooling {
		t.Fatal("a 应熔断")
	}
	if cooling, _, err := s.Health(ctx, b); err != nil || cooling {
		t.Fatalf("b（同渠道不同模型）不应受 a 影响：cooling=%v err=%v", cooling, err)
	}
	healthy, err := s.FilterHealthy(ctx, []Unit{a, b})
	if err != nil {
		t.Fatal(err)
	}
	if len(healthy) != 1 || healthy[0] != b {
		t.Fatalf("只有 a 被剔除，应剩 b：%+v", healthy)
	}
}

// 熔断关闭（运营开关）时：FilterHealthy 恒放行、失败不计数
func TestDisabledCircuitBreakerFailOpen(t *testing.T) {
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
	cfg := DefaultConfig()
	cfg.Disabled = true
	s := &Store{Pool: admin, Cfg: cfg, Log: slog.New(slog.DiscardHandler)}
	u := Unit{ChannelID: "ch_a", ProviderModel: "gpt-4o"}

	s.RecordFailure(ctx, u) // 关闭时不应写库
	healthy, err := s.FilterHealthy(ctx, []Unit{u})
	if err != nil {
		t.Fatal(err)
	}
	if len(healthy) != 1 {
		t.Fatalf("熔断关闭时应恒放行，实际 %+v", healthy)
	}
}

// Store 为 nil（未装配）时恒放行：fail-open 语义
func TestNilStoreFailOpen(t *testing.T) {
	ctx := context.Background()
	var s *Store
	u := Unit{ChannelID: "ch_a", ProviderModel: "gpt-4o"}
	healthy, err := s.FilterHealthy(ctx, []Unit{u})
	if err != nil || len(healthy) != 1 {
		t.Fatalf("nil Store 应 fail-open 放行：healthy=%+v err=%v", healthy, err)
	}
}
