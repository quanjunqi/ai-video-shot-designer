package observability

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net/http"
	"time"
)

// 请求链路与租户上下文的透传 header（与 docs/how-to/observability.md 一致）。
const (
	HeaderRequestID  = "X-Request-ID"
	HeaderWorkspace  = "X-Workspace-Id"
	HeaderActor      = "X-Actor-Id"
	HeaderMetricsURL = "/metrics"
)

// ctxKey 是 request_id 在 context 中的私有键。
type ctxKey struct{}

// WithRequestID 把 request_id 写入 context（供下游 http.Client 透传）。
func WithRequestID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, ctxKey{}, id)
}

// RequestIDFrom 从 context 读取 request_id；无则返回空串。
func RequestIDFrom(ctx context.Context) string {
	id, _ := ctx.Value(ctxKey{}).(string)
	return id
}

// newRequestID 生成 16 字节随机 hex（32 字符），无第三方依赖。
func newRequestID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		// crypto/rand 失败近乎不可能；兜底用时间戳保证唯一性。
		return hex.EncodeToString([]byte(time.Now().Format("20060102150405.000000000")))
	}
	return hex.EncodeToString(b)
}

// statusRecorder 包装 ResponseWriter 以捕获实际状态码（含 WriteHeader 幂等处理）。
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	if r.status != 0 {
		return // 已写过状态码（Go 的隐式 200 也经 WriteHeader 幂等保护）
	}
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

// WithObservability 返回请求观测中间件：
//   - 生成/透传 request_id（X-Request-ID），并回写响应头供下游透传；
//   - 提取 workspace_id（X-Workspace-Id）、actor_id（X-Actor-Id）；
//   - 每条请求记录 Info 级结构化日志（method/path/status/latency_ms）；
//   - 记录 Prometheus 指标（http_requests_total / http_request_duration_seconds）；
//   - GET /metrics 直接输出指标（不经过业务 handler）。
func WithObservability(logger *slog.Logger, m *Metrics) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == HeaderMetricsURL {
				m.Handler().ServeHTTP(w, r)
				return
			}
			start := time.Now()

			// request_id：上游已透传则沿用，否则生成；回写响应头供下游透传。
			requestID := r.Header.Get(HeaderRequestID)
			if requestID == "" {
				requestID = newRequestID()
				r.Header.Set(HeaderRequestID, requestID)
			}
			w.Header().Set(HeaderRequestID, requestID)
			r = r.WithContext(WithRequestID(r.Context(), requestID))

			rec := &statusRecorder{ResponseWriter: w}
			next.ServeHTTP(rec, r)

			status := rec.status
			if status == 0 {
				status = http.StatusOK // 未显式 WriteHeader 的 200
			}
			latency := time.Since(start)
			m.Observe(r.Method, r.URL.Path, status, latency)

			logger.Info("http_request",
				slog.String("method", r.Method),
				slog.String("path", r.URL.Path),
				slog.Int("status", status),
				slog.Int64("latency_ms", latency.Milliseconds()),
				slog.String("request_id", requestID),
				slog.String("workspace_id", r.Header.Get(HeaderWorkspace)),
				slog.String("actor_id", r.Header.Get(HeaderActor)),
			)
		})
	}
}
