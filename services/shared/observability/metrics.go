package observability

import (
	"fmt"
	"net/http"
	"runtime"
	"sort"
	"sync"
	"time"
)

// Metrics 提供进程内 HTTP 请求指标累加器，输出标准 Prometheus text 格式。
// 零第三方依赖：计数器为 map + mutex，输出时排序保证确定性。
// 内部服务路由数量有限（单服务 ~40 条），按原始 path 记录不会构成高基数。
type Metrics struct {
	mu       sync.Mutex
	totals   map[string]int64 // key: method|path|status
	durSum   map[string]float64
	durCount map[string]int64
}

// NewMetrics 返回空指标累加器。
func NewMetrics() *Metrics {
	return &Metrics{
		totals:   make(map[string]int64),
		durSum:   make(map[string]float64),
		durCount: make(map[string]int64),
	}
}

// Observe 记录一次请求：method/path/status 计数 + 耗时（秒，供 summary 计算）。
func (m *Metrics) Observe(method, path string, status int, latency time.Duration) {
	secs := latency.Seconds()
	m.mu.Lock()
	defer m.mu.Unlock()
	k := method + "|" + path
	ks := fmt.Sprintf("%s|%s|%d", method, path, status)
	m.totals[ks]++
	m.durSum[k] += secs
	m.durCount[k]++
}

// Handler 输出 Prometheus text 格式指标（GET /metrics 用）。
func (m *Metrics) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		m.mu.Lock()
		totals := make([]string, 0, len(m.totals))
		for k, v := range m.totals {
			method, path, status := splitTotalKey(k)
			totals = append(totals, fmt.Sprintf(`http_requests_total{method="%s",path="%s",status="%s"} %d`, method, path, status, v))
		}
		sort.Strings(totals)
		durs := make([]string, 0, len(m.durSum))
		for k, sum := range m.durSum {
			method, path := splitDurKey(k)
			durs = append(durs,
				fmt.Sprintf(`http_request_duration_seconds_sum{method="%s",path="%s"} %g`, method, path, sum),
				fmt.Sprintf(`http_request_duration_seconds_count{method="%s",path="%s"} %d`, method, path, m.durCount[k]),
			)
		}
		sort.Strings(durs)
		m.mu.Unlock()

		var ms runtime.MemStats
		runtime.ReadMemStats(&ms)

		w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		fmt.Fprintln(w, "# HELP http_requests_total Total HTTP requests processed.")
		fmt.Fprintln(w, "# TYPE http_requests_total counter")
		for _, l := range totals {
			fmt.Fprintln(w, l)
		}
		fmt.Fprintln(w, "# HELP http_request_duration_seconds HTTP request latency.")
		fmt.Fprintln(w, "# TYPE http_request_duration_seconds summary")
		for _, l := range durs {
			fmt.Fprintln(w, l)
		}
		fmt.Fprintln(w, "# HELP go_goroutines Number of goroutines that currently exist.")
		fmt.Fprintln(w, "# TYPE go_goroutines gauge")
		fmt.Fprintf(w, "go_goroutines %d\n", runtime.NumGoroutine())
		fmt.Fprintln(w, "# HELP go_heap_bytes Current heap memory usage in bytes.")
		fmt.Fprintln(w, "# TYPE go_heap_bytes gauge")
		fmt.Fprintf(w, "go_heap_bytes %d\n", ms.HeapAlloc)
	})
}

// splitTotalKey 解析 "method|path|status" 键。
func splitTotalKey(k string) (method, path, status string) {
	i, j := indexByte(k, '|'), lastIndexByte(k, '|')
	return k[:i], k[i+1 : j], k[j+1:]
}

// splitDurKey 解析 "method|path" 键。
func splitDurKey(k string) (method, path string) {
	i := indexByte(k, '|')
	return k[:i], k[i+1:]
}

func indexByte(s string, b byte) int {
	for i := 0; i < len(s); i++ {
		if s[i] == b {
			return i
		}
	}
	return -1
}

func lastIndexByte(s string, b byte) int {
	for i := len(s) - 1; i >= 0; i-- {
		if s[i] == b {
			return i
		}
	}
	return -1
}
