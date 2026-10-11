package catalog

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"shotdesigner/shared/netguard"
)

// 鉴权语义必须与【引擎】逐字一致（engine.go 的 data-driven 分支）：
// 同一个渠道，探测 / 同步 / 实际调用用同一套鉴权，否则会出现"探测通过但同步 401"。
func TestAuthForMatchesEngineSemantics(t *testing.T) {
	cases := []struct {
		name       string
		cfg        SyncChannelConfig
		key        string
		wantHeader string
		wantValue  string
	}{
		{"AuthHeader 非空 ⇒ 用自定义头 + 前缀", SyncChannelConfig{AuthHeader: "X-Api-Key", AuthPrefix: "tok "}, "K", "X-Api-Key", "tok K"},
		{"AuthHeader 非空且前缀为空 ⇒ 裸值", SyncChannelConfig{AuthHeader: "Authorization", AuthPrefix: ""}, "K", "Authorization", "K"},
		{"bearer ⇒ Bearer 前缀", SyncChannelConfig{AuthType: "bearer"}, "K", "Authorization", "Bearer K"},
		{"apikey ⇒ Bearer 前缀", SyncChannelConfig{AuthType: "apikey"}, "K", "Authorization", "Bearer K"},
		{"token ⇒ 裸值（AutoDL 形态）", SyncChannelConfig{AuthType: "token"}, "K", "Authorization", "K"},
		{"未知/空 ⇒ 默认 Bearer（历史行为不得漂移）", SyncChannelConfig{AuthType: ""}, "K", "Authorization", "Bearer K"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			h, v := authFor(c.cfg, c.key)
			if h != c.wantHeader || v != c.wantValue {
				t.Fatalf("期望 %s=%q，得到 %s=%q", c.wantHeader, c.wantValue, h, v)
			}
		})
	}
}

func TestJoinURL(t *testing.T) {
	cases := []struct {
		base, path, want string
		wantErr          bool
	}{
		{"https://api.example.com", "/v1/models", "https://api.example.com/v1/models", false},
		{"https://api.example.com/", "v1/models", "https://api.example.com/v1/models", false},
		{"https://api.example.com/relay/", "/api/pricing", "https://api.example.com/relay/api/pricing", false},
		{"", "/v1/models", "", true},
		{"https://api.example.com", "", "", true},
		{"ftp://api.example.com", "/v1/models", "", true},
	}
	for _, c := range cases {
		got, err := joinURL(c.base, c.path)
		if c.wantErr {
			if err == nil {
				t.Fatalf("base=%q path=%q 期望报错", c.base, c.path)
			}
			continue
		}
		if err != nil || got != c.want {
			t.Fatalf("base=%q path=%q 期望 %q，得到 %q（err=%v）", c.base, c.path, c.want, got, err)
		}
	}
}

// 只认 OpenAI 兼容的 {"data":[{"id":…}]}（外加同形状的 {"models":[…]}）：认不出就报错，不猜。
func TestParseModels(t *testing.T) {
	models, err := parseModels([]byte(`{"data":[{"id":"gpt-image-2","name":"图 2","type":"image","owned_by":"openai","created":1700000000,"pricing":{"amount":0.25,"unit":"per_call"}}]}`))
	if err != nil {
		t.Fatal(err)
	}
	if len(models) != 1 {
		t.Fatalf("应有 1 条，实际 %d", len(models))
	}
	m := models[0]
	if m.ProviderModel != "gpt-image-2" || m.DisplayName != "图 2" || m.ModelType != "image" || m.Vendor != "openai" {
		t.Fatalf("字段解析不对：%+v", m)
	}
	if m.RemoteCreatedAt == nil || !m.RemoteCreatedAt.Equal(time.Unix(1700000000, 0).UTC()) {
		t.Fatalf("created 应转成 UTC 时间：%+v", m.RemoteCreatedAt)
	}
	if string(m.Pricing) == "" {
		t.Fatal("行内 pricing 应被保留")
	}

	if _, err := parseModels([]byte(`{"models":[{"id":"m1"}]}`)); err != nil {
		t.Fatalf("models 形状应被接受：%v", err)
	}
	if _, err := parseModels([]byte(`{"foo":1}`)); err == nil {
		t.Fatal("没有 data/models 数组应报错")
	}
	if _, err := parseModels([]byte(`not json`)); err == nil {
		t.Fatal("非 JSON 应报错")
	}
	if _, err := parseModels([]byte(`{"data":[{"name":"no-id"}]}`)); err == nil {
		t.Fatal("缺 id 的条目应报错")
	}

	// 没有 name/type 时用 id / object 兜底（上游原样标签，不做约束）
	models2, err := parseModels([]byte(`{"data":[{"id":"m2","object":"chat.completion"}]}`))
	if err != nil {
		t.Fatal(err)
	}
	if models2[0].DisplayName != "m2" || models2[0].ModelType != "chat.completion" {
		t.Fatalf("兜底不对：%+v", models2[0])
	}
}

// ★ SSRF：**默认策略必须拒绝环回**；显式放行后才允许（与 execution 的实测行为一致）。
func TestHTTPListerRefusesLoopbackByDefault(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":[{"id":"m1"}]}`))
	}))
	defer srv.Close()

	cfg := SyncChannelConfig{ID: "ch1", SyncKind: "openai_compatible", SyncModelsPath: "/v1/models"}
	strict := NewHTTPLister(netguard.Policy{}, 5*time.Second)
	if _, _, err := strict.List(context.Background(), cfg, srv.URL, ""); err == nil {
		t.Fatal("默认策略下，环回地址必须被拒绝")
	} else if !strings.Contains(strings.ToLower(err.Error()), "loopback") && !strings.Contains(strings.ToLower(err.Error()), "private") {
		t.Fatalf("拒绝原因应可读地指出环回/私网，实际：%v", err)
	}

	allowed := NewHTTPLister(netguard.Policy{AllowPrivate: true}, 5*time.Second)
	models, endpoints, err := allowed.List(context.Background(), cfg, srv.URL, "")
	if err != nil {
		t.Fatalf("显式放行后应成功：%v", err)
	}
	if len(models) != 1 || endpoints["models"] == "" {
		t.Fatalf("应有 1 条模型与端点映射：%+v %+v", models, endpoints)
	}
}

// 价格抓取失败【不算同步失败】：模型清单仍有价值；失败原因记进 endpoints 供排障。
func TestHTTPListerPricingFailureIsNotFatal(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "pricing") {
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte("boom"))
			return
		}
		_, _ = w.Write([]byte(`{"data":[{"id":"m1"},{"id":"m2"}]}`))
	}))
	defer srv.Close()
	cfg := SyncChannelConfig{ID: "ch1", SyncKind: "openai_compatible", SyncModelsPath: "/v1/models", SyncPricingPath: "/api/pricing"}
	l := NewHTTPLister(netguard.Policy{AllowPrivate: true}, 5*time.Second)
	models, endpoints, err := l.List(context.Background(), cfg, srv.URL, "")
	if err != nil {
		t.Fatalf("价格失败不应让整次抓取失败：%v", err)
	}
	if len(models) != 2 {
		t.Fatalf("应仍有 2 条模型，实际 %d", len(models))
	}
	if endpoints["pricing_error"] == "" {
		t.Fatal("价格失败原因应记进 endpoints（不是静默吞掉）")
	}
}

// 鉴权头确实发出去了（用自定义头 + 裸值形态各验一次）。
func TestHTTPListerSendsAuthHeader(t *testing.T) {
	got := make(chan string, 2)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got <- r.Header.Get("X-Api-Key")
		_, _ = w.Write([]byte(`{"data":[{"id":"m1"}]}`))
	}))
	defer srv.Close()
	l := NewHTTPLister(netguard.Policy{AllowPrivate: true}, 5*time.Second)
	cfg := SyncChannelConfig{ID: "ch1", SyncKind: "openai_compatible", SyncModelsPath: "/v1/models", AuthHeader: "X-Api-Key", AuthPrefix: "tok "}
	if _, _, err := l.List(context.Background(), cfg, srv.URL, "SECRET"); err != nil {
		t.Fatal(err)
	}
	if h := <-got; h != "tok SECRET" {
		t.Fatalf("鉴权头应为 AuthPrefix+key，实际 %q", h)
	}
}

// 401 要让排查者一眼看到状态码（而不是笼统的失败）。
func TestHTTPListerReportsStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"invalid key"}`))
	}))
	defer srv.Close()
	l := NewHTTPLister(netguard.Policy{AllowPrivate: true}, 5*time.Second)
	cfg := SyncChannelConfig{ID: "ch1", SyncKind: "openai_compatible", SyncModelsPath: "/v1/models"}
	_, _, err := l.List(context.Background(), cfg, srv.URL, "bad")
	if err == nil || !strings.Contains(err.Error(), "401") {
		t.Fatalf("错误里应包含状态码 401，实际 %v", err)
	}
	_ = json.RawMessage(nil)
}
