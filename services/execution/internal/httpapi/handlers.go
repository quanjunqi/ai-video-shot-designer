package httpapi

import (
	"context"
	"shotdesigner/services/execution/internal/budget"
	"shotdesigner/services/execution/internal/quota"
	"shotdesigner/services/execution/internal/reconcile"

	"net/http"

	"shotdesigner/services/execution/internal/artifact"

	"log/slog"
	"shotdesigner/services/execution/internal/job"

	"crypto/subtle"
	"strings"
	"time"

	"encoding/json"

	"io"

	"errors"
	"shotdesigner/services/execution/internal/alert"
	"shotdesigner/services/execution/internal/audit"
	"shotdesigner/services/execution/internal/breaker"
	"shotdesigner/services/execution/internal/catalog"

	"shotdesigner/services/execution/internal/creds"

	"shotdesigner/services/execution/internal/probe"
)

type Handler struct {
	Store        Store
	Token        string
	Ready        func(context.Context) error
	Catalog      *catalog.Client
	Creds        *creds.Client
	EngineClient *http.Client
	AuditStore   *audit.Store
	// Quota 为 nil 时不做限流与成本判定（便于渐进启用与测试）
	Quota *quota.Limiter
	// Probe 是渠道连通性探测（全仓唯一实现，TASK-INFRA-004）。为 nil 时该路由 503。
	Probe *probe.Prober
	// Artifacts 是产物落盘客户端（TASK-ASSET-001）。为 nil 时不落盘（best-effort 关闭）。
	Artifacts *artifact.Client
	// ReconcileStore 是 T0 价格校准台账（price_calibration_logs）。为 nil 时对账端点 503。
	ReconcileStore *reconcile.Store
	// Breaker 是单元熔断 Store（T4，TASK-ROUTE-003）。为 nil 时熔断语义不生效（fail-open）。
	Breaker *breaker.Store
	// Budget 是请求前预算校验器（T3，TASK-MODEL-005）。为 nil 时不校验（fail-open）。
	Budget *budget.Checker
	// BudgetHolds 是预算预扣/结算状态机（T3）。为 nil 时不预扣（fail-open）。
	BudgetHolds budget.HoldsStore
	// Alert 是 T11 告警评估器（错误率突增/熔断/同步失败 → webhook）。为 nil 时告警路由 503。
	Alert *alert.Evaluator
}

type Store interface {
	Create(context.Context, string, string, job.Input) (job.Job, bool, error)
	List(context.Context, string, string, string, int) ([]job.Job, error)
	Get(context.Context, string, string) (job.Job, error)
	Cancel(context.Context, string, string) (job.Job, error)
	Retry(context.Context, string, string) (job.Job, error)
}

func (h Handler) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /live", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	mux.HandleFunc("GET /ready", func(w http.ResponseWriter, r *http.Request) {
		if h.Ready == nil || h.Ready(r.Context()) != nil {
			writeError(w, 503, "NOT_READY", "database unavailable")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("POST /internal/v1/tasks", h.create)
	mux.HandleFunc("POST /internal/v1/execution-intents", h.createFromIntent)
	mux.HandleFunc("GET /internal/v1/tasks", h.list)
	mux.HandleFunc("GET /internal/v1/tasks/{id}", h.get)
	mux.HandleFunc("POST /internal/v1/tasks/{id}/cancel", h.cancel)
	mux.HandleFunc("POST /internal/v1/tasks/{id}/retry", h.retry)
	mux.HandleFunc("POST /internal/v1/tasks/run", h.runModel)
	mux.HandleFunc("POST /v1/generate", h.generate)
	mux.HandleFunc("GET /internal/v1/audit/logs", h.listAuditLogs)
	mux.HandleFunc("GET /internal/v1/audit/export", h.exportAuditLogs)
	// T2 运营报表聚合：四维排行 + 日/周/月趋势（成本看板数据源）。
	mux.HandleFunc("GET /internal/v1/audit/stats", h.listStats)
	mux.HandleFunc("GET /internal/v1/audit/stats/trend", h.statsTrend)
	// T11 渠道健康面板：供给单元健康聚合 + 错误码分布 + 熔断状态。
	mux.HandleFunc("GET /internal/v1/audit/health", h.listHealth)
	// T11 告警配置（错误率阈值/窗口/冷却/webhook）：读取即默认，PUT 落库。
	mux.HandleFunc("GET /internal/v1/alerts/config", h.getAlertConfig)
	mux.HandleFunc("PUT /internal/v1/alerts/config", h.putAlertConfig)
	// T11 同步失败告警触发（BFF channelSync 转发失败时上报）。
	mux.HandleFunc("POST /internal/v1/alerts/sync-failure", h.notifySyncFailure)
	// 渠道探测：全仓唯一实现（BFF 只转发，不再自己在边缘发探测请求）。
	mux.HandleFunc("POST /internal/v1/channels/{id}/probe", h.probeChannel)
	// T0 价格对账：触发一次「审计实际成本 vs 目录权威价」的差异检查，写入校准台账。
	mux.HandleFunc("POST /internal/v1/reconcile", h.reconcile)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 同步测试端点 /tasks/run 会真实等待上游生成（文本 ~5s、图片 30-120s、视频异步不在此同步执行），
		// 超时按上游长任务放宽，避免图片/视频生成被掐断。
		ctx, cancel := context.WithTimeout(r.Context(), 300*time.Second)
		defer cancel()
		mux.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (h Handler) createFromIntent(w http.ResponseWriter, r *http.Request) {
	if !h.auth(w, r) {
		return
	}
	ws, actor, ok := ctxOf(r)
	if !ok {
		writeError(w, 400, "INVALID_CONTEXT", "workspace and actor are required")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 512*1024+4096)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	var in struct {
		IntentID   string          `json:"intent_id"`
		ProjectID  string          `json:"project_id"`
		EpisodeID  string          `json:"episode_id"`
		AssetID    string          `json:"asset_id"`
		ShotID     string          `json:"shot_id"`
		Feature    string          `json:"feature"`
		Kind       string          `json:"kind"`
		Label      string          `json:"label"`
		Payload    json.RawMessage `json:"payload"`
		ScopeEpoch int             `json:"scope_epoch"`
	}
	if err := dec.Decode(&in); err != nil {
		writeError(w, 400, "INVALID_BODY", "invalid execution intent JSON or body too large")
		return
	}
	if dec.Decode(new(any)) != io.EOF {
		writeError(w, 400, "INVALID_BODY", "request must contain exactly one JSON object")
		return
	}
	if in.IntentID == "" || in.ProjectID == "" || in.Kind == "" || in.Label == "" || in.ScopeEpoch < 0 || len(in.Payload) == 0 || !json.Valid(in.Payload) {
		writeError(w, 422, "INVALID_INTENT", "intent_id, project_id, kind, label and payload are required")
		return
	}
	key := "intent:" + in.IntentID
	out, replayed, err := h.Store.Create(r.Context(), ws, actor, job.Input{IntentID: in.IntentID, IdempotencyKey: key, Kind: in.Kind, Label: in.Label, ProjectID: in.ProjectID, EpisodeID: in.EpisodeID, AssetID: in.AssetID, ShotID: in.ShotID, Feature: in.Feature, ScopeEpoch: in.ScopeEpoch, IntentPayload: in.Payload})
	if errors.Is(err, job.ErrIdempotencyConflict) {
		writeError(w, 409, "INTENT_CONFLICT", err.Error())
		return
	}
	if err != nil {
		writeError(w, 503, "EXECUTION_UNAVAILABLE", "execution intent could not be persisted")
		return
	}
	w.Header().Set("X-Idempotent-Replay", boolString(replayed))
	if !replayed {
		// T1（§3.7）：异步提交路径创建 submit-time 审计行（status=queued，含业务归因 + job_id）。
		// 终结「异步任务零审计」——worker 终态更新（UpdateResultByJobID）命中本行。
		// 审计失败不得阻断主流程（D1），但必须可见。
		h.writeSubmitAudit(r.Context(), ws, actor, genRequestID(), out, in.Kind, in.Payload)
	}
	if replayed {
		writeJSON(w, 200, out)
	} else {
		writeJSON(w, 201, out)
	}
}

// writeSubmitAudit 为异步任务写入提交时审计行（T1）。
// 归因从意图上下文取；model_id 从 payload 尽力解析（best-effort，缺失置空容忍）；
// channel_id/provider_model 提交时未知，由 worker 终态更新补齐（UpdateResultByJobID）。
func (h Handler) writeSubmitAudit(ctx context.Context, ws, actor, requestID string, j job.Job, kind string, payload json.RawMessage) {
	if h.AuditStore == nil {
		return
	}
	modelID := ""
	if len(payload) > 0 {
		var m struct {
			ModelID string `json:"modelId"`
		}
		if json.Unmarshal(payload, &m) == nil {
			modelID = m.ModelID
		}
	}
	auditLog := audit.Log{
		RequestID: requestID, WorkspaceID: ws,
		ProjectID: j.ProjectID, EpisodeID: j.EpisodeID, AssetID: j.AssetID, ShotID: j.ShotID, Feature: j.Feature,
		UserID: actor, Product: kind, ModelID: modelID, Mode: "",
		RequestPayload: payload, Status: "queued",
		JobID: j.ID, CostCurrency: "CNY",
	}
	if err := h.AuditStore.Insert(ctx, auditLog); err != nil {
		slog.Error("audit submit insert failed", "jobId", j.ID, "error", err)
	}
}
func (h Handler) auth(w http.ResponseWriter, r *http.Request) bool {
	p := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if h.Token == "" || len(p) != len(h.Token) || subtle.ConstantTimeCompare([]byte(p), []byte(h.Token)) != 1 {
		writeError(w, 401, "UNAUTHENTICATED", "internal authentication required")
		return false
	}
	return true
}
func ctxOf(r *http.Request) (string, string, bool) {
	return strings.TrimSpace(r.Header.Get("X-Workspace-Id")), strings.TrimSpace(r.Header.Get("X-Actor-Id")), r.Header.Get("X-Workspace-Id") != "" && r.Header.Get("X-Actor-Id") != ""
}
func (h Handler) create(w http.ResponseWriter, r *http.Request) {
	if !h.auth(w, r) {
		return
	}
	ws, actor, ok := ctxOf(r)
	if !ok {
		writeError(w, 400, "INVALID_CONTEXT", "workspace and actor are required")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 512*1024+4096)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	var in struct {
		Kind           string          `json:"kind"`
		Label          string          `json:"label"`
		ProjectID      string          `json:"project_id"`
		EpisodeID      string          `json:"episode_id"`
		AssetID        string          `json:"asset_id"`
		ShotID         string          `json:"shot_id"`
		Feature        string          `json:"feature"`
		Steps          json.RawMessage `json:"steps"`
		Payload        json.RawMessage `json:"payload"`
		CostEstimate   string          `json:"cost_estimate"`
		ContextPath    string          `json:"context_path"`
		IdempotencyKey string          `json:"idempotency_key"`
	}
	if err := dec.Decode(&in); err != nil {
		writeError(w, 400, "INVALID_JSON", "invalid task request")
		return
	}
	if dec.Decode(new(any)) != io.EOF {
		writeError(w, 400, "INVALID_JSON", "request must contain exactly one JSON object")
		return
	}
	key := r.Header.Get("Idempotency-Key")
	if key == "" {
		key = in.IdempotencyKey
	}
	out, replayed, err := h.Store.Create(r.Context(), ws, actor, job.Input{IdempotencyKey: key, Kind: in.Kind, Label: in.Label, ProjectID: in.ProjectID, EpisodeID: in.EpisodeID, AssetID: in.AssetID, ShotID: in.ShotID, Feature: in.Feature, Steps: in.Steps, IntentPayload: in.Payload, CostEstimate: in.CostEstimate, ContextPath: in.ContextPath})
	if errors.Is(err, job.ErrIdempotencyConflict) {
		writeError(w, 409, "IDEMPOTENCY_CONFLICT", err.Error())
		return
	}
	if err != nil {
		writeError(w, 422, "INVALID_TASK", err.Error())
		return
	}
	w.Header().Set("X-Idempotent-Replay", boolString(replayed))
	if !replayed {
		// T1（§3.7）：同 intent 提交路径，任务提交创建 submit-time 审计行（queued + 归因 + job_id）。
		h.writeSubmitAudit(r.Context(), ws, actor, genRequestID(), out, in.Kind, in.Payload)
	}
	if replayed {
		writeJSON(w, 200, out)
		return
	}
	writeJSON(w, 201, out)
}
func (h Handler) list(w http.ResponseWriter, r *http.Request) {
	if !h.auth(w, r) {
		return
	}
	ws, _, ok := ctxOf(r)
	if !ok {
		writeError(w, 400, "INVALID_CONTEXT", "workspace and actor are required")
		return
	}
	out, err := h.Store.List(r.Context(), ws, r.URL.Query().Get("status"), r.URL.Query().Get("kind"), 50)
	if err != nil {
		writeError(w, 503, "TASK_UNAVAILABLE", err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"items": out})
}
func (h Handler) get(w http.ResponseWriter, r *http.Request) {
	if !h.auth(w, r) {
		return
	}
	ws, _, ok := ctxOf(r)
	if !ok {
		writeError(w, 400, "INVALID_CONTEXT", "workspace and actor are required")
		return
	}
	out, err := h.Store.Get(r.Context(), ws, r.PathValue("id"))
	if errors.Is(err, job.ErrNotFound) {
		writeError(w, 404, "NOT_FOUND", "task not found")
		return
	}
	if err != nil {
		writeError(w, 503, "TASK_UNAVAILABLE", err.Error())
		return
	}
	writeJSON(w, 200, out)
}
func (h Handler) cancel(w http.ResponseWriter, r *http.Request) {
	if !h.auth(w, r) {
		return
	}
	ws, _, ok := ctxOf(r)
	if !ok {
		writeError(w, 400, "INVALID_CONTEXT", "workspace and actor are required")
		return
	}
	out, err := h.Store.Cancel(r.Context(), ws, r.PathValue("id"))
	if errors.Is(err, job.ErrNotFound) {
		writeError(w, 404, "NOT_FOUND", "task not found")
		return
	}
	if err != nil {
		writeError(w, 409, "INVALID_STATE", err.Error())
		return
	}
	writeJSON(w, 200, out)
}
func (h Handler) retry(w http.ResponseWriter, r *http.Request) {
	if !h.auth(w, r) {
		return
	}
	ws, _, ok := ctxOf(r)
	if !ok {
		writeError(w, 400, "INVALID_CONTEXT", "workspace and actor are required")
		return
	}
	out, err := h.Store.Retry(r.Context(), ws, r.PathValue("id"))
	if errors.Is(err, job.ErrNotFound) {
		writeError(w, 404, "NOT_FOUND", "task not found")
		return
	}
	if err != nil {
		writeError(w, 409, "INVALID_STATE", err.Error())
		return
	}
	writeJSON(w, 200, out)
}

type cfgErr struct {
	status int
	code   string
	msg    string
}

func (e *cfgErr) Error() string { return e.msg }
