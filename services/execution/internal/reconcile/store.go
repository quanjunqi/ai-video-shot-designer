package reconcile

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Store 负责把对账结果写入校准台账（price_calibration_logs，迁移 012）。
// 只写 alert 行：台账记录的是"需要人看的异常"，ok 行由报表从审计实时聚合
// （避免噪声淹没告警，也避免对账任务写入量随调用量线性增长）。
type Store struct {
	Pool *pgxpool.Pool
}

// WriteAlerts 批量写入告警记录（幂等语义：不删旧行，只追加 —— 台账可追溯每次对账）。
func (s Store) WriteAlerts(ctx context.Context, alerts []Alert) error {
	if len(alerts) == 0 {
		return nil
	}
	batch := &pgx.Batch{}
	for _, a := range alerts {
		batch.Queue(`
			INSERT INTO price_calibration_logs (
				model_id, channel_id, provider_model, actual_cost, ledger_cost, diff_pct, status, note
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		`, a.ModelID, a.ChannelID, a.ProviderModel, a.Actual, a.Ledger, a.DiffPct, a.Status, a.Note)
	}
	br := s.Pool.SendBatch(ctx, batch)
	defer br.Close()
	for i := range alerts {
		if _, err := br.Exec(); err != nil {
			return fmt.Errorf("reconcile write alert %d: %w", i, err)
		}
	}
	return nil
}
