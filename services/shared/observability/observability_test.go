package observability

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// NewJSONLogger：默认 Info 级别；LOG_LEVEL=debug 时开 Debug；自动注入 service 字段。
func TestNewJSONLogger(t *testing.T) {
	t.Setenv("LOG_LEVEL", "")
	l := NewJSONLogger("test-svc")
	if l == nil {
		t.Fatal("NewJSONLogger returned nil")
	}

	t.Setenv("LOG_LEVEL", "debug")
	if NewJSONLogger("test-svc") == nil {
		t.Fatal("debug 级别应正常创建")
	}
}

// WithRequestID / RequestIDFrom：写入后可读回，未写入时返回空串。
func TestRequestIDContext(t *testing.T) {
	if got := RequestIDFrom(context.Background()); got != "" {
		t.Fatalf("空 context 应返回空串，got %q", got)
	}
	ctx := WithRequestID(context.Background(), "rid-123")
	if got := RequestIDFrom(ctx); got != "rid-123" {
		t.Fatalf("RequestIDFrom = %q, want rid-123", got)
	}
}

// 中间件：生成 request_id 并回写响应头；记录请求日志；/metrics 短路。
func TestWithObservabilityGeneratesRequestID(t *testing.T) {
	m := NewMetrics()
	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	handler := WithObservability(discardLogger(), m)(inner)

	req := httptest.NewRequest(http.MethodGet, "/internal/v1/ping", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", rec.Code)
	}
	if rid := rec.Header().Get(HeaderRequestID); rid == "" {
		t.Fatal("X-Request-ID 未生成")
	} else if len(rid) != 32 {
		t.Fatalf("request_id = %q, want 32 hex chars", rid)
	}
}

// 中间件：上游已透传 request_id 时沿用（不重新生成）。
func TestWithObservabilityPreservesUpstreamRequestID(t *testing.T) {
	m := NewMetrics()
	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	handler := WithObservability(discardLogger(), m)(inner)

	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set(HeaderRequestID, "upstream-rid")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if got := rec.Header().Get(HeaderRequestID); got != "upstream-rid" {
		t.Fatalf("request_id = %q, want 沿用 upstream-rid", got)
	}
}

// 中间件：隐式 200（未 WriteHeader）按 200 记录，指标可查。
func TestWithObservabilityImplicit200Recorded(t *testing.T) {
	m := NewMetrics()
	inner := http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}) // 不写状态码
	handler := WithObservability(discardLogger(), m)(inner)

	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/implicit", nil))

	m.mu.Lock()
	defer m.mu.Unlock()
	if m.totals["GET|/implicit|200"] != 1 {
		t.Fatalf("implicit 200 未按 200 记录: %v", m.totals)
	}
	if m.durCount["GET|/implicit"] != 1 {
		t.Fatalf("duration 未记录: %v", m.durCount)
	}
}

// /metrics：输出 Prometheus text 格式且含 http_requests_total / go_goroutines。
func TestMetricsHandlerOutput(t *testing.T) {
	m := NewMetrics()
	m.Observe("GET", "/internal/v1/items", 200, 15*time.Millisecond)
	m.Observe("POST", "/internal/v1/items", 422, 8*time.Millisecond)
	m.Observe("GET", "/internal/v1/items", 200, 5*time.Millisecond)

	handler := WithObservability(discardLogger(), m)(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, HeaderMetricsURL, nil))

	body := rec.Body.String()
	if rec.Code != http.StatusOK {
		t.Fatalf("metrics status = %d", rec.Code)
	}
	for _, want := range []string{
		`http_requests_total{method="GET",path="/internal/v1/items",status="200"} 2`,
		`http_requests_total{method="POST",path="/internal/v1/items",status="422"} 1`,
		`http_request_duration_seconds_sum{method="GET",path="/internal/v1/items"}`,
		"go_goroutines ",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("metrics 缺 %q\n---\n%s", want, body)
		}
	}
}

// 并发安全：多 goroutine 同时 Observe 不丢计数。
func TestMetricsConcurrentObserve(t *testing.T) {
	m := NewMetrics()
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				m.Observe("GET", "/c", 200, time.Millisecond)
			}
		}()
	}
	wg.Wait()
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.totals["GET|/c|200"] != 5000 {
		t.Fatalf("并发计数 = %d, want 5000", m.totals["GET|/c|200"])
	}
}
