package httpserver

import (
	"bytes"
	"errors"
	"io"
	"net/http"
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
	role, err := s.authorize(r)
	if err != nil {
		if errors.Is(err, errAuthorizationDenied) {
			writeError(w, 403, "FORBIDDEN", "workspace authorization failed")
		} else {
			writeError(w, 503, "UPSTREAM_UNAVAILABLE", "workspace authorization unavailable")
		}
		return
	}
	r = r.WithContext(withRole(r.Context(), role))
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
func (s *server) catalogProxy(w http.ResponseWriter, r *http.Request) {
	if !strings.HasPrefix(r.URL.Path, "/api/v1/catalog") {
		http.NotFound(w, r)
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodPost && r.Method != http.MethodPut && r.Method != http.MethodDelete {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	role, err := s.authorize(r)
	if err != nil {
		if errors.Is(err, errAuthorizationDenied) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "production authorization failed")
		} else {
			writeError(w, http.StatusServiceUnavailable, "UPSTREAM_UNAVAILABLE", "production authorization unavailable")
		}
		return
	}
	r = r.WithContext(withRole(r.Context(), role))
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
	role, err := s.authorize(r)
	if err != nil {
		if errors.Is(err, errAuthorizationDenied) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "production authorization failed")
		} else {
			writeError(w, http.StatusServiceUnavailable, "UPSTREAM_UNAVAILABLE", "production authorization unavailable")
		}
		return
	}
	r = r.WithContext(withRole(r.Context(), role))
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
	role, err := s.authorize(r)
	if err != nil {
		if errors.Is(err, errAuthorizationDenied) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "production authorization failed")
		} else {
			writeError(w, http.StatusServiceUnavailable, "UPSTREAM_UNAVAILABLE", "production authorization unavailable")
		}
		return
	}
	r = r.WithContext(withRole(r.Context(), role))
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
	role, err := s.authorize(r)
	if err != nil {
		if errors.Is(err, errAuthorizationDenied) {
			writeError(w, 403, "FORBIDDEN", "workspace authorization failed")
		} else {
			writeError(w, 503, "UPSTREAM_UNAVAILABLE", "workspace authorization unavailable")
		}
		return
	}
	r = r.WithContext(withRole(r.Context(), role))
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
	role, err := s.authorize(r)
	if err != nil {
		if errors.Is(err, errAuthorizationDenied) {
			writeError(w, 403, "FORBIDDEN", "workspace authorization failed")
		} else {
			writeError(w, 503, "UPSTREAM_UNAVAILABLE", "workspace authorization unavailable")
		}
		return
	}
	r = r.WithContext(withRole(r.Context(), role))
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
	role, err := s.authorize(r)
	if err != nil {
		if errors.Is(err, errAuthorizationDenied) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "workspace authorization failed")
		} else {
			writeError(w, http.StatusServiceUnavailable, "UPSTREAM_UNAVAILABLE", "workspace authorization unavailable")
		}
		return
	}
	r = r.WithContext(withRole(r.Context(), role))
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
	role, err := s.authorize(r)
	if err != nil {
		if errors.Is(err, errAuthorizationDenied) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "workspace authorization failed")
		} else {
			writeError(w, http.StatusServiceUnavailable, "UPSTREAM_UNAVAILABLE", "workspace authorization unavailable")
		}
		return
	}
	r = r.WithContext(withRole(r.Context(), role))
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
