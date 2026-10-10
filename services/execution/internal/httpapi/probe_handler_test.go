package httpapi

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"shotdesigner/services/execution/internal/catalog"
	"shotdesigner/services/execution/internal/creds"
	"shotdesigner/services/execution/internal/netguard"
	"shotdesigner/services/execution/internal/probe"
)

// probeFixture 组装一条完整的执行链：HTTP 路由 → probe → 三方替身
// （workspace 用户渠道/凭据、production 目录、被探测的上游）。
type probeFixture struct {
	handler http.Handler
	target  *httptest.Server
	mu      sync.Mutex
	hits    int
	ua      string
}

func (f *probeFixture) snapshot() (int, string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.hits, f.ua
}

// newProbeFixture 构造替身：工作区用户渠道 comfy 指向 target。两个替身服务
// 刻意不读请求体 —— 执行端也不读。
func newProbeFixture(t *testing.T, policy netguard.Policy) *probeFixture {
	t.Helper()
	f := &probeFixture{}
	f.target = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		f.hits++
		f.ua = r.Header.Get("User-Agent")
		f.mu.Unlock()
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(f.target.Close)

	workspace := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.HasSuffix(r.URL.Path, "/channels"):
			_, _ = fmt.Fprintf(w, `{"items":[{"id":"comfy","kind":"local","baseUrl":%q,"authType":"none"}]}`, f.target.URL)
		case strings.HasSuffix(r.URL.Path, "/credentials"):
			_, _ = w.Write([]byte(`{"items":[]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(workspace.Close)
	production := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"models":[],"templates":[],"channels":[]}`))
	}))
	t.Cleanup(production.Close)

	prober := probe.New(
		catalog.NewClient(production.URL, "prod-token"),
		creds.NewClient(workspace.URL, "ws-token"),
		policy, 2*time.Second,
	)
	f.handler = Handler{Store: &fakeStore{}, Token: "test-token", Probe: prober}.Routes()
	return f
}

// TestProbeRouteIgnoresBodyBaseURL 锁定 SSRF 面的消除：请求体里带着任意地址
// （这里用云元数据地址 —— 任何策略下都必须拒绝）时，执行端**完全不看请求体**，
// 只用服务端来源解析出的地址，并且确实探测了那个地址。
func TestProbeRouteIgnoresBodyBaseURL(t *testing.T) {
	f := newProbeFixture(t, netguard.Policy{AllowPrivate: true})

	r := executionRequest(http.MethodPost, "/internal/v1/channels/comfy/probe",
		`{"baseUrl":"http://169.254.169.254/latest/meta-data/","authType":"bearer"}`)
	w := httptest.NewRecorder()
	f.handler.ServeHTTP(w, r)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), `"reachable":true`) {
		t.Fatalf("应以服务端配置的地址探测成功，实际 %s", w.Body.String())
	}
	if hits, _ := f.snapshot(); hits != 1 {
		t.Fatalf("应探测服务端配置的地址一次，实际 %d", hits)
	}
	if strings.Contains(w.Body.String(), "169.254") {
		t.Fatalf("请求体里的地址不得进入探测: %s", w.Body.String())
	}
}

// TestProbeRouteRequiresAuthAndWorkspaceContext：内部端点必须鉴权且必须有租户上下文。
func TestProbeRouteRequiresAuthAndWorkspaceContext(t *testing.T) {
	f := newProbeFixture(t, netguard.Policy{AllowPrivate: true})

	r := executionRequest(http.MethodPost, "/internal/v1/channels/comfy/probe", "")
	r.Header.Del("Authorization")
	w := httptest.NewRecorder()
	f.handler.ServeHTTP(w, r)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}

	r = executionRequest(http.MethodPost, "/internal/v1/channels/comfy/probe", "")
	r.Header.Del("X-Workspace-Id")
	w = httptest.NewRecorder()
	f.handler.ServeHTTP(w, r)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 without workspace context, got %d", w.Code)
	}
	if hits, _ := f.snapshot(); hits != 0 {
		t.Fatalf("未通过鉴权/上下文时不得发起探测，实际 %d 次", hits)
	}
}

// TestProbeRouteUnavailableWhenNotConfigured：未装配 prober 时如实返回 503。
func TestProbeRouteUnavailableWhenNotConfigured(t *testing.T) {
	h := Handler{Store: &fakeStore{}, Token: "test-token"}.Routes()
	r := executionRequest(http.MethodPost, "/internal/v1/channels/comfy/probe", "")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusServiceUnavailable || !strings.Contains(w.Body.String(), "PROBE_UNAVAILABLE") {
		t.Fatalf("expected 503 PROBE_UNAVAILABLE, got %d body=%s", w.Code, w.Body.String())
	}
}

// TestProbeRouteUnknownChannelReturns404：渠道在目录与工作区都不存在时 404。
func TestProbeRouteUnknownChannelReturns404(t *testing.T) {
	f := newProbeFixture(t, netguard.Policy{AllowPrivate: true})
	r := executionRequest(http.MethodPost, "/internal/v1/channels/nope/probe", "")
	w := httptest.NewRecorder()
	f.handler.ServeHTTP(w, r)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d body=%s", w.Code, w.Body.String())
	}
}

// TestProbeRouteReportsPolicyDenialInDetail：判据 3 的 HTTP 侧 ——
// 默认策略下私网目标必须在 detail 里说清「被策略拒绝」+ 放开方式。
func TestProbeRouteReportsPolicyDenialInDetail(t *testing.T) {
	f := newProbeFixture(t, netguard.Policy{})
	r := executionRequest(http.MethodPost, "/internal/v1/channels/comfy/probe", "")
	w := httptest.NewRecorder()
	f.handler.ServeHTTP(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("策略拒绝是结果而非执行失败，expected 200, got %d", w.Code)
	}
	body := w.Body.String()
	if !strings.Contains(body, "策略拒绝") || !strings.Contains(body, "EXECUTION_ALLOW_PRIVATE_UPSTREAM=1") {
		t.Fatalf("detail 必须说明策略拒绝与放开方式: %s", body)
	}
	if hits, _ := f.snapshot(); hits != 0 {
		t.Fatalf("策略拒绝必须发生在连接之前，实际命中 %d 次", hits)
	}
}
