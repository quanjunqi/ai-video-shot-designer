package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"shotdesigner/services/production/internal/catalog"
)

type stubSyncer struct {
	res    catalog.SyncResult
	err    error
	wsSeen string
	chSeen string
}

func (s *stubSyncer) SyncChannel(_ context.Context, workspaceID, channelID string) (catalog.SyncResult, error) {
	s.wsSeen, s.chSeen = workspaceID, channelID
	return s.res, s.err
}

func syncRequest(channelID string) *http.Request {
	r := httptest.NewRequest(http.MethodPost, "/internal/v1/channels/"+channelID+"/sync", nil)
	r.Header.Set("Authorization", "Bearer secret")
	r.Header.Set("X-Workspace-Id", "ws_dev")
	r.Header.Set("X-Actor-Id", "user_dev")
	return r
}

// 成功：返回计数，且把 workspace / channel 原样交给同步器
func TestSyncChannelEndpointOK(t *testing.T) {
	stub := &stubSyncer{res: catalog.SyncResult{RawCount: 3, Added: 2, Updated: 1, Missing: 0, PriceChanged: 1}}
	h := Handler{Token: "secret", ChannelSyncer: stub}
	rec := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, syncRequest("ch_1"))
	if rec.Code != http.StatusOK {
		t.Fatalf("期望 200，得到 %d：%s", rec.Code, rec.Body.String())
	}
	var got map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got["channel_id"] != "ch_1" || got["raw_count"].(float64) != 3 || got["price_changed"].(float64) != 1 {
		t.Fatalf("返回内容不对：%v", got)
	}
	if stub.wsSeen != "ws_dev" || stub.chSeen != "ch_1" {
		t.Fatalf("workspace/channel 传参不对：%q %q", stub.wsSeen, stub.chSeen)
	}
}

// 没配同步 ⇒ 400（这是"配置问题"，不是上游故障 —— 状态码要能区分）
func TestSyncChannelEndpointNotConfigured(t *testing.T) {
	h := Handler{Token: "secret", ChannelSyncer: &stubSyncer{err: catalog.ErrSyncNotConfigured}}
	rec := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, syncRequest("ch_1"))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("期望 400，得到 %d", rec.Code)
	}
}

// 渠道不存在 ⇒ 404（领域错误映射，handler 不依赖驱动包）
func TestSyncChannelEndpointChannelNotFound(t *testing.T) {
	h := Handler{Token: "secret", ChannelSyncer: &stubSyncer{err: catalog.ErrChannelNotFound}}
	rec := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, syncRequest("nope"))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("期望 404，得到 %d", rec.Code)
	}
}

// 上游失败 ⇒ 502（并把原因带出来，便于运营在界面上看到）
func TestSyncChannelEndpointUpstreamFailed(t *testing.T) {
	h := Handler{Token: "secret", ChannelSyncer: &stubSyncer{err: errors.New("upstream 503")}}
	rec := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, syncRequest("ch_1"))
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("期望 502，得到 %d", rec.Code)
	}
	if !contains(rec.Body.String(), "upstream 503") {
		t.Fatalf("错误原因应带出来：%s", rec.Body.String())
	}
}

// 未装配同步器 ⇒ 503 如实拒绝（而不是静默成功）
func TestSyncChannelEndpointDisabled(t *testing.T) {
	h := Handler{Token: "secret"}
	rec := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, syncRequest("ch_1"))
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("期望 503，得到 %d", rec.Code)
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
