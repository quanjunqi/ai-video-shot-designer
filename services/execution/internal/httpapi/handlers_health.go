package httpapi

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"shotdesigner/services/execution/internal/alert"
)

// listHealth 返回供给单元（渠道×模型）健康聚合（T11）。
// 供 BFF 代理 → web 健康面板（/models/health）消费。
func (h Handler) listHealth(w http.ResponseWriter, r *http.Request) {
	if !h.auth(w, r) {
		return
	}
	ws, _, ok := ctxOf(r)
	if !ok {
		writeError(w, 400, "INVALID_CONTEXT", "workspace is required")
		return
	}
	if h.AuditStore == nil {
		writeError(w, 503, "AUDIT_UNAVAILABLE", "audit store not configured")
		return
	}
	var since, until *time.Time
	if v := r.URL.Query().Get("since"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			writeError(w, 400, "INVALID_SINCE", "since must be RFC3339")
			return
		}
		since = &t
	}
	if v := r.URL.Query().Get("until"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			writeError(w, 400, "INVALID_UNTIL", "until must be RFC3339")
			return
		}
		until = &t
	}
	limit := 100
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}
	units, err := h.AuditStore.HealthByUnit(r.Context(), ws, since, until, limit)
	if err != nil {
		writeError(w, 500, "AUDIT_HEALTH_FAILED", err.Error())
		return
	}
	// 补充成功率字段（与 stats 口径一致：0-100）
	for i := range units {
		if units[i].Calls > 0 {
			units[i].SuccessRate = float64(units[i].SuccessCalls) / float64(units[i].Calls) * 100
		}
	}
	writeJSON(w, 200, map[string]any{
		"workspace_id": ws,
		"units":        units,
	})
}

// getAlertConfig 返回某 workspace 的告警配置（T11）。未配置返回默认值（enabled=true, 20/5/10, webhook 空）。
func (h Handler) getAlertConfig(w http.ResponseWriter, r *http.Request) {
	if !h.auth(w, r) {
		return
	}
	ws, _, ok := ctxOf(r)
	if !ok {
		writeError(w, 400, "INVALID_CONTEXT", "workspace is required")
		return
	}
	if h.Alert == nil || h.Alert.Admin == nil {
		writeError(w, 503, "ALERT_UNAVAILABLE", "alert store not configured")
		return
	}
	cfg, err := h.Alert.Admin.Get(r.Context(), ws)
	if err != nil {
		writeError(w, 500, "ALERT_CONFIG_LOAD_FAILED", err.Error())
		return
	}
	if cfg == nil {
		cfg = alert.DefaultConfig(ws) // 未配置 = 默认值（不落库，读取即默认）
	}
	writeJSON(w, 200, cfg)
}

// putAlertConfig upsert 告警配置（管理面：web 面板的告警配置区 → BFF → 本端点）。
func (h Handler) putAlertConfig(w http.ResponseWriter, r *http.Request) {
	if !h.auth(w, r) {
		return
	}
	ws, _, ok := ctxOf(r)
	if !ok {
		writeError(w, 400, "INVALID_CONTEXT", "workspace is required")
		return
	}
	if h.Alert == nil || h.Alert.Admin == nil {
		writeError(w, 503, "ALERT_UNAVAILABLE", "alert store not configured")
		return
	}
	var req struct {
		Enabled               *bool    `json:"enabled"`
		ErrorRateThresholdPct *float64 `json:"error_rate_threshold_pct"`
		ErrorRateWindowMin    *int     `json:"error_rate_window_min"`
		CooldownMin           *int     `json:"cooldown_min"`
		WebhookURL            string   `json:"webhook_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, 400, "INVALID_BODY", "invalid JSON body")
		return
	}
	cur, err := h.Alert.Admin.Get(r.Context(), ws)
	if err != nil {
		writeError(w, 500, "ALERT_CONFIG_LOAD_FAILED", err.Error())
		return
	}
	cfg := alert.DefaultConfig(ws)
	if cur != nil {
		cfg = cur
	}
	if req.Enabled != nil {
		cfg.Enabled = *req.Enabled
	}
	if req.ErrorRateThresholdPct != nil {
		if *req.ErrorRateThresholdPct <= 0 || *req.ErrorRateThresholdPct > 100 {
			writeError(w, 400, "INVALID_THRESHOLD", "error_rate_threshold_pct must be in (0, 100]")
			return
		}
		cfg.ErrorRateThresholdPct = *req.ErrorRateThresholdPct
	}
	if req.ErrorRateWindowMin != nil {
		if *req.ErrorRateWindowMin <= 0 || *req.ErrorRateWindowMin > 1440 {
			writeError(w, 400, "INVALID_WINDOW", "error_rate_window_min must be in (0, 1440]")
			return
		}
		cfg.ErrorRateWindowMin = *req.ErrorRateWindowMin
	}
	if req.CooldownMin != nil {
		if *req.CooldownMin <= 0 || *req.CooldownMin > 1440 {
			writeError(w, 400, "INVALID_COOLDOWN", "cooldown_min must be in (0, 1440]")
			return
		}
		cfg.CooldownMin = *req.CooldownMin
	}
	cfg.WebhookURL = req.WebhookURL
	if cfg.Enabled && cfg.WebhookURL == "" {
		writeError(w, 400, "WEBHOOK_REQUIRED", "webhook_url is required when enabled")
		return
	}
	if err := h.Alert.Admin.Upsert(r.Context(), *cfg); err != nil {
		writeError(w, 500, "ALERT_CONFIG_SAVE_FAILED", err.Error())
		return
	}
	writeJSON(w, 200, cfg)
}

// notifySyncFailure 是同步失败告警的内部触发端点（BFF channelSync 转发失败时调用）。
// 仅 internal 网络可达（与其它 /internal/v1 端点同级别）。
func (h Handler) notifySyncFailure(w http.ResponseWriter, r *http.Request) {
	if !h.auth(w, r) {
		return
	}
	ws, _, ok := ctxOf(r)
	if !ok {
		writeError(w, 400, "INVALID_CONTEXT", "workspace is required")
		return
	}
	if h.Alert == nil {
		writeError(w, 503, "ALERT_UNAVAILABLE", "alert evaluator not configured")
		return
	}
	var req struct {
		ChannelID string `json:"channel_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ChannelID == "" {
		writeError(w, 400, "INVALID_BODY", "channel_id is required")
		return
	}
	h.Alert.NotifySyncFailure(r.Context(), ws, req.ChannelID)
	writeJSON(w, 200, map[string]bool{"accepted": true})
}

// alertBreaker 触发熔断告警（T11 同步路径）：单元进入冷却时调用。Alert 为 nil 时不生效（fail-open）。
func (h Handler) alertBreaker(ctx context.Context, ws, channelID, providerModel string) {
	if h.Alert == nil {
		return
	}
	unit := channelID
	if providerModel != "" {
		unit = channelID + "/" + providerModel
	}
	h.Alert.NotifyBreaker(ctx, ws, unit)
}

// logger 供本文件 handler 内部使用（避免与包内其它 logger 冲突）。
var _ = slog.Default
