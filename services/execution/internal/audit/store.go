package audit

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Log 网关调用审计日志记录
type Log struct {
	ID              int64           `json:"id"`
	RequestID       string          `json:"request_id"`
	WorkspaceID     string          `json:"workspace_id"`
	ProjectID       string          `json:"project_id,omitempty"`
	EpisodeID       string          `json:"episode_id,omitempty"`
	AssetID         string          `json:"asset_id,omitempty"`
	UserID          string          `json:"user_id,omitempty"`
	Product         string          `json:"product"` // comic/canvas/create
	ModelID         string          `json:"model_id"`
	ChannelID       string          `json:"channel_id,omitempty"`
	ProviderModel   string          `json:"provider_model,omitempty"`
	Mode            string          `json:"mode"` // text-chat/text-to-image/image-to-image/...
	RequestPayload  json.RawMessage `json:"request_payload"`
	ResponsePayload json.RawMessage `json:"response_payload,omitempty"`
	ErrorMessage    string          `json:"error_message,omitempty"`
	Status          string          `json:"status"` // success/failed/rate_limited/cancelled/timeout
	LatencyMs       int             `json:"latency_ms"`
	TokenInput      int             `json:"token_input"`
	TokenOutput     int             `json:"token_output"`
	TokenCached     int             `json:"token_cached"`
	CostAmount      float64         `json:"cost_amount"`
	CostCurrency    string          `json:"cost_currency"`
	JobID           string          `json:"job_id,omitempty"`
	ProviderTaskID  string          `json:"provider_task_id,omitempty"`
	CreatedAt       time.Time       `json:"created_at"`
}

// Store 审计日志存储
type Store struct{ Pool *pgxpool.Pool }

// Insert 插入一条审计日志（同步写入，不异步丢失）
func (s Store) Insert(ctx context.Context, log Log) error {
	// D5a：L0 脱敏在【写库入口】做 —— 唯一收口，任何调用方都不可能忘记。
	log.RequestPayload = RedactJSON(log.RequestPayload)
	log.ResponsePayload = RedactJSON(log.ResponsePayload)
	log.ErrorMessage = redactText(log.ErrorMessage)
	requestPayload := log.RequestPayload
	if len(requestPayload) == 0 {
		requestPayload = json.RawMessage(`{}`)
	}
	_, err := s.Pool.Exec(ctx, `
		INSERT INTO gateway_audit_logs (
			request_id, workspace_id, project_id, episode_id, asset_id, user_id,
			product, model_id, channel_id, provider_model, mode,
			request_payload, response_payload, error_message, status,
			latency_ms, token_input, token_output, token_cached,
			cost_amount, cost_currency, job_id, provider_task_id
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
	`,
		log.RequestID, log.WorkspaceID, log.ProjectID, log.EpisodeID, log.AssetID, log.UserID,
		log.Product, log.ModelID, log.ChannelID, log.ProviderModel, log.Mode,
		requestPayload, log.ResponsePayload, log.ErrorMessage, log.Status,
		log.LatencyMs, log.TokenInput, log.TokenOutput, log.TokenCached,
		log.CostAmount, log.CostCurrency, log.JobID, log.ProviderTaskID,
	)
	return err
}

// UpdateResult 更新审计日志的结果（异步任务完成后调用）
func (s Store) UpdateResult(ctx context.Context, requestID string, status string, responsePayload json.RawMessage, errorMessage string, latencyMs int, tokenInput, tokenOutput, tokenCached int, costAmount float64, providerTaskID string) error {
	_, err := s.Pool.Exec(ctx, `
		UPDATE gateway_audit_logs SET
			status = $2,
			response_payload = COALESCE($3, response_payload),
			error_message = $4,
			latency_ms = $5,
			token_input = $6,
			token_output = $7,
			token_cached = $8,
			cost_amount = $9,
			provider_task_id = COALESCE(NULLIF($10, ''), provider_task_id)
		WHERE request_id = $1
	`, requestID, status, responsePayload, errorMessage, latencyMs, tokenInput, tokenOutput, tokenCached, costAmount, providerTaskID)
	return err
}

// UpdateResultByJobID 按 job_id 把任务终态写回审计日志（D2）。
//
// 为什么按 job_id 而不是 request_id：
//
//	job.Job（job/store.go:36-58）与 jobs 表都【没有 request_id】，
//	而 gateway_audit_logs 已有 job_id 列，且提交路径对异步任务已写入该列
//	（httpapi/handler.go 的 writeAudit("queued", …, j.ID, "")）。
//	⇒ 按 job_id 定位无需任何 schema 变更。
//
// 返回受影响行数：0 表示该 job【没有提交时的审计行】（例如经 /internal/v1/tasks 提交的任务）。
// 调用方必须把这个 0 打出来 —— 静默的空更新会重现"审计看起来有、其实没更新"的问题。
func (s Store) UpdateResultByJobID(ctx context.Context, jobID, status string, responsePayload json.RawMessage, errorMessage string, latencyMs, tokenInput, tokenOutput, tokenCached int, costAmount float64, providerTaskID string) (int64, error) {
	// D5a：同一个收口点，异步终态也走 L0 脱敏
	responsePayload = RedactJSON(responsePayload)
	errorMessage = redactText(errorMessage)
	tag, err := s.Pool.Exec(ctx, `
		UPDATE gateway_audit_logs SET
			status = $2,
			response_payload = COALESCE($3, response_payload),
			error_message = $4,
			latency_ms = $5,
			token_input = $6,
			token_output = $7,
			token_cached = $8,
			cost_amount = $9,
			provider_task_id = COALESCE(NULLIF($10, ''), provider_task_id)
		WHERE job_id = $1
	`, jobID, status, responsePayload, errorMessage, latencyMs, tokenInput, tokenOutput, tokenCached, costAmount, providerTaskID)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

// Spend 返回某 workspace 的**当日/当月**累计花费（用于成本上限判定）。
// 依赖 (workspace_id, created_at) 索引（见迁移 009）。
func (s Store) Spend(ctx context.Context, workspace string) (day float64, month float64, err error) {
	err = s.Pool.QueryRow(ctx, `
		SELECT
			COALESCE(SUM(cost_amount) FILTER (WHERE created_at >= date_trunc('day', now())), 0),
			COALESCE(SUM(cost_amount) FILTER (WHERE created_at >= date_trunc('month', now())), 0)
		FROM gateway_audit_logs WHERE workspace_id = $1
	`, workspace).Scan(&day, &month)
	return day, month, err
}

// ListByWorkspace 按租户查询审计日志
func (s Store) ListByWorkspace(ctx context.Context, workspaceID string, limit, offset int) ([]Log, error) {
	rows, err := s.Pool.Query(ctx, `
		SELECT id, request_id, workspace_id, project_id, episode_id, asset_id, user_id,
			product, model_id, channel_id, provider_model, mode,
			request_payload, response_payload, error_message, status,
			latency_ms, token_input, token_output, token_cached,
			cost_amount, cost_currency, job_id, provider_task_id, created_at
		FROM gateway_audit_logs
		WHERE workspace_id = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`, workspaceID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []Log
	for rows.Next() {
		var l Log
		err := rows.Scan(
			&l.ID, &l.RequestID, &l.WorkspaceID, &l.ProjectID, &l.EpisodeID, &l.AssetID, &l.UserID,
			&l.Product, &l.ModelID, &l.ChannelID, &l.ProviderModel, &l.Mode,
			&l.RequestPayload, &l.ResponsePayload, &l.ErrorMessage, &l.Status,
			&l.LatencyMs, &l.TokenInput, &l.TokenOutput, &l.TokenCached,
			&l.CostAmount, &l.CostCurrency, &l.JobID, &l.ProviderTaskID, &l.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		logs = append(logs, l)
	}
	return logs, rows.Err()
}
