package catalog

import (
	"context"
	"testing"
)

// P2-1b 的验收：目录投影必须**只读地**暴露同步状态，界面才能显示
// "这个渠道有没有配同步、上次同步什么时候成功过"。
// 同时钉住一条边界：同步字段**不在** ChannelPatch 里 —— 同步配置是平台级的，
// 而渠道页写的是工作区域（useSettingsStore 的注释），两者不能混。
func TestIntegrationDirectoryExposesSyncStatus(t *testing.T) {
	s := testPostgresStore(t)
	ctx := context.Background()
	if _, err := s.Pool.Exec(ctx, `
		INSERT INTO model_channels (id, name, kind, base_url, auth_type, sync_kind, sync_models_path, sync_pricing_path, last_sync_at)
		VALUES ('ch_status', '状态渠道', 'aggregator', 'https://upstream.example.com', 'bearer',
		        'openai_compatible', '/v1/models', '/api/pricing', now())`); err != nil {
		t.Fatal(err)
	}

	dir, err := s.Directory(ctx, "")
	if err != nil {
		t.Fatal(err)
	}
	var got *Channel
	for i := range dir.Channels {
		if dir.Channels[i].ID == "ch_status" {
			got = &dir.Channels[i]
		}
	}
	if got == nil {
		t.Fatal("目录里应能读到该渠道")
	}
	if got.SyncKind != "openai_compatible" || got.SyncModelsPath != "/v1/models" || got.SyncPricingPath != "/api/pricing" {
		t.Fatalf("同步配置未被投影：%+v", got)
	}
	if got.LastSyncAt == nil {
		t.Fatal("上次同步时间未被投影（界面要显示它）")
	}

	// 未配同步的渠道：投影应是 none/空，而不是报错或漏字段
	if _, err := s.Pool.Exec(ctx, `INSERT INTO model_channels (id, name, kind, base_url, sync_kind, last_sync_at) VALUES ('ch_plain','普通','aggregator','https://x.example.com','none',NULL)`); err != nil {
		t.Fatal(err)
	}
	dir2, err := s.Directory(ctx, "")
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range dir2.Channels {
		if c.ID == "ch_plain" {
			if c.SyncKind != "none" || c.SyncModelsPath != "" || c.LastSyncAt != nil {
				t.Fatalf("未配置同步的渠道投影不对：%+v", c)
			}
		}
	}

	// UpdateChannel 的回读也要带同步字段（否则 PUT 的响应会显示成"未配置"）
	enabled := true
	updated, err := s.UpdateChannel(ctx, "ch_status", ChannelPatch{Enabled: &enabled})
	if err != nil {
		t.Fatal(err)
	}
	if updated.SyncKind != "openai_compatible" || updated.LastSyncAt == nil {
		t.Fatalf("UpdateChannel 的回读缺同步字段：%+v", updated)
	}
}
