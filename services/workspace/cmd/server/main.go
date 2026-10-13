package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"shotdesigner/services/workspace/internal/httpapi"
	"shotdesigner/services/workspace/internal/store"
	"shotdesigner/shared/observability"
)

func main() {
	logger := observability.NewJSONLogger("workspace")
	dsn, token := os.Getenv("WORKSPACE_DATABASE_URL"), os.Getenv("WORKSPACE_INTERNAL_TOKEN")
	if dsn == "" || token == "" {
		logger.Error("WORKSPACE_DATABASE_URL and WORKSPACE_INTERNAL_TOKEN must be set")
		os.Exit(1)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	p, err := pgxpool.New(ctx, dsn)
	if err != nil {
		logger.Error("pgxpool init failed", slog.Any("err", err))
		os.Exit(1)
	}
	defer p.Close()
	if err := p.Ping(ctx); err != nil {
		logger.Error("db ping failed", slog.Any("err", err))
		os.Exit(1)
	}
	h := httpapi.Handler{Store: store.Store{Pool: p}, Token: token, Ready: p.Ping}
	addr := os.Getenv("WORKSPACE_LISTEN_ADDR")
	if addr == "" {
		addr = "127.0.0.1:8082"
	}
	metrics := observability.NewMetrics()
	handler := observability.WithObservability(logger, metrics)(h.Routes())
	logger.Info("workspace internal API listening", "addr", addr)
	if err := (&http.Server{Addr: addr, Handler: handler, ReadHeaderTimeout: 5 * time.Second}).ListenAndServe(); err != nil {
		logger.Error("workspace server stopped", slog.Any("err", err))
		os.Exit(1)
	}
}
