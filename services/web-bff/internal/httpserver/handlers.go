package httpserver

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
)

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
	defer func() { _ = resp.Body.Close() }()
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
	defer func() { _ = resp.Body.Close() }()
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
	defer func() { _ = resp.Body.Close() }()
	// T11 同步失败告警：上游同步非 2xx（未配置 400 / 渠道不存在 404 / 抓取失败 502 / 未装配 503）
	// ⇒ 上报 execution 告警端点（异步 best-effort，不阻断同步响应）。
	if resp.StatusCode >= 400 {
		s.reportSyncFailure(r.Context(), channelID)
	}
	copyHeaders(w.Header(), resp.Header)
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

// reportSyncFailure 把渠道同步失败上报给 execution 告警端点（T11）。
// best-effort：execution 不可达或失败只记日志，不阻断同步响应（告警是附加能力）。
func (s *server) reportSyncFailure(ctx context.Context, channelID string) {
	body, err := json.Marshal(map[string]string{"channel_id": channelID})
	if err != nil {
		slog.Warn("reportSyncFailure marshal failed", "err", err)
		return
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		s.executionURL+"/internal/v1/alerts/sync-failure", bytes.NewReader(body))
	if err != nil {
		slog.Warn("reportSyncFailure request build failed", "err", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.executionToken)
	req.Header.Set("X-Workspace-Id", s.devWorkspace)
	req.Header.Set("X-Actor-Id", s.devActor)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		slog.Warn("reportSyncFailure upstream failed", "channel_id", channelID, "err", err)
		return
	}
	defer func() { _ = resp.Body.Close() }()
	_ = resp.Body
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
	if r.URL.RawQuery != "" {
		upstreamPath += "?" + r.URL.RawQuery
	}
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
	defer func() { _ = resp.Body.Close() }()
	copyHeaders(w.Header(), resp.Header)
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

// workspaceBudget forwards budget-rule CRUD to the workspace service, rewriting
// /api/v1/workspace/budget[...] onto the internal
// /internal/v1/workspaces/{workspace_id}/budget/rules[...] shape.
// 路由：GET 列表 / PUT 增改 / DELETE /budget/rules/{period}（工作区级规则）。
func (s *server) workspaceBudget(w http.ResponseWriter, r *http.Request) {
	if !strings.HasPrefix(r.URL.Path, "/api/v1/workspace/budget") {
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
	rel := strings.TrimPrefix(r.URL.Path, "/api/v1/workspace/budget")
	upstreamPath := "/internal/v1/workspaces/" + s.devWorkspace + "/budget" + rel
	if r.URL.RawQuery != "" {
		upstreamPath += "?" + r.URL.RawQuery
	}
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
	defer func() { _ = resp.Body.Close() }()
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
	defer func() { _ = resp.Body.Close() }()
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
	defer func() { _ = resp.Body.Close() }()
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
	defer func() { _ = resp.Body.Close() }()
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
	defer func() { _ = resp.Body.Close() }()
	copyHeaders(w.Header(), resp.Header)
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

func (s *server) ready(w http.ResponseWriter, r *http.Request) {
	if err := s.check(r.Context(), s.workspaceURL+"/ready", s.workspaceToken); err != nil {
		http.Error(w, "workspace unavailable", http.StatusServiceUnavailable)
		return
	}
	if err := s.check(r.Context(), s.productionURL+"/ready", s.productionToken); err != nil {
		http.Error(w, "production unavailable", http.StatusServiceUnavailable)
		return
	}
	if err := s.check(r.Context(), s.assetURL+"/ready", s.assetToken); err != nil {
		http.Error(w, "asset unavailable", http.StatusServiceUnavailable)
		return
	}
	if err := s.check(r.Context(), s.executionURL+"/ready", s.executionToken); err != nil {
		http.Error(w, "execution unavailable", http.StatusServiceUnavailable)
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
	defer func() { _ = resp.Body.Close() }()
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
	defer func() { _ = resp.Body.Close() }()
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
	defer func() { _ = resp.Body.Close() }()
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
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
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
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	path := strings.TrimPrefix(r.URL.Path, "/api/v1")
	upstreamPath := "/internal/v1" + path
	if r.URL.RawQuery != "" {
		upstreamPath += "?" + r.URL.RawQuery
	}
	req, err := http.NewRequestWithContext(r.Context(), r.Method, s.productionURL+upstreamPath, bytes.NewReader(body))
	if err != nil {
		http.Error(w, "request failed", http.StatusInternalServerError)
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
	defer func() { _ = resp.Body.Close() }()
	copyHeaders(w.Header(), resp.Header)
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}
