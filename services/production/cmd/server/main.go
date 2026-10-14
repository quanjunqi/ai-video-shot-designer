package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"shotdesigner/services/production/internal/catalog"
	"shotdesigner/services/production/internal/episode"
	"shotdesigner/services/production/internal/episodeasset"
	"shotdesigner/services/production/internal/httpapi"
	"shotdesigner/services/production/internal/intent"
	"shotdesigner/services/production/internal/project"
	"shotdesigner/services/production/internal/projectcharacter"
	"shotdesigner/services/production/internal/ruletemplate"
	"shotdesigner/shared/netguard"
	"shotdesigner/shared/observability"
)

func main() {
	logger := observability.NewJSONLogger("production")
	databaseURL := os.Getenv("PRODUCTION_DATABASE_URL")
	token := os.Getenv("PRODUCTION_INTERNAL_TOKEN")
	if databaseURL == "" || token == "" {
		logger.Error("PRODUCTION_DATABASE_URL and PRODUCTION_INTERNAL_TOKEN must be set")
		os.Exit(1)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		logger.Error("pgxpool init failed", slog.Any("err", err))
		os.Exit(1)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		logger.Error("db ping failed", slog.Any("err", err))
		os.Exit(1)
	}
	// ── 上游同步器（① 的第①步）───────────────────────────────────────────────
	// 没有 PRODUCTION_WORKSPACE_URL / PRODUCTION_WORKSPACE_TOKEN 时**不装配**：
	// 路由会以 503 如实拒绝，而不是"同步成功但什么都没拉"。
	// 出站走共享 netguard，且用 PRODUCTION_ 前缀的变量（与 execution 的 EXECUTION_ 分开，
	// 否则一个服务的私网开关会顺带打开另一个服务的）。
	syncPolicy := netguard.FromEnvWithPrefix("PRODUCTION", os.Getenv)
	var channelSyncer httpapi.ChannelSyncer
	if wsURL, wsToken := os.Getenv("PRODUCTION_WORKSPACE_URL"), os.Getenv("PRODUCTION_WORKSPACE_TOKEN"); wsURL != "" && wsToken != "" {
		wsClient := catalog.NewWorkspaceCredentials(wsURL, wsToken, 10*time.Second)
		channelSyncer = catalog.Syncer{
			Store:       catalog.PostgresStore{Pool: pool},
			Credentials: wsClient,
			// 同步配置来源（ADR-009 决定 2）：工作区自己的渠道优先，其次平台渠道
			Channels: wsClient,
			Lister:   catalog.NewHTTPLister(syncPolicy, 30*time.Second),
		}
	} else {
		logger.Info("上游同步器未启用（需 PRODUCTION_WORKSPACE_URL / PRODUCTION_WORKSPACE_TOKEN）")
	}

	handler := httpapi.Handler{
		Store:                 project.PostgresStore{Pool: pool},
		EpisodeStore:          episode.PostgresStore{Pool: pool},
		EpisodeAssetStore:     episodeasset.PostgresStore{Pool: pool},
		ProjectCharacterStore: projectcharacter.PostgresStore{Pool: pool},
		RuleTemplateStore:     ruletemplate.PostgresStore{Pool: pool},
		IntentStore:           intent.PostgresStore{Pool: pool},
		CatalogStore:          catalog.PostgresStore{Pool: pool},
		LogicalModelStore:     catalog.PostgresStore{Pool: pool},
		CurationStore:         catalog.PostgresStore{Pool: pool},
		ChannelSyncer:         channelSyncer,
		Token:                 token,
		Ready:                 pool.Ping,
	}
	addr := os.Getenv("PRODUCTION_LISTEN_ADDR")
	if addr == "" {
		addr = "127.0.0.1:8081"
	}
	metrics := observability.NewMetrics()
	observed := observability.WithObservability(logger, metrics)(handler.Routes())
	server := &http.Server{
		Addr:              addr,
		Handler:           observed,
		ReadHeaderTimeout: 5 * time.Second,
	}
	logger.Info("production internal API listening", "addr", addr)
	if err := server.ListenAndServe(); err != nil {
		logger.Error("production server stopped", slog.Any("err", err))
		os.Exit(1)
	}
}
