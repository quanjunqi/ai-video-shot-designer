package httpserver

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// 代理 handler 回归护栏（W4+ 补强）：为 generationIntents / workspaceChannels /
// ruleTemplates / tasks / generate / assets 六个低覆盖代理补齐「透传 + 守卫」证据。
// 模式与 catalogProxy 测试一致：httptest mock 上游 + workspace 鉴权放行。

func newProxyServer(t *testing.T, upstreams map[string]*httptest.Server) *server {
	t.Helper()
	get := func(key string) string {
		if u, ok := upstreams[key]; ok && u != nil {
			return u.URL
		}
		return "http://127.0.0.1:1" // 未配置的上游：请求必失败，用于 503 分支
	}
	return &server{
		httpClient:      &http.Client{Timeout: 2 * time.Second},
		workspaceURL:    get("workspace"),
		workspaceToken:  "wt",
		productionURL:   get("production"),
		productionToken: "pt",
		executionURL:    get("execution"),
		executionToken:  "et",
		assetURL:        get("asset"),
		assetToken:      "at",
		devWorkspace:    "ws_a",
		devActor:        "user_a",
	}
}

// 记录一次上游请求的路径/query/方法/关键头。
type seenRequest struct {
	method, path, query string
	workspace, actor    string
	auth                string
	body                string
}

func captureUpstream(t *testing.T, status int, body string) (*httptest.Server, *seenRequest) {
	t.Helper()
	seen := &seenRequest{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b := make([]byte, 4096)
		n, _ := r.Body.Read(b)
		seen.method = r.Method
		seen.path = r.URL.Path
		seen.query = r.URL.RawQuery
		seen.workspace = r.Header.Get("X-Workspace-Id")
		seen.actor = r.Header.Get("X-Actor-Id")
		seen.auth = r.Header.Get("Authorization")
		seen.body = strings.TrimSpace(string(b[:n]))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	return srv, seen
}

func authOK(t *testing.T) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }))
	t.Cleanup(srv.Close)
	return srv
}

// ---------- generationIntents ----------

func TestGenerationIntentsForwardsGetAndPost(t *testing.T) {
	prod, seen := captureUpstream(t, http.StatusCreated, `{"id":"i1"}`)
	s := newProxyServer(t, map[string]*httptest.Server{"workspace": authOK(t), "production": prod})

	rec := httptest.NewRecorder()
	s.generationIntents(rec, httptest.NewRequest(http.MethodGet, "/api/v1/generation-intents?status=pending", nil))
	if rec.Code != http.StatusCreated {
		t.Fatalf("GET 期望 201，得到 %d：%s", rec.Code, rec.Body.String())
	}
	if seen.path != "/internal/v1/generation-intents" || seen.query != "status=pending" {
		t.Fatalf("上游路径/查询不对：%q?%q", seen.path, seen.query)
	}
	if seen.workspace != "ws_a" || seen.actor != "user_a" || seen.auth != "Bearer pt" {
		t.Fatalf("可信上下文头缺失：ws=%q actor=%q auth=%q", seen.workspace, seen.actor, seen.auth)
	}

	rec = httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/generation-intents", strings.NewReader(`{"kind":"video"}`))
	req.Header.Set("Idempotency-Key", "ik-1")
	s.generationIntents(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("POST 期望 201，得到 %d", rec.Code)
	}
	if seen.body != `{"kind":"video"}` {
		t.Fatalf("POST 体未透传：%q", seen.body)
	}
}

func TestGenerationIntentsGuards(t *testing.T) {
	s := newProxyServer(t, map[string]*httptest.Server{"workspace": authOK(t)})

	rec := httptest.NewRecorder()
	s.generationIntents(rec, httptest.NewRequest(http.MethodGet, "/api/v1/other", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("前缀不符期望 404，得到 %d", rec.Code)
	}
	rec = httptest.NewRecorder()
	s.generationIntents(rec, httptest.NewRequest(http.MethodDelete, "/api/v1/generation-intents/1", nil))
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("非法方法期望 405，得到 %d", rec.Code)
	}
}

// ---------- workspaceChannels ----------

func TestWorkspaceChannelsRewritesPathAndForwards(t *testing.T) {
	// workspaceChannels 的鉴权与转发都走 workspaceURL：一个 capture server
	// 同时承担放行（200）与记录。
	ws, seen := captureUpstream(t, http.StatusOK, `{"channels":[]}`)
	s := newProxyServer(t, map[string]*httptest.Server{"workspace": ws})

	rec := httptest.NewRecorder()
	s.workspaceChannels(rec, httptest.NewRequest(http.MethodGet, "/api/v1/workspace/channels/ch_1?detail=1", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("期望 200，得到 %d", rec.Code)
	}
	if seen.path != "/internal/v1/workspaces/ws_a/channels/ch_1" || seen.query != "detail=1" {
		t.Fatalf("重写路径/查询不对：%q?%q", seen.path, seen.query)
	}
	if seen.auth != "Bearer wt" {
		t.Fatalf("workspace token 未透传：%q", seen.auth)
	}

	rec = httptest.NewRecorder()
	s.workspaceChannels(rec, httptest.NewRequest(http.MethodGet, "/api/v1/workspace/channels", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("列表请求期望 200，得到 %d", rec.Code)
	}
	if seen.path != "/internal/v1/workspaces/ws_a/channels" {
		t.Fatalf("列表路径不对：%q", seen.path)
	}
}

func TestWorkspaceChannelsGuards(t *testing.T) {
	s := newProxyServer(t, map[string]*httptest.Server{"workspace": authOK(t)})
	rec := httptest.NewRecorder()
	s.workspaceChannels(rec, httptest.NewRequest(http.MethodPatch, "/api/v1/workspace/channels/1", nil))
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("PATCH 期望 405，得到 %d", rec.Code)
	}
}

// ---------- ruleTemplates ----------

func TestRuleTemplatesForwardsQuery(t *testing.T) {
	prod, seen := captureUpstream(t, http.StatusOK, `{"templates":[]}`)
	s := newProxyServer(t, map[string]*httptest.Server{"workspace": authOK(t), "production": prod})

	rec := httptest.NewRecorder()
	s.ruleTemplates(rec, httptest.NewRequest(http.MethodGet, "/api/v1/rule-templates?type=extract", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("期望 200，得到 %d", rec.Code)
	}
	if seen.path != "/internal/v1/rule-templates" || seen.query != "type=extract" {
		t.Fatalf("路径/查询不对：%q?%q", seen.path, seen.query)
	}
	if seen.auth != "Bearer pt" {
		t.Fatalf("production token 未透传：%q", seen.auth)
	}
}

// ---------- tasks ----------

func TestTasksForwardsAndSetsNoStore(t *testing.T) {
	exec, seen := captureUpstream(t, http.StatusOK, `{"tasks":[]}`)
	s := newProxyServer(t, map[string]*httptest.Server{"workspace": authOK(t), "execution": exec})

	rec := httptest.NewRecorder()
	s.tasks(rec, httptest.NewRequest(http.MethodGet, "/api/v1/tasks?page=2", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("GET 期望 200，得到 %d", rec.Code)
	}
	if seen.path != "/internal/v1/tasks" || seen.query != "page=2" {
		t.Fatalf("路径/查询不对：%q?%q", seen.path, seen.query)
	}
	if rec.Header().Get("Cache-Control") != "no-store, no-cache, must-revalidate, max-age=0" {
		t.Fatalf("任务查询必须禁用缓存：%q", rec.Header().Get("Cache-Control"))
	}

	rec = httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/tasks", strings.NewReader(`{"job":"j1"}`))
	req.Header.Set("Content-Type", "application/json")
	s.tasks(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("POST 期望 200，得到 %d", rec.Code)
	}
	if seen.method != http.MethodPost || !strings.Contains(seen.body, `"job":"j1"`) {
		t.Fatalf("POST 未透传：method=%s body=%q", seen.method, seen.body)
	}
}

func TestTasksGuards(t *testing.T) {
	s := newProxyServer(t, map[string]*httptest.Server{"workspace": authOK(t)})
	rec := httptest.NewRecorder()
	s.tasks(rec, httptest.NewRequest(http.MethodDelete, "/api/v1/tasks/1", nil))
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("DELETE 期望 405，得到 %d", rec.Code)
	}
}

// ---------- generate ----------

func TestGenerateForwardsPost(t *testing.T) {
	exec, seen := captureUpstream(t, http.StatusOK, `{"result":"ok"}`)
	s := newProxyServer(t, map[string]*httptest.Server{"workspace": authOK(t), "execution": exec})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/generate?model=flux", strings.NewReader(`{"prompt":"p"}`))
	req.Header.Set("Content-Type", "application/json")
	s.generate(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("期望 200，得到 %d：%s", rec.Code, rec.Body.String())
	}
	if seen.path != "/v1/generate" || seen.query != "model=flux" {
		t.Fatalf("路径/查询不对：%q?%q", seen.path, seen.query)
	}
	if seen.auth != "Bearer et" {
		t.Fatalf("execution token 未透传：%q", seen.auth)
	}
	if rec.Header().Get("Cache-Control") == "" {
		t.Fatal("generate 响应必须禁用缓存")
	}
}

func TestGenerateGuards(t *testing.T) {
	s := newProxyServer(t, map[string]*httptest.Server{"workspace": authOK(t)})
	rec := httptest.NewRecorder()
	s.generate(rec, httptest.NewRequest(http.MethodGet, "/api/v1/generate", nil))
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("GET 期望 405，得到 %d", rec.Code)
	}
}

// ---------- assets ----------

func TestAssetsForwardsQuery(t *testing.T) {
	asset, seen := captureUpstream(t, http.StatusOK, `{"assets":[]}`)
	s := newProxyServer(t, map[string]*httptest.Server{"workspace": authOK(t), "asset": asset})

	rec := httptest.NewRecorder()
	s.assets(rec, httptest.NewRequest(http.MethodGet, "/api/v1/assets?kind=image", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("期望 200，得到 %d", rec.Code)
	}
	if seen.path != "/internal/v1/assets" || seen.query != "kind=image" {
		t.Fatalf("路径/查询不对：%q?%q", seen.path, seen.query)
	}
	if seen.auth != "Bearer at" {
		t.Fatalf("asset token 未透传：%q", seen.auth)
	}
}

func TestAssetsGuards(t *testing.T) {
	s := newProxyServer(t, map[string]*httptest.Server{"workspace": authOK(t)})
	rec := httptest.NewRecorder()
	s.assets(rec, httptest.NewRequest(http.MethodDelete, "/api/v1/assets/1", nil))
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("DELETE 期望 405，得到 %d", rec.Code)
	}
}

// ---------- 上游不可用（503）与鉴权失败 ----------

func TestProxyUpstreamUnavailable(t *testing.T) {
	// workspaceChannels 不在其中：它的鉴权与转发走同一个 workspaceURL，
	// URL 不可达时 authorize 先失败返回 503（已被 TestProxyAuthorizationUnavailable
	// 覆盖），"转发阶段才 503"的分支在逻辑上不可达。
	cases := []struct {
		name   string
		run    func(*server, http.ResponseWriter, *http.Request)
		path   string
		method string
	}{
		{"generationIntents", func(s *server, w http.ResponseWriter, r *http.Request) { s.generationIntents(w, r) }, "/api/v1/generation-intents", http.MethodGet},
		{"ruleTemplates", func(s *server, w http.ResponseWriter, r *http.Request) { s.ruleTemplates(w, r) }, "/api/v1/rule-templates", http.MethodGet},
		{"tasks", func(s *server, w http.ResponseWriter, r *http.Request) { s.tasks(w, r) }, "/api/v1/tasks", http.MethodGet},
		{"generate", func(s *server, w http.ResponseWriter, r *http.Request) { s.generate(w, r) }, "/api/v1/generate", http.MethodPost},
		{"assets", func(s *server, w http.ResponseWriter, r *http.Request) { s.assets(w, r) }, "/api/v1/assets", http.MethodGet},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			// workspace 鉴权正常但对应上游未配置（127.0.0.1:1）⇒ 503
			s := newProxyServer(t, map[string]*httptest.Server{"workspace": authOK(t)})
			rec := httptest.NewRecorder()
			c.run(s, rec, httptest.NewRequest(c.method, c.path, nil))
			if rec.Code != http.StatusServiceUnavailable {
				t.Fatalf("期望 503，得到 %d", rec.Code)
			}
		})
	}
}

func TestProxyAuthorizationDenied(t *testing.T) {
	// workspace 鉴权拒绝（403）⇒ 全部代理返回 403 FORBIDDEN
	deny := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusForbidden) }))
	defer deny.Close()
	s := newProxyServer(t, map[string]*httptest.Server{"workspace": deny})
	rec := httptest.NewRecorder()
	s.generationIntents(rec, httptest.NewRequest(http.MethodGet, "/api/v1/generation-intents", nil))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("期望 403，得到 %d", rec.Code)
	}
}

func TestProxyAuthorizationUnavailable(t *testing.T) {
	// workspace 鉴权服务不可达 ⇒ 503 UPSTREAM_UNAVAILABLE
	s := newProxyServer(t, nil)
	rec := httptest.NewRecorder()
	s.tasks(rec, httptest.NewRequest(http.MethodGet, "/api/v1/tasks", nil))
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("期望 503，得到 %d", rec.Code)
	}
}
