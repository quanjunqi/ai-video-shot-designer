package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"shotdesigner/services/execution/internal/audit"
)

// T2-1 契约测试：stats 端点守卫链（不依赖数据库，触及 Store 的路径停在守卫之前）。
// 守卫链：auth(401) → ctxOf(400) → AuditStore==nil(503) → 参数校验(400) → Store 调用。
// 与 audit_export_test.go 同套路：合法参数会走到数据库，故只测守卫路径。

func statsReq(path string) *http.Request {
	return httptest.NewRequest(http.MethodGet, path, nil)
}

func TestListStatsGuards(t *testing.T) {
	const token = "test-secret"
	withCtx := func(r *http.Request) *http.Request {
		r.Header.Set("X-Workspace-Id", "ws_dev")
		r.Header.Set("X-Actor-Id", "user_dev")
		return r
	}
	auth := func(r *http.Request) *http.Request {
		r.Header.Set("Authorization", "Bearer "+token)
		return r
	}

	cases := []struct {
		name     string
		h        Handler
		build    func() *http.Request
		wantCode int
		wantBody string
	}{
		{
			name:     "未鉴权 ⇒ 401",
			h:        Handler{Token: token},
			build:    func() *http.Request { return statsReq("/internal/v1/audit/stats") },
			wantCode: http.StatusUnauthorized, wantBody: "UNAUTHENTICATED",
		},
		{
			name:     "有鉴权但缺 workspace/actor ⇒ 400",
			h:        Handler{Token: token},
			build:    func() *http.Request { return auth(statsReq("/internal/v1/audit/stats")) },
			wantCode: http.StatusBadRequest, wantBody: "INVALID_CONTEXT",
		},
		{
			name:     "审计库未配置 ⇒ 503",
			h:        Handler{Token: token},
			build:    func() *http.Request { return withCtx(auth(statsReq("/internal/v1/audit/stats"))) },
			wantCode: http.StatusServiceUnavailable, wantBody: "AUDIT_UNAVAILABLE",
		},
		{
			name:     "dimension 缺失 ⇒ 400",
			h:        Handler{Token: token, AuditStore: &audit.Store{}},
			build:    func() *http.Request { return withCtx(auth(statsReq("/internal/v1/audit/stats"))) },
			wantCode: http.StatusBadRequest, wantBody: "INVALID_DIMENSION",
		},
		{
			name: "dimension 非法（含注入串）⇒ 400",
			h:    Handler{Token: token, AuditStore: &audit.Store{}},
			build: func() *http.Request {
				return withCtx(auth(statsReq("/internal/v1/audit/stats?dimension=model_id;DROP%20TABLE%20x")))
			},
			wantCode: http.StatusBadRequest, wantBody: "INVALID_DIMENSION",
		},
		{
			name: "since 非法 ⇒ 400（参数校验先于数据库）",
			h:    Handler{Token: token, AuditStore: &audit.Store{}},
			build: func() *http.Request {
				return withCtx(auth(statsReq("/internal/v1/audit/stats?dimension=channel&since=notatime")))
			},
			wantCode: http.StatusBadRequest, wantBody: "INVALID_SINCE",
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			c.h.listStats(rec, c.build())
			if rec.Code != c.wantCode {
				t.Fatalf("期望 %d，得到 %d（body=%s）", c.wantCode, rec.Code, rec.Body.String())
			}
			if !contains(rec.Body.String(), c.wantBody) {
				t.Fatalf("响应体应含 %q，得到 %s", c.wantBody, rec.Body.String())
			}
		})
	}
}

func TestStatsTrendGuards(t *testing.T) {
	const token = "test-secret"
	withCtx := func(r *http.Request) *http.Request {
		r.Header.Set("X-Workspace-Id", "ws_dev")
		r.Header.Set("X-Actor-Id", "user_dev")
		return r
	}
	auth := func(r *http.Request) *http.Request {
		r.Header.Set("Authorization", "Bearer "+token)
		return r
	}

	cases := []struct {
		name     string
		h        Handler
		build    func() *http.Request
		wantCode int
		wantBody string
	}{
		{
			name:     "granularity 缺失 ⇒ 400",
			h:        Handler{Token: token, AuditStore: &audit.Store{}},
			build:    func() *http.Request { return withCtx(auth(statsReq("/internal/v1/audit/stats/trend"))) },
			wantCode: http.StatusBadRequest, wantBody: "INVALID_GRANULARITY",
		},
		{
			name: "granularity 非法 ⇒ 400",
			h:    Handler{Token: token, AuditStore: &audit.Store{}},
			build: func() *http.Request {
				return withCtx(auth(statsReq("/internal/v1/audit/stats/trend?granularity=hour")))
			},
			wantCode: http.StatusBadRequest, wantBody: "INVALID_GRANULARITY",
		},
		{
			name: "dimension 带值但非法 ⇒ 400",
			h:    Handler{Token: token, AuditStore: &audit.Store{}},
			build: func() *http.Request {
				return withCtx(auth(statsReq("/internal/v1/audit/stats/trend?granularity=day&dimension=nope")))
			},
			wantCode: http.StatusBadRequest, wantBody: "INVALID_DIMENSION",
		},
		{
			name: "until 非法 ⇒ 400",
			h:    Handler{Token: token, AuditStore: &audit.Store{}},
			build: func() *http.Request {
				return withCtx(auth(statsReq("/internal/v1/audit/stats/trend?granularity=day&until=nope")))
			},
			wantCode: http.StatusBadRequest, wantBody: "INVALID_UNTIL",
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			c.h.statsTrend(rec, c.build())
			if rec.Code != c.wantCode {
				t.Fatalf("期望 %d，得到 %d（body=%s）", c.wantCode, rec.Code, rec.Body.String())
			}
			if !contains(rec.Body.String(), c.wantBody) {
				t.Fatalf("响应体应含 %q，得到 %s", c.wantBody, rec.Body.String())
			}
		})
	}
}
