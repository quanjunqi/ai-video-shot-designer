package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestProdAuthorizeRequestMatrix(t *testing.T) {
	cases := []struct {
		name   string
		role   string
		method string
		path   string
		want   bool
	}{
		// 模型目录：读 viewer / 写 admin
		{"viewer 看目录", "viewer", "GET", "/internal/v1/catalog", true},
		{"viewer 建模型被拒", "viewer", "POST", "/internal/v1/catalog/models", false},
		{"admin 建模型", "admin", "POST", "/internal/v1/catalog/models", true},
		{"viewer 策展被拒", "viewer", "POST", "/internal/v1/catalog/curate", false},
		{"owner 策展", "owner", "POST", "/internal/v1/catalog/curate", true},
		// 逻辑模型：读 viewer / 写 admin
		{"viewer 看逻辑模型", "viewer", "GET", "/internal/v1/logical-models", true},
		{"viewer 建逻辑模型被拒", "viewer", "POST", "/internal/v1/logical-models", false},
		{"admin 建逻辑模型", "admin", "POST", "/internal/v1/logical-models", true},
		// 规则模板：读 viewer / 写 admin
		{"viewer 看规则模板", "viewer", "GET", "/internal/v1/rule-templates", true},
		{"viewer 建规则模板被拒", "viewer", "POST", "/internal/v1/rule-templates", false},
		{"admin 建规则模板", "admin", "POST", "/internal/v1/rule-templates", true},
		// 渠道同步：admin
		{"viewer 渠道同步被拒", "viewer", "POST", "/internal/v1/channels/ch_1/sync", false},
		{"admin 渠道同步", "admin", "POST", "/internal/v1/channels/ch_1/sync", true},
		// 创作流：member 可用
		{"viewer 创作", "viewer", "POST", "/internal/v1/comic-projects", true},
		{"member 创作", "member", "POST", "/internal/v1/comic-projects", true},
		// 未知角色 fail-safe member
		{"未知角色看目录被拒", "hacker", "GET", "/internal/v1/catalog", false},
	}
	for _, c := range cases {
		if got := authorizeRequest(c.role, c.method, c.path); got != c.want {
			t.Errorf("%s: authorizeRequest(%q, %s, %s) = %v, want %v", c.name, c.role, c.method, c.path, got, c.want)
		}
	}
}

func TestAuthzMiddleware(t *testing.T) {
	newHandler := func() http.Handler {
		// 用真实 Routes 验证中间件接线；GET /internal/v1/catalog 无需 store 即返回
		return Handler{Token: "secret"}.Routes()
	}
	do := func(h http.Handler, method, path, role string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(""))
		if role != "" {
			req.Header.Set("X-Actor-Role", role)
		}
		req.Header.Set("Authorization", "Bearer secret")
		req.Header.Set("X-Workspace-Id", "workspace-1")
		req.Header.Set("X-Actor-Id", "user-1")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}
	t.Run("探活无需角色头", func(t *testing.T) {
		h := newHandler()
		if rec := do(h, "GET", "/live", ""); rec.Code != http.StatusNoContent {
			t.Fatalf("live 应 204，got %d", rec.Code)
		}
		if rec := do(h, "GET", "/ready", ""); rec.Code != http.StatusServiceUnavailable && rec.Code != http.StatusNoContent {
			t.Fatalf("ready 不应 403，got %d", rec.Code)
		}
	})
	t.Run("缺失角色头 403", func(t *testing.T) {
		h := newHandler()
		if rec := do(h, "GET", "/internal/v1/catalog", ""); rec.Code != http.StatusForbidden {
			t.Fatalf("缺角色头应 403，got %d", rec.Code)
		}
	})
	t.Run("viewer 读目录放行/写被拒", func(t *testing.T) {
		h := newHandler()
		if rec := do(h, "GET", "/internal/v1/catalog", "viewer"); rec.Code == http.StatusForbidden {
			t.Fatalf("viewer GET catalog 不应 403")
		}
		if rec := do(h, "POST", "/internal/v1/catalog/models", "viewer"); rec.Code != http.StatusForbidden {
			t.Fatalf("viewer POST catalog/models 应 403，got %d", rec.Code)
		}
	})
	t.Run("admin 写目录放行", func(t *testing.T) {
		h := newHandler()
		if rec := do(h, "POST", "/internal/v1/catalog/models", "admin"); rec.Code == http.StatusForbidden {
			t.Fatalf("admin POST catalog/models 不应 403")
		}
	})
}
