package catalog

import (
	"context"
	"encoding/json"
	"testing"
)

// ADR-004 §4 的策展路径。核心主张：**约束在策展这一步施加**（§3.1），
// 以及 §8.6 的 cost_* / price_* 落位与 price_source。

// seedSupply 一次同步【多条】。★ 注意不能分多次调用：每次 ApplySync 都会把
// "本次未出现的行"标记为 missing（§8.2 的正确行为），分两次调用会把前一条标成缺失。
func seedSupply(t *testing.T, s PostgresStore, channelID string, rows ...[3]string) {
	t.Helper()
	items := make([]UpstreamModel, 0, len(rows))
	for _, r := range rows {
		items = append(items, UpstreamModel{
			ProviderModel: r[0],
			DisplayName:   r[0] + " 显示名",
			ModelType:     r[1],
			Pricing:       json.RawMessage(r[2]),
		})
	}
	if _, err := s.ApplySync(context.Background(), channelID, items); err != nil {
		t.Fatal(err)
	}
}

func catalogCount(t *testing.T, s PostgresStore) int {
	t.Helper()
	var n int
	if err := s.Pool.QueryRow(context.Background(), `SELECT count(*) FROM model_catalog`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestIntegrationListSupplyShowsUpstreamLabelsAndParsesPrice(t *testing.T) {
	s := testPostgresStore(t)
	ctx := context.Background()
	seedChannel(t, s, "ch_list")
	// audio 是上游标签，产品面**无法**表示 —— 供给池必须原样收下（ADR §3.1）
	seedSupply(t, s, "ch_list",
		[3]string{"m_audio", "audio", `{"amount":0.5,"unit":"per_call"}`},
		// 合法 JSON、但不是本文件认的那种窄约定 ⇒ 必须"不猜"
		[3]string{"m_weird", "image", `{"some":"other shape"}`})

	items, err := s.ListSupply(ctx, "ch_list", false)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 2 {
		t.Fatalf("应列出 2 条，实际 %d", len(items))
	}
	byID := map[string]SupplyItem{}
	for _, it := range items {
		byID[it.ProviderModel] = it
	}
	if byID["m_audio"].UpstreamType != "audio" {
		t.Errorf("上游标签应原样保留，实际 %q", byID["m_audio"].UpstreamType)
	}
	if byID["m_audio"].PricingAmount == nil || *byID["m_audio"].PricingAmount != 0.5 || byID["m_audio"].PricingUnit != "per_call" {
		t.Errorf("价格应按窄约定解析出来，实际 %+v", byID["m_audio"])
	}
	if byID["m_weird"].PricingAmount != nil {
		t.Error("认不出的定价形状【不许猜】，应为 nil")
	}
}

// ★ ADR §3.1 的核心主张：上游有任意标签，约束在这里施加
func TestIntegrationCurateRejectsTypesTheProductCannotRepresent(t *testing.T) {
	s := testPostgresStore(t)
	ctx := context.Background()
	seedChannel(t, s, "ch_cur")
	seedSupply(t, s, "ch_cur", [3]string{"m_audio", "audio", `{}`})
	before := catalogCount(t, s)

	if _, err := s.Curate(ctx, "human", CurateInput{
		ID: "mc_audio", Family: "f", Name: "音频模型", Type: "audio",
		ChannelID: "ch_cur", ProviderModel: "m_audio",
	}); err == nil {
		t.Fatal("type=audio 应被拒绝：model_catalog 只允许 text|image|video")
	}
	if after := catalogCount(t, s); after != before {
		t.Fatalf("被拒的策展不得写入任何行：%d → %d", before, after)
	}
}

// §8.6：同步价写入 cost_*/price_*，人工价写 price_*，price_source 正确
func TestIntegrationCuratePriceSource(t *testing.T) {
	s := testPostgresStore(t)
	ctx := context.Background()
	seedChannel(t, s, "ch_price2")
	seedSupply(t, s, "ch_price2", [3]string{"m1", "image", `{"amount":0.25,"unit":"per_call"}`})

	// ① 不给人工售价 ⇒ 取供给池的 ⇒ price_source=synced 且记录同步时刻
	synced, err := s.Curate(ctx, "human", CurateInput{
		ID: "mc_synced", Family: "f1", Name: "n1", Type: "image",
		ChannelID: "ch_price2", ProviderModel: "m1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if synced.PriceSource != "synced" || synced.PriceAmount == nil || *synced.PriceAmount != 0.25 {
		t.Fatalf("应取供给池价格并标记 synced，实际 %+v", synced)
	}
	var syncedAt *string
	if err := s.Pool.QueryRow(ctx, `SELECT price_synced_at::text FROM model_catalog WHERE id='mc_synced'`).Scan(&syncedAt); err != nil {
		t.Fatal(err)
	}
	if syncedAt == nil {
		t.Error("price_source=synced 时应记录 price_synced_at")
	}

	// ② 给人工售价 ⇒ price_source=manual，且不写 price_synced_at
	manual := 9.99
	man, err := s.Curate(ctx, "human", CurateInput{
		ID: "mc_manual", Family: "f2", Name: "n2", Type: "image",
		ChannelID: "ch_price2", ProviderModel: "m1",
		PriceAmount: &manual, PriceUnit: "per_call",
	})
	if err != nil {
		t.Fatal(err)
	}
	if man.PriceSource != "manual" || man.PriceAmount == nil || *man.PriceAmount != manual {
		t.Fatalf("人工价应标记 manual，实际 %+v", man)
	}
	if err := s.Pool.QueryRow(ctx, `SELECT price_synced_at::text FROM model_catalog WHERE id='mc_manual'`).Scan(&syncedAt); err != nil {
		t.Fatal(err)
	}
	if syncedAt != nil {
		t.Error("manual 价格不应写 price_synced_at")
	}
}

// 同一个 (family, channel_id) 重复策展 ⇒ 只有一行，version 递增（UNIQUE 约束）
func TestIntegrationCurateUpdatesInPlaceOnSameFamilyChannel(t *testing.T) {
	s := testPostgresStore(t)
	ctx := context.Background()
	seedChannel(t, s, "ch_up")
	seedSupply(t, s, "ch_up", [3]string{"m1", "image", `{}`})

	first, err := s.Curate(ctx, "h1", CurateInput{ID: "mc1", Family: "f", Name: "旧名", Type: "image", ChannelID: "ch_up", ProviderModel: "m1"})
	if err != nil {
		t.Fatal(err)
	}
	second, err := s.Curate(ctx, "h2", CurateInput{ID: "mc2", Family: "f", Name: "新名", Type: "image", ChannelID: "ch_up", ProviderModel: "m1"})
	if err != nil {
		t.Fatal(err)
	}
	if second.Version != first.Version+1 {
		t.Errorf("同 (family, channel) 再策展应就地更新并 version+1：%d → %d", first.Version, second.Version)
	}
	var n int
	if err := s.Pool.QueryRow(ctx, `SELECT count(*) FROM model_catalog WHERE family='f' AND channel_id='ch_up'`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("应只有一行，实际 %d", n)
	}
}

// 策展必须基于**真实存在的供给**：供给池里没有的行不许凭空造出来
func TestIntegrationCurateRequiresAnExistingSupplyRow(t *testing.T) {
	s := testPostgresStore(t)
	seedChannel(t, s, "ch_req")
	before := catalogCount(t, s)
	if _, err := s.Curate(context.Background(), "human", CurateInput{
		ID: "mc_ghost", Family: "f", Name: "n", Type: "image",
		ChannelID: "ch_req", ProviderModel: "never_synced",
	}); err == nil {
		t.Fatal("供给池里没有的 provider_model 应被拒绝")
	}
	if after := catalogCount(t, s); after != before {
		t.Fatalf("不得写入：%d → %d", before, after)
	}
}
