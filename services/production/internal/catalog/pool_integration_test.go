package catalog

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"
)

// 逐条对应 ADR-004 §8 的验证计划（1–4、6 中与库相关的部分）。

func poolRows(t *testing.T, s PostgresStore, channelID string) map[string]struct {
	Display   string
	FirstSeen time.Time
	LastSeen  time.Time
	Missing   *time.Time
	Pricing   string
} {
	t.Helper()
	rows, err := s.Pool.Query(context.Background(),
		`SELECT provider_model, COALESCE(display_name,''), first_seen_at, last_seen_at, missing_since, pricing::text
		   FROM channel_models WHERE channel_id=$1`, channelID)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	out := map[string]struct {
		Display   string
		FirstSeen time.Time
		LastSeen  time.Time
		Missing   *time.Time
		Pricing   string
	}{}
	for rows.Next() {
		var k, d, p string
		var fs, ls time.Time
		var m *time.Time
		if err := rows.Scan(&k, &d, &fs, &ls, &m, &p); err != nil {
			t.Fatal(err)
		}
		out[k] = struct {
			Display   string
			FirstSeen time.Time
			LastSeen  time.Time
			Missing   *time.Time
			Pricing   string
		}{d, fs, ls, m, p}
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	return out
}

func seedChannel(t *testing.T, s PostgresStore, id string) {
	t.Helper()
	if _, err := s.Pool.Exec(context.Background(),
		// kind 必须落在 CHECK 允许的集合内：official | aggregator | local
		// （判据：pg_constraint 读出 model_channels_kind_check；中转站对应 aggregator）
		`INSERT INTO model_channels (id, name, kind, base_url) VALUES ($1,$2,'aggregator','https://relay.test') ON CONFLICT (id) DO NOTHING`,
		id, id); err != nil {
		t.Fatal(err)
	}
}

func upstream(pairs ...string) []UpstreamModel {
	out := make([]UpstreamModel, 0, len(pairs)/2)
	for i := 0; i+1 < len(pairs); i += 2 {
		out = append(out, UpstreamModel{
			ProviderModel: pairs[i],
			DisplayName:   pairs[i+1],
			ModelType:     "image",
			Pricing:       json.RawMessage(`{"per_call":0.1}`),
		})
	}
	return out
}

// §8.1 幂等：连续同步两次，行数与内容不变（时间戳 first_seen_at 不被刷新）
func TestIntegrationApplySyncIsIdempotent(t *testing.T) {
	s := testPostgresStore(t)
	ctx := context.Background()
	seedChannel(t, s, "ch_idem")

	first, err := s.ApplySync(ctx, "ch_idem", upstream("m1", "模型一", "m2", "模型二"))
	if err != nil {
		t.Fatal(err)
	}
	if first.Added != 2 || first.Updated != 0 || first.Missing != 0 {
		t.Fatalf("首次应为 added=2/updated=0/missing=0，实际 %+v", first)
	}
	before := poolRows(t, s, "ch_idem")

	second, err := s.ApplySync(ctx, "ch_idem", upstream("m1", "模型一", "m2", "模型二"))
	if err != nil {
		t.Fatal(err)
	}
	if second.Added != 0 || second.Updated != 2 {
		t.Fatalf("第二次应为 added=0/updated=2，实际 %+v", second)
	}
	after := poolRows(t, s, "ch_idem")
	if len(after) != len(before) {
		t.Fatalf("行数应不变：%d → %d", len(before), len(after))
	}
	for k, b := range before {
		a := after[k]
		if a.Display != b.Display {
			t.Errorf("%s 内容被改动：%q → %q", k, b.Display, a.Display)
		}
		if !a.FirstSeen.Equal(b.FirstSeen) {
			t.Errorf("%s 的 first_seen_at 被刷新了（幂等要求不刷新）", k)
		}
		if a.Missing != nil {
			t.Errorf("%s 不应被标记缺失", k)
		}
	}
}

// §8.2 差异：上游少一个模型 ⇒ missing_since 置位且【行未删除】；再出现 ⇒ 置回 NULL
func TestIntegrationApplySyncMarksMissingWithoutDeleting(t *testing.T) {
	s := testPostgresStore(t)
	ctx := context.Background()
	seedChannel(t, s, "ch_miss")

	if _, err := s.ApplySync(ctx, "ch_miss", upstream("m1", "一", "m2", "二")); err != nil {
		t.Fatal(err)
	}
	firstSeen := poolRows(t, s, "ch_miss")["m2"].FirstSeen

	res, err := s.ApplySync(ctx, "ch_miss", upstream("m1", "一"))
	if err != nil {
		t.Fatal(err)
	}
	if res.Missing != 1 {
		t.Fatalf("应有 1 行被标记缺失，实际 %+v", res)
	}
	rows := poolRows(t, s, "ch_miss")
	if len(rows) != 2 {
		t.Fatalf("**行不得被删除**：应仍为 2 行，实际 %d", len(rows))
	}
	if rows["m2"].Missing == nil {
		t.Fatal("m2 的 missing_since 应已置位")
	}
	missingAt := *rows["m2"].Missing

	// 再次出现 ⇒ 置回 NULL，且 first_seen_at 不被刷新
	if _, err := s.ApplySync(ctx, "ch_miss", upstream("m1", "一", "m2", "二")); err != nil {
		t.Fatal(err)
	}
	rows = poolRows(t, s, "ch_miss")
	if rows["m2"].Missing != nil {
		t.Fatal("m2 重新出现后 missing_since 应置回 NULL")
	}
	if !rows["m2"].FirstSeen.Equal(firstSeen) {
		t.Error("重新出现不应刷新 first_seen_at（它是「首次见到」的事实）")
	}
	_ = missingAt
}

// §8.3 不越界：同步【绝不】写 model_catalog
func TestIntegrationApplySyncNeverWritesModelCatalog(t *testing.T) {
	s := testPostgresStore(t)
	ctx := context.Background()
	seedChannel(t, s, "ch_nocat")

	count := func() int {
		var n int
		if err := s.Pool.QueryRow(ctx, `SELECT count(*) FROM model_catalog`).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	before := count()
	if _, err := s.ApplySync(ctx, "ch_nocat", upstream("m1", "一", "m2", "二", "m3", "三")); err != nil {
		t.Fatal(err)
	}
	if after := count(); after != before {
		t.Fatalf("同步不得改动 model_catalog：%d → %d", before, after)
	}
}

// §8.4 失败隔离：中途失败 ⇒ 整体回滚 ⇒ 已有供给池数据完好
func TestIntegrationApplySyncRollsBackOnFailure(t *testing.T) {
	s := testPostgresStore(t)
	ctx := context.Background()
	seedChannel(t, s, "ch_fail")

	if _, err := s.ApplySync(ctx, "ch_fail", upstream("m1", "一", "m2", "二")); err != nil {
		t.Fatal(err)
	}
	before := poolRows(t, s, "ch_fail")

	// 构造中途失败：第二条的 endpoint_types 不是合法 JSON ⇒ jsonb 转换报错
	bad := []UpstreamModel{
		{ProviderModel: "m3", DisplayName: "三", EndpointTypes: json.RawMessage(`["ok"]`)},
		{ProviderModel: "m4", DisplayName: "四", EndpointTypes: json.RawMessage(`{not json`)},
	}
	if _, err := s.ApplySync(ctx, "ch_fail", bad); err == nil {
		t.Fatal("非法 JSON 应导致失败")
	}

	after := poolRows(t, s, "ch_fail")
	if len(after) != len(before) {
		t.Fatalf("失败必须整体回滚：行数应仍为 %d，实际 %d", len(before), len(after))
	}
	if _, exists := after["m3"]; exists {
		t.Error("失败事务中已写入的 m3 也必须被回滚掉")
	}
	for k, b := range before {
		if !after[k].FirstSeen.Equal(b.FirstSeen) || after[k].Missing != nil {
			t.Errorf("已存在的 %s 应完好无损", k)
		}
	}
}

// §8.6 价格来源：同步价写入 pricing，并计入 price_changed（cost_*/price_* 的落位在策展时）
func TestIntegrationApplySyncCountsPriceChanges(t *testing.T) {
	s := testPostgresStore(t)
	ctx := context.Background()
	seedChannel(t, s, "ch_price")

	if _, err := s.ApplySync(ctx, "ch_price", upstream("m1", "一")); err != nil {
		t.Fatal(err)
	}
	// 价格未变 ⇒ 不计
	res, err := s.ApplySync(ctx, "ch_price", upstream("m1", "一"))
	if err != nil {
		t.Fatal(err)
	}
	if res.PriceChanged != 0 {
		t.Fatalf("价格未变时不应计入，实际 %+v", res)
	}
	// 价格变化 ⇒ 计 1，且落库
	changed := []UpstreamModel{{ProviderModel: "m1", DisplayName: "一", Pricing: json.RawMessage(`{"per_call":0.2}`)}}
	res, err = s.ApplySync(ctx, "ch_price", changed)
	if err != nil {
		t.Fatal(err)
	}
	if res.PriceChanged != 1 {
		t.Fatalf("价格变化应计 1，实际 %+v", res)
	}
	if got := poolRows(t, s, "ch_price")["m1"].Pricing; got != `{"per_call": 0.2}` {
		t.Errorf("价格未落库，实际 %s", got)
	}
}

// §8.4 的另一半：失败的同步也要【留痕】
func TestIntegrationSyncRecordLifecycle(t *testing.T) {
	s := testPostgresStore(t)
	ctx := context.Background()
	seedChannel(t, s, "ch_rec")

	id, err := s.StartSync(ctx, "ch_rec")
	if err != nil {
		t.Fatal(err)
	}
	var status string
	if err := s.Pool.QueryRow(ctx, `SELECT status FROM channel_model_syncs WHERE id=$1`, id).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "running" {
		t.Fatalf("新记录应为 running，实际 %q", status)
	}

	if err := s.FinishSync(ctx, id, SyncResult{RawCount: 5, Added: 3, Updated: 2, Missing: 1, PriceChanged: 1}, nil, nil, nil); err != nil {
		t.Fatal(err)
	}
	var raw, added, updated, missing, priceChanged int
	var finished *time.Time
	if err := s.Pool.QueryRow(ctx,
		`SELECT status, raw_count, added, updated, missing, price_changed, finished_at FROM channel_model_syncs WHERE id=$1`, id).
		Scan(&status, &raw, &added, &updated, &missing, &priceChanged, &finished); err != nil {
		t.Fatal(err)
	}
	if status != "succeeded" || raw != 5 || added != 3 || updated != 2 || missing != 1 || priceChanged != 1 || finished == nil {
		t.Fatalf("计数未如实落库：status=%s raw=%d added=%d updated=%d missing=%d price=%d finished=%v",
			status, raw, added, updated, missing, priceChanged, finished)
	}

	// 失败路径：错误必须被记录下来
	failID, err := s.StartSync(ctx, "ch_rec")
	if err != nil {
		t.Fatal(err)
	}
	if err := s.FinishSync(ctx, failID, SyncResult{}, nil, nil, errors.New("上游 500")); err != nil {
		t.Fatal(err)
	}
	var errText *string
	if err := s.Pool.QueryRow(ctx, `SELECT status, error FROM channel_model_syncs WHERE id=$1`, failID).Scan(&status, &errText); err != nil {
		t.Fatal(err)
	}
	if status != "failed" || errText == nil || *errText != "上游 500" {
		t.Fatalf("失败未留痕：status=%s error=%v", status, errText)
	}
}
