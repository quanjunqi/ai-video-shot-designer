package httpserver

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// ① 的第①步：BFF 把「同步上游模型目录」转发到 production 的 /internal/v1/channels/{id}/sync，
// 并**透传上游状态码与响应体**（四种失败语义必须能到达界面）。
func TestChannelSyncForwardsToProduction(t *testing.T) {
	var path, auth, ws, actor string
	production := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path, auth = r.URL.Path, r.Header.Get("Authorization")
		ws, actor = r.Header.Get("X-Workspace-Id"), r.Header.Get("X-Actor-Id")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"channel_id":"ch_1","raw_count":2,"added":2,"updated":0,"missing":0,"price_changed":0}`))
	}))
	defer production.Close()
	workspace := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer workspace.Close()

	s := &server{
		httpClient:      &http.Client{Timeout: 2 * time.Second},
		workspaceURL:    workspace.URL,
		workspaceToken:  "wt",
		productionURL:   production.URL,
		productionToken: "pt",
		devWorkspace:    "ws_dev",
		devActor:        "user_dev",
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/channels/ch_1/sync", nil)
	req.SetPathValue("id", "ch_1")
	rec := httptest.NewRecorder()
	s.channelSync(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("期望 200，得到 %d：%s", rec.Code, rec.Body.String())
	}
	if path != "/internal/v1/channels/ch_1/sync" {
		t.Fatalf("转发路径不对：%q", path)
	}
	if auth != "Bearer pt" {
		t.Fatalf("应带 production 的内部令牌，实际 %q", auth)
	}
	if ws != "ws_dev" || actor != "user_dev" {
		t.Fatalf("应带 workspace/actor 头，实际 %q %q", ws, actor)
	}
	if !contains(rec.Body.String(), `"added":2`) {
		t.Fatalf("响应体应原样透传：%s", rec.Body.String())
	}
}

// 上游的 400/502 必须【原样】到达调用方（否则界面分不清"没配"还是"上游坏了"）
func TestChannelSyncPassesUpstreamStatusThrough(t *testing.T) {
	for _, code := range []int{http.StatusBadRequest, http.StatusNotFound, http.StatusBadGateway, http.StatusServiceUnavailable} {
		production := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(code)
			_, _ = w.Write([]byte(`{"code":"X","message":"upstream said so"}`))
		}))
		workspace := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))
		s := &server{
			httpClient:      &http.Client{Timeout: 2 * time.Second},
			workspaceURL:    workspace.URL,
			workspaceToken:  "wt",
			productionURL:   production.URL,
			productionToken: "pt",
			devWorkspace:    "ws_dev",
			devActor:        "user_dev",
		}
		req := httptest.NewRequest(http.MethodPost, "/api/v1/channels/ch_1/sync", nil)
		req.SetPathValue("id", "ch_1")
		rec := httptest.NewRecorder()
		s.channelSync(rec, req)
		if rec.Code != code {
			t.Fatalf("上游 %d 应原样透传，实际 %d", code, rec.Code)
		}
		if !contains(rec.Body.String(), "upstream said so") {
			t.Fatalf("上游错误文案应透传：%s", rec.Body.String())
		}
		production.Close()
		workspace.Close()
	}
}

// 授权被拒 ⇒ 403，且**不**去打扰 production（省一次无用的上游调用）
func TestChannelSyncDeniedByAuthorization(t *testing.T) {
	hit := false
	production := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hit = true
		w.WriteHeader(http.StatusOK)
	}))
	defer production.Close()
	workspace := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer workspace.Close()
	s := &server{
		httpClient:      &http.Client{Timeout: 2 * time.Second},
		workspaceURL:    workspace.URL,
		workspaceToken:  "wt",
		productionURL:   production.URL,
		productionToken: "pt",
		devWorkspace:    "ws_dev",
		devActor:        "user_dev",
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/channels/ch_1/sync", nil)
	req.SetPathValue("id", "ch_1")
	rec := httptest.NewRecorder()
	s.channelSync(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("期望 403，得到 %d", rec.Code)
	}
	if hit {
		t.Fatal("授权失败时不应调用 production")
	}
}

func contains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
