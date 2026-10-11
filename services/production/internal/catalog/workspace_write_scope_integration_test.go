package catalog

import (
	"context"
	"testing"
)

// ADR-009 Phase B2b 的验收判据（端到端的那一条）：
// **A 工作区同步进来的模型，B 工作区看不见** —— 这次是真写库、真过滤。
func TestIntegrationSyncWritesIntoWorkspaceScope(t *testing.T) {
	s := testPostgresStore(t)
	ctx := context.Background()
	if _, err := s.Pool.Exec(ctx, `INSERT INTO model_channels (id, name, kind, base_url, auth_type) VALUES ('ch_ws_write','写作用域渠道','aggregator','https://up.example.com','bearer')`); err != nil {
		t.Fatal(err)
	}
	upstream := []UpstreamModel{
		{ProviderModel: "m-1", DisplayName: "上游一", ModelType: "text"},
		{ProviderModel: "m-2", DisplayName: "上游二", ModelType: "image"},
	}

	// A 工作区同步
	if _, err := s.ApplySync(ctx, "ws_a", "ch_ws_write", upstream); err != nil {
		t.Fatal(err)
	}

	// ① 写进去的行确实带 ws_a 指纹
	var n int
	if err := s.Pool.QueryRow(ctx, `SELECT count(*) FROM channel_models WHERE workspace_id='ws_a' AND channel_id='ch_ws_write'`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 2 {
		t.Fatalf("ws_a 应写入 2 行，实际 %d", n)
	}

	// ② ★ A 看得见，B 看不见（这就是"多租户隔离"的端到端定义）
	seeA, err := s.ListSupply(ctx, "ws_a", "ch_ws_write", true)
	if err != nil {
		t.Fatal(err)
	}
	if len(seeA) != 2 {
		t.Fatalf("ws_a 应看得见 2 行，实际 %d", len(seeA))
	}
	seeB, err := s.ListSupply(ctx, "ws_b", "ch_ws_write", true)
	if err != nil {
		t.Fatal(err)
	}
	if len(seeB) != 0 {
		t.Fatalf("★ ws_b 不应看见 ws_a 同步进来的任何行，实际 %d 行", len(seeB))
	}

	// ③ 同步记录也带工作区（审计按工作区过滤的前提）
	syncID, err := s.StartSync(ctx, "ws_a", "ch_ws_write")
	if err != nil {
		t.Fatal(err)
	}
	if err := s.FinishSync(ctx, syncID, SyncResult{RawCount: 2, Added: 2}, nil, nil, nil); err != nil {
		t.Fatal(err)
	}
	var ws string
	if err := s.Pool.QueryRow(ctx, `SELECT workspace_id FROM channel_model_syncs WHERE id=$1`, syncID).Scan(&ws); err != nil {
		t.Fatal(err)
	}
	if ws != "ws_a" {
		t.Fatalf("同步记录应归 ws_a，实际 %q", ws)
	}

	// ④ 平台视角（""）看不到工作区私有的行（不越权）
	seePlatform, err := s.ListSupply(ctx, "", "ch_ws_write", true)
	if err != nil {
		t.Fatal(err)
	}
	if len(seePlatform) != 0 {
		t.Fatalf("平台视角不应看到工作区私有的供给行，实际 %d 行", len(seePlatform))
	}
}

// 配置来源顺序：**工作区自己的渠道优先**（ADR-009 决定 2），且这解开了 F3
// （工作区渠道的 id 就是它的 user_channels.id，不再要求"与平台渠道 id 相同"）。
type fakeUserChannels struct {
	cfg   SyncChannelConfig
	found bool
	err   error
}

func (f fakeUserChannels) UserChannel(context.Context, string, string) (SyncChannelConfig, bool, error) {
	return f.cfg, f.found, f.err
}

func TestSyncChannelPrefersWorkspaceChannelConfig(t *testing.T) {
	s := testPostgresStore(t)
	ctx := context.Background()
	// 只有平台渠道（sync_kind=none）⇒ 默认会拒绝
	if _, err := s.Pool.Exec(ctx, `INSERT INTO model_channels (id, name, kind, base_url, auth_type, sync_kind) VALUES ('ch_cfg','平台渠道','aggregator','https://platform.example.com','bearer','none')`); err != nil {
		t.Fatal(err)
	}
	base := Syncer{Store: s, Credentials: fakeCreds{}, Lister: fakeLister{}}
	if _, err := base.SyncChannel(ctx, "ws_a", "ch_cfg"); err == nil {
		t.Fatal("平台未配同步时应明确拒绝（ErrSyncNotConfigured）")
	} else if !isNotConfigured(err) {
		t.Fatalf("应是 ErrSyncNotConfigured，实际 %v", err)
	}

	// 工作区自己定义了同名渠道并配好同步 ⇒ 应当被采用（即使平台那条是 none）
	sy := base
	sy.Channels = fakeUserChannels{found: true, cfg: SyncChannelConfig{
		ID: "ch_cfg", Name: "工作区渠道", BaseURL: "https://ws.example.com", AuthType: "bearer",
		SyncKind: "openai_compatible", SyncModelsPath: "/v1/models",
	}}
	sy.Credentials = fakeCreds{cred: Credential{APIKey: "k"}}
	sy.Lister = fakeLister{models: []UpstreamModel{{ProviderModel: "m-x", DisplayName: "X", ModelType: "text"}}}
	if _, err := sy.SyncChannel(ctx, "ws_a", "ch_cfg"); err != nil {
		t.Fatalf("工作区渠道的配置应被采用：%v", err)
	}
	var ws string
	if err := s.Pool.QueryRow(ctx, `SELECT COALESCE(max(workspace_id),'') FROM channel_models WHERE channel_id='ch_cfg'`).Scan(&ws); err != nil {
		t.Fatal(err)
	}
	if ws != "ws_a" {
		t.Fatalf("工作区渠道的同步结果应写入 ws_a，实际 %q", ws)
	}
}

func isNotConfigured(err error) bool {
	return err != nil && (err == ErrSyncNotConfigured || err.Error() == ErrSyncNotConfigured.Error())
}

// ★ 细化后的判据：**平台渠道的同步必须写平台共享行**（否则会给供给池添一份调用方工作区的副本）。
func TestSyncPlatformChannelWritesPlatformRows(t *testing.T) {
	s := testPostgresStore(t)
	ctx := context.Background()
	if _, err := s.Pool.Exec(ctx, `INSERT INTO model_channels (id, name, kind, base_url, auth_type, sync_kind, sync_models_path) VALUES ('ch_plat_sync','平台渠道','aggregator','https://p.example.com','bearer','openai_compatible','/v1/models')`); err != nil {
		t.Fatal(err)
	}
	sy := Syncer{
		Store:       s,
		Credentials: fakeCreds{cred: Credential{APIKey: "k"}},
		Lister:      fakeLister{models: []UpstreamModel{{ProviderModel: "m-p", DisplayName: "P", ModelType: "text"}}},
		// Channels 为 nil ⇒ 只能用平台配置 ⇒ 数据应归平台
	}
	if _, err := sy.SyncChannel(ctx, "ws_dev", "ch_plat_sync"); err != nil {
		t.Fatal(err)
	}
	var ws string
	if err := s.Pool.QueryRow(ctx, `SELECT COALESCE(max(workspace_id),'') FROM channel_models WHERE channel_id='ch_plat_sync'`).Scan(&ws); err != nil {
		t.Fatal(err)
	}
	if ws != "" {
		t.Fatalf("★ 平台渠道的同步应写平台共享行（workspace_id=''），实际 %q", ws)
	}
	// 而工作区渠道（上一用例）写的是 ws_a ⇒ 两者语义不同，这正是细化要的效果
}
