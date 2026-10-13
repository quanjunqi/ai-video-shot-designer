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

// TestTerminalFillsSupplyUnit 锁定 T1 终态回填：异步 submit-time 行（queued）在 worker
// 命中模型后由 UpdateResultByJobID 补齐 channel_id/provider_model（迁移 014 将二者
// 从身份字段移入可回填完成字段 —— 真机验收曾触发 011 触发器拦截）。
func TestTerminalFillsSupplyUnit(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	log := Log{
		RequestID: "req-supply-1", WorkspaceID: "workspace-a", ProjectID: "project-1",
		EpisodeID: "episode-1", AssetID: "asset-1", ShotID: "shot-1", Feature: "storyboard",
		UserID: "actor-a", Product: "comic", ModelID: "lm-video-standard", Status: "queued",
		JobID: "job-supply-1", CostCurrency: "CNY",
		RequestPayload: json.RawMessage(`{"prompt":"x"}`),
	}
	if err := s.Insert(ctx, log); err != nil {
		t.Fatalf("insert: %v", err)
	}
	// 终态回填：status + 供给单元（空串不覆盖 submit 时已知值）
	n, err := s.UpdateResultByJobID(ctx, "job-supply-1", "success", json.RawMessage(`{"ok":true}`), "", 12, 3, 5, 0, 1.5, "CNY", "chan-minimax", "MiniMax-Text-01", "task-9")
	if err != nil {
		t.Fatalf("terminal update must not be blocked by guard trigger: %v", err)
	}
	if n != 1 {
		t.Fatalf("expected 1 row updated, got %d", n)
	}
	var status, channelID, providerModel string
	var cost float64
	if err := s.Pool.QueryRow(ctx, `SELECT status, channel_id, provider_model, cost_amount FROM gateway_audit_logs WHERE request_id=$1`, log.RequestID).Scan(&status, &channelID, &providerModel, &cost); err != nil {
		t.Fatalf("read back: %v", err)
	}
	if status != "success" || channelID != "chan-minimax" || providerModel != "MiniMax-Text-01" {
		t.Fatalf("supply unit not filled on terminal: status=%q channel=%q provider=%q", status, channelID, providerModel)
	}
	if cost != 1.5 {
		t.Fatalf("cost not filled: %v", cost)
	}
}
