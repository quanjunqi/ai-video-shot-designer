package audit

import (
	"context"
	"encoding/json"
	"testing"
)

// TestInsertPersistsAttribution 锁定 T1：Insert 写入 shot_id/feature（迁移 013 列），
// 缺失归因不报错、不丢行（§3.7：缺失置空容忍）。
func TestInsertPersistsAttribution(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	log := Log{
		RequestID: "req-attr-1", WorkspaceID: "workspace-a", ProjectID: "project-1",
		EpisodeID: "episode-1", AssetID: "asset-1", ShotID: "shot-1", Feature: "storyboard",
		UserID: "actor-a", Product: "comic", ModelID: "lm-video-standard", Status: "queued",
		JobID: "job-1", CostCurrency: "CNY",
		RequestPayload: json.RawMessage(`{"prompt":"x"}`),
	}
	if err := s.Insert(ctx, log); err != nil {
		t.Fatalf("insert with attribution: %v", err)
	}
	var shotID, feature string
	if err := s.Pool.QueryRow(ctx, `SELECT shot_id, feature FROM gateway_audit_logs WHERE request_id=$1`, log.RequestID).Scan(&shotID, &feature); err != nil {
		t.Fatalf("read back: %v", err)
	}
	if shotID != "shot-1" || feature != "storyboard" {
		t.Fatalf("attribution columns not persisted: shot=%q feature=%q", shotID, feature)
	}

	// 缺失归因：置空容忍，不报错、不丢行
	minimal := Log{RequestID: "req-attr-2", WorkspaceID: "workspace-a", Status: "success", ModelID: "m", CostCurrency: "CNY", RequestPayload: json.RawMessage(`{}`)}
	if err := s.Insert(ctx, minimal); err != nil {
		t.Fatalf("insert without attribution must not fail: %v", err)
	}
	if err := s.Pool.QueryRow(ctx, `SELECT shot_id, feature FROM gateway_audit_logs WHERE request_id=$1`, minimal.RequestID).Scan(&shotID, &feature); err != nil {
		t.Fatalf("read back minimal: %v", err)
	}
	if shotID != "" || feature != "" {
		t.Fatalf("missing attribution must decode as empty, got shot=%q feature=%q", shotID, feature)
	}
}
