package alert

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// windowQuerier 是错误率窗口查询的抽象（默认实现走 Store.Pool；测试注入 fake）。
// 返回 (total, failed)：窗口内调用总数与失败数（status <> 'success'）。
type windowQuerier interface {
	ErrorRate(ctx context.Context, workspaceID string, windowMin int) (total, failed int, err error)
}

// configStore 是 Evaluator 需要的配置存取接口（*Store 实现；测试注入 fake）。
type configStore interface {
	Get(ctx context.Context, workspaceID string) (*Config, error)
	ClaimCooldown(ctx context.Context, workspaceID string, cooldownMin int) (bool, error)
}

// Evaluator 是三类告警的评估与触发入口。
// 依赖注入（测试友好）：Store 访问配置，window 查询错误率，Webhook 发送，Now 可注入时钟。
type Evaluator struct {
	Store   configStore
	Admin   *Store // 管理面（Upsert/Delete，handler 用）；运行时评估只用 Store 接口
	window  windowQuerier
	Webhook *WebhookClient
	Now     func() time.Time // 默认 time.Now；测试注入
	Log     *slog.Logger
}

// Kind 告警类型（webhook Payload.Kind 取值）。
const (
	KindErrorRateSpike = "error_rate_spike"
	KindBreaker        = "circuit_breaker"
	KindSyncFailure    = "sync_failure"
)

// NewEvaluator 构造告警评估器。log 为 nil 时用默认 logger。
func NewEvaluator(st *Store, webhook *WebhookClient, log *slog.Logger) *Evaluator {
	if log == nil {
		log = slog.Default()
	}
	e := &Evaluator{Store: st, Admin: st, Webhook: webhook, Now: time.Now, Log: log}
	if st != nil {
		e.window = auditWindow{pool: st.Pool}
	}
	return e
}

// auditWindow 是默认的错误率窗口查询（读 gateway_audit_logs，T11 迁移 017 后按 status 聚合）。
type auditWindow struct{ pool *pgxpool.Pool }

// ErrorRate 查询某 workspace 最近 windowMin 分钟的调用总数与失败数。
// 错误率口径 = (total - success) / total；success 指审计 status='success'（failed/rate_limited/cancelled/timeout 计失败），
// 与前端成功率口径一致。
func (a auditWindow) ErrorRate(ctx context.Context, workspaceID string, windowMin int) (int, int, error) {
	var total, failed int
	err := a.pool.QueryRow(ctx, `
		SELECT
			COUNT(*) AS total,
			COUNT(*) FILTER (WHERE status <> 'success') AS failed
		FROM gateway_audit_logs
		WHERE workspace_id = $1
		  AND created_at >= now() - make_interval(mins => $2)
	`, workspaceID, windowMin).Scan(&total, &failed)
	return total, failed, err
}

// EvaluateErrorRate 在【审计终态写入后】调用：评估该 workspace 滚动窗口错误率是否突增。
//
// 流程（fail-open，任何一步失败都只是不告警，不阻断调用方）：
//  1. 读配置；未配置 / 禁用 / webhook 为空 ⇒ 跳过
//  2. 原子占位冷却（ClaimCooldown）：冷却期内 ⇒ 跳过（防重复）
//  3. 查滚动窗口（error_rate_window_min）错误率
//  4. 窗口内调用数 > 0 且错误率 >= 阈值 ⇒ 发 webhook
//
// 说明：错误率口径见 auditWindow.ErrorRate 注释。
func (e *Evaluator) EvaluateErrorRate(ctx context.Context, workspaceID string) {
	if e == nil || e.Store == nil || e.window == nil {
		return
	}
	cfg, err := e.Store.Get(ctx, workspaceID)
	if err != nil {
		e.Log.Warn("alert: load config failed (fail-open)", "workspace", workspaceID, "err", err)
		return
	}
	if cfg == nil || !cfg.Enabled || cfg.WebhookURL == "" {
		return // 未配置 / 关闭 / 无接收方 ⇒ 不告警
	}
	claimed, err := e.Store.ClaimCooldown(ctx, cfg.WorkspaceID, cfg.CooldownMin)
	if err != nil {
		e.Log.Warn("alert: claim cooldown failed (fail-open)", "workspace", workspaceID, "err", err)
		return
	}
	if !claimed {
		return // 冷却期内（本实例或多实例已触发）
	}

	windowMin := cfg.ErrorRateWindowMin
	if windowMin <= 0 {
		windowMin = 5 // 默认窗口（防御非法配置）
	}
	total, failed, err := e.window.ErrorRate(ctx, workspaceID, windowMin)
	if err != nil {
		e.Log.Warn("alert: error-rate query failed (fail-open)", "workspace", workspaceID, "err", err)
		return
	}
	if total <= 0 {
		return // 窗口内无调用 ⇒ 无错误率可言
	}
	pct := float64(failed) / float64(total) * 100
	if pct < cfg.ErrorRateThresholdPct {
		return // 未超阈值
	}
	e.Webhook.Send(ctx, cfg.WebhookURL, Payload{
		Kind:         KindErrorRateSpike,
		WorkspaceID:  workspaceID,
		Message:      fmt.Sprintf("error rate spike: %.1f%% in last %d min window (threshold %.1f%%)", pct, windowMin, cfg.ErrorRateThresholdPct),
		ErrorRatePct: pct,
		TriggeredAt:  e.Now().UTC().Format(time.RFC3339),
	})
}

// NotifyBreaker 在【熔断单元进入冷却】时调用（worker/handlers_generate 的失败路径）。
// 复用同一配置（enabled / webhook_url / cooldown）；未配置 ⇒ 不告警。
func (e *Evaluator) NotifyBreaker(ctx context.Context, workspaceID, unit string) {
	if e == nil || e.Store == nil {
		return
	}
	cfg, err := e.Store.Get(ctx, workspaceID)
	if err != nil {
		e.Log.Warn("alert: load config failed (fail-open)", "workspace", workspaceID, "err", err)
		return
	}
	if cfg == nil || !cfg.Enabled || cfg.WebhookURL == "" {
		return
	}
	// 熔断进入冷却本身就是"有新鲜度的事件"，无需额外冷却判定：直接占位冷却，
	// 若上一类告警刚发过（同一冷却期内），不再重复发（防刷屏）。
	claimed, err := e.Store.ClaimCooldown(ctx, workspaceID, cfg.CooldownMin)
	if err != nil || !claimed {
		return
	}
	e.Webhook.Send(ctx, cfg.WebhookURL, Payload{
		Kind:        KindBreaker,
		WorkspaceID: workspaceID,
		Unit:        unit,
		Message:     "circuit breaker opened: unit " + unit + " entered cooldown",
		TriggeredAt: e.Now().UTC().Format(time.RFC3339),
	})
}

// NotifySyncFailure 在【渠道模型目录同步失败】时调用（BFF channelSync 转发失败 → 内部端点）。
// 复用同一配置；未配置 ⇒ 不告警。
func (e *Evaluator) NotifySyncFailure(ctx context.Context, workspaceID, channelID string) {
	if e == nil || e.Store == nil {
		return
	}
	cfg, err := e.Store.Get(ctx, workspaceID)
	if err != nil {
		e.Log.Warn("alert: load config failed (fail-open)", "workspace", workspaceID, "err", err)
		return
	}
	if cfg == nil || !cfg.Enabled || cfg.WebhookURL == "" {
		return
	}
	claimed, err := e.Store.ClaimCooldown(ctx, workspaceID, cfg.CooldownMin)
	if err != nil || !claimed {
		return
	}
	e.Webhook.Send(ctx, cfg.WebhookURL, Payload{
		Kind:        KindSyncFailure,
		WorkspaceID: workspaceID,
		Unit:        channelID,
		Message:     "channel model catalog sync failed: " + channelID,
		TriggeredAt: e.Now().UTC().Format(time.RFC3339),
	})
}
