package httpserver

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// web-bff 此前 24 个函数里 **17 个是 0%** —— 包括 ready（健康检查）与多个 handler 的守卫。
//
// 本文件只断言【已从源码逐行确证】的行为，不靠推断：
// 每个用例的期望都对应 main.go 里读过的那一行。同包已有 testServer（复用，不重定义）。

// countingServer 记录被调用次数，用于证明"守卫在鉴权【之前】就返回了"。
func countingServer(t *testing.T, status int) (*httptest.Server, *int) {
	t.Helper()
	calls := 0
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(status)
	}))
	t.Cleanup(s.Close)
	return s, &calls
}

func do(h http.HandlerFunc, method, path string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h(rec, httptest.NewRequest(method, path, nil))
	return rec
}

// ── 404：路径前缀不符 ⇒ http.NotFound，且【不得触碰上游】 ──────────────
func TestHandlersReturn404ForForeignPath(t *testing.T) {
	ws, wsCalls := countingServer(t, http.StatusNoContent)
	prod, prodCalls := countingServer(t, http.StatusNoContent)
	s := testServer(ws, prod)

	cases := []struct {
		name string
		h    http.HandlerFunc
		path string
	}{
		{"generationIntents", s.generationIntents, "/api/v1/nope"},
		{"workspaceChannels", s.workspaceChannels, "/api/v1/nope"},
		{"catalogProxy", s.catalogProxy, "/api/v1/nope"},
		{"ruleTemplates", s.ruleTemplates, "/api/v1/nope"},
		{"tasks", s.tasks, "/api/v1/nope"},
		{"assets", s.assets, "/api/v1/nope"},
		{"projects", s.projects, "/api/v1/nope"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rec := do(c.h, http.MethodGet, c.path)
			if rec.Code != http.StatusNotFound {
				t.Fatalf("路径不符应 404，得到 %d（body=%s）", rec.Code, rec.Body.String())
			}
		})
	}
	if *wsCalls != 0 || *prodCalls != 0 {
		t.Fatalf("404 分支不应触碰上游：workspace=%d production=%d", *wsCalls, *prodCalls)
	}
}

// ── 405：方法不允许 ⇒ 且【不得触碰上游鉴权】 ─────────────────────────
// ★ 如实记录一处不一致（不是"应该"）：
//
//	projects 用 http.Error 返回【纯文本】"method not allowed"，
//	其余 handler 用 writeError 返回【JSON】{"code":"METHOD_NOT_ALLOWED"}。
//	本文件把它钉成事实：若日后统一，用例会失败并提醒"这是对外响应格式变更"。
func TestHandlersReturn405ForDisallowedMethod(t *testing.T) {
	ws, wsCalls := countingServer(t, http.StatusNoContent)
	prod, _ := countingServer(t, http.StatusNoContent)
	s := testServer(ws, prod)

	cases := []struct {
		name         string
		h            http.HandlerFunc
		method, path string
		wantJSON     bool
	}{
		{"generationIntents 只允许 GET/POST", s.generationIntents, http.MethodPut, "/api/v1/generation-intents", true},
		{"workspaceChannels 只允许 GET/PUT/DELETE", s.workspaceChannels, http.MethodPost, "/api/v1/workspace/channels", true},
		{"catalogProxy 只允许 GET/POST/PUT/DELETE", s.catalogProxy, http.MethodPatch, "/api/v1/catalog", true},
		{"ruleTemplates 只允许 GET/POST/PATCH/DELETE", s.ruleTemplates, http.MethodPut, "/api/v1/rule-templates", true},
		{"assets 只允许 GET/POST/PUT", s.assets, http.MethodDelete, "/api/v1/assets", true},
		{"generate 只允许 POST", s.generate, http.MethodGet, "/api/v1/generate", true},
		{"auditLogs 只允许 GET", s.auditLogs, http.MethodPost, "/api/v1/audit/logs", true},
		{"projects 只允许 GET/POST/DELETE/PATCH（纯文本 405）", s.projects, http.MethodPut, "/api/v1/comic-projects", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rec := do(c.h, c.method, c.path)
			if rec.Code != http.StatusMethodNotAllowed {
				t.Fatalf("期望 405，得到 %d（body=%s）", rec.Code, rec.Body.String())
			}
			body := rec.Body.String()
			if c.wantJSON {
				if !strings.Contains(body, "METHOD_NOT_ALLOWED") {
					t.Fatalf("期望 JSON 错误码 METHOD_NOT_ALLOWED，得到 %q", body)
				}
				if ct := rec.Header().Get("Content-Type"); !strings.Contains(ct, "application/json") {
					t.Fatalf("期望 JSON Content-Type，得到 %q", ct)
				}
			} else if strings.Contains(body, "METHOD_NOT_ALLOWED") {
				t.Fatalf("projects 当前返回纯文本；若已统一为 JSON，请同步更新本用例（实测 body=%q）", body)
			}
		})
	}
	if *wsCalls != 0 {
		t.Fatalf("405 应在鉴权之前返回，却调用了 workspace %d 次", *wsCalls)
	}
}

// ── 鉴权失败的两条分支：403（被拒）与 503（鉴权服务不可用） ──────────────
func TestAuthorizationFailuresAreDistinguished(t *testing.T) {
	for _, c := range []struct {
		name     string
		wsStatus int
		wantCode int
		wantBody string
	}{
		{"workspace 返回 403 ⇒ FORBIDDEN", http.StatusForbidden, http.StatusForbidden, "FORBIDDEN"},
		{"workspace 返回 500 ⇒ UPSTREAM_UNAVAILABLE", http.StatusInternalServerError, http.StatusServiceUnavailable, "UPSTREAM_UNAVAILABLE"},
	} {
		t.Run(c.name, func(t *testing.T) {
			ws, _ := countingServer(t, c.wsStatus)
			prod, _ := countingServer(t, http.StatusNoContent)
			s := testServer(ws, prod)
			for _, h := range []struct {
				n string
				f http.HandlerFunc
			}{
				{"generate", s.generate},
				{"auditLogs", s.auditLogs},
			} {
				rec := httptest.NewRecorder()
				h.f(rec, httptest.NewRequest(http.MethodPost, "/api/v1/generate", nil))
				if h.n == "auditLogs" {
					rec = httptest.NewRecorder()
					h.f(rec, httptest.NewRequest(http.MethodGet, "/api/v1/audit/logs", nil))
				}
				if rec.Code != c.wantCode || !strings.Contains(rec.Body.String(), c.wantBody) {
					t.Fatalf("%s：期望 %d %s，得到 %d %s", h.n, c.wantCode, c.wantBody, rec.Code, rec.Body.String())
				}
			}
		})
	}
}

// ── ready：四个上游逐一探测，任一不可用即 503，且【消息指明是谁】 ──────────
func TestReadyProbesEveryUpstream(t *testing.T) {
	build := func(wsStatus, prodStatus, assetStatus, execStatus int) (*server, []func()) {
		ws, _ := countingServer(t, wsStatus)
		prod, _ := countingServer(t, prodStatus)
		asset, _ := countingServer(t, assetStatus)
		exec, _ := countingServer(t, execStatus)
		s := testServer(ws, prod)
		s.assetURL, s.assetToken = asset.URL, "asset-secret"
		s.executionURL, s.executionToken = exec.URL, "execution-secret"
		return s, nil
	}

	t.Run("全部就绪 ⇒ 204", func(t *testing.T) {
		s, _ := build(204, 204, 204, 204)
		rec := do(s.ready, http.MethodGet, "/ready")
		if rec.Code != http.StatusNoContent {
			t.Fatalf("期望 204，得到 %d（body=%s）", rec.Code, rec.Body.String())
		}
	})
	for _, c := range []struct {
		name, wantMsg         string
		ws, prod, asset, exec int
	}{
		{"workspace 不可用", "workspace unavailable", 500, 204, 204, 204},
		{"production 不可用", "production unavailable", 204, 500, 204, 204},
		{"asset 不可用", "asset unavailable", 204, 204, 500, 204},
		{"execution 不可用", "execution unavailable", 204, 204, 204, 500},
	} {
		t.Run(c.name, func(t *testing.T) {
			s, _ := build(c.ws, c.prod, c.asset, c.exec)
			rec := do(s.ready, http.MethodGet, "/ready")
			if rec.Code != http.StatusServiceUnavailable {
				t.Fatalf("期望 503，得到 %d", rec.Code)
			}
			if !strings.Contains(rec.Body.String(), c.wantMsg) {
				t.Fatalf("响应体应指明是谁不可用（%q），得到 %q", c.wantMsg, rec.Body.String())
			}
		})
	}
}

// ── check：2xx ⇒ nil；>=300 ⇒ error；连不上 ⇒ error ─────────────────────
func TestCheckTreatsNon2xxAndUnreachableAsFailure(t *testing.T) {
	s := &server{httpClient: &http.Client{Timeout: 2 * time.Second}, workspaceToken: "t"}
	for _, status := range []int{200, 204} {
		srv, _ := countingServer(t, status)
		if err := s.check(context.Background(), srv.URL, "t"); err != nil {
			t.Fatalf("状态 %d 应视为就绪，得到 %v", status, err)
		}
	}
	for _, status := range []int{301, 404, 500} {
		srv, _ := countingServer(t, status)
		if err := s.check(context.Background(), srv.URL, "t"); err == nil {
			t.Fatalf("状态 %d 应视为不就绪", status)
		}
	}
	if err := s.check(context.Background(), "http://127.0.0.1:1", "t"); err == nil {
		t.Fatal("连不上应视为不就绪")
	}
}

// ── withTimeout：全局禁缓存头 + 向下游传递可取消的 context ────────────────
func TestWithTimeoutSetsNoStoreHeadersAndCallsNext(t *testing.T) {
	var gotDeadline bool
	var gotCache, gotPragma, gotExpires string
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, gotDeadline = r.Context().Deadline()
		gotCache = w.Header().Get("Cache-Control")
		w.WriteHeader(http.StatusTeapot)
	})
	rec := httptest.NewRecorder()
	withTimeout(inner).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/x", nil))
	gotPragma = rec.Header().Get("Pragma")
	gotExpires = rec.Header().Get("Expires")

	if !gotDeadline {
		t.Fatal("应向下游传递带 deadline 的 context")
	}
	if !strings.Contains(gotCache, "no-store") {
		t.Fatalf("Cache-Control 应含 no-store，得到 %q", gotCache)
	}
	if gotPragma != "no-cache" || gotExpires != "0" {
		t.Fatalf("禁缓存头不完整：Pragma=%q Expires=%q", gotPragma, gotExpires)
	}
	if rec.Code != http.StatusTeapot {
		t.Fatalf("应原样调用 next，得到 %d", rec.Code)
	}
}

// ── 纯函数 ────────────────────────────────────────────────────────────
func TestEnvFallsBackOnUnsetAndEmpty(t *testing.T) {
	for _, c := range []struct {
		name string
		set  *string
		want string
	}{
		{"未设置 ⇒ 回退", nil, "fb"},
		{"空串 ⇒ 回退（与未设置等价）", strptrBFF(""), "fb"},
		{"有值 ⇒ 采用", strptrBFF("v"), "v"},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Setenv("BFF_TEST_ENV", "")
			if c.set != nil {
				t.Setenv("BFF_TEST_ENV", *c.set)
			}
			if got := Env("BFF_TEST_ENV", "fb"); got != c.want {
				t.Fatalf("期望 %q，得到 %q", c.want, got)
			}
		})
	}
}

func TestWriteJSONSetsStatusAndContentType(t *testing.T) {
	rec := httptest.NewRecorder()
	writeJSON(rec, http.StatusCreated, map[string]string{"a": "b"})
	if rec.Code != http.StatusCreated {
		t.Fatalf("期望 201，得到 %d", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.Contains(ct, "application/json") {
		t.Fatalf("Content-Type 应为 JSON，得到 %q", ct)
	}
	if !strings.Contains(rec.Body.String(), `"a":"b"`) {
		t.Fatalf("响应体应含编码后的对象，得到 %q", rec.Body.String())
	}
}

func TestNewKeyShapeAndUniqueness(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 200; i++ {
		k := newKey()
		if !strings.HasPrefix(k, "bff_") || len(k) != len("bff_")+32 {
			t.Fatalf("key 形状应为 bff_ + 32 位 hex，得到 %q（%d 字符）", k, len(k))
		}
		if seen[k] {
			t.Fatalf("key 重复：%q", k)
		}
		seen[k] = true
	}
}

func strptrBFF(s string) *string { return &s }

var _ = io.EOF
