// Package alert 是 T11 三类最小告警（错误率突增 / 熔断发生 / 同步失败 → webhook）的统一实现。
//
// 设计原则（task 卡 §6 约束）：
//   - 不引入独立告警服务（P1 外）：webhook 简单 POST + 3 次重试上限
//   - 配置 fail-open：alert_config 读不到 / DB 故障 ⇒ 不告警不阻断主流程
//   - 冷却去重跨副本共享：last_triggered_at 落库（非本地内存），多实例不会重复发
//   - 错误率突增评估在【审计终态写入后】触发（无定时巡检，符合范围外约束）
package alert

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Config 是一个 workspace 的告警配置（对应 alert_config 表，018）。
type Config struct {
	WorkspaceID           string     `json:"workspace_id"`
	Enabled               bool       `json:"enabled"`
	ErrorRateThresholdPct float64    `json:"error_rate_threshold_pct"`
	ErrorRateWindowMin    int        `json:"error_rate_window_min"`
	CooldownMin           int        `json:"cooldown_min"`
	WebhookURL            string     `json:"webhook_url"`
	LastTriggeredAt       *time.Time `json:"last_triggered_at,omitempty"`
}

// Store 是 alert_config 的访问层。
type Store struct {
	Pool *pgxpool.Pool
	Log  *slog.Logger
}

// New 构造告警配置 Store。Log 为 nil 时用默认 logger。
func New(pool *pgxpool.Pool, log *slog.Logger) *Store {
	if log == nil {
		log = slog.Default()
	}
	return &Store{Pool: pool, Log: log}
}

// DefaultConfig 返回某 workspace 的默认告警配置（未落库时读取即默认：
// enabled=true、阈值 20%、窗口 5 分钟、冷却 10 分钟、webhook 空）。
func DefaultConfig(workspaceID string) *Config {
	return &Config{
		WorkspaceID:           workspaceID,
		Enabled:               true,
		ErrorRateThresholdPct: 20,
		ErrorRateWindowMin:    5,
		CooldownMin:           10,
		WebhookURL:            "",
	}
}

// Get 返回某 workspace 的告警配置。
// 返回 (nil, nil) 表示未配置（不告警）；DB 故障同样返回 (nil, err)，调用方按"不告警"处理（fail-open）。
func (s *Store) Get(ctx context.Context, workspaceID string) (*Config, error) {
	if s == nil || s.Pool == nil {
		return nil, nil // 未装配 = 未配置
	}
	var c Config
	var last *time.Time
	err := s.Pool.QueryRow(ctx, `
		SELECT workspace_id, enabled, error_rate_threshold_pct, error_rate_window_min,
		       cooldown_min, webhook_url, last_triggered_at
		FROM alert_config WHERE workspace_id = $1
	`, workspaceID).Scan(&c.WorkspaceID, &c.Enabled, &c.ErrorRateThresholdPct, &c.ErrorRateWindowMin, &c.CooldownMin, &c.WebhookURL, &last)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil // 未配置
	}
	if err != nil {
		return nil, err
	}
	c.LastTriggeredAt = last
	return &c, nil
}

// Upsert 创建或更新告警配置（管理面：BFF → 内部 API）。
func (s *Store) Upsert(ctx context.Context, c Config) error {
	if s == nil || s.Pool == nil {
		return nil
	}
	_, err := s.Pool.Exec(ctx, `
		INSERT INTO alert_config (workspace_id, enabled, error_rate_threshold_pct, error_rate_window_min, cooldown_min, webhook_url, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, now())
		ON CONFLICT (workspace_id) DO UPDATE SET
			enabled = EXCLUDED.enabled,
			error_rate_threshold_pct = EXCLUDED.error_rate_threshold_pct,
			error_rate_window_min = EXCLUDED.error_rate_window_min,
			cooldown_min = EXCLUDED.cooldown_min,
			webhook_url = EXCLUDED.webhook_url,
			updated_at = now()
	`, c.WorkspaceID, c.Enabled, c.ErrorRateThresholdPct, c.ErrorRateWindowMin, c.CooldownMin, c.WebhookURL)
	return err
}

// Delete 删除告警配置（管理面：一键关闭可 upsert enabled=false，删除用于彻底清配置）。
func (s *Store) Delete(ctx context.Context, workspaceID string) error {
	if s == nil || s.Pool == nil {
		return nil
	}
	_, err := s.Pool.Exec(ctx, `DELETE FROM alert_config WHERE workspace_id = $1`, workspaceID)
	return err
}

// ClaimCooldown 原子占位冷却：距上次触发不足 CooldownMin 时不占位。
// 返回 true 表示本实例拿到触发权（可发 webhook）；false = 冷却期内或未配置（跳过）。
// 跨副本共享：last_triggered_at 落库，多实例不会重复发（BE-CONC 同思路）。
func (s *Store) ClaimCooldown(ctx context.Context, workspaceID string, cooldownMin int) (bool, error) {
	if s == nil || s.Pool == nil {
		return false, nil
	}
	tag, err := s.Pool.Exec(ctx, `
		UPDATE alert_config SET last_triggered_at = now(), updated_at = now()
		WHERE workspace_id = $1
		  AND (last_triggered_at IS NULL
		       OR last_triggered_at < now() - make_interval(mins => $2))
	`, workspaceID, cooldownMin)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}
