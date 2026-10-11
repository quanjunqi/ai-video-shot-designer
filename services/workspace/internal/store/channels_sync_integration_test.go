package store

import (
	"context"
	"testing"
)

// ADR-009 决定 2 的落点判据：同步配置【跟着渠道走】—— 写入后必须能原样读回，
// 且留空时归一为 'none'（而不是空串），让读侧只面对"不配同步 / 配了某个同步器"两种状态。
func TestIntegrationUserChannelSyncConfigRoundTrip(t *testing.T) {
	s, ctx := testStore(t)
	ptr := func(v string) *string { return &v }

	// user_channels.workspace_id 有外键指向 workspaces ⇒ 测试必须先建工作区行
	// （我第一次漏了，被 FK 当场拦下 —— 记在提交信息里）。
	for _, w := range []struct{ id, name string }{{"ws_test", "测试工作区"}, {"ws_other", "另一个工作区"}} {
		if _, err := s.Pool.Exec(ctx, `INSERT INTO workspaces (id, name) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING`, w.id, w.name); err != nil {
			t.Fatal(err)
		}
	}

	// ① 带同步配置写入
	in := UserChannel{
		ID: "ch_sync_cfg", Name: "中转站", Kind: "aggregator", Protocol: "api",
		BaseURL: "https://relay.example.com", AuthType: "bearer", Enabled: true, Note: "",
		SyncKind: "openai_compatible", SyncModelsPath: ptr("/v1/models"),
		SyncPricingPath: ptr("/api/pricing"), TrustNote: ptr("本地联调"),
	}
	saved, err := s.UpsertUserChannel(ctx, "ws_test", in)
	if err != nil {
		t.Fatal(err)
	}
	if saved.SyncKind != "openai_compatible" {
		t.Fatalf("syncKind 未落库：%+v", saved)
	}
	if saved.SyncModelsPath == nil || *saved.SyncModelsPath != "/v1/models" {
		t.Fatalf("syncModelsPath 未落库：%+v", saved.SyncModelsPath)
	}
	if saved.SyncPricingPath == nil || *saved.SyncPricingPath != "/api/pricing" {
		t.Fatalf("syncPricingPath 未落库：%+v", saved.SyncPricingPath)
	}
	if saved.TrustNote == nil || *saved.TrustNote != "本地联调" {
		t.Fatalf("trustNote 未落库：%+v", saved.TrustNote)
	}

	// ② 读回（逐个 + 列表两条路径都要带）
	got, err := s.GetUserChannel(ctx, "ws_test", "ch_sync_cfg")
	if err != nil {
		t.Fatal(err)
	}
	if got.SyncKind != "openai_compatible" || got.SyncModelsPath == nil || *got.SyncModelsPath != "/v1/models" {
		t.Fatalf("GetUserChannel 未带回同步配置：%+v", got)
	}
	items, err := s.ListUserChannels(ctx, "ws_test")
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, c := range items {
		if c.ID == "ch_sync_cfg" {
			found = true
			if c.SyncKind != "openai_compatible" {
				t.Fatalf("ListUserChannels 未带回同步配置：%+v", c)
			}
		}
	}
	if !found {
		t.Fatal("列表里应能找到该渠道")
	}

	// ③ 整替换语义：再写一次但不带同步配置 ⇒ 同步配置被清空（不静默保留旧值）
	in.SyncKind = "none"
	in.SyncModelsPath = nil
	in.SyncPricingPath = nil
	in.TrustNote = nil
	cleared, err := s.UpsertUserChannel(ctx, "ws_test", in)
	if err != nil {
		t.Fatal(err)
	}
	if cleared.SyncKind != "none" || cleared.SyncModelsPath != nil || cleared.SyncPricingPath != nil {
		t.Fatalf("整替换应清空同步配置，实际：%+v", cleared)
	}

	// ④ 另一个工作区不受影响（隔离性 —— 这正是 ADR-009 的目标）
	if _, err := s.UpsertUserChannel(ctx, "ws_other", UserChannel{
		ID: "ch_sync_cfg", Name: "他区渠道", Kind: "aggregator", Protocol: "api",
		BaseURL: "https://other.example.com", AuthType: "bearer", Enabled: true,
		SyncKind: "openai_compatible", SyncModelsPath: ptr("/models"),
	}); err != nil {
		t.Fatal(err)
	}
	other, err := s.GetUserChannel(ctx, "ws_other", "ch_sync_cfg")
	if err != nil {
		t.Fatal(err)
	}
	mine, err := s.GetUserChannel(ctx, "ws_test", "ch_sync_cfg")
	if err != nil {
		t.Fatal(err)
	}
	if other.SyncKind != "openai_compatible" || mine.SyncKind != "none" {
		t.Fatalf("两个工作区互相影响：other=%+v mine=%+v", other.SyncKind, mine.SyncKind)
	}
	_ = context.Background()
}
