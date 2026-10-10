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

// Purge 删除超出保留期的审计行，返回删除行数（D6）。
//
// 为什么必须"事务 + SET LOCAL"：
//
//	迁移 011 的 trg_audit_logs_guard 默认【拒绝 DELETE】，
//	只认 `SET LOCAL app.allow_audit_purge = 'on'`；而 SET LOCAL 仅在事务内有效。
//	⇒ 清理只能以这种方式进行，**"顺手删一条"仍然做不到**（这是刻意的双保险）。
//
// 两个窗口（调用方传入，<=0 表示该类不清理）：
//
//	success 行保留 successDays 天（合规留痕与成本归因的周期更长）
//	非 success 行保留 failureDays 天（故障定位的时效更短）
func (s Store) Purge(ctx context.Context, successDays, failureDays int) (int64, error) {
	if successDays <= 0 && failureDays <= 0 {
		return 0, nil // 两个窗口都关闭 ⇒ 什么也不做（绝不在默认状态下删数据）
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `SET LOCAL app.allow_audit_purge = 'on'`); err != nil {
		return 0, err
	}
	tag, err := tx.Exec(ctx, `
		DELETE FROM gateway_audit_logs
		WHERE ($1 > 0 AND status = 'success'  AND created_at < now() - make_interval(days => $1))
		   OR ($2 > 0 AND status <> 'success' AND created_at < now() - make_interval(days => $2))
	`, successDays, failureDays)
	if err != nil {
		return 0, err
	}
	n := tag.RowsAffected()
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return n, nil
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
// SystemWorkspace 是"系统自身动作"（而非某个租户调用）的审计归属（D6）。
//
// 为什么用哨兵值而不是挑一个真实 workspace：
//
//	清理是【全库】动作，不属于任何租户。若挂到某个真实 workspace 下，
//	那个租户的列表/聚合里就会凭空多出"删除了 N 行"——是误归因。
//	用哨兵值则天然隔离：列表与聚合都按 workspace_id 过滤，永不会带出它。
const SystemWorkspace = "__system__"

// Filter 是审计查询的筛选条件（D7a）。零值表示不筛该项。
type Filter struct {
	Status    string
	ModelID   string
	ChannelID string
	Since     *time.Time // created_at >= Since
	Until     *time.Time // created_at <= Until
}

// whereClause 生成筛选条件（参数从 $2 起，$1 固定为 workspace_id）。
func (f Filter) whereClause() string {
	return `
		AND ($2 = '' OR status = $2)
		AND ($3 = '' OR model_id = $3)
		AND ($4 = '' OR channel_id = $4)
		AND ($5::timestamptz IS NULL OR created_at >= $5)
		AND ($6::timestamptz IS NULL OR created_at <= $6)`
}

// ListByWorkspace 返回一页审计日志与【筛选后的总数】（D7a）。
//
// 改动原因（判据）：此前签名没有筛选，返回也没有总数，而 handler 用 len(logs) 当 total
// ⇒ 「total」实际是【当前页条数】；且查询无法按 status/model/channel/时间筛选，
// 尽管表上为 status/model/project 建过索引（索引在场却没有查询使用）。
//
// total 用 COUNT(*) OVER() 在【同一条查询】里取，避免第二次往返；
// 注意：offset 之后 total 仍是筛选后的全集条数（窗口函数在 LIMIT 之前计算）。
func (s Store) ListByWorkspace(ctx context.Context, workspaceID string, f Filter, limit, offset int) ([]Log, int, error) {
	rows, err := s.Pool.Query(ctx, `
		SELECT id, request_id, workspace_id, project_id, episode_id, asset_id, user_id,
			product, model_id, channel_id, provider_model, mode,
			request_payload, response_payload, error_message, status,
			latency_ms, token_input, token_output, token_cached,
			cost_amount, cost_currency, job_id, provider_task_id, created_at,
			COUNT(*) OVER() AS total_count
		FROM gateway_audit_logs
		WHERE workspace_id = $1`+f.whereClause()+`
		ORDER BY created_at DESC
		LIMIT $7 OFFSET $8
	`, workspaceID, f.Status, f.ModelID, f.ChannelID, f.Since, f.Until, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var logs []Log
	total := 0
	for rows.Next() {
		var l Log
		err := rows.Scan(
			&l.ID, &l.RequestID, &l.WorkspaceID, &l.ProjectID, &l.EpisodeID, &l.AssetID, &l.UserID,
			&l.Product, &l.ModelID, &l.ChannelID, &l.ProviderModel, &l.Mode,
			&l.RequestPayload, &l.ResponsePayload, &l.ErrorMessage, &l.Status,
			&l.LatencyMs, &l.TokenInput, &l.TokenOutput, &l.TokenCached,
			&l.CostAmount, &l.CostCurrency, &l.JobID, &l.ProviderTaskID, &l.CreatedAt,
			&total,
		)
		if err != nil {
			return nil, 0, err
		}
		logs = append(logs, l)
	}
	return logs, total, rows.Err()
}

// ExportAll 返回筛选后的审计行（导出用），最多 maxRows 行。
//
// 为什么单独一个方法而不是复用 ListByWorkspace：
//
//	导出的语义是"给我筛选后的这一批"，不是"第 N 页"；用同一个方法会让
//	limit/offset 的分页语义混进导出，容易误用（例如 offset 被当成"跳过多少行再导出"）。
//	maxRows 是防爆护栏：导出必须有上界，否则一次请求就能把整表拉进内存。
func (s Store) ExportAll(ctx context.Context, workspaceID string, f Filter, maxRows int) ([]Log, error) {
	rows, err := s.Pool.Query(ctx, `
		SELECT id, request_id, workspace_id, project_id, episode_id, asset_id, user_id,
			product, model_id, channel_id, provider_model, mode,
			request_payload, response_payload, error_message, status,
			latency_ms, token_input, token_output, token_cached,
			cost_amount, cost_currency, job_id, provider_task_id, created_at
		FROM gateway_audit_logs
		WHERE workspace_id = $1`+f.whereClause()+`
		ORDER BY created_at DESC
		LIMIT $7
	`, workspaceID, f.Status, f.ModelID, f.ChannelID, f.Since, f.Until, maxRows)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []Log
	for rows.Next() {
		var l Log
		if err := rows.Scan(
			&l.ID, &l.RequestID, &l.WorkspaceID, &l.ProjectID, &l.EpisodeID, &l.AssetID, &l.UserID,
			&l.Product, &l.ModelID, &l.ChannelID, &l.ProviderModel, &l.Mode,
			&l.RequestPayload, &l.ResponsePayload, &l.ErrorMessage, &l.Status,
			&l.LatencyMs, &l.TokenInput, &l.TokenOutput, &l.TokenCached,
			&l.CostAmount, &l.CostCurrency, &l.JobID, &l.ProviderTaskID, &l.CreatedAt,
		); err != nil {
			return nil, err
		}
		logs = append(logs, l)
	}
	return logs, rows.Err()
}

// Aggregate 返回【筛选后全集】的按状态计数与平均耗时（D7a）。
//
// 为什么要服务端算：前端此前在【当前页】（limit:100）上算成功率与平均耗时
// ⇒ 翻页/筛选后"统计"会变，是【假统计】。
func (s Store) Aggregate(ctx context.Context, workspaceID string, f Filter) (map[string]int, int, error) {
	rows, err := s.Pool.Query(ctx, `
		SELECT status, count(*)::int, COALESCE(AVG(latency_ms), 0)::int
		FROM gateway_audit_logs
		WHERE workspace_id = $1`+f.whereClause()+`
		GROUP BY status
	`, workspaceID, f.Status, f.ModelID, f.ChannelID, f.Since, f.Until)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	byStatus := map[string]int{}
	total, latSum, latN := 0, 0, 0
	for rows.Next() {
		var st string
		var n, avg int
		if err := rows.Scan(&st, &n, &avg); err != nil {
			return nil, 0, err
		}
		byStatus[st] = n
		total += n
		if avg > 0 {
			latSum += avg * n
			latN += n
		}
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	avgLatency := 0
	if latN > 0 {
		avgLatency = latSum / latN
	}
	return byStatus, avgLatency, nil
}
