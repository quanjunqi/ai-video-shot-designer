package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"time"

	"shotdesigner/services/execution/internal/artifact"
	"shotdesigner/services/execution/internal/audit"
	"shotdesigner/services/execution/internal/catalog"
	"shotdesigner/services/execution/internal/creds"
	"shotdesigner/services/execution/internal/httpapi"
	"shotdesigner/services/execution/internal/job"
	"shotdesigner/services/execution/internal/probe"
	"shotdesigner/services/execution/internal/quota"
	"shotdesigner/services/execution/internal/reconcile"
	"shotdesigner/services/execution/internal/worker"
	"shotdesigner/shared/netguard"
	"shotdesigner/shared/observability"

	"github.com/jackc/pgx/v5/pgxpool"
)

// main 只做装配（BE-LAYER-002）：读环境变量 → 建依赖 → 启动 worker/HTTP。
// 任务执行、审计终态、重试/死信、保留期清理全部收敛在 internal/worker。
func main() {
	dsn := os.Getenv("EXECUTION_DATABASE_URL")
	token := os.Getenv("EXECUTION_INTERNAL_TOKEN")
	productionURL := os.Getenv("EXECUTION_PRODUCTION_URL")
	productionToken := os.Getenv("PRODUCTION_INTERNAL_TOKEN")
	workspaceURL := os.Getenv("EXECUTION_WORKSPACE_URL")
	workspaceToken := os.Getenv("WORKSPACE_INTERNAL_TOKEN")
	if dsn == "" || token == "" {
		worker.Logger.Error("EXECUTION_DATABASE_URL and EXECUTION_INTERNAL_TOKEN must be set")
		os.Exit(1)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		worker.Logger.Error("pgxpool init failed", slog.Any("err", err))
		os.Exit(1)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		worker.Logger.Error("db ping failed", slog.Any("err", err))
		os.Exit(1)
	}
	store := job.Store{Pool: pool}
	auditStore := &audit.Store{Pool: pool}
	addr := os.Getenv("EXECUTION_LISTEN_ADDR")
	if addr == "" {
		addr = "0.0.0.0:8085"
	}
	var catalogClient *catalog.Client
	var credsClient *creds.Client
	if productionURL != "" && productionToken != "" {
		catalogClient = catalog.NewClient(productionURL, productionToken)
	}
	if workspaceURL != "" && workspaceToken != "" {
		credsClient = creds.NewClient(workspaceURL, workspaceToken)
	}
	if catalogClient == nil || credsClient == nil {
		worker.Logger.Warn("execution engine partial config; /run unavailable", "catalog", catalogClient != nil, "creds", credsClient != nil)
	}
	// 模型网关的 client 会请求「渠道凭据里的 base_url」——该 URL 由用户提供，
	// 因此必须带 SSRF 防护（见 internal/netguard 的威胁模型说明）。
	// 注意：catalog/creds 的内部调用走各自的 client，目标是私网内部服务，
	// **不能**套用本防护，否则会自断链路。
	upstreamPolicy := netguard.FromEnv(os.Getenv)
	engineClient := upstreamPolicy.NewClient(600 * time.Second)
	worker.Logger.Info("upstream SSRF policy", "allow_private", upstreamPolicy.AllowPrivate, "allowed_hosts", len(upstreamPolicy.AllowedHosts))
	// 渠道探测（TASK-INFRA-004）：全仓唯一实现，base URL 只从服务端来源解析
	// （工作区用户渠道 / 凭据行 / 平台目录），出站走同一套 SSRF 防护。
	prober := probe.New(catalogClient, credsClient, upstreamPolicy, 5*time.Second)
	if catalogClient == nil && credsClient == nil {
		prober = nil
		worker.Logger.Warn("warning: channel probe disabled (neither catalog nor workspace configured)")
	}
	// 并发闸门：原先每任务直接起 goroutine、**无上限**，一次批量提交就会同时
	// 打满上游配额并耗尽本进程连接/内存。容量可配，默认 8。
	// 配额与限流：QPS 令牌桶 + 日/月成本上限（默认 QPS 宽松、成本不限制）
	quotaCfg := quota.FromEnv(os.Getenv)
	quotaLimiter := quota.New(quotaCfg, auditStore)
	worker.Logger.Info("配额配置", "qps", quotaCfg.QPS, "burst", quotaCfg.Burst, "daily_cost_limit", quotaCfg.DailyCostLimit, "monthly_cost_limit", quotaCfg.MonthlyCostLimit)

	maxConcurrent := envInt("EXECUTION_MAX_CONCURRENT_JOBS", 8)
	gate := job.NewSemaphore(maxConcurrent)
	worker.Logger.Info("worker 并发上限", "cap", gate.Cap())
	go worker.Run(store, catalogClient, credsClient, engineClient, gate, auditStore)

	// D6：审计保留期清理。**默认关闭**（天数未设置 = 0）—— 清理是破坏性操作，
	// 在没有人类显式配置之前不启动，避免"部署一次就默默删掉历史审计"。
	successDays := envInt("EXECUTION_AUDIT_RETENTION_DAYS", 0)
	failureDays := envInt("EXECUTION_AUDIT_FAILURE_RETENTION_DAYS", 0)
	if successDays > 0 || failureDays > 0 {
		purgeInterval := envDuration("EXECUTION_AUDIT_PURGE_INTERVAL", 24*time.Hour)
		worker.Logger.Info("审计保留期清理已启用", "success_days", successDays, "failure_days", failureDays, "interval", purgeInterval.String())
		go worker.RunAuditPurger(auditStore, successDays, failureDays, purgeInterval)
	} else {
		worker.Logger.Info("execution: 审计保留期清理【未启用】（需显式设置 EXECUTION_AUDIT_RETENTION_DAYS / EXECUTION_AUDIT_FAILURE_RETENTION_DAYS）")
	}
	// 产物落盘（TASK-ASSET-001）：配置了 ASSET_BASE_URL/ASSET_INTERNAL_TOKEN 才启用。
	// 下载上游 URL 走与模型网关同一套 netguard SSRF 防护；调 asset 内部 API 用普通 client
	// （内网目标，套防护会自断链路）。
	var artifactClient *artifact.Client
	if assetBaseURL := os.Getenv("ASSET_BASE_URL"); assetBaseURL != "" {
		assetToken := os.Getenv("ASSET_INTERNAL_TOKEN")
		if assetToken == "" {
			worker.Logger.Error("ASSET_INTERNAL_TOKEN must be set when ASSET_BASE_URL is set")
			os.Exit(1)
		}
		artifactClient = &artifact.Client{
			AssetBaseURL: assetBaseURL,
			Token:        assetToken,
			AssetHTTP:    &http.Client{Timeout: 60 * time.Second},
			Downloader:   upstreamPolicy.NewClient(120 * time.Second),
			CheckURL:     upstreamPolicy.CheckURL,
			MaxBytes:     artifact.DefaultMaxBytes,
		}
		worker.Logger.Info("artifact persist enabled", "asset_base_url", assetBaseURL)
	}
	// T0 价格校准台账：对账端点（POST /internal/v1/reconcile）写入 price_calibration_logs
	reconcileStore := &reconcile.Store{Pool: pool}
	metrics := observability.NewMetrics()
	observed := observability.WithObservability(worker.Logger, metrics)(httpapi.Handler{Store: store, Token: token, Ready: pool.Ping, Catalog: catalogClient, Creds: credsClient, EngineClient: engineClient, AuditStore: auditStore, Quota: quotaLimiter, Probe: prober, Artifacts: artifactClient, ReconcileStore: reconcileStore}.Routes())
	server := &http.Server{Addr: addr, Handler: observed, ReadHeaderTimeout: 5 * time.Second}
	worker.Logger.Info("execution service listening", "addr", addr)
	if err := server.ListenAndServe(); err != nil {
		worker.Logger.Error("execution server stopped", slog.Any("err", err))
		os.Exit(1)
	}
}

// envDuration 读一个 time.Duration 环境变量（如 24h / 30m）；非法或未设置时取默认值。
// 装配配置读取工具收敛在 cmd（BE-LAYER-002：cmd 负责配置装配）。
func envDuration(key string, def time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil && d > 0 {
			return d
		}
	}
	return def
}

func envInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return def
}
