// Package app 承载 asset 服务的**装配**（BE-LAYER-002：cmd/ 只装配，
// 「装配校验收敛在构造函数」）。
//
// 为什么单独成包（TASK-PROC-006）：原 `cmd/server/main.go` 73 行里没有业务逻辑/SQL/
// handler 实现，全是「读 env + 构造 pgx/minio + 启 HTTP」⇒ 属**单个装配文件超行数上限**，
// 故只做**搬移**，不删任何装配与校验。
//
// 行为不变：环境变量名、默认值（endpoint=minio:9000 / bucket=assets /
// addr=0.0.0.0:8084 / max=100MiB）、启动顺序（含 MakeBucket 的"存在即容忍"语义）、
// 日志文案、os.Exit 语义逐条照搬。
package app

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"time"

	"shotdesigner/services/asset/internal/asset"
	"shotdesigner/services/asset/internal/httpapi"
	"shotdesigner/shared/observability"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// Config 是装配所需的全部配置（逐字段对应原 main 中读取的环境变量）。
type Config struct {
	DSN       string
	Token     string
	Endpoint  string
	Bucket    string
	AccessKey string
	SecretKey string
	MaxBytes  int64
	Addr      string
}

// ConfigFromEnv 读环境变量并套默认值。**默认值与原 main 完全一致**。
func ConfigFromEnv() Config {
	max := int64(100 * 1024 * 1024)
	if v, err := strconv.ParseInt(os.Getenv("ASSET_MAX_BYTES"), 10, 64); err == nil && v > 0 {
		max = v
	}
	return Config{
		DSN:       os.Getenv("ASSET_DATABASE_URL"),
		Token:     os.Getenv("ASSET_INTERNAL_TOKEN"),
		Endpoint:  env("ASSET_S3_ENDPOINT", "minio:9000"),
		Bucket:    env("ASSET_S3_BUCKET", "assets"),
		AccessKey: os.Getenv("ASSET_S3_ACCESS_KEY"),
		SecretKey: os.Getenv("ASSET_S3_SECRET_KEY"),
		MaxBytes:  max,
		Addr:      env("ASSET_LISTEN_ADDR", "0.0.0.0:8084"),
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
	if cfg.DSN == "" || cfg.Token == "" {
		logger.Error("ASSET_DATABASE_URL and ASSET_INTERNAL_TOKEN must be set")
		return nil, ErrMissingRequired
	}
	p, err := pgxpool.New(ctx, cfg.DSN)
	if err != nil {
		logger.Error("pgxpool init failed", slog.Any("err", err))
		return nil, err
	}
	if err := p.Ping(ctx); err != nil {
		p.Close()
		logger.Error("db ping failed", slog.Any("err", err))
		return nil, err
	}
	mc, err := minio.New(cfg.Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: false,
	})
	if err != nil {
		p.Close()
		logger.Error("minio init failed", slog.Any("err", err))
		return nil, err
	}
	// MakeBucket 的"存在即容忍"语义原样保留：仅当桶确实不存在时才退出。
	if err := mc.MakeBucket(ctx, cfg.Bucket, minio.MakeBucketOptions{}); err != nil {
		exists, _ := mc.BucketExists(ctx, cfg.Bucket)
		if !exists {
			p.Close()
			logger.Error("bucket init failed", "bucket", cfg.Bucket, slog.Any("err", err))
			return nil, err
		}
	}
	h := httpapi.Handler{
		Store: asset.Store{Pool: p, Object: mc, Bucket: cfg.Bucket, MaxBytes: cfg.MaxBytes},
		Token: cfg.Token,
		Ready: p.Ping,
	}
	metrics := observability.NewMetrics()
	return &App{
		cfg:     cfg,
		pool:    p,
		logger:  logger,
		handler: observability.WithObservability(logger, metrics)(h.Routes()),
	}, nil
}

// ListenAndServe 阻塞至退出。**不在此打停止日志** —— 由 main 按原文案打
// "asset server stopped"（保持日志逐字一致）。
func (a *App) ListenAndServe() error {
	server := &http.Server{Addr: a.cfg.Addr, Handler: a.handler, ReadHeaderTimeout: 5 * time.Second}
	a.logger.Info("asset service listening", "addr", a.cfg.Addr)
	return server.ListenAndServe()
}

// Close 释放连接池。
func (a *App) Close() {
	if a.pool != nil {
		a.pool.Close()
	}
}

// env 读环境变量，空则回退默认值（签名与实现照搬原 cmd/server）。
func env(k, f string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return f
}

// 装配失败的类型化信号（日志已在 New 内按原文案打出，main 只需退出）。
var ErrMissingRequired = errApp("ASSET_DATABASE_URL and ASSET_INTERNAL_TOKEN must be set")

type errApp string

func (e errApp) Error() string { return string(e) }
