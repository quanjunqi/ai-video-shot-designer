package audit

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"shotdesigner/services/execution/internal/reconcile"
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
	// CostUnit 记录本次调用成本的计费单位（per_call/per_second/per_mtok_input/per_mtok_output）。
	// T0 价格校准新增：来源 = 命中模型的 model_catalog.cost_unit（迁移 012 新增列）。
	// 空 = 该模型无校准价（成本为 0 的"预估"口径，T2 报表据此区分已校准/预估）。
	CostUnit       string    `json:"cost_unit,omitempty"`
	JobID          string    `json:"job_id,omitempty"`
	ProviderTaskID string    `json:"provider_task_id,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
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
			cost_amount, cost_currency, cost_unit, job_id, provider_task_id
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
	`,
		log.RequestID, log.WorkspaceID, log.ProjectID, log.EpisodeID, log.AssetID, log.UserID,
		log.Product, log.ModelID, log.ChannelID, log.ProviderModel, log.Mode,
		requestPayload, log.ResponsePayload, log.ErrorMessage, log.Status,
		log.LatencyMs, log.TokenInput, log.TokenOutput, log.TokenCached,
		log.CostAmount, log.CostCurrency, log.CostUnit, log.JobID, log.ProviderTaskID,
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
// costUnit（第 11 参数，T0 新增）：异步终态把命中模型的计费单位一并回写；
// 空 = 不覆盖既有值（提交时已写）或保持无校准口径。COALESCE(NULLIF(…)) 语义：
// 空串不动原值，非空才覆盖 —— 避免"同步提交写了 unit、异步回写又把 unit 清空"。
//
// 返回受影响行数：0 表示该 job【没有提交时的审计行】（例如经 /internal/v1/tasks 提交的任务）。
// 调用方必须把这个 0 打出来 —— 静默的空更新会重现"审计看起来有、其实没更新"的问题。
func (s Store) UpdateResultByJobID(ctx context.Context, jobID, status string, responsePayload json.RawMessage, errorMessage string, latencyMs, tokenInput, tokenOutput, tokenCached int, costAmount float64, costUnit, providerTaskID string) (int64, error) {
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
			cost_unit = COALESCE(NULLIF($10, ''), cost_unit),
			provider_task_id = COALESCE(NULLIF($11, ''), provider_task_id)
		WHERE job_id = $1
	`, jobID, status, responsePayload, errorMessage, latencyMs, tokenInput, tokenOutput, tokenCached, costAmount, costUnit, providerTaskID)
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
	// 任务卡 §2.1「合规留痕」要求「按**人/项目**/时间的操作清单」
	// ⇒ 这两项必须能服务端筛（此前前端只能在【当前页】上做文本过滤，
	//   于是用户看到筛过的列表、而 total/stats 仍是全集 —— 是误导）。
	UserID    string
	ProjectID string
	Since     *time.Time // created_at >= Since
	Until     *time.Time // created_at <= Until
}

// whereClause 生成筛选条件（参数从 $2 起，$1 固定为 workspace_id）。
func (f Filter) whereClause() string {
	return `
		-- ★ 读侧兼容历史行：审计表里曾同时存在 "success"（同步路径）与
		-- "succeeded"（worker 旧写法）。写侧已归一为 "success"，
		-- 但**历史行不能因此从「成功」筛选里消失** ⇒ 这里把两者都当作 success。
		AND ($2 = '' OR status = $2 OR ($2 = 'success' AND status = 'succeeded'))
		AND ($3 = '' OR model_id = $3)
		AND ($4 = '' OR channel_id = $4)
		AND ($5::timestamptz IS NULL OR created_at >= $5)
		AND ($6::timestamptz IS NULL OR created_at <= $6)
		AND ($7 = '' OR user_id = $7)
		AND ($8 = '' OR project_id = $8)`
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
		LIMIT $9 OFFSET $10
	`, workspaceID, f.Status, f.ModelID, f.ChannelID, f.Since, f.Until, f.UserID, f.ProjectID, limit, offset)
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
		LIMIT $9
	`, workspaceID, f.Status, f.ModelID, f.ChannelID, f.Since, f.Until, f.UserID, f.ProjectID, maxRows)
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

// AggregateResult 是【筛选后全集】的聚合结果（D7a + ④ §2.3 的耗时百分位）。
//
// 用结构体而不是多返回值：聚合维度会增加，多返回值很快就会变成"位置参数猜谜"。
type AggregateResult struct {
	ByStatus     map[string]int
	AvgLatencyMs int
	// P50/P95：任务卡 §2.3「故障定位」明确要求「P50/P95 耗时」（此前只有平均值）。
	P50LatencyMs int
	P95LatencyMs int
	// TopErrors：任务卡 §2.3 的「按错误文本聚类」。
	TopErrors []ErrorCluster
	// TokensByModel / TokensByChannel：任务卡 §2.2「成本归因」的 SUM 维度
	// （按渠道/模型/项目/时间的 SUM）。见 TokenUsage 上关于"为什么先做 token 而不是金额"的说明。
	TokensByModel   []TokenUsage
	TokensByChannel []TokenUsage
}

// TokenUsage 是按某个维度聚合的 token 用量。
//
// **为什么先做 token、而不是金额 SUM**：`cost_amount` 目前**恒为 0** ——
// 计费单位尚未确定（D4b），金额 SUM 现在做出来只会显示 0，**反而误导**；
// 而 token 是 D4a/D4c 已经落地的**真实数据**（判据：开发库 mod_aaa… 有 in=35/out=38）。
// 等 D4b 定下单位后，同一套按维度聚合的写法可直接加上金额列。
type TokenUsage struct {
	// Key 维度取值；未标注时统一显示为 (未标注)
	Key    string `json:"key"`
	Input  int64  `json:"input"`
	Output int64  `json:"output"`
	Cached int64  `json:"cached"`
	Calls  int64  `json:"calls"`
}

// tokenDimensionWhitelist：维度名来自调用方，**绝不能**直接拼进 SQL。
// 白名单是这里唯一的防线，所以它必须是显式的 map，而不是字符串前缀判断。
var tokenDimensionWhitelist = map[string]string{
	"model":   "model_id",
	"channel": "channel_id",
}

// TokenUsageBy 按白名单维度聚合 token 用量（同一筛选口径与租户）。
// 只统计**有 token 的行**：全 0 的行（校验失败等）没有用量可言，混进来只会稀释平均数。
func (s Store) TokenUsageBy(ctx context.Context, workspaceID string, f Filter, dimension string, limit int) ([]TokenUsage, error) {
	col, ok := tokenDimensionWhitelist[dimension]
	if !ok {
		return nil, fmt.Errorf("unsupported token dimension %q (allowed: model|channel)", dimension)
	}
	if limit <= 0 || limit > 50 {
		limit = 5
	}
	rows, err := s.Pool.Query(ctx, `
		SELECT COALESCE(NULLIF(`+col+`, ''), '(未标注)') AS key,
		       COALESCE(sum(token_input), 0)::bigint,
		       COALESCE(sum(token_output), 0)::bigint,
		       COALESCE(sum(token_cached), 0)::bigint,
		       count(*)::bigint
		FROM gateway_audit_logs
		WHERE workspace_id = $1 AND (token_input > 0 OR token_output > 0 OR token_cached > 0)`+f.whereClause()+`
		GROUP BY key
		ORDER BY (COALESCE(sum(token_input), 0) + COALESCE(sum(token_output), 0)) DESC,
		         COALESCE(NULLIF(`+col+`, ''), '(未标注)') COLLATE "C" ASC
		LIMIT $9`,
		workspaceID, f.Status, f.ModelID, f.ChannelID, f.Since, f.Until, f.UserID, f.ProjectID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]TokenUsage, 0, limit)
	for rows.Next() {
		var u TokenUsage
		if err := rows.Scan(&u.Key, &u.Input, &u.Output, &u.Cached, &u.Calls); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// ErrorCluster 是一簇错误文本。
//
// 库里**没有错误码列**（判据：gateway_audit_logs 只有 error_message text），但实测形状很稳定：
// **稳定前缀 + ':' + 变量尾部**，例如
//
//	"required parameter missing: messages" / "required parameter missing: model"
//	"catalog unavailable: catalog: Get \"http://…\": dial tcp …"
//
// 且**大小写不一致**（"model not found in directory" vs "invalid generate request JSON"）。
// ⇒ 最小忠实的"聚类"= 取**第一个冒号之前**的部分、trim、**转小写**作为簇键。
// **不引入相似度算法**：那会让"同一簇"变成说不清的东西，而这里要的是**可解释**的归类。
type ErrorCluster struct {
	// Key 规范化后的簇键（小写、去变量尾部）——用于分组/去重
	Key string `json:"key"`
	// Sample 该簇里字典序最小的原始前缀（保留原大小写，供人阅读）
	Sample string `json:"sample"`
	Count  int    `json:"count"`
	// ★ 这三个 tag 是必需的：没有它们，JSON 会发成 Key/Sample/Count（首字母大写），
	//   而前端类型读的是 key/sample/count ⇒ 界面会显示 undefined。本项目真实踩到过
	//   （错误分布那块界面），是靠"在真实实例上核对 wire 格式"发现的。
}

// topErrorsLimit：界面一屏能看几条。刻意取小 —— 聚合用来看"形状"，
// 不是用来导出的（导出走 CSV，含全部原始 error_message）。
const topErrorsLimit = 5

// Aggregate 返回【筛选后全集】的按状态计数、平均耗时与耗时百分位（D7a）。
//
// 为什么要服务端算：前端此前在【当前页】（limit:100）上算成功率与平均耗时
// ⇒ 翻页/筛选后"统计"会变，是【假统计】。
//
// ★ 零耗时的处理（与既有平均值保持一致，不是新决定）：
//
//	`latency_ms` 是 NOT NULL DEFAULT 0，0 表示"没有测量到"而不是"瞬时完成"。
//	下面算平均值时本来就跳过了 avg=0 的状态组；百分位因此同样用 `latency_ms > 0` 排除零 ——
//	否则 2 行未测量的数据会把 P50 直接拉到 0，把"耗时分布"变成假象。
func (s Store) Aggregate(ctx context.Context, workspaceID string, f Filter) (AggregateResult, error) {
	rows, err := s.Pool.Query(ctx, `
		SELECT status, count(*)::int, COALESCE(AVG(latency_ms), 0)::int
		FROM gateway_audit_logs
		WHERE workspace_id = $1`+f.whereClause()+`
		GROUP BY status
	`, workspaceID, f.Status, f.ModelID, f.ChannelID, f.Since, f.Until, f.UserID, f.ProjectID)
	if err != nil {
		return AggregateResult{}, err
	}
	defer rows.Close()

	var out AggregateResult
	out.ByStatus = map[string]int{}
	total, latSum, latN := 0, 0, 0
	for rows.Next() {
		var st string
		var n, avg int
		if err := rows.Scan(&st, &n, &avg); err != nil {
			return AggregateResult{}, err
		}
		out.ByStatus[st] = n
		total += n
		if avg > 0 {
			latSum += avg * n
			latN += n
		}
	}
	if err := rows.Err(); err != nil {
		return AggregateResult{}, err
	}
	if latN > 0 {
		out.AvgLatencyMs = latSum / latN
	}

	// 耗时百分位：在同一次筛选条件、同一个 workspace 上算（语义与 byStatus 一致：filtered_total）。
	// percentile_cont 是连续插值；空集返回 NULL ⇒ COALESCE 归 0。
	if err := s.Pool.QueryRow(ctx, `
		SELECT
			COALESCE(percentile_cont(0.50) WITHIN GROUP (ORDER BY latency_ms), 0)::int,
			COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms), 0)::int
		FROM gateway_audit_logs
		WHERE workspace_id = $1 AND latency_ms > 0`+f.whereClause(),
		workspaceID, f.Status, f.ModelID, f.ChannelID, f.Since, f.Until, f.UserID, f.ProjectID).
		Scan(&out.P50LatencyMs, &out.P95LatencyMs); err != nil {
		return AggregateResult{}, err
	}

	// ④ §2.3「按错误文本聚类」。与上面**同一套筛选条件与同一租户**（口径一致）。
	//   key    = 第一个冒号之前、trim、转小写（分组用）
	//   sample = 同簇里"最小"的原始前缀（展示用）
	//
	// ★ 两处显式 COLLATE "C"：text 的 min()/ORDER BY 结果依赖**数据库排序规则** ——
	//   字节序（C）下 'M'(0x4D) < 'm'(0x6D)，而 UTF-8/ICU 排序会得出相反结果。
	//   实测：本机（C）取到 "Model Not Found…"，CI 取到 "model not found…"。
	//   显式指定 C 后，同一份数据的返回**在任何环境都相同**（可复现），
	//   而不是"取决于这台机器怎么排序"。
	errRows, err := s.Pool.Query(ctx, `
		SELECT lower(btrim(split_part(error_message, ':', 1))) AS key,
		       min(btrim(split_part(error_message, ':', 1)) COLLATE "C") AS sample,
		       count(*)::int                                  AS n
		FROM gateway_audit_logs
		WHERE workspace_id = $1 AND error_message <> ''`+f.whereClause()+`
		GROUP BY key
		ORDER BY n DESC, lower(btrim(split_part(error_message, ':', 1))) COLLATE "C" ASC
		LIMIT `+strconv.Itoa(topErrorsLimit),
		workspaceID, f.Status, f.ModelID, f.ChannelID, f.Since, f.Until, f.UserID, f.ProjectID)
	if err != nil {
		return AggregateResult{}, err
	}
	defer errRows.Close()
	out.TopErrors = make([]ErrorCluster, 0, topErrorsLimit)
	for errRows.Next() {
		var c ErrorCluster
		if err := errRows.Scan(&c.Key, &c.Sample, &c.Count); err != nil {
			return AggregateResult{}, err
		}
		out.TopErrors = append(out.TopErrors, c)
	}
	if err := errRows.Err(); err != nil {
		return AggregateResult{}, err
	}

	// §2.2 成本归因的 SUM 维度（按模型 / 按渠道）。两个维度各一次聚合；
	// 若将来维度变多，可换成单条 `GROUP BY GROUPING SETS` 查询（这里先保持可读）。
	if out.TokensByModel, err = s.TokenUsageBy(ctx, workspaceID, f, "model", 5); err != nil {
		return AggregateResult{}, err
	}
	if out.TokensByChannel, err = s.TokenUsageBy(ctx, workspaceID, f, "channel", 5); err != nil {
		return AggregateResult{}, err
	}
	return out, nil
}

// AggregateRecentCosts 聚合最近 7 天成功调用的实际成本（按 model_id 分组，T0 对账用）。
//
// 语义：actual = 审计回写的权威成本（sync/async 路径均已接权威价）；
// 返回 reconcile.ActualCost 供对账纯函数直接消费（同 unit 内聚合，避免跨单位相加）。
// limit 限制返回的模型行数（按总成本降序），防止目录膨胀时对账集失控。
func (s Store) AggregateRecentCosts(ctx context.Context, limit int) ([]reconcile.ActualCost, error) {
	rows, err := s.Pool.Query(ctx, `
		SELECT model_id, COALESCE(channel_id, ''), COALESCE(provider_model, ''), COALESCE(cost_unit, ''), SUM(cost_amount)
		FROM gateway_audit_logs
		WHERE status = 'success'
		  AND created_at >= now() - interval '7 days'
		GROUP BY model_id, channel_id, provider_model, cost_unit
		ORDER BY SUM(cost_amount) DESC
		LIMIT $1`, limit)
	if err != nil {
		return nil, fmt.Errorf("audit aggregate recent costs: %w", err)
	}
	defer rows.Close()
	var out []reconcile.ActualCost
	for rows.Next() {
		var a reconcile.ActualCost
		if err := rows.Scan(&a.ModelID, &a.ChannelID, &a.ProviderModel, &a.CostUnit, &a.Amount); err != nil {
			return nil, fmt.Errorf("audit aggregate recent costs: %w", err)
		}
		out = append(out, a)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("audit aggregate recent costs: %w", err)
	}
	return out, nil
}
