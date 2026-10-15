package httpserver

import (
	"errors"
	"io"
	"net/http"
)

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
	defer func() { _ = resp.Body.Close() }()
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

// auditHealthProxy 转发 T11 供给单元健康聚合到 execution /internal/v1/audit/health。
// 健康面板数据源（错误码分布 + 成功率 + 熔断状态）。
func (s *server) auditHealthProxy(w http.ResponseWriter, r *http.Request) {
	s.auditGetProxy("/internal/v1/audit/health", w, r)
}

// alertConfigProxy 转发 T11 告警配置读写到 execution（GET 读 / PUT 写）。
// 与 auditGetProxy 的差异：支持 PUT 与请求体透传。
func (s *server) alertConfigProxy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodPut {
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
	upstreamPath := "/internal/v1/alerts/config"
	var body io.Reader
	if r.Body != nil {
		body = r.Body
	}
	req, err := http.NewRequestWithContext(r.Context(), r.Method, s.executionURL+upstreamPath, body)
	if err != nil {
		writeError(w, 500, "REQUEST_FAILED", "request failed")
		return
	}
	if r.Method == http.MethodPut {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Authorization", "Bearer "+s.executionToken)
	req.Header.Set("X-Workspace-Id", s.devWorkspace)
	req.Header.Set("X-Actor-Id", s.devActor)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		writeError(w, 503, "UPSTREAM_UNAVAILABLE", "execution service unavailable")
		return
	}
	defer func() { _ = resp.Body.Close() }()
	copyHeaders(w.Header(), resp.Header)
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
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
	defer func() { _ = resp.Body.Close() }()
	copyHeaders(w.Header(), resp.Header)
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}
