package httpapi

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// asset 服务此前【一个测试都没有】（覆盖率 0.0%，是按「棘轮」最该补的那个）。
//
// 可测性约束（决定了本文件的范围）：Handler.Store 是【具体类型】asset.Store
// （struct，内含 *pgxpool.Pool 与 *minio.Client），**无法伪造**。
// 因此这里只覆盖**不触及 Store 的路径**：
//   - 健康检查 /live /ready
//   - 鉴权 auth（401）
//   - 四个 handler 的入参守卫（400）
// 触及 Store 的成功/失败路径需要真实 DB 与 MinIO ⇒ 属集成测试，另见文件末说明。
//
// 这些路径不是"边角料"：**401/400 是网关唯一的入口防线**，
// 而它们此前完全没有被任何测试锁定过。

func newHandler() Handler { return Handler{Token: "test-secret"} }

func req(t *testing.T, method, target string, body string) *http.Request {
	t.Helper()
	var r *http.Request
	if body == "" {
		r = httptest.NewRequest(method, target, nil)
	} else {
		r = httptest.NewRequest(method, target, strings.NewReader(body))
	}
	return r
}

func withAuth(r *http.Request) *http.Request {
	r.Header.Set("Authorization", "Bearer test-secret")
	return r
}

func TestLiveReturns204(t *testing.T) {
	rec := httptest.NewRecorder()
	newHandler().Routes().ServeHTTP(rec, req(t, http.MethodGet, "/live", ""))
	if rec.Code != http.StatusNoContent {
		t.Fatalf("/live 期望 204，得到 %d", rec.Code)
	}
}

func TestReadyBranches(t *testing.T) {
	cases := []struct {
		name  string
		ready func(context.Context) error
		want  int
	}{
		{"未配置 Ready ⇒ 503（不假装就绪）", nil, http.StatusServiceUnavailable},
		{"Ready 返回 nil ⇒ 204", func(context.Context) error { return nil }, http.StatusNoContent},
		{"Ready 返回错误 ⇒ 503", func(context.Context) error { return errors.New("db down") }, http.StatusServiceUnavailable},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			h := newHandler()
			h.Ready = c.ready
			rec := httptest.NewRecorder()
			h.Routes().ServeHTTP(rec, req(t, http.MethodGet, "/ready", ""))
			if rec.Code != c.want {
				t.Fatalf("期望 %d，得到 %d（body=%s）", c.want, rec.Code, rec.Body.String())
			}
		})
	}
}

func TestAuthRejects(t *testing.T) {
	cases := []struct {
		name   string
		token  string
		header string
		want   int
	}{
		{"无 Authorization 头", "test-secret", "", http.StatusUnauthorized},
		{"token 不匹配", "test-secret", "Bearer wrong", http.StatusUnauthorized},
		{"服务端未配置 Token ⇒ 一律拒绝", "", "Bearer anything", http.StatusUnauthorized},
		// ★ 这条是测试【发现】的真实行为：auth 用 strings.TrimPrefix 而非严格校验，
		//   因此 Authorization: <token>（无 Bearer 前缀）会被【接受】。
		//   这不是缺陷 —— 仓库在别处（协议模板 auth_type=token）本就支持裸 Token 形态，
		//   两处行为一致是刻意的。这里把它钉成不变量：一旦有人改成严格校验，
		//   裸 Token 渠道会突然全部 401，这个测试会立刻失败并指出原因。
		{"裸 Token（无 Bearer 前缀）⇒ 鉴权通过，只因缺 workspace 而 400", "test-secret", "test-secret", http.StatusBadRequest},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			h := Handler{Token: c.token}
			rec := httptest.NewRecorder()
			r := req(t, http.MethodPost, "/internal/v1/assets/uploads", "{}")
			if c.header != "" {
				r.Header.Set("Authorization", c.header)
			}
			h.Routes().ServeHTTP(rec, r)
			if rec.Code != c.want {
				t.Fatalf("期望 %d，得到 %d（body=%s）", c.want, rec.Code, rec.Body.String())
			}
			if c.want == http.StatusUnauthorized && !strings.Contains(rec.Body.String(), "UNAUTHENTICATED") {
				t.Fatalf("401 响应体应含 UNAUTHENTICATED：%s", rec.Body.String())
			}
		})
	}
}

func TestCreateGuards(t *testing.T) {
	h := newHandler()
	t.Run("缺 workspace/actor ⇒ 400 INVALID_CONTEXT", func(t *testing.T) {
		rec := httptest.NewRecorder()
		h.Routes().ServeHTTP(rec, withAuth(req(t, http.MethodPost, "/internal/v1/assets/uploads", "{}")))
		if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "INVALID_CONTEXT") {
			t.Fatalf("期望 400 INVALID_CONTEXT，得到 %d %s", rec.Code, rec.Body.String())
		}
	})
	t.Run("JSON 非法 ⇒ 400 INVALID_JSON", func(t *testing.T) {
		r := withAuth(req(t, http.MethodPost, "/internal/v1/assets/uploads", "not-json"))
		r.Header.Set("X-Workspace-Id", "ws")
		r.Header.Set("X-Actor-Id", "u")
		rec := httptest.NewRecorder()
		h.Routes().ServeHTTP(rec, r)
		if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "INVALID_JSON") {
			t.Fatalf("期望 400 INVALID_JSON，得到 %d %s", rec.Code, rec.Body.String())
		}
	})
}

func TestPutGuards(t *testing.T) {
	h := newHandler()
	t.Run("缺 workspace ⇒ 400（在触及 Store 之前返回）", func(t *testing.T) {
		rec := httptest.NewRecorder()
		h.Routes().ServeHTTP(rec, withAuth(req(t, http.MethodPut, "/internal/v1/assets/uploads/up_1/content", "x")))
		if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "INVALID_CONTEXT") {
			t.Fatalf("期望 400 INVALID_CONTEXT，得到 %d %s", rec.Code, rec.Body.String())
		}
	})
	t.Run("id 为空 ⇒ 400 INVALID_UPLOAD", func(t *testing.T) {
		// 直调 handler（不经 mux）：Go 1.22 的路由要求 {id} 非空，
		// 所以这条守卫只有直调才能触达 —— 正是它存在的意义（防御性检查）。
		r := withAuth(req(t, http.MethodPut, "/internal/v1/assets/uploads//content", "x"))
		r.Header.Set("X-Workspace-Id", "ws")
		rec := httptest.NewRecorder()
		h.put(rec, r)
		if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "INVALID_UPLOAD") {
			t.Fatalf("期望 400 INVALID_UPLOAD，得到 %d %s", rec.Code, rec.Body.String())
		}
	})
}

func TestCommitAndListGuards(t *testing.T) {
	h := newHandler()
	for _, c := range []struct{ name, method, target string }{
		{"commit 缺 workspace", http.MethodPost, "/internal/v1/assets/uploads/up_1/commit"},
		{"list 缺 workspace", http.MethodGet, "/internal/v1/assets"},
	} {
		t.Run(c.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			h.Routes().ServeHTTP(rec, withAuth(req(t, c.method, c.target, "")))
			if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "INVALID_CONTEXT") {
				t.Fatalf("期望 400 INVALID_CONTEXT，得到 %d %s", rec.Code, rec.Body.String())
			}
		})
	}
}

func TestWriteErrorSetsJSONContentType(t *testing.T) {
	rec := httptest.NewRecorder()
	writeError(rec, http.StatusTeapot, "TEAPOT", "短与胖")
	if ct := rec.Header().Get("Content-Type"); !strings.Contains(ct, "application/json") {
		t.Fatalf("Content-Type 应为 JSON，得到 %q", ct)
	}
	if !strings.Contains(rec.Body.String(), "TEAPOT") {
		t.Fatalf("响应体应含错误码：%s", rec.Body.String())
	}
}

// 未覆盖并如实说明：触及 Store 的路径需要真实 PostgreSQL 与 MinIO
// （CreateUpload/Put/Commit/List 的全部成功与错误分支）。
// 它们不属于"单元测试"范畴；若要覆盖，应按仓库既有约定
// （EXECUTION_TEST_DATABASE_URL 式的集成测试）另开一片。
