// Package httpserver 承载 web-bff 的全部 HTTP 语义：上游代理 handler、
// 工作区授权守卫、链路 ID 透传与响应工具。
//
// 高内聚：所有 handler/守卫/工具收敛在本包；cmd/server 只做装配
// （BE-LAYER-002：cmd 只装配，不含业务）。
package httpserver

import (
	"errors"
	"net/http"
	"time"

	"shotdesigner/shared/observability"
)

// errAuthorizationDenied 表示工作区授权被上游明确拒绝（403）。
var errAuthorizationDenied = errors.New("workspace authorization denied")

type server struct {
	httpClient                                                                                                                               *http.Client
	workspaceURL, productionURL, assetURL, executionURL, workspaceToken, productionToken, assetToken, executionToken, devWorkspace, devActor string
}

// Config 是构造 Server 的装配参数（由 cmd 读环境变量提供）。
type Config struct {
	WorkspaceURL, ProductionURL, AssetURL, ExecutionURL         string
	WorkspaceToken, ProductionToken, AssetToken, ExecutionToken string
	DevWorkspace, DevActor                                      string
}

// New 构造 Server。装配校验（内部 token 非空）收敛在构造函数内，
// cmd/main 只负责读环境变量并调用，不在装配层堆业务校验。
func New(cfg Config) (*server, error) {
	if cfg.WorkspaceToken == "" || cfg.ProductionToken == "" || cfg.AssetToken == "" || cfg.ExecutionToken == "" {
		return nil, errors.New("workspace/production/asset/execution internal tokens must be set")
	}
	return &server{
		httpClient:      &http.Client{Timeout: 300 * time.Second, Transport: requestIDTransport{base: http.DefaultTransport}},
		workspaceURL:    cfg.WorkspaceURL,
		productionURL:   cfg.ProductionURL,
		assetURL:        cfg.AssetURL,
		executionURL:    cfg.ExecutionURL,
		workspaceToken:  cfg.WorkspaceToken,
		productionToken: cfg.ProductionToken,
		assetToken:      cfg.AssetToken,
		executionToken:  cfg.ExecutionToken,
		devWorkspace:    cfg.DevWorkspace,
		devActor:        cfg.DevActor,
	}, nil
}

// Routes 返回带全部路由与全局中间件的 Handler。
// 观测横切（logger/metrics）由 cmd 装配时包装（observability 属于装配层）。
func (s *server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /live", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	mux.HandleFunc("GET /ready", s.ready)
	mux.HandleFunc("/api/v1/comic-projects", s.projects)
	// The collection and detail endpoints share the same authorization and
	// trusted-context forwarding path.
	mux.HandleFunc("/api/v1/comic-projects/", s.projects)
	mux.HandleFunc("/api/v1/generation-intents", s.generationIntents)
	mux.HandleFunc("/api/v1/generation-intents/", s.generationIntents)
	mux.HandleFunc("/api/v1/assets", s.assets)
	mux.HandleFunc("/api/v1/assets/", s.assets)
	mux.HandleFunc("/api/v1/tasks", s.tasks)
	mux.HandleFunc("/api/v1/tasks/", s.tasks)
	mux.HandleFunc("/api/v1/audit/logs", s.auditLogs)
	mux.HandleFunc("/api/v1/audit/export", s.auditExport)
	// T2 运营报表聚合（成本看板数据源）：透传 execution /internal/v1/audit/stats[/trend]
	mux.HandleFunc("/api/v1/audit/stats", s.auditStatsProxy)
	mux.HandleFunc("/api/v1/audit/stats/trend", s.auditTrendProxy)
	// T11 渠道健康面板：供给单元健康聚合 + 告警配置（透传 execution）
	mux.HandleFunc("/api/v1/audit/health", s.auditHealthProxy)
	mux.HandleFunc("/api/v1/alerts/config", s.alertConfigProxy)
	mux.HandleFunc("/api/v1/generate", s.generate)
	mux.HandleFunc("/api/v1/channels/", s.channelProbe)
	// 更具体的模式优先于上面的 "/api/v1/channels/"（Go 1.22 ServeMux 的最具体匹配）
	mux.HandleFunc("POST /api/v1/channels/{id}/sync", s.channelSync)
	mux.HandleFunc("/api/v1/catalog", s.catalogProxy)
	mux.HandleFunc("/api/v1/catalog/", s.catalogProxy)
	mux.HandleFunc("/api/v1/rule-templates", s.ruleTemplates)
	mux.HandleFunc("/api/v1/rule-templates/", s.ruleTemplates)
	mux.HandleFunc("/api/v1/logical-models", s.logicalModels)
	mux.HandleFunc("/api/v1/logical-models/", s.logicalModels)
	mux.HandleFunc("/api/v1/workspace/credentials", s.workspaceCredentials)
	mux.HandleFunc("/api/v1/workspace/credentials/", s.workspaceCredentials)
	mux.HandleFunc("/api/v1/workspace/channels", s.workspaceChannels)
	mux.HandleFunc("/api/v1/workspace/channels/", s.workspaceChannels)
	// T3 预算规则（TASK-MODEL-005）：透传 workspace /internal/v1/workspaces/{ws}/budget/rules
	mux.HandleFunc("/api/v1/workspace/budget", s.workspaceBudget)
	mux.HandleFunc("/api/v1/workspace/budget/", s.workspaceBudget)
	return withTimeout(mux)
}

// requestIDTransport 自动把 context 中的 request_id 注入每个上游请求头
// （BFF 是所有内部服务的唯一入口，负责链路 ID 的生成与透传；
//
//	各 handler 无需逐处复制 header —— RoundTrip 统一处理）。
type requestIDTransport struct{ base http.RoundTripper }

func (t requestIDTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if rid := observability.RequestIDFrom(req.Context()); rid != "" {
		req.Header.Set(observability.HeaderRequestID, rid)
	}
	return t.base.RoundTrip(req)
}
