package main

import (
	"context"
	"log/slog"
	"os"
	"time"

	"shotdesigner/services/outbox-relay/internal/relay"

	"github.com/jackc/pgx/v5/pgxpool"
)

// main 只做装配（BE-LAYER-002）：读环境变量 → 建依赖 → 构造 relay → 运行。
// 所有投递业务收敛在 internal/relay，装配校验（默认值/依赖非空）在 relay.New 内。
func main() {
	dsn := os.Getenv("OUTBOX_DATABASE_URL")
	if dsn == "" {
		relay.Logger.Error("OUTBOX_DATABASE_URL must be set")
		os.Exit(1)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		relay.Logger.Error("pgxpool init failed", slog.Any("err", err))
		os.Exit(1)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		relay.Logger.Error("db ping failed", slog.Any("err", err))
		os.Exit(1)
	}
	r, err := relay.New(relay.Config{
		Pool:         pool,
		ExecutionURL: relay.Env("OUTBOX_EXECUTION_URL", "http://execution:8085"),
		Token:        os.Getenv("OUTBOX_EXECUTION_TOKEN"),
		Batch:        relay.EnvInt("OUTBOX_BATCH_SIZE", 20),
		Lease:        time.Duration(relay.EnvInt("OUTBOX_LEASE_SECONDS", 60)) * time.Second,
		MaxAttempts:  relay.EnvInt("OUTBOX_MAX_ATTEMPTS", 20),
	})
	if err != nil {
		relay.Logger.Error("relay init failed", slog.Any("err", err))
		os.Exit(1)
	}
	interval := time.Duration(relay.EnvInt("OUTBOX_POLL_SECONDS", 2)) * time.Second
	r.Run(context.Background(), interval)
}
