package probe

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"shotdesigner/services/execution/internal/catalog"
	"shotdesigner/services/execution/internal/creds"
	"shotdesigner/services/execution/internal/netguard"
)

// ---- 替身 ----------------------------------------------------------------

// targetStub 是被探测的上游；记录命中数与最后一次请求头。
type targetStub struct {
	srv    *httptest.Server
	mu     sync.Mutex
	hits   int
	auth   string
	apiKey string
	ua     string
	path   string
}

func newTargetStub(t *testing.T) *targetStub {
	t.Helper()
	ts := &targetStub{}
	ts.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ts.mu.Lock()
		ts.hits++
		ts.auth = r.Header.Get("Authorization")
		ts.apiKey = r.Header.Get("X-API-Key")
		ts.ua = r.Header.Get("User-Agent")
		ts.path = r.URL.Path
		ts.mu.Unlock()
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(ts.srv.Close)
	return ts
}

func (ts *targetStub) snapshot() (hits int, auth, apiKey, ua, path string) {
	ts.mu.Lock()
	defer ts.mu.Unlock()
	return ts.hits, ts.auth, ts.apiKey, ts.ua, ts.path
}

// workspaceStub 是 workspace 内部端点的替身，记录被请求的路径
// （用来证明探测**从不**调用 reveal 取明文）。
type workspaceStub struct {
	srv      *httptest.Server
	channels string
	status   string
	mu       sync.Mutex
	paths    []string
}

func newWorkspaceStub(t *testing.T, channels, status string) *workspaceStub {
	t.Helper()
	ws := &workspaceStub{channels: channels, status: status}
	ws.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ws.mu.Lock()
		ws.paths = append(ws.paths, r.URL.Path)
		ws.mu.Unlock()
		if r.Header.Get("Authorization") != "Bearer ws-token" {
			http.Error(w, "unauthenticated", http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.HasSuffix(r.URL.Path, "/channels"):
			_, _ = w.Write([]byte(ws.channels))
		case strings.HasSuffix(r.URL.Path, "/credentials"):
			_, _ = w.Write([]byte(ws.status))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(ws.srv.Close)
	return ws
}

func (ws *workspaceStub) requestedPaths() []string {
	ws.mu.Lock()
	defer ws.mu.Unlock()
	return append([]string(nil), ws.paths...)
}

func (ws *workspaceStub) revealCalls() int {
	n := 0
	for _, p := range ws.requestedPaths() {
		if strings.HasSuffix(p, "/reveal") {
			n++
		}
	}
	return n
}

// catalogStub 是 production 目录的替身。
func newCatalogStub(t *testing.T, channelsJSON string) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer prod-token" {
			http.Error(w, "unauthenticated", http.StatusUnauthorized)
			return
		}
		if got := r.Header.Get("X-Workspace-Id"); got != "ws-1" {
			http.Error(w, "missing workspace context", http.StatusBadRequest)
			return
		}
		if got := r.Header.Get("X-Actor-Id"); got != "actor-1" {
			http.Error(w, "missing actor context", http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprintf(w, `{"models":[],"templates":[],"channels":%s}`, channelsJSON)
	}))
	t.Cleanup(srv.Close)
	return srv
}

func newProber(ws *workspaceStub, cat *httptest.Server, policy netguard.Policy) *Prober {
	var catalogClient *catalog.Client
	if cat != nil {
		catalogClient = catalog.NewClient(cat.URL, "prod-token")
	}
	var wsClient *creds.Client
	if ws != nil {
		wsClient = creds.NewClient(ws.srv.URL, "ws-token")
	}
	return New(catalogClient, wsClient, policy, 2*time.Second)
}

// ---- 判据 3：私网/环回目标被拒绝，且理由可读 ------------------------------

// TestProbeReportsPrivateTargetAsPolicyDenial 是本片选项 ③ 的核心用例：
// 目标被 netguard 拒绝时，结果必须**如实标注为策略拒绝**（并给出放开方式），
// 不得伪装成 reachable=false 的一般网络错误；而且必须在建立连接之前就拒绝。
func TestProbeReportsPrivateTargetAsPolicyDenial(t *testing.T) {
	target := newTargetStub(t)
	ws := newWorkspaceStub(t, fmt.Sprintf(
		`{"items":[{"id":"local-comfy","kind":"local","baseUrl":%q,"authType":"none"}]}`, target.srv.URL),
		`{"items":[]}`)
	cat := newCatalogStub(t, `[]`)

	// 默认策略：拒绝环回/私网。
	p := newProber(ws, cat, netguard.Policy{})
	out, err := p.Probe(context.Background(), "ws-1", "actor-1", "local-comfy")
	if err != nil {
		t.Fatalf("策略拒绝必须作为结果如实上报，而不是 error: %v", err)
	}
	if out.Reachable {
		t.Fatalf("被策略拒绝的目标不能报告为可达: %+v", out)
	}
	if !strings.Contains(out.Detail, "策略拒绝") {
		t.Fatalf("detail 必须说明是策略拒绝，实际 %q", out.Detail)
	}
	if !strings.Contains(out.Detail, "EXECUTION_ALLOW_PRIVATE_UPSTREAM=1") {
		t.Fatalf("detail 必须给出放开方式（EXECUTION_ALLOW_PRIVATE_UPSTREAM=1），实际 %q", out.Detail)
	}
	if strings.Contains(out.Detail, "网络不可达") {
		t.Fatalf("策略拒绝不得伪装成一般网络错误，实际 %q", out.Detail)
	}
	if out.StatusCode != 0 || out.AuthOK != nil {
		t.Fatalf("策略拒绝时不得带 statusCode/authOk: %+v", out)
	}
	if hits, _, _, _, _ := target.snapshot(); hits != 0 {
		t.Fatalf("策略拒绝必须发生在建立连接之前，但目标被命中 %d 次", hits)
	}
}

// TestProbeAllowPrivateReachesLocalChannel 是对照组：显式放开后同一目标必须可达 ——
// 证明「如实拒绝」不会把本地开发渠道永久弄坏。
func TestProbeAllowPrivateReachesLocalChannel(t *testing.T) {
	target := newTargetStub(t)
	ws := newWorkspaceStub(t, fmt.Sprintf(
		`{"items":[{"id":"local-comfy","kind":"local","baseUrl":%q,"authType":"none"}]}`, target.srv.URL),
		`{"items":[]}`)

	p := newProber(ws, newCatalogStub(t, `[]`), netguard.Policy{AllowPrivate: true})
	out, err := p.Probe(context.Background(), "ws-1", "actor-1", "local-comfy")
	if err != nil {
		t.Fatalf("Probe: %v", err)
	}
	if !out.Reachable || out.StatusCode != http.StatusOK {
		t.Fatalf("放开私网后本地渠道应可达: %+v", out)
	}
	if hits, _, _, _, _ := target.snapshot(); hits != 1 {
		t.Fatalf("应恰好探测一次，实际 %d", hits)
	}
}

// TestProbeAllowlistRejectionIsReportedAsPolicyDenial 覆盖 CheckURL 前置校验路径
// （主机不在白名单），同样必须如实标注策略拒绝。
func TestProbeAllowlistRejectionIsReportedAsPolicyDenial(t *testing.T) {
	target := newTargetStub(t)
	ws := newWorkspaceStub(t, fmt.Sprintf(
		`{"items":[{"id":"local-comfy","kind":"local","baseUrl":%q,"authType":"none"}]}`, target.srv.URL),
		`{"items":[]}`)

	p := newProber(ws, newCatalogStub(t, `[]`), netguard.Policy{AllowPrivate: true, AllowedHosts: []string{"api.example.com"}})
	out, err := p.Probe(context.Background(), "ws-1", "actor-1", "local-comfy")
	if err != nil {
		t.Fatalf("Probe: %v", err)
	}
	if out.Reachable || !strings.Contains(out.Detail, "策略拒绝") {
		t.Fatalf("白名单拒绝应如实上报: %+v", out)
	}
	if hits, _, _, _, _ := target.snapshot(); hits != 0 {
		t.Fatalf("白名单拒绝必须发生在建立连接之前，但目标被命中 %d 次", hits)
	}
}

// ---- 判据 4：用户渠道无需请求体即可探测 ------------------------------------

// TestProbeUserChannelResolvesWithoutRequestBody 覆盖实测里的
// POST /api/v1/channels/chan-muo4b9zo/probe（无 body）：base URL 必须能从
// workspace 用户渠道定义解析出来，而不是靠请求体。
func TestProbeUserChannelResolvesWithoutRequestBody(t *testing.T) {
	target := newTargetStub(t)
	ws := newWorkspaceStub(t, fmt.Sprintf(
		`{"items":[{"id":"chan-muo4b9zo","kind":"aggregator","baseUrl":%q,"authType":"bearer"}]}`, target.srv.URL),
		`{"items":[{"channelId":"chan-muo4b9zo","baseUrl":"","authType":"bearer","hasKey":true}]}`)

	p := newProber(ws, newCatalogStub(t, `[]`), netguard.Policy{AllowPrivate: true})
	out, err := p.Probe(context.Background(), "ws-1", "actor-1", "chan-muo4b9zo")
	if err != nil {
		t.Fatalf("Probe: %v", err)
	}
	if !out.Reachable || out.StatusCode != http.StatusOK {
		t.Fatalf("用户渠道（无请求体）应被真实探测: %+v", out)
	}
	if !out.AuthConfigured || out.AuthOK == nil || !*out.AuthOK {
		t.Fatalf("凭据存在时应带 authConfigured/authOk: %+v", out)
	}
	if hits, _, _, _, _ := target.snapshot(); hits != 1 {
		t.Fatalf("应恰好探测一次，实际 %d", hits)
	}
}

// TestProbeUsesPlaceholderCredentialAndNeverReveals 锁定「探测不发真实密钥」：
// 上游收到的只能是占位串，且探测过程中**从不**调用 reveal（不接触明文）。
func TestProbeUsesPlaceholderCredentialAndNeverReveals(t *testing.T) {
	target := newTargetStub(t)
	ws := newWorkspaceStub(t, fmt.Sprintf(
		`{"items":[{"id":"chan-x","kind":"aggregator","baseUrl":%q,"authType":"bearer"}]}`, target.srv.URL),
		`{"items":[{"channelId":"chan-x","baseUrl":"","authType":"bearer","hasKey":true}]}`)

	p := newProber(ws, newCatalogStub(t, `[]`), netguard.Policy{AllowPrivate: true})
	if _, err := p.Probe(context.Background(), "ws-1", "actor-1", "chan-x"); err != nil {
		t.Fatalf("Probe: %v", err)
	}
	hits, auth, _, ua, _ := target.snapshot()
	if hits != 1 {
		t.Fatalf("应恰好探测一次，实际 %d", hits)
	}
	if want := "Bearer " + placeholderSecret; auth != want {
		t.Fatalf("Authorization = %q, want 占位串 %q", auth, want)
	}
	if ua != UserAgent {
		t.Fatalf("User-Agent = %q, want %q", ua, UserAgent)
	}
	if n := ws.revealCalls(); n != 0 {
		t.Fatalf("探测不得调用 reveal 取明文密钥，实际调用 %d 次（路径 %v）", n, ws.requestedPaths())
	}
}

// ---- base URL 来源与优先级 -------------------------------------------------

// TestProbeBuiltinChannelFallsBackToCatalog：workspace 没有该渠道时，
// 内置渠道的地址来自平台目录（并带上 workspace/actor 上下文）。
func TestProbeBuiltinChannelFallsBackToCatalog(t *testing.T) {
	target := newTargetStub(t)
	ws := newWorkspaceStub(t, `{"items":[]}`, `{"items":[]}`)
	cat := newCatalogStub(t, fmt.Sprintf(`[{"id":"comfy","kind":"local","baseUrl":%q}]`, target.srv.URL))

	p := newProber(ws, cat, netguard.Policy{AllowPrivate: true})
	out, err := p.Probe(context.Background(), "ws-1", "actor-1", "comfy")
	if err != nil {
		t.Fatalf("Probe: %v", err)
	}
	if !out.Reachable {
		t.Fatalf("内置渠道应能从目录解析地址并探测: %+v", out)
	}
	if out.AuthConfigured {
		t.Fatalf("无凭据行时 authConfigured 必须为 false: %+v", out)
	}
}

// TestProbeUserChannelOverridesCatalogAndCredentialRow 锁定来源优先级：
// 用户渠道定义 > 凭据行 > 平台目录。
//
// 这是对任务卡 §3「内置渠道走 catalog」的一处**有意偏差**：前端把用户对
// 内置渠道的修改也写进 workspace 用户渠道域，并在合并时覆盖平台目录
// （apps/web/src/stores/useSettingsStore.ts upsertChannel），因此只有以用户
// 渠道定义为先，探测的才是用户实际看到、点「测试」的那个地址。
func TestProbeUserChannelOverridesCatalogAndCredentialRow(t *testing.T) {
	catalogTarget := newTargetStub(t)
	userTarget := newTargetStub(t)
	credTarget := newTargetStub(t)
	ws := newWorkspaceStub(t, fmt.Sprintf(
		`{"items":[{"id":"openai","kind":"official","baseUrl":%q,"authType":"bearer"}]}`, userTarget.srv.URL),
		fmt.Sprintf(`{"items":[{"channelId":"openai","baseUrl":%q,"authType":"bearer","hasKey":true}]}`, credTarget.srv.URL))
	cat := newCatalogStub(t, fmt.Sprintf(`[{"id":"openai","kind":"official","baseUrl":%q}]`, catalogTarget.srv.URL))

	p := newProber(ws, cat, netguard.Policy{AllowPrivate: true})
	if _, err := p.Probe(context.Background(), "ws-1", "actor-1", "openai"); err != nil {
		t.Fatalf("Probe: %v", err)
	}
	if hits, _, _, _, _ := userTarget.snapshot(); hits != 1 {
		t.Fatalf("应以工作区用户渠道定义的地址为准，userTarget hits=%d", hits)
	}
	if hits, _, _, _, _ := catalogTarget.snapshot(); hits != 0 {
		t.Fatalf("用户渠道覆盖时不得探测目录默认地址，catalogTarget hits=%d", hits)
	}
	if hits, _, _, _, _ := credTarget.snapshot(); hits != 0 {
		t.Fatalf("用户渠道覆盖时不得探测凭据行地址，credTarget hits=%d", hits)
	}
}

// TestProbeCredentialRowAddressUsedWhenNoChannelRow：历史数据兼容 ——
// 只有凭据行、没有渠道行的渠道仍可探测。
func TestProbeCredentialRowAddressUsedWhenNoChannelRow(t *testing.T) {
	credTarget := newTargetStub(t)
	ws := newWorkspaceStub(t, `{"items":[]}`,
		fmt.Sprintf(`{"items":[{"channelId":"pearapi","baseUrl":%q,"authType":"apikey","hasKey":true}]}`, credTarget.srv.URL))

	p := newProber(ws, newCatalogStub(t, `[]`), netguard.Policy{AllowPrivate: true})
	out, err := p.Probe(context.Background(), "ws-1", "actor-1", "pearapi")
	if err != nil {
		t.Fatalf("Probe: %v", err)
	}
	if !out.Reachable || !out.AuthConfigured {
		t.Fatalf("仅有凭据行的渠道应可探测: %+v", out)
	}
	if hits, auth, apiKey, _, _ := credTarget.snapshot(); hits != 1 || auth != "" || apiKey != placeholderSecret {
		t.Fatalf("apikey 占位串应走 X-API-Key: hits=%d authorization=%q x-api-key=%q", hits, auth, apiKey)
	}
}

// TestProbeBareHostPortGetsHTTPPrefix 锁定既有归一化：裸 host:port 自动补 http://。
func TestProbeBareHostPortGetsHTTPPrefix(t *testing.T) {
	got, err := normalizeBaseURL("127.0.0.1:8188/")
	if err != nil || got != "http://127.0.0.1:8188" {
		t.Fatalf("normalizeBaseURL = %q, %v", got, err)
	}
	if _, err := normalizeBaseURL("ftp://example.com/x"); err == nil {
		t.Fatal("非 http(s) 协议应被拒绝")
	}
}

// ---- 无地址 / 渠道不存在 ---------------------------------------------------

func TestProbeMissingBaseURLIsReportedHonestly(t *testing.T) {
	ws := newWorkspaceStub(t, `{"items":[{"id":"chan-empty","kind":"aggregator","baseUrl":"","authType":"none"}]}`, `{"items":[]}`)
	p := newProber(ws, nil, netguard.Policy{})
	out, err := p.Probe(context.Background(), "ws-1", "actor-1", "chan-empty")
	if err != nil {
		t.Fatalf("「未配置地址」不是执行错误: %v", err)
	}
	if out.Reachable || out.Detail != "未配置 Base URL，无法探测" {
		t.Fatalf("应如实报告未配置地址: %+v", out)
	}
}

func TestProbeUnknownChannelReturnsErrChannelNotFound(t *testing.T) {
	ws := newWorkspaceStub(t, `{"items":[]}`, `{"items":[]}`)
	p := newProber(ws, newCatalogStub(t, `[]`), netguard.Policy{})
	if _, err := p.Probe(context.Background(), "ws-1", "actor-1", "nope"); !errors.Is(err, ErrChannelNotFound) {
		t.Fatalf("未知渠道应返回 ErrChannelNotFound，实际 %v", err)
	}
}

// ---- 判据 5：字段契约 ------------------------------------------------------

// TestResultJSONFieldContract 与旧 probe.Result / 前端 ProbeResult 逐字段对齐：
// 键名不变、可选字段的省略规则不变（authOk/statusCode 仅在设置时出现）。
func TestResultJSONFieldContract(t *testing.T) {
	ok := true
	full, err := json.Marshal(Result{ChannelID: "c", Reachable: true, AuthConfigured: true, AuthOK: &ok, StatusCode: 200, Detail: "d", ProbedAt: "t"})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	assertKeys(t, full, []string{"channelId", "reachable", "authConfigured", "authOk", "statusCode", "detail", "probedAt"})

	// 网络层失败（含策略拒绝）不得出现 authOk/statusCode。
	minimal, err := json.Marshal(Result{ChannelID: "c", Reachable: false, Detail: "d", ProbedAt: "t"})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	assertKeys(t, minimal, []string{"channelId", "reachable", "authConfigured", "detail", "probedAt"})
}

func assertKeys(t *testing.T, raw []byte, want []string) {
	t.Helper()
	var got map[string]json.RawMessage
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("unmarshal %s: %v", raw, err)
	}
	keys := make([]string, 0, len(got))
	for k := range got {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	sort.Strings(want)
	if strings.Join(keys, ",") != strings.Join(want, ",") {
		t.Fatalf("字段集合 = %v, want %v (raw=%s)", keys, want, raw)
	}
}

// TestProbeWithoutAnySourceFailsLoudly：catalog/workspace 都不可用时必须报错，
// 不得假装探测过。
func TestProbeWithoutAnySourceFailsLoudly(t *testing.T) {
	p := New(nil, nil, netguard.Policy{}, time.Second)
	if _, err := p.Probe(context.Background(), "ws-1", "actor-1", "comfy"); err == nil {
		t.Fatal("没有任何渠道来源时应返回错误")
	}
}
