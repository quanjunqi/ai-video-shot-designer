// 早退守卫与工作区预算域测试（TASK-PROC-008：BE-SIZE-001「一个文件一个域」拆分）。
//
// 从 main_test.go（764 行超上限）按域拆出：渠道探测的早退（零上游调用）与
// 工作区预算转发的路径改写、鉴权与方法守卫。**纯搬移**：函数体与断言逐字未改。
package httpserver

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// TestChannelProbeRejectsEarlyWithoutUpstreamCalls 覆盖前转函数在触达 execution **之前**
// 的两条拒绝路径：路由不匹配（404）与 方法不是 POST（405）。
//
// 为什么要补这些用例（可复现的原因）：
//
//	B3a 用一段 41 行的前转函数替换了 BFF 内联探测（约 140 行、原本有测试覆盖）。
//	**删除"有覆盖的代码"会让总覆盖率下降** —— 实测 22.5% < 下限 23%，
//	触发了覆盖率棘轮门禁（.github/coverage-baseline.txt）。
//	相比调低下限（= 放松门禁），更正确的做法是把新代码的分支测全。
//
// 这些用例刻意**不注入任何上游 server**：两条拒绝都发生在 authorize 之前，
// 因此若将来实现被改成"先调用上游再校验"，本用例会因空 URL / 超时而失败。
func TestChannelProbeRejectsEarlyWithoutUpstreamCalls(t *testing.T) {
	cases := []struct {
		name   string
		path   string
		method string
		want   int
	}{
		{"path prefix mismatch", "/api/v1/other/minimax/probe", http.MethodPost, http.StatusNotFound},
		{"path suffix mismatch", "/api/v1/channels/minimax/probeX", http.MethodPost, http.StatusNotFound},
		{"method is get", "/api/v1/channels/minimax/probe", http.MethodGet, http.StatusMethodNotAllowed},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := &server{httpClient: &http.Client{Timeout: time.Second}}
			w := httptest.NewRecorder()
			s.channelProbe(w, httptest.NewRequest(tc.method, tc.path, nil))
			if w.Code != tc.want {
				t.Fatalf("path=%s method=%s: got %d, want %d", tc.path, tc.method, w.Code, tc.want)
			}
		})
	}
}

func TestWorkspaceBudgetRewritesPathAndPassesMethods(t *testing.T) {
	var (
		seenPath, seenMethod, seenAuth string
		seenBody                       string
	)
	workspace := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// TASK-AUTH-001：authorize 探测命中同一 URL 时返回角色 JSON
		if strings.Contains(r.URL.Path, "/authorize") {
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"role":"owner"}`)
			return
		}
		seenPath, seenMethod = r.URL.Path, r.Method
		seenAuth = r.Header.Get("Authorization")
		b, _ := io.ReadAll(r.Body)
		seenBody = string(b)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, `{"items":[]}`)
	}))
	defer workspace.Close()
	production := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"role":"owner"}`)
	}))
	defer production.Close()

	s := testServer(workspace, production)
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/workspace/budget", s.workspaceBudget)
	mux.HandleFunc("/api/v1/workspace/budget/", s.workspaceBudget)

	// PUT 列表（upsert）
	r := httptest.NewRequest(http.MethodPut, "/api/v1/workspace/budget/rules",
		strings.NewReader(`{"scope":"workspace","period":"day","limitAmount":500,"action":"block"}`))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, r)
	if rec.Code != http.StatusOK {
		t.Fatalf("PUT budget: expected 200, got %d", rec.Code)
	}
	if seenPath != "/internal/v1/workspaces/ws_dev/budget/rules" {
		t.Fatalf("expected rewritten budget path, got %q", seenPath)
	}
	if seenMethod != http.MethodPut {
		t.Fatalf("expected PUT, got %s", seenMethod)
	}
	if seenAuth != "Bearer workspace-secret" {
		t.Fatalf("expected workspace token, got %q", seenAuth)
	}
	if !strings.Contains(seenBody, `"limitAmount":500`) {
		t.Fatalf("body must pass through, got %q", seenBody)
	}

	// DELETE 周期
	r = httptest.NewRequest(http.MethodDelete, "/api/v1/workspace/budget/rules/day", nil)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, r)
	if seenPath != "/internal/v1/workspaces/ws_dev/budget/rules/day" {
		t.Fatalf("expected DELETE rewrite, got %q", seenPath)
	}
	if seenMethod != http.MethodDelete {
		t.Fatalf("expected DELETE, got %s", seenMethod)
	}

	// GET 列表
	r = httptest.NewRequest(http.MethodGet, "/api/v1/workspace/budget/rules", nil)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, r)
	if rec.Code != http.StatusOK || seenMethod != http.MethodGet {
		t.Fatalf("GET budget: code=%d method=%s", rec.Code, seenMethod)
	}
	if !strings.Contains(rec.Body.String(), `"items"`) {
		t.Fatalf("GET budget must stream upstream body, got %q", rec.Body.String())
	}
}

func TestWorkspaceBudgetAuthAndMethodGuard(t *testing.T) {
	workspace := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer workspace.Close()
	production := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"role":"owner"}`)
	}))
	defer production.Close()

	s := testServer(workspace, production)
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/workspace/budget", s.workspaceBudget)
	mux.HandleFunc("/api/v1/workspace/budget/", s.workspaceBudget)

	// workspace 403 ⇒ FORBIDDEN
	r := httptest.NewRequest(http.MethodGet, "/api/v1/workspace/budget/rules", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, r)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("auth denied: expected 403, got %d", rec.Code)
	}

	// 不支持的方法 ⇒ 405
	r = httptest.NewRequest(http.MethodPost, "/api/v1/workspace/budget/rules", nil)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, r)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("POST budget: expected 405, got %d", rec.Code)
	}
}
