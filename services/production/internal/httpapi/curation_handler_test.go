package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"shotdesigner/services/production/internal/catalog"
)

// D1：策展接口的契约。stub 只实现被本文件用到的方法，其余用嵌入接口占位。
type stubCurationStore struct {
	supply    []catalog.SupplyItem
	supplyErr error
	curated   catalog.CuratedModel
	curateErr error
	seenWS    string
	seenActor string
	seenChan  string
	seenInput catalog.CurateInput
}

func (s *stubCurationStore) ListSupply(_ context.Context, workspace, channelID string, _ bool) ([]catalog.SupplyItem, error) {
	s.seenWS, s.seenChan = workspace, channelID
	return s.supply, s.supplyErr
}

func (s *stubCurationStore) Curate(_ context.Context, workspace, actor string, in catalog.CurateInput) (catalog.CuratedModel, error) {
	s.seenWS, s.seenActor, s.seenInput = workspace, actor, in
	return s.curated, s.curateErr
}

func curationReq(method, target, body string) *http.Request {
	var r *http.Request
	if body == "" {
		r = httptest.NewRequest(method, target, nil)
	} else {
		r = httptest.NewRequest(method, target, strings.NewReader(body))
	}
	r.Header.Set("Authorization", "Bearer secret")
	r.Header.Set("X-Workspace-Id", "ws_a")
	r.Header.Set("X-Actor-Id", "user_a")
	r.Header.Set("X-Actor-Role", "owner")
	r.Header.Set("Content-Type", "application/json")
	return r
}

func TestListSupplyEndpointPassesWorkspace(t *testing.T) {
	stub := &stubCurationStore{supply: []catalog.SupplyItem{{ChannelID: "ch_1", ProviderModel: "m-1", DisplayName: "上游一"}}}
	h := Handler{Token: "secret", CurationStore: stub}
	rec := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, curationReq(http.MethodGet, "/internal/v1/catalog/supply?channel_id=ch_1&include_missing=1", ""))
	if rec.Code != http.StatusOK {
		t.Fatalf("期望 200，得到 %d：%s", rec.Code, rec.Body.String())
	}
	if stub.seenWS != "ws_a" || stub.seenChan != "ch_1" {
		t.Fatalf("工作区/渠道应透传，实际 %q %q", stub.seenWS, stub.seenChan)
	}
	var got struct {
		Items []map[string]any `json:"items"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if len(got.Items) != 1 || got.Items[0]["providerModel"] != "m-1" {
		t.Fatalf("响应应为驼峰字段且含该行：%v", got.Items)
	}
}

func TestListSupplyEndpointRequiresChannel(t *testing.T) {
	h := Handler{Token: "secret", CurationStore: &stubCurationStore{}}
	rec := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, curationReq(http.MethodGet, "/internal/v1/catalog/supply", ""))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("缺 channel_id 应 400，得到 %d", rec.Code)
	}
}

func TestCurateEndpointHappyPath(t *testing.T) {
	stub := &stubCurationStore{curated: catalog.CuratedModel{ID: "mod_x", ChannelID: "ch_1", Family: "f", Name: "n"}}
	h := Handler{Token: "secret", CurationStore: stub}
	body := `{"id":"mod_x","family":"f","name":"n","type":"image","channelId":"ch_1","providerModel":"m-1"}`
	rec := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, curationReq(http.MethodPost, "/internal/v1/catalog/curate", body))
	if rec.Code != http.StatusOK {
		t.Fatalf("期望 200，得到 %d：%s", rec.Code, rec.Body.String())
	}
	if stub.seenActor != "user_a" || stub.seenInput.ProviderModel != "m-1" {
		t.Fatalf("actor/入参应透传：%q %+v", stub.seenActor, stub.seenInput)
	}
}

// 供给池里没有这条 ⇒ 404（不猜、不新建：策展的前提是"上游确实同步过它"）
func TestCurateEndpointSupplyMissing(t *testing.T) {
	h := Handler{Token: "secret", CurationStore: &stubCurationStore{curateErr: catalog.ErrSupplyNotFound}}
	body := `{"id":"mod_x","family":"f","name":"n","type":"image","channelId":"ch_1","providerModel":"m-1"}`
	rec := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, curationReq(http.MethodPost, "/internal/v1/catalog/curate", body))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("期望 404，得到 %d", rec.Code)
	}
}

// 产品面只允许 text|image|video ⇒ 上游的原样标签不能越过这道约束
func TestCurateEndpointRejectsUnsupportedType(t *testing.T) {
	h := Handler{Token: "secret", CurationStore: &stubCurationStore{curateErr: errors.New(`unsupported model type "audio": model_catalog only allows text|image|video`)}}
	body := `{"id":"mod_x","family":"f","name":"n","type":"audio","channelId":"ch_1","providerModel":"m-1"}`
	rec := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, curationReq(http.MethodPost, "/internal/v1/catalog/curate", body))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("期望 422，得到 %d", rec.Code)
	}
}

// 未装配 store ⇒ 503 如实拒绝（而不是静默成功）
func TestCurationEndpointsDisabled(t *testing.T) {
	h := Handler{Token: "secret"}
	rec := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, curationReq(http.MethodGet, "/internal/v1/catalog/supply?channel_id=ch_1", ""))
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("期望 503，得到 %d", rec.Code)
	}
}
