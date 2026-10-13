package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"shotdesigner/shared/observability"
	"strings"
	"time"
)

type server struct {
	httpClient                                                                                                                               *http.Client
	workspaceURL, productionURL, assetURL, executionURL, workspaceToken, productionToken, assetToken, executionToken, devWorkspace, devActor string
}

var errAuthorizationDenied = errors.New("workspace authorization denied")

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

func main() {
	logger := observability.NewJSONLogger("web-bff")
	s := &server{httpClient: &http.Client{Timeout: 300 * time.Second, Transport: requestIDTransport{base: http.DefaultTransport}}, workspaceURL: env("BFF_WORKSPACE_URL", "http://workspace:8082"), productionURL: env("BFF_PRODUCTION_URL", "http://production:8081"), assetURL: env("BFF_ASSET_URL", "http://asset:8084"), executionURL: env("BFF_EXECUTION_URL", "http://execution:8085"), workspaceToken: os.Getenv("WORKSPACE_INTERNAL_TOKEN"), productionToken: os.Getenv("PRODUCTION_INTERNAL_TOKEN"), assetToken: os.Getenv("ASSET_INTERNAL_TOKEN"), executionToken: os.Getenv("EXECUTION_INTERNAL_TOKEN"), devWorkspace: env("BFF_DEV_WORKSPACE_ID", "ws_dev"), devActor: env("BFF_DEV_ACTOR_ID", "user_dev")}
	if s.workspaceToken == "" || s.productionToken == "" || s.assetToken == "" || s.executionToken == "" {
		logger.Error("WORKSPACE_INTERNAL_TOKEN, PRODUCTION_INTERNAL_TOKEN, ASSET_INTERNAL_TOKEN and EXECUTION_INTERNAL_TOKEN must be set")
		os.Exit(1)
	}
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
	addr := env("BFF_LISTEN_ADDR", "0.0.0.0:8080")
	metrics := observability.NewMetrics()
	handler := observability.WithObservability(logger, metrics)(withTimeout(mux))
	logger.Info("web bff listening", "addr", addr)
	if err := (&http.Server{Addr: addr, Handler: handler, ReadHeaderTimeout: 5 * time.Second}).ListenAndServe(); err != nil {
		logger.Error("web bff server stopped", slog.Any("err", err))
		os.Exit(1)
	}
}

func (s *server) generationIntents(w http.ResponseWriter, r *http.Request) {
	if !strings.HasPrefix(r.URL.Path, "/api/v1/generation-intents") {
		http.NotFound(w, r)
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	if err := s.authorize(r.Context()); err != nil {
		if errors.Is(err, errAuthorizationDenied) {
			writeError(w, 403, "FORBIDDEN", "workspace authorization failed")
		} else {
			writeError(w, 503, "UPSTREAM_UNAVAILABLE", "workspace authorization unavailable")
		}
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 512*1024+4096))
	if err != nil {
		writeError(w, 400, "INVALID_BODY", "invalid body")
		return
	}
	path := strings.TrimPrefix(r.URL.Path, "/api/v1")
	upstreamPath := "/internal/v1" + path
	if r.URL.RawQuery != "" {
		upstreamPath += "?" + r.URL.RawQuery
	}
	req, err := http.NewRequestWithContext(r.Context(), r.Method, s.productionURL+upstreamPath, bytes.NewReader(body))
	if err != nil {
		writeError(w, 500, "REQUEST_FAILED", "request failed")
		return
	}
	req.Header.Set("Authorization", "Bearer "+s.productionToken)
	req.Header.Set("X-Workspace-Id", s.devWorkspace)
	req.Header.Set("X-Actor-Id", s.devActor)
	for _, key := range []string{"Content-Type", "Idempotency-Key"} {
		if value := r.Header.Get(key); value != "" {
			req.Header.Set(key, value)
		}
	}
	if r.Method == http.MethodPost && r.Header.Get("Idempotency-Key") == "" {
		req.Header.Set("Idempotency-Key", newKey())
	}
	resp, err := s.httpClient.Do(req)
	if err != nil {
		writeError(w, 503, "UPSTREAM_UNAVAILABLE", "production service unavailable")
		return
	}
	defer resp.Body.Close()
	copyHeaders(w.Header(), resp.Header)
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

// channelProbe forwards the real connectivity check to the execution service,
// which owns the single probe implementation (TASK-INFRA-004).
//
// 请求体被**刻意忽略**：base URL 只由 execution 从服务端来源解析
// （工作区用户渠道定义 / 凭据行 / 平台目录）。此前 BFF 接受 body 里的 baseUrl
// 并直接在边缘发起请求，这正是 SSRF 面的来源。
func (s *server) channelProbe(w http.ResponseWriter, r *http.Request) {
	if !strings.HasPrefix(r.URL.Path, "/api/v1/channels/") || !strings.HasSuffix(r.URL.Path, "/probe") {
		http.NotFound(w, r)
		return
	}
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	if err := s.authorize(r.Context()); err != nil {
		if errors.Is(err, errAuthorizationDenied) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "workspace authorization failed")
		} else {
			writeError(w, http.StatusServiceUnavailable, "UPSTREAM_UNAVAILABLE", "workspace authorization unavailable")
		}
		return
	}
	channelID := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/v1/channels/"), "/probe")
	if channelID == "" {
		writeError(w, http.StatusBadRequest, "INVALID_PATH", "channel id is required")
		return
	}
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost,
		s.executionURL+"/internal/v1/channels/"+url.PathEscape(channelID)+"/probe", nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "REQUEST_FAILED", "request failed")
		return
	}
	req.Header.Set("Authorization", "Bearer "+s.executionToken)
	req.Header.Set("X-Workspace-Id", s.devWorkspace)
	req.Header.Set("X-Actor-Id", s.devActor)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "UPSTREAM_UNAVAILABLE", "execution service unavailable")
		return
	}
	defer resp.Body.Close()
	copyHeaders(w.Header(), resp.Header)
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

// channelSync 触发一次上游模型目录同步（① 的第①步）—— 转发到 production 的内部同步接口。
//
// 为什么要【透传上游状态码】而不是一律折成 500：同步有四种可区分的失败 ——
// 未配置同步(400) / 渠道不存在(404) / 上游抓取失败(502) / 同步器未装配(503)。
// 折成一个码，运营在界面上就分不清"是我没配"还是"是上游坏了"。
// 这也是本项目反复强调的：错误必须可归因。
func (s *server) channelSync(w http.ResponseWriter, r *http.Request) {
	channelID := r.PathValue("id")
	if channelID == "" {
		writeError(w, http.StatusBadRequest, "INVALID_PATH", "channel id is required")
		return
	}
	if err := s.authorize(r.Context()); err != nil {
		if errors.Is(err, errAuthorizationDenied) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "workspace authorization failed")
		} else {
			writeError(w, http.StatusServiceUnavailable, "UPSTREAM_UNAVAILABLE", "workspace authorization unavailable")
		}
		return
	}
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost,
		s.productionURL+"/internal/v1/channels/"+url.PathEscape(channelID)+"/sync", nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "REQUEST_FAILED", "request failed")
		return
	}
	req.Header.Set("Authorization", "Bearer "+s.productionToken)
	req.Header.Set("X-Workspace-Id", s.devWorkspace)
	req.Header.Set("X-Actor-Id", s.devActor)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "UPSTREAM_UNAVAILABLE", "production service unavailable")
		return
	}
	defer resp.Body.Close()
	copyHeaders(w.Header(), resp.Header)
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

// workspaceChannels forwards user-scoped channel CRUD (tenant-owned, NOT the
// platform catalog) to the workspace service, rewriting
// /api/v1/workspace/channels[...] onto the internal channels[...] shape.
func (s *server) workspaceChannels(w http.ResponseWriter, r *http.Request) {
	if !strings.HasPrefix(r.URL.Path, "/api/v1/workspace/channels") {
		http.NotFound(w, r)
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodPut && r.Method != http.MethodDelete {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	if err := s.authorize(r.Context()); err != nil {
		if errors.Is(err, errAuthorizationDenied) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "workspace authorization failed")
		} else {
			writeError(w, http.StatusServiceUnavailable, "UPSTREAM_UNAVAILABLE", "workspace authorization unavailable")
		}
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 256*1024+4096))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "invalid body")
		return
	}
	rel := strings.TrimPrefix(r.URL.Path, "/api/v1/workspace/channels")
	upstreamPath := "/internal/v1/workspaces/" + s.devWorkspace + "/channels" + rel
	req, err := http.NewRequestWithContext(r.Context(), r.Method, s.workspaceURL+upstreamPath, bytes.NewReader(body))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "REQUEST_FAILED", "request failed")
		return
	}
	req.Header.Set("Authorization", "Bearer "+s.workspaceToken)
	req.Header.Set("X-Workspace-Id", s.devWorkspace)
	req.Header.Set("X-Actor-Id", s.devActor)
	if value := r.Header.Get("Content-Type"); value != "" {
		req.Header.Set("Content-Type", value)
	}
	resp, err := s.httpClient.Do(req)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "UPSTREAM_UNAVAILABLE", "workspace service unavailable")
		return
	}
	defer resp.Body.Close()
	copyHeaders(w.Header(), resp.Header)
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

// workspaceCredentials forwards credential write/read/delete to the workspace
// service, rewriting /api/v1/workspace/credentials[...] onto the internal
// /internal/v1/workspaces/{workspace_id}/credentials[...] shape.
func (s *server) workspaceCredentials(w http.ResponseWriter, r *http.Request) {
	if !strings.HasPrefix(r.URL.Path, "/api/v1/workspace/credentials") {
		http.NotFound(w, r)
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodPut && r.Method != http.MethodDelete {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	if err := s.authorize(r.Context()); err != nil {
		if errors.Is(err, errAuthorizationDenied) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "workspace authorization failed")
		} else {
			writeError(w, http.StatusServiceUnavailable, "UPSTREAM_UNAVAILABLE", "workspace authorization unavailable")
		}
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 256*1024+4096))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "invalid body")
		return
	}
	rel := strings.TrimPrefix(r.URL.Path, "/api/v1/workspace/credentials")
	upstreamPath := "/internal/v1/workspaces/" + s.devWorkspace + "/credentials" + rel
	req, err := http.NewRequestWithContext(r.Context(), r.Method, s.workspaceURL+upstreamPath, bytes.NewReader(body))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "REQUEST_FAILED", "request failed")
		return
	}
	req.Header.Set("Authorization", "Bearer "+s.workspaceToken)
	req.Header.Set("X-Workspace-Id", s.devWorkspace)
	req.Header.Set("X-Actor-Id", s.devActor)
	if value := r.Header.Get("Content-Type"); value != "" {
		req.Header.Set("Content-Type", value)
	}
	resp, err := s.httpClient.Do(req)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "UPSTREAM_UNAVAILABLE", "workspace service unavailable")
		return
	}
	defer resp.Body.Close()
	copyHeaders(w.Header(), resp.Header)
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

// catalogProxy forwards the model directory CRUD to the production service
// (platform-shared default directory). Paths align 1:1 with production routes.
func (s *server) catalogProxy(w http.ResponseWriter, r *http.Request) {
	if !strings.HasPrefix(r.URL.Path, "/api/v1/catalog") {
		http.NotFound(w, r)
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodPost && r.Method != http.MethodPut && r.Method != http.MethodDelete {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	if err := s.authorize(r.Context()); err != nil {
		if errors.Is(err, errAuthorizationDenied) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "production authorization failed")
		} else {
			writeError(w, http.StatusServiceUnavailable, "UPSTREAM_UNAVAILABLE", "production authorization unavailable")
		}
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 256*1024+4096))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "invalid body")
		return
	}
	rel := strings.TrimPrefix(r.URL.Path, "/api/v1/catalog")
	upstreamPath := "/internal/v1/catalog" + rel
	// ★ 保留查询串：本仓其它 9 个代理都做了这件事，唯独这里漏了 ——
	//   后果是 /api/v1/catalog/supply?channel_id=… 到上游后变成"没带 channel_id"，
	//   用户看到 400 MISSING_CHANNEL（是我的新接口把它暴露出来的）。
	if r.URL.RawQuery != "" {
		upstreamPath += "?" + r.URL.RawQuery
	}
	req, err := http.NewRequestWithContext(r.Context(), r.Method, s.productionURL+upstreamPath, bytes.NewReader(body))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "REQUEST_FAILED", "request failed")
		return
	}
	req.Header.Set("Authorization", "Bearer "+s.productionToken)
	req.Header.Set("X-Workspace-Id", s.devWorkspace)
	req.Header.Set("X-Actor-Id", s.devActor)
	if value := r.Header.Get("Content-Type"); value != "" {
		req.Header.Set("Content-Type", value)
	}
	resp, err := s.httpClient.Do(req)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "UPSTREAM_UNAVAILABLE", "production service unavailable")
		return
	}
	defer resp.Body.Close()
	copyHeaders(w.Header(), resp.Header)
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

// ruleTemplates forwards the rule template CRUD to the production service.
func (s *server) ruleTemplates(w http.ResponseWriter, r *http.Request) {
	if !strings.HasPrefix(r.URL.Path, "/api/v1/rule-templates") {
		http.NotFound(w, r)
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodPost && r.Method != http.MethodPatch && r.Method != http.MethodDelete {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	if err := s.authorize(r.Context()); err != nil {
		if errors.Is(err, errAuthorizationDenied) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "production authorization failed")
		} else {
			writeError(w, http.StatusServiceUnavailable, "UPSTREAM_UNAVAILABLE", "production authorization unavailable")
		}
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 2*1024*1024))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "invalid body")
		return
	}
	rel := strings.TrimPrefix(r.URL.Path, "/api/v1/rule-templates")
	upstreamPath := "/internal/v1/rule-templates" + rel
	if r.URL.RawQuery != "" {
		upstreamPath += "?" + r.URL.RawQuery
	}
	req, err := http.NewRequestWithContext(r.Context(), r.Method, s.productionURL+upstreamPath, bytes.NewReader(body))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "REQUEST_FAILED", "request failed")
		return
	}
	req.Header.Set("Authorization", "Bearer "+s.productionToken)
	req.Header.Set("X-Workspace-Id", s.devWorkspace)
	req.Header.Set("X-Actor-Id", s.devActor)
	if value := r.Header.Get("Content-Type"); value != "" {
		req.Header.Set("Content-Type", value)
	}
	resp, err := s.httpClient.Do(req)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "UPSTREAM_UNAVAILABLE", "production service unavailable")
		return
	}
	defer resp.Body.Close()
	copyHeaders(w.Header(), resp.Header)
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

// logicalModels forwards the logical model CRUD and candidate bindings to the
// production service. Paths align 1:1 with production routes, so the business
// status codes and error codes produced there (400 ID_IMMUTABLE,
// 409 MODEL_ALREADY_BOUND, 404 MODEL_NOT_FOUND / CANDIDATE_NOT_FOUND) reach the
// browser unchanged.
func (s *server) logicalModels(w http.ResponseWriter, r *http.Request) {
	if !strings.HasPrefix(r.URL.Path, "/api/v1/logical-models") {
		http.NotFound(w, r)
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodPost && r.Method != http.MethodPatch && r.Method != http.MethodDelete {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	if err := s.authorize(r.Context()); err != nil {
		if errors.Is(err, errAuthorizationDenied) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "production authorization failed")
		} else {
			writeError(w, http.StatusServiceUnavailable, "UPSTREAM_UNAVAILABLE", "production authorization unavailable")
		}
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 256*1024+4096))
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "invalid body")
		return
	}
	rel := strings.TrimPrefix(r.URL.Path, "/api/v1/logical-models")
	upstreamPath := "/internal/v1/logical-models" + rel
	if r.URL.RawQuery != "" {
		upstreamPath += "?" + r.URL.RawQuery
	}
	req, err := http.NewRequestWithContext(r.Context(), r.Method, s.productionURL+upstreamPath, bytes.NewReader(body))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "REQUEST_FAILED", "request failed")
		return
	}
	req.Header.Set("Authorization", "Bearer "+s.productionToken)
	req.Header.Set("X-Workspace-Id", s.devWorkspace)
	req.Header.Set("X-Actor-Id", s.devActor)
	if value := r.Header.Get("Content-Type"); value != "" {
		req.Header.Set("Content-Type", value)
	}
	resp, err := s.httpClient.Do(req)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "UPSTREAM_UNAVAILABLE", "production service unavailable")
		return
	}
	defer resp.Body.Close()
	copyHeaders(w.Header(), resp.Header)
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

func (s *server) ready(w http.ResponseWriter, r *http.Request) {
	if err := s.check(r.Context(), s.workspaceURL+"/ready", s.workspaceToken); err != nil {
		http.Error(w, "workspace unavailable", 503)
		return
	}
	if err := s.check(r.Context(), s.productionURL+"/ready", s.productionToken); err != nil {
		http.Error(w, "production unavailable", 503)
		return
	}
	if err := s.check(r.Context(), s.assetURL+"/ready", s.assetToken); err != nil {
		http.Error(w, "asset unavailable", 503)
		return
	}
	if err := s.check(r.Context(), s.executionURL+"/ready", s.executionToken); err != nil {
		http.Error(w, "execution unavailable", 503)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) tasks(w http.ResponseWriter, r *http.Request) {
	if !strings.HasPrefix(r.URL.Path, "/api/v1/tasks") {
		http.NotFound(w, r)
		return
	}
	allowed := r.Method == http.MethodGet || r.Method == http.MethodPost
	if strings.HasSuffix(r.URL.Path, "/cancel") || strings.HasSuffix(r.URL.Path, "/retry") {
		allowed = r.Method == http.MethodPost
	}
	if !allowed {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	if err := s.authorize(r.Context()); err != nil {
		if errors.Is(err, errAuthorizationDenied) {
			writeError(w, 403, "FORBIDDEN", "workspace authorization failed")
		} else {
			writeError(w, 503, "UPSTREAM_UNAVAILABLE", "workspace authorization unavailable")
		}
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 2*1024*1024+4096))
	if err != nil {
		writeError(w, 400, "INVALID_BODY", "invalid body")
		return
	}
	path := strings.TrimPrefix(r.URL.Path, "/api/v1")
	upstreamPath := "/internal/v1" + path
	if r.URL.RawQuery != "" {
		upstreamPath += "?" + r.URL.RawQuery
	}
	req, err := http.NewRequestWithContext(r.Context(), r.Method, s.executionURL+upstreamPath, bytes.NewReader(body))
	if err != nil {
		writeError(w, 500, "REQUEST_FAILED", "request failed")
		return
	}
	req.Header.Set("Authorization", "Bearer "+s.executionToken)
	req.Header.Set("X-Workspace-Id", s.devWorkspace)
	req.Header.Set("X-Actor-Id", s.devActor)
	for _, key := range []string{"Content-Type", "Content-Length", "Idempotency-Key"} {
		if value := r.Header.Get(key); value != "" {
			req.Header.Set(key, value)
		}
	}
	if r.Method == http.MethodPost && r.Header.Get("Idempotency-Key") == "" && strings.TrimSuffix(path, "/") == "/tasks" {
		req.Header.Set("Idempotency-Key", newKey())
	}
	resp, err := s.httpClient.Do(req)
	if err != nil {
		writeError(w, 503, "UPSTREAM_UNAVAILABLE", "execution service unavailable")
		return
	}
	defer resp.Body.Close()
	copyHeaders(w.Header(), resp.Header)
	// 任务状态查询禁止缓存，确保前端轮询时始终拿到最新数据
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

// generate forwards unified model gateway requests to execution /v1/generate.
func (s *server) generate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	if err := s.authorize(r.Context()); err != nil {
		if errors.Is(err, errAuthorizationDenied) {
			writeError(w, 403, "FORBIDDEN", "workspace authorization failed")
		} else {
			writeError(w, 503, "UPSTREAM_UNAVAILABLE", "workspace authorization unavailable")
		}
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 2*1024*1024+4096))
	if err != nil {
		writeError(w, 400, "INVALID_BODY", "invalid body")
		return
	}
	upstreamPath := "/v1/generate"
	if r.URL.RawQuery != "" {
		upstreamPath += "?" + r.URL.RawQuery
	}
	req, err := http.NewRequestWithContext(r.Context(), r.Method, s.executionURL+upstreamPath, bytes.NewReader(body))
	if err != nil {
		writeError(w, 500, "REQUEST_FAILED", "request failed")
		return
	}
	req.Header.Set("Authorization", "Bearer "+s.executionToken)
	req.Header.Set("X-Workspace-Id", s.devWorkspace)
	req.Header.Set("X-Actor-Id", s.devActor)
	for _, key := range []string{"Content-Type", "Content-Length"} {
		if value := r.Header.Get(key); value != "" {
			req.Header.Set(key, value)
		}
	}
	resp, err := s.httpClient.Do(req)
	if err != nil {
		writeError(w, 503, "UPSTREAM_UNAVAILABLE", "execution service unavailable")
		return
	}
	defer resp.Body.Close()
	copyHeaders(w.Header(), resp.Header)
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

// auditExport 转发审计导出到 execution /internal/v1/audit/export（④ D8b）。
// 与 auditLogs 的区别：不解析/不裁剪响应体，只透传状态码、Content-Type、
// Content-Disposition 与流（导出可能是大响应，不做缓冲）。
func (s *server) auditExport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	if err := s.authorize(r.Context()); err != nil {
		if errors.Is(err, errAuthorizationDenied) {
			writeError(w, 403, "FORBIDDEN", "workspace authorization failed")
		} else {
			writeError(w, 503, "UPSTREAM_UNAVAILABLE", "workspace authorization unavailable")
		}
		return
	}
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet,
		s.executionURL+"/internal/v1/audit/export?"+r.URL.RawQuery, nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "REQUEST_FAILED", "request failed")
		return
	}
	req.Header.Set("Authorization", "Bearer "+s.executionToken)
	req.Header.Set("X-Workspace-Id", s.devWorkspace)
	req.Header.Set("X-Actor-Id", s.devActor)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "UPSTREAM_UNAVAILABLE", "execution service unavailable")
		return
	}
	defer resp.Body.Close()
	copyHeaders(w.Header(), resp.Header)
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

// auditLogs forwards audit log queries to execution /internal/v1/audit/logs.
func (s *server) auditLogs(w http.ResponseWriter, r *http.Request) {
	s.auditGetProxy("/internal/v1/audit/logs", w, r)
}

// auditStatsProxy 转发 T2 运营报表排行到 execution /internal/v1/audit/stats。
func (s *server) auditStatsProxy(w http.ResponseWriter, r *http.Request) {
	s.auditGetProxy("/internal/v1/audit/stats", w, r)
}

// auditTrendProxy 转发 T2 时间序列到 execution /internal/v1/audit/stats/trend。
func (s *server) auditTrendProxy(w http.ResponseWriter, r *http.Request) {
	s.auditGetProxy("/internal/v1/audit/stats/trend", w, r)
}

// auditGetProxy 是审计读端点的通用透传（logs/stats/trend 共用同一守卫与转发逻辑，
// 只换上游路径；与 auditExport 的区别：不解析响应体，只透传状态码与流）。
func (s *server) auditGetProxy(upstreamPath string, w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	if err := s.authorize(r.Context()); err != nil {
		if errors.Is(err, errAuthorizationDenied) {
			writeError(w, 403, "FORBIDDEN", "workspace authorization failed")
		} else {
			writeError(w, 503, "UPSTREAM_UNAVAILABLE", "workspace authorization unavailable")
		}
		return
	}
	if r.URL.RawQuery != "" {
		upstreamPath += "?" + r.URL.RawQuery
	}
	req, err := http.NewRequestWithContext(r.Context(), r.Method, s.executionURL+upstreamPath, nil)
	if err != nil {
		writeError(w, 500, "REQUEST_FAILED", "request failed")
		return
	}
	req.Header.Set("Authorization", "Bearer "+s.executionToken)
	req.Header.Set("X-Workspace-Id", s.devWorkspace)
	req.Header.Set("X-Actor-Id", s.devActor)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		writeError(w, 503, "UPSTREAM_UNAVAILABLE", "execution service unavailable")
		return
	}
	defer resp.Body.Close()
	copyHeaders(w.Header(), resp.Header)
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

func (s *server) assets(w http.ResponseWriter, r *http.Request) {
	if !strings.HasPrefix(r.URL.Path, "/api/v1/assets") {
		http.NotFound(w, r)
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodPost && r.Method != http.MethodPut {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	if err := s.authorize(r.Context()); err != nil {
		if errors.Is(err, errAuthorizationDenied) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "workspace authorization failed")
		} else {
			writeError(w, http.StatusServiceUnavailable, "UPSTREAM_UNAVAILABLE", "workspace authorization unavailable")
		}
		return
	}
	path := strings.TrimPrefix(r.URL.Path, "/api/v1")
	upstreamPath := "/internal/v1" + path
	if r.URL.RawQuery != "" {
		upstreamPath += "?" + r.URL.RawQuery
	}
	req, err := http.NewRequestWithContext(r.Context(), r.Method, s.assetURL+upstreamPath, r.Body)
	if err != nil {
		writeError(w, 500, "REQUEST_FAILED", "request failed")
		return
	}
	req.Header.Set("Authorization", "Bearer "+s.assetToken)
	req.Header.Set("X-Workspace-Id", s.devWorkspace)
	req.Header.Set("X-Actor-Id", s.devActor)
	for _, key := range []string{"Content-Type", "Content-Length", "Idempotency-Key"} {
		if value := r.Header.Get(key); value != "" {
			req.Header.Set(key, value)
		}
	}
	resp, err := s.httpClient.Do(req)
	if err != nil {
		writeError(w, 503, "UPSTREAM_UNAVAILABLE", "asset service unavailable")
		return
	}
	defer resp.Body.Close()
	copyHeaders(w.Header(), resp.Header)
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

func (s *server) projects(w http.ResponseWriter, r *http.Request) {
	if !strings.HasPrefix(r.URL.Path, "/api/v1/comic-projects") {
		http.NotFound(w, r)
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodPost && r.Method != http.MethodDelete && r.Method != http.MethodPatch {
		http.Error(w, "method not allowed", 405)
		return
	}
	if err := s.authorize(r.Context()); err != nil {
		if errors.Is(err, errAuthorizationDenied) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "workspace authorization failed")
		} else {
			writeError(w, http.StatusServiceUnavailable, "UPSTREAM_UNAVAILABLE", "workspace authorization unavailable")
		}
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 2*1024*1024+4096))
	if err != nil {
		http.Error(w, "invalid body", 400)
		return
	}
	path := strings.TrimPrefix(r.URL.Path, "/api/v1")
	upstreamPath := "/internal/v1" + path
	if r.URL.RawQuery != "" {
		upstreamPath += "?" + r.URL.RawQuery
	}
	req, err := http.NewRequestWithContext(r.Context(), r.Method, s.productionURL+upstreamPath, bytes.NewReader(body))
	if err != nil {
		http.Error(w, "request failed", 500)
		return
	}
	req.Header.Set("Authorization", "Bearer "+s.productionToken)
	req.Header.Set("X-Workspace-Id", s.devWorkspace)
	req.Header.Set("X-Actor-Id", s.devActor)
	if key := r.Header.Get("Idempotency-Key"); key != "" {
		req.Header.Set("Idempotency-Key", key)
	} else if r.Method == http.MethodPost {
		req.Header.Set("Idempotency-Key", newKey())
	}
	if r.Method == http.MethodPost || r.Method == http.MethodPatch {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := s.httpClient.Do(req)
	if err != nil {
		writeError(w, 503, "UPSTREAM_UNAVAILABLE", "project service unavailable")
		return
	}
	defer resp.Body.Close()
	copyHeaders(w.Header(), resp.Header)
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

func (s *server) authorize(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.workspaceURL+"/internal/v1/workspaces/"+s.devWorkspace+"/authorize?actor_id="+s.devActor, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+s.workspaceToken)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusForbidden {
		return errAuthorizationDenied
	}
	if resp.StatusCode >= 300 {
		return errors.New("workspace authorization upstream failure")
	}
	return nil
}
func (s *server) check(ctx context.Context, url, token string) error {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return io.EOF
	}
	return nil
}
func withTimeout(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 全局禁用缓存：所有API响应都不允许浏览器/代理缓存，确保轮询任务始终拿到最新数据
		w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
		// 与 httpClient(180s) 对齐：tasks 同步测试会真实等待上游文本/图片生成（可达 120s+）
		ctx, cancel := context.WithTimeout(r.Context(), 300*time.Second)
		defer cancel()
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
func copyHeaders(dst, src http.Header) {
	if v := src.Get("Content-Type"); v != "" {
		dst.Set("Content-Type", v)
	}
	if v := src.Get("Location"); v != "" {
		dst.Set("Location", v)
	}
	// 导出类响应需要它：否则浏览器拿不到文件名（D8b 实测：缺此条时 CSV 仍能下载，
	// 但文件名退化为 URL 末段）。
	if v := src.Get("Content-Disposition"); v != "" {
		dst.Set("Content-Disposition", v)
	}
}
func writeError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"code": code, "message": message})
}
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func newKey() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	return "bff_" + hex.EncodeToString(b[:])
}
func env(k, fallback string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return fallback
}
