package audit

import (
	"context"
	"fmt"
	"time"
)

// UnitHealth 是健康面板的一个供给单元（渠道×模型）聚合行。
type UnitHealth struct {
	ChannelID     string `json:"channel_id"`
	ProviderModel string `json:"provider_model"`
	Calls         int64  `json:"calls"`
	SuccessCalls  int64  `json:"success_calls"`
	FailedCalls   int64  `json:"failed_calls"`
	// ErrorCodes 是错误码分布（T11，迁移 017 的 status_code 列 + status 兜底）。
	// 键 = breaker 分类桶（hard_4xx/soft_4xx/server_5xx/network/content_safety/other），
	// 值 = 该桶的调用数。仅统计失败行（status <> success）。
	ErrorCodes map[string]int64 `json:"error_codes"`
	// SuccessRate 成功率（0-100），handler 计算（与 stats 口径一致）。
	SuccessRate float64 `json:"success_rate"`
	// Breaker 状态（LEFT JOIN channel_health，T4）：
	// BreakerState 三态：normal（无健康行/未冷却/冷却到期未探活）/ cooling（熔断中）/
	// half_open（冷却到期且 probe_owner 占位，半开探活中）。与设计稿「熔断三态判定」一致。
	Cooling       bool       `json:"cooling"`
	BreakerState  string     `json:"breaker_state"`
	ProbeOwner    *string    `json:"probe_owner,omitempty"`
	CooldownUntil *time.Time `json:"cooldown_until,omitempty"`
	FailCount     int        `json:"fail_count"`
	LastFailureAt *time.Time `json:"last_failure_at,omitempty"`
	LastSuccessAt *time.Time `json:"last_success_at,omitempty"`
	LastSeenAt    *time.Time `json:"last_seen_at,omitempty"`
}

// HealthByUnit 按供给单元（channel_id × provider_model）聚合审计日志的健康指标，
// 并与 channel_health（T4 熔断状态）LEFT JOIN —— 一次查询返回面板所需全部字段。
//
// 过滤：since/until 可选（RFC3339）；默认最近 7 天。空 channel 或空 provider_model
// 的行（未回填供给单元的提交行/早退行）不参与聚合（健康面板只看已命中供给单元的真实调用）。
//
// 错误码分类（与 breaker.Classify 表 3-1 同口径）：
//   - 硬 4xx（400/401/403/404/422）与内容安全 → 各自归桶；其余 4xx 归 soft_4xx
//   - 5xx → server_5xx；status_code=0 → network；NULL 且失败 → other（历史行无状态码）
func (s Store) HealthByUnit(ctx context.Context, workspaceID string, since, until *time.Time, limit int) ([]UnitHealth, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	rows, err := s.Pool.Query(ctx, `
		SELECT
			COALESCE(a.channel_id, ''),
			COALESCE(a.provider_model, ''),
			count(*)::bigint AS calls,
			count(*) FILTER (WHERE a.status = 'success' OR a.status = 'succeeded')::bigint AS success_calls,
			count(*) FILTER (WHERE a.status <> 'success' AND a.status <> 'succeeded')::bigint AS failed_calls,
			-- 错误码分布（只统计失败行）：按 breaker 表 3-1 分类
			count(*) FILTER (
				WHERE a.status <> 'success' AND a.status <> 'succeeded'
				  AND a.status_code IN (400, 401, 403, 404, 422)
			)::bigint AS hard_4xx,
			count(*) FILTER (
				WHERE a.status <> 'success' AND a.status <> 'succeeded'
				  AND a.status_code IS NOT NULL
				  AND a.status_code NOT IN (400, 401, 403, 404, 422, 0)
				  AND a.status_code >= 400 AND a.status_code < 500
			)::bigint AS soft_4xx,
			count(*) FILTER (
				WHERE a.status <> 'success' AND a.status <> 'succeeded'
				  AND a.status_code >= 500 AND a.status_code < 600
			)::bigint AS server_5xx,
			count(*) FILTER (
				WHERE a.status <> 'success' AND a.status <> 'succeeded'
				  AND a.status_code = 0
			)::bigint AS network,
			count(*) FILTER (
				WHERE a.status <> 'success' AND a.status <> 'succeeded'
				  AND a.status_code IS NOT NULL
				  AND a.status_code NOT IN (400, 401, 403, 404, 422)
				  AND a.status_code < 400
			)::bigint AS content_safety,
			count(*) FILTER (
				WHERE a.status <> 'success' AND a.status <> 'succeeded'
				  AND a.status_code IS NULL
			)::bigint AS other,
			-- channel_health 熔断状态（LEFT JOIN，无健康行时 fail_count=0/cooling=false）
			COALESCE(ch.fail_count, 0) AS fail_count,
			(ch.cooldown_until IS NOT NULL AND ch.cooldown_until > now()) AS cooling,
			ch.probe_owner,
			ch.cooldown_until,
			ch.last_failure_at,
			ch.last_success_at,
			max(a.created_at) AS last_seen_at
		FROM gateway_audit_logs a
		LEFT JOIN channel_health ch
			ON ch.channel_id = a.channel_id AND ch.provider_model = a.provider_model
		WHERE a.workspace_id = $1
		  AND a.channel_id <> ''
		  AND a.provider_model <> ''
		  AND ($2::timestamptz IS NULL OR a.created_at >= $2)
		  AND ($3::timestamptz IS NULL OR a.created_at <= $3)
		GROUP BY a.channel_id, a.provider_model,
			ch.fail_count, ch.cooldown_until, ch.probe_owner, ch.last_failure_at, ch.last_success_at
		ORDER BY calls DESC, a.channel_id COLLATE "C", a.provider_model COLLATE "C"
		LIMIT $4
	`, workspaceID, since, until, limit)
	if err != nil {
		return nil, fmt.Errorf("audit health by unit: %w", err)
	}
	defer rows.Close()

	out := make([]UnitHealth, 0, limit)
	for rows.Next() {
		var u UnitHealth
		u.ErrorCodes = make(map[string]int64, 6)
		var hard4xx, soft4xx, server5xx, network, contentSafety, other int64
		var cooldownUntil, lastFailureAt, lastSuccessAt, lastSeenAt *time.Time
		var probeOwner *string
		var cooling bool
		if err := rows.Scan(
			&u.ChannelID, &u.ProviderModel, &u.Calls, &u.SuccessCalls, &u.FailedCalls,
			&hard4xx, &soft4xx, &server5xx, &network, &contentSafety, &other,
			&u.FailCount, &cooling, &probeOwner, &cooldownUntil, &lastFailureAt, &lastSuccessAt, &lastSeenAt,
		); err != nil {
			return nil, fmt.Errorf("audit health by unit: %w", err)
		}
		u.ErrorCodes["hard_4xx"] = hard4xx
		u.ErrorCodes["soft_4xx"] = soft4xx
		u.ErrorCodes["server_5xx"] = server5xx
		u.ErrorCodes["network"] = network
		u.ErrorCodes["content_safety"] = contentSafety
		u.ErrorCodes["other"] = other
		u.Cooling = cooling
		u.ProbeOwner = probeOwner
		u.CooldownUntil = cooldownUntil
		u.LastFailureAt = lastFailureAt
		u.LastSuccessAt = lastSuccessAt
		u.LastSeenAt = lastSeenAt
		// 熔断三态（设计稿口径）：cooldown_until IS NULL → 正常；
		// cooldown_until > now → 冷却中；cooldown_until <= now 且 probe_owner 非空 → 半开探活；
		// 冷却到期但无人占位 → 正常（等待探活占位，fail-open 语义）。
		now := time.Now()
		u.BreakerState = "normal"
		if cooldownUntil != nil {
			if cooldownUntil.After(now) {
				u.BreakerState = "cooling"
			} else if probeOwner != nil && *probeOwner != "" {
				u.BreakerState = "half_open"
			}
		}
		out = append(out, u)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("audit health by unit: %w", err)
	}
	return out, nil
}
