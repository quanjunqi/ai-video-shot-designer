// Package app 承载 execution 服务的**装配**（BE-LAYER-002：cmd/ 只装配，
// 「装配校验收敛在构造函数」）。
//
// 为什么单独成包（TASK-PROC-006）：
//
//	原 `cmd/server/main.go` 184 行里，1-28 行是 import、166-184 行是两个 env 读取工具，
//	中间 135 行全是「读 env + 构造 14 个依赖 + 启 worker/HTTP」。
//	**该文件没有任何业务逻辑/SQL/handler 实现** —— 它不是"业务堆在 cmd"，
//	而是"单个装配文件超行数上限"。故本卡只做**搬移**，不删任何装配与校验。
//
// 行为不变是硬要求（验收判据 5/8）：环境变量名、默认值、启动顺序、
// 日志文案、os.Exit 语义全部逐条照搬。改文案会让运维既有的告警与检索失效。
package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"time"

	"shotdesigner/services/execution/internal/alert"
	"shotdesigner/services/execution/internal/artifact"
	"shotdesigner/services/execution/internal/audit"
	"shotdesigner/services/execution/internal/breaker"
	"shotdesigner/services/execution/internal/budget"
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

// Getenv 是环境读取的注入点（生产传 os.Getenv；测试传 map 查找）。
type Getenv func(string) string

// Config 是装配所需的全部配置（逐字段对应原 main 中读取的环境变量）。
type Config struct {
	DSN             string
	Token           string
	ProductionURL   string
	ProductionToken string
	WorkspaceURL    string
	WorkspaceToken  string
	Addr            string
	MaxConcurrent   int
	AuditSuccess    int
	AuditFailure    int
	PurgeInterval   time.Duration
	AssetBaseURL    string
	AssetToken      string
}

// ConfigFromEnv 读环境变量并套默认值。**默认值与原 main 完全一致**：
// addr=0.0.0.0:8085、maxConcurrent=8、保留期清理默认关闭（0 天）、清理间隔 24h。
func ConfigFromEnv() Config {
	addr := os.Getenv("EXECUTION_LISTEN_ADDR")
	if addr == "" {
		addr = "0.0.0.0:8085"
	}
	return Config{
		DSN:             os.Getenv("EXECUTION_DATABASE_URL"),
		Token:           os.Getenv("EXECUTION_INTERNAL_TOKEN"),
		ProductionURL:   os.Getenv("EXECUTION_PRODUCTION_URL"),
		ProductionToken: os.Getenv("PRODUCTION_INTERNAL_TOKEN"),
		WorkspaceURL:    os.Getenv("EXECUTION_WORKSPACE_URL"),
		WorkspaceToken:  os.Getenv("WORKSPACE_INTERNAL_TOKEN"),
		Addr:            addr,
		MaxConcurrent:   envInt("EXECUTION_MAX_CONCURRENT_JOBS", 8),
		AuditSuccess:    envInt("EXECUTION_AUDIT_RETENTION_DAYS", 0),
		AuditFailure:    envInt("EXECUTION_AUDIT_FAILURE_RETENTION_DAYS", 0),
		PurgeInterval:   envDuration("EXECUTION_AUDIT_PURGE_INTERVAL", 24*time.Hour),
		AssetBaseURL:    os.Getenv("ASSET_BASE_URL"),
		AssetToken:      os.Getenv("ASSET_INTERNAL_TOKEN"),
	}
}

// App 持有装配结果。Start 起后台协程，ListenAndServe 阻塞，Close 释放连接池。
type App struct {
	cfg     Config
	pool    *pgxpool.Pool
	handler http.Handler

	// Start 起后台协程所需的依赖（装配结果，不在此重复构造）。
	store         job.Store
	auditStore    *audit.Store
	catalogClient *catalog.Client
	credsClient   *creds.Client
	engineClient  *http.Client
	gate          *job.Semaphore
	breakerStore  *breaker.Store
	budgetHolds   budget.HoldsStore
	alertEval     *alert.Evaluator
}

// New 完成全部依赖构造与装配校验。
//
// ★ 失败时的**日志与原文案逐字一致**，且已在此处打出（main 只负责 os.Exit(1)）——
// 这样既不把文案拆到两个文件，也不给原本无字段的日志多加字段。
func New(ctx context.Context, cfg Config, getenv Getenv) (*App, error) {
	if cfg.DSN == "" || cfg.Token == "" {
		worker.Logger.Error("EXECUTION_DATABASE_URL and EXECUTION_INTERNAL_TOKEN must be set")
		return nil, ErrMissingRequired
	}
	pool, err := pgxpool.New(ctx, cfg.DSN)
	if err != nil {
		worker.Logger.Error("pgxpool init failed", slog.Any("err", err))
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		worker.Logger.Error("db ping failed", slog.Any("err", err))
		return nil, err
	}

	store := job.Store{Pool: pool}
	auditStore := &audit.Store{Pool: pool}

	var catalogClient *catalog.Client
	var credsClient *creds.Client
	if cfg.ProductionURL != "" && cfg.ProductionToken != "" {
		catalogClient = catalog.NewClient(cfg.ProductionURL, cfg.ProductionToken)
	}
	if cfg.WorkspaceURL != "" && cfg.WorkspaceToken != "" {
		credsClient = creds.NewClient(cfg.WorkspaceURL, cfg.WorkspaceToken)
	}
	if catalogClient == nil || credsClient == nil {
		worker.Logger.Warn("execution engine partial config; /run unavailable", "catalog", catalogClient != nil, "creds", credsClient != nil)
	}

	// 模型网关的 client 会请求「渠道凭据里的 base_url」——该 URL 由用户提供，
	// 因此必须带 SSRF 防护（见 internal/netguard 的威胁模型说明）。
	// 注意：catalog/creds 的内部调用走各自的 client，目标是私网内部服务，
	// **不能**套用本防护，否则会自断链路。
	upstreamPolicy := netguard.FromEnv(getenv)
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
	quotaCfg := quota.FromEnv(getenv)
	quotaLimiter := quota.New(quotaCfg, auditStore)
	worker.Logger.Info("配额配置", "qps", quotaCfg.QPS, "burst", quotaCfg.Burst, "daily_cost_limit", quotaCfg.DailyCostLimit, "monthly_cost_limit", quotaCfg.MonthlyCostLimit)

	// T3 预算（TASK-MODEL-005）：请求前校验 + 预扣/结算状态机。
	// 规则来自 workspace（workspaceURL/token 未配置时预算关闭 —— fail-open 语义，
	// 不拦截任何请求；配置后立即生效）。预算系统故障也 fail-open（放行 + 审计标记）。
	var budgetChecker *budget.Checker
	var budgetHolds budget.HoldsStore = &budget.Store{Pool: pool}
	if cfg.WorkspaceURL != "" && cfg.WorkspaceToken != "" {
		budgetClient := budget.NewWorkspaceClient(cfg.WorkspaceURL, cfg.WorkspaceToken)
		budgetChecker = budget.NewChecker(budgetClient, auditStore, worker.Logger)
		worker.Logger.Info("预算校验已启用", "rules_source", "workspace")
	} else {
		worker.Logger.Warn("预算校验【未启用】（需 EXECUTION_WORKSPACE_URL / WORKSPACE_INTERNAL_TOKEN）")
	}

	gate := job.NewSemaphore(cfg.MaxConcurrent)
	worker.Logger.Info("worker 并发上限", "cap", gate.Cap())

	// T4 单元熔断（TASK-ROUTE-003）：channel_health 表 + 原子计数 + 半开单飞。
	// 配置收敛在装配层（BE-CFG）；默认启用（LiteLLM 档位：3 → 60s → 30s），
	// 误伤可 EXECUTION_CIRCUIT_BREAKER=off 一键关闭（fail-open）。
	breakerCfg := breaker.FromEnv(getenv)
	breakerStore := breaker.New(pool, breakerCfg, worker.Logger)
	worker.Logger.Info("单元熔断配置", "enabled", breakerCfg.Enabled(), "allowed_fails", breakerCfg.AllowedFails, "cooldown", breakerCfg.Cooldown.String(), "health_check", breakerCfg.HealthCheck.String())

	// T11 最小告警（TASK-OBS-002）：错误率突增/熔断/同步失败 → webhook。
	// 配置存 alert_config（018）；webhook 客户端简单 POST + 3 重试。
	// 告警是 best-effort：评估/发送失败只记日志，不阻断任务主流程。
	alertStore := alert.New(pool, worker.Logger)
	alertWebhook := alert.NewWebhookClient(worker.Logger)
	alertEval := alert.NewEvaluator(alertStore, alertWebhook, worker.Logger)

	// 产物落盘（TASK-ASSET-001）：配置了 ASSET_BASE_URL/ASSET_INTERNAL_TOKEN 才启用。
	// 下载上游 URL 走与模型网关同一套 netguard SSRF 防护；调 asset 内部 API 用普通 client
	// （内网目标，套防护会自断链路）。
	var artifactClient *artifact.Client
	if cfg.AssetBaseURL != "" {
		if cfg.AssetToken == "" {
			pool.Close()
			worker.Logger.Error("ASSET_INTERNAL_TOKEN must be set when ASSET_BASE_URL is set")
			return nil, ErrMissingAssetToken
		}
		artifactClient = &artifact.Client{
			AssetBaseURL: cfg.AssetBaseURL,
			Token:        cfg.AssetToken,
			AssetHTTP:    &http.Client{Timeout: 60 * time.Second},
			Downloader:   upstreamPolicy.NewClient(120 * time.Second),
			CheckURL:     upstreamPolicy.CheckURL,
			MaxBytes:     artifact.DefaultMaxBytes,
		}
		worker.Logger.Info("artifact persist enabled", "asset_base_url", cfg.AssetBaseURL)
	}

	// T0 价格校准台账：对账端点（POST /internal/v1/reconcile）写入 price_calibration_logs
	reconcileStore := &reconcile.Store{Pool: pool}
	metrics := observability.NewMetrics()
	h := httpapi.Handler{
		Store: store, Token: cfg.Token, Ready: pool.Ping,
		Catalog: catalogClient, Creds: credsClient, EngineClient: engineClient,
		AuditStore: auditStore, Quota: quotaLimiter, Probe: prober,
		Artifacts: artifactClient, ReconcileStore: reconcileStore,
		Breaker: breakerStore, Budget: budgetChecker, BudgetHolds: budgetHolds,
		Alert: alertEval,
	}
	return &App{
		cfg:           cfg,
		pool:          pool,
		handler:       observability.WithObservability(worker.Logger, metrics)(h.Routes()),
		store:         store,
		auditStore:    auditStore,
		catalogClient: catalogClient,
		credsClient:   credsClient,
		engineClient:  engineClient,
		gate:          gate,
		breakerStore:  breakerStore,
		budgetHolds:   budgetHolds,
		alertEval:     alertEval,
	}, nil
}

// Start 起后台协程（worker / 保留期清理），语义与顺序同原 main。
func (a *App) Start() {
	go worker.Run(a.store, a.catalogClient, a.credsClient, a.engineClient, a.gate,
		a.auditStore, a.breakerStore, a.budgetHolds, a.alertEval)

	// D6：审计保留期清理。**默认关闭**（天数未设置 = 0）—— 清理是破坏性操作，
	// 在没有人类显式配置之前不启动，避免"部署一次就默默删掉历史审计"。
	if a.cfg.AuditSuccess > 0 || a.cfg.AuditFailure > 0 {
		worker.Logger.Info("审计保留期清理已启用", "success_days", a.cfg.AuditSuccess, "failure_days", a.cfg.AuditFailure, "interval", a.cfg.PurgeInterval.String())
		go worker.RunAuditPurger(a.auditStore, a.cfg.AuditSuccess, a.cfg.AuditFailure, a.cfg.PurgeInterval)
	} else {
		worker.Logger.Info("execution: 审计保留期清理【未启用】（需显式设置 EXECUTION_AUDIT_RETENTION_DAYS / EXECUTION_AUDIT_FAILURE_RETENTION_DAYS）")
	}
}

// ListenAndServe 阻塞至退出。**不在此打日志** —— 由 main 按原文案打
// "execution server stopped"（保持日志逐字一致）。
func (a *App) ListenAndServe() error {
	server := &http.Server{Addr: a.cfg.Addr, Handler: a.handler, ReadHeaderTimeout: 5 * time.Second}
	worker.Logger.Info("execution service listening", "addr", a.cfg.Addr)
	return server.ListenAndServe()
}

// Close 释放连接池。
func (a *App) Close() {
	if a.pool != nil {
		a.pool.Close()
	}
}

// envDuration 读一个 time.Duration 环境变量（如 24h / 30m）；非法或未设置时取默认值。
//
// ★ 签名与实现**照搬原 cmd/server**（直接读 os.Getenv，不收 getenv 参数）——
// 这样随业务迁来的既有测试（原 cmd/server/main_test.go，现 app_test.go）
// 只需换包名即可继续锁定同一条不变量：**保留期配置只认正数** ⇒ 清理默认关闭。
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

// 装配失败的类型化信号（日志已在 New 内按原文案打出，main 只需退出）。
var (
	ErrMissingRequired   = errApp("EXECUTION_DATABASE_URL and EXECUTION_INTERNAL_TOKEN must be set")
	ErrMissingAssetToken = errApp("ASSET_INTERNAL_TOKEN must be set when ASSET_BASE_URL is set")
)

type errApp string

func (e errApp) Error() string { return string(e) }
