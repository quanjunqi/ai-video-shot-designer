package catalog

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"shotdesigner/shared/netguard"
)

// ADR-004 §4 第①步的端到端判据：抓取 → 解析 → 落库 → 留痕。
// 上游用本地 httptest（真实 HTTP，但不花钱）；密钥用假实现（无需 workspace）。

type fakeCreds struct {
	cred Credential
	err  error
}

func (f fakeCreds) Reveal(context.Context, string, string) (Credential, error) {
	return f.cred, f.err
}

type fakeLister struct {
	models []UpstreamModel
	err    error
}

func (f fakeLister) List(context.Context, SyncChannelConfig, string, string) ([]UpstreamModel, map[string]string, error) {
	return f.models, map[string]string{"models": "fake://models"}, f.err
}

// 助手统一加 sync 前缀：本包已有 seedChannel 等同名助手（并行开发留下的），不去动别人的。
func syncSeedChannel(t *testing.T, s PostgresStore, id, kind, modelsPath, pricingPath, authType string) {
	t.Helper()
	if _, err := s.Pool.Exec(context.Background(), `
		INSERT INTO model_channels (id, name, kind, base_url, auth_type, sync_kind, sync_models_path, sync_pricing_path)
		VALUES ($1, $1, 'aggregator', 'https://upstream.example.com', $2, $3, $4, NULLIF($5,'')::text)`,
		id, authType, kind, modelsPath, pricingPath); err != nil {
		t.Fatal(err)
	}
}

type syncRecordRow struct {
	Status    string
	Added     *int
	Updated   *int
	Missing   *int
	Endpoints string
	Err       *string
	Finished  *time.Time
}

func syncRecordsFor(t *testing.T, s PostgresStore, channelID string) []syncRecordRow {
	t.Helper()
	rows, err := s.Pool.Query(context.Background(), `
		SELECT status, added, updated, missing, COALESCE(endpoints::text,''), error, finished_at
		  FROM channel_model_syncs WHERE channel_id=$1 ORDER BY id`, channelID)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []syncRecordRow
	for rows.Next() {
		var r syncRecordRow
		if err := rows.Scan(&r.Status, &r.Added, &r.Updated, &r.Missing, &r.Endpoints, &r.Err, &r.Finished); err != nil {
			t.Fatal(err)
		}
		out = append(out, r)
	}
	return out
}

func syncModelCount(t *testing.T, s PostgresStore, channelID string) int {
	t.Helper()
	var n int
	if err := s.Pool.QueryRow(context.Background(),
		`SELECT count(*) FROM channel_models WHERE channel_id=$1`, channelID).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func syncFirstSeen(t *testing.T, s PostgresStore, channelID string) map[string]time.Time {
	t.Helper()
	rows, err := s.Pool.Query(context.Background(),
		`SELECT provider_model, first_seen_at FROM channel_models WHERE channel_id=$1`, channelID)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	out := map[string]time.Time{}
	for rows.Next() {
		var k string
		var fs time.Time
		if err := rows.Scan(&k, &fs); err != nil {
			t.Fatal(err)
		}
		out[k] = fs
	}
	return out
}

// ① 没配同步 ⇒ 明确拒绝，且不留下任何同步记录（"没配就别猜"）
func TestIntegrationSyncChannelRefusesWhenNotConfigured(t *testing.T) {
	s := testPostgresStore(t)
	syncSeedChannel(t, s, "ch_none", "none", "", "", "none")
	sy := Syncer{Store: s, Credentials: fakeCreds{}, Lister: fakeLister{}}
	if _, err := sy.SyncChannel(context.Background(), "ws_dev", "ch_none"); !errors.Is(err, ErrSyncNotConfigured) {
		t.Fatalf("应返回 ErrSyncNotConfigured，实际 %v", err)
	}
	if n := len(syncRecordsFor(t, s, "ch_none")); n != 0 {
		t.Fatalf("未配置时不应写同步记录，实际 %d 条", n)
	}
	if n := syncModelCount(t, s, "ch_none"); n != 0 {
		t.Fatalf("未配置时不应写供给池，实际 %d 行", n)
	}
}

// ② 正常一次同步 + ③ 幂等 + ④ 上游少一条只标记不删
func TestIntegrationSyncChannelHappyPath(t *testing.T) {
	s := testPostgresStore(t)
	syncSeedChannel(t, s, "ch_ok", "openai_compatible", "/v1/models", "", "bearer")
	fixed := time.Date(2026, 10, 11, 12, 0, 0, 0, time.UTC)
	sy := Syncer{
		Store:       s,
		Credentials: fakeCreds{cred: Credential{APIKey: "k"}},
		Lister: fakeLister{models: []UpstreamModel{
			{ProviderModel: "m_a", DisplayName: "A", ModelType: "image", Pricing: json.RawMessage(`{"amount":0.25,"unit":"per_call"}`)},
			{ProviderModel: "m_b", DisplayName: "B", ModelType: "image"},
		}},
		Now: func() time.Time { return fixed },
	}
	res, err := sy.SyncChannel(context.Background(), "ws_dev", "ch_ok")
	if err != nil {
		t.Fatal(err)
	}
	if res.RawCount != 2 || res.Added != 2 {
		t.Fatalf("计数不对：%+v", res)
	}
	if n := syncModelCount(t, s, "ch_ok"); n != 2 {
		t.Fatalf("供给池应有 2 行，实际 %d", n)
	}

	recs := syncRecordsFor(t, s, "ch_ok")
	if len(recs) != 1 || recs[0].Status != "succeeded" || recs[0].Finished == nil {
		t.Fatalf("应有 1 条 succeeded 且已结束的记录：%+v", recs)
	}
	if recs[0].Endpoints == "" {
		t.Fatal("endpoints 应记录实际访问的上游地址（供追溯）")
	}
	if recs[0].Err != nil {
		t.Fatalf("成功时不应有错误：%v", *recs[0].Err)
	}

	var last *time.Time
	if err := s.Pool.QueryRow(context.Background(),
		`SELECT last_sync_at FROM model_channels WHERE id='ch_ok'`).Scan(&last); err != nil {
		t.Fatal(err)
	}
	if last == nil || !last.Equal(fixed) {
		t.Fatalf("last_sync_at 应更新为注入的时刻：%v", last)
	}

	// ③ 幂等：§8.1 的语义是【行集与内容不变、first_seen_at 不被刷新】。
	//    `Updated` 计的是"这次写过的行"，重复同步时它不为 0，也【不代表语义变化】。
	before := syncFirstSeen(t, s, "ch_ok")
	res2, err := sy.SyncChannel(context.Background(), "ws_dev", "ch_ok")
	if err != nil {
		t.Fatal(err)
	}
	if res2.Added != 0 || res2.RawCount != 2 {
		t.Fatalf("重复同步不应新增，实际 %+v", res2)
	}
	if n := syncModelCount(t, s, "ch_ok"); n != 2 {
		t.Fatalf("重复同步后行数应仍为 2，实际 %d", n)
	}
	after := syncFirstSeen(t, s, "ch_ok")
	if len(after) != len(before) {
		t.Fatalf("行集合应不变：before=%d after=%d", len(before), len(after))
	}
	for k, fs := range before {
		if !after[k].Equal(fs) {
			t.Fatalf("%s 的 first_seen_at 不得被刷新（幂等）：%v → %v", k, fs, after[k])
		}
	}
	if n := len(syncRecordsFor(t, s, "ch_ok")); n != 2 {
		t.Fatalf("每次同步都应有自己的记录（共 2 条），实际 %d", n)
	}

	// ④ 上游少了一个 ⇒ 只标记 missing_since，绝不删行
	sy.Lister = fakeLister{models: []UpstreamModel{{ProviderModel: "m_a", DisplayName: "A", ModelType: "image"}}}
	res3, err := sy.SyncChannel(context.Background(), "ws_dev", "ch_ok")
	if err != nil {
		t.Fatal(err)
	}
	if res3.Missing != 1 {
		t.Fatalf("应有 1 条被标记缺失，实际 %+v", res3)
	}
	if n := syncModelCount(t, s, "ch_ok"); n != 2 {
		t.Fatalf("缺失不得删行，行数应仍为 2，实际 %d", n)
	}
	var missing *time.Time
	if err := s.Pool.QueryRow(context.Background(),
		`SELECT missing_since FROM channel_models WHERE channel_id='ch_ok' AND provider_model='m_b'`).Scan(&missing); err != nil {
		t.Fatal(err)
	}
	if missing == nil {
		t.Fatal("消失的模型应被置 missing_since")
	}
}

// ⑤ 抓取失败：留下 failed 记录（排障入口），且不写入任何供给池行
func TestIntegrationSyncChannelRecordsFailure(t *testing.T) {
	s := testPostgresStore(t)
	syncSeedChannel(t, s, "ch_fail", "openai_compatible", "/v1/models", "", "bearer")
	sy := Syncer{
		Store:       s,
		Credentials: fakeCreds{cred: Credential{APIKey: "k"}},
		Lister:      fakeLister{err: errors.New("upstream 503")},
	}
	if _, err := sy.SyncChannel(context.Background(), "ws_dev", "ch_fail"); err == nil {
		t.Fatal("抓取失败应返回错误")
	}
	recs := syncRecordsFor(t, s, "ch_fail")
	if len(recs) != 1 || recs[0].Status != "failed" || recs[0].Err == nil {
		t.Fatalf("应留下 1 条 failed 且带错误文案的记录：%+v", recs)
	}
	if n := syncModelCount(t, s, "ch_fail"); n != 0 {
		t.Fatalf("失败时不应写入供给池，实际 %d 行", n)
	}
}

// ⑥ 与 production 真实形态一致：真 HTTP（httptest 当上游）+ 真 netguard 策略 + 价格接口
func TestIntegrationSyncChannelOverRealHTTP(t *testing.T) {
	s := testPostgresStore(t)
	syncSeedChannel(t, s, "ch_http", "openai_compatible", "/v1/models", "/api/pricing", "bearer")

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer secret" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		if r.URL.Path == "/api/pricing" {
			_, _ = w.Write([]byte(`{"gpt-x":{"amount":1.5,"unit":"per_mtok_input"}}`))
			return
		}
		_, _ = w.Write([]byte(`{"data":[{"id":"gpt-x","name":"X","type":"text"}]}`))
	}))
	defer srv.Close()

	if _, err := s.Pool.Exec(context.Background(),
		`UPDATE model_channels SET base_url=$1 WHERE id='ch_http'`, srv.URL); err != nil {
		t.Fatal(err)
	}
	sy := Syncer{
		Store:       s,
		Credentials: fakeCreds{cred: Credential{APIKey: "secret"}},
		Lister:      NewHTTPLister(netguard.Policy{AllowPrivate: true}, 5*time.Second),
	}
	res, err := sy.SyncChannel(context.Background(), "ws_dev", "ch_http")
	if err != nil {
		t.Fatal(err)
	}
	if res.Added != 1 {
		t.Fatalf("应新增 1 条，实际 %+v", res)
	}
	var pricing string
	if err := s.Pool.QueryRow(context.Background(),
		`SELECT COALESCE(pricing::text,'') FROM channel_models WHERE channel_id='ch_http' AND provider_model='gpt-x'`).Scan(&pricing); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(pricing, "per_mtok_input") {
		t.Fatalf("价格接口的结果应被写进 pricing，实际 %q", pricing)
	}
}
