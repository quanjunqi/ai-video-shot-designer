package main

import (
	"log/slog"
	"net/http"
	"os"
	"time"

	"shotdesigner/services/web-bff/internal/httpserver"
	"shotdesigner/shared/observability"
)

// main 只做装配（BE-LAYER-002）：读环境变量 → 构造 server → 启动 HTTP。
// 所有代理 handler/守卫/响应工具收敛在 internal/httpserver。
func main() {
	logger := observability.NewJSONLogger("web-bff")
	s, err := httpserver.New(httpserver.Config{
		WorkspaceURL:    httpserver.Env("BFF_WORKSPACE_URL", "http://workspace:8082"),
		ProductionURL:   httpserver.Env("BFF_PRODUCTION_URL", "http://production:8081"),
		AssetURL:        httpserver.Env("BFF_ASSET_URL", "http://asset:8084"),
		ExecutionURL:    httpserver.Env("BFF_EXECUTION_URL", "http://execution:8085"),
		WorkspaceToken:  os.Getenv("WORKSPACE_INTERNAL_TOKEN"),
		ProductionToken: os.Getenv("PRODUCTION_INTERNAL_TOKEN"),
		AssetToken:      os.Getenv("ASSET_INTERNAL_TOKEN"),
		ExecutionToken:  os.Getenv("EXECUTION_INTERNAL_TOKEN"),
		DevWorkspace:    httpserver.Env("BFF_DEV_WORKSPACE_ID", "ws_dev"),
		DevActor:        httpserver.Env("BFF_DEV_ACTOR_ID", "user_dev"),
	})
	if err != nil {
		logger.Error("web-bff init failed", slog.Any("err", err))
		os.Exit(1)
	}
	addr := httpserver.Env("BFF_LISTEN_ADDR", "0.0.0.0:8080")
	metrics := observability.NewMetrics()
	handler := observability.WithObservability(logger, metrics)(s.Routes())
	logger.Info("web bff listening", "addr", addr)
	if err := (&http.Server{Addr: addr, Handler: handler, ReadHeaderTimeout: 5 * time.Second}).ListenAndServe(); err != nil {
		logger.Error("web bff server stopped", slog.Any("err", err))
		os.Exit(1)
	}
}
