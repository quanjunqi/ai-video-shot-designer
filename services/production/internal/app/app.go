// Package app 承载 production 服务的**装配**（BE-LAYER-002：cmd/ 只装配，
// 「装配校验收敛在构造函数」）。
//
// 为什么单独成包（TASK-PROC-006）：原 `cmd/server/main.go` 94 行里没有业务逻辑/SQL/
// handler 实现，全是「读 env + 构造依赖 + 启 HTTP」⇒ 属**单个装配文件超行数上限**，
// 故只做**搬移**，不删任何装配与校验。
//
// 行为不变：环境变量名、默认值（addr=127.0.0.1:8081）、日志文案、os.Exit 语义逐条照搬。
package app

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"time"

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

	"github.com/jackc/pgx/v5/pgxpool"
)

// Config 是装配所需的全部配置（逐字段对应原 main 中读取的环境变量）。
type Config struct {
	DatabaseURL    string
	Token          string
	WorkspaceURL   string
	WorkspaceToken string
	Addr           string
}

// ConfigFromEnv 读环境变量并套默认值。**默认值与原 main 完全一致**：addr=127.0.0.1:8081。
func ConfigFromEnv() Config {
	addr := os.Getenv("PRODUCTION_LISTEN_ADDR")
	if addr == "" {
		addr = "127.0.0.1:8081"
	}
	return Config{
		DatabaseURL:    os.Getenv("PRODUCTION_DATABASE_URL"),
		Token:          os.Getenv("PRODUCTION_INTERNAL_TOKEN"),
		WorkspaceURL:   os.Getenv("PRODUCTION_WORKSPACE_URL"),
		WorkspaceToken: os.Getenv("PRODUCTION_WORKSPACE_TOKEN"),
		Addr:           addr,
	}
}

// App 持有装配结果。
type App struct {
	cfg     Config
	pool    *pgxpool.Pool
	logger  *slog.Logger
	handler http.Handler
}

// New 完成全部依赖构造与装配校验。
//
// ★ 失败时的**日志与原文案逐字一致**，且已在此处打出（main 只负责 os.Exit(1)）。
func New(ctx context.Context, logger *slog.Logger, cfg Config) (*App, error) {
	if cfg.DatabaseURL == "" || cfg.Token == "" {
		logger.Error("PRODUCTION_DATABASE_URL and PRODUCTION_INTERNAL_TOKEN must be set")
		return nil, ErrMissingRequired
	}
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("pgxpool init failed", slog.Any("err", err))
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		logger.Error("db ping failed", slog.Any("err", err))
		return nil, err
	}

	// ── 上游同步器（① 的第①步）───────────────────────────────────────────────
	// 没有 PRODUCTION_WORKSPACE_URL / PRODUCTION_WORKSPACE_TOKEN 时**不装配**：
	// 路由会以 503 如实拒绝，而不是"同步成功但什么都没拉"。
	// 出站走共享 netguard，且用 PRODUCTION_ 前缀的变量（与 execution 的 EXECUTION_ 分开，
	// 否则一个服务的私网开关会顺带打开另一个服务的）。
	syncPolicy := netguard.FromEnvWithPrefix("PRODUCTION", os.Getenv)
	var channelSyncer httpapi.ChannelSyncer
	if cfg.WorkspaceURL != "" && cfg.WorkspaceToken != "" {
		wsClient := catalog.NewWorkspaceCredentials(cfg.WorkspaceURL, cfg.WorkspaceToken, 10*time.Second)
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
		Token:                 cfg.Token,
		Ready:                 pool.Ping,
	}
	metrics := observability.NewMetrics()
	return &App{
		cfg:     cfg,
		pool:    pool,
		logger:  logger,
		handler: observability.WithObservability(logger, metrics)(handler.Routes()),
	}, nil
}

// ListenAndServe 阻塞至退出。**不在此打停止日志** —— 由 main 按原文案打
// "production server stopped"（保持日志逐字一致）。
func (a *App) ListenAndServe() error {
	server := &http.Server{
		Addr:              a.cfg.Addr,
		Handler:           a.handler,
		ReadHeaderTimeout: 5 * time.Second,
	}
	a.logger.Info("production internal API listening", "addr", a.cfg.Addr)
	return server.ListenAndServe()
}

// Close 释放连接池。
func (a *App) Close() {
	if a.pool != nil {
		a.pool.Close()
	}
}

// 装配失败的类型化信号（日志已在 New 内按原文案打出，main 只需退出）。
var ErrMissingRequired = errApp("PRODUCTION_DATABASE_URL and PRODUCTION_INTERNAL_TOKEN must be set")

type errApp string

func (e errApp) Error() string { return string(e) }
