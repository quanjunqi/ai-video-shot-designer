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

// runModel is the sync model-test entry: given a catalog modelId and a runtime
// payload (business fields for role=runtime params), it resolves the channel
// credentials + protocol template from the directory, assembles the real HTTP
// request per source classification and returns the extracted result. It
// never fakes a dispatch and never returns credentials.

// ADR-003 的候选解析（与 worker 同一实现，避免两条路径口径分叉）。

// 文案与改动前逐字一致（错误码 MODEL_NOT_FOUND 与消息都保持稳定）

// P3-2：按候选顺序**失败切换**（ADR-003）。顺序与判定只保留一份实现
// （catalog.AttemptEach），避免两条执行路径口径分叉。
//
// 错误语义刻意与改动前保持兼容：
//   - 配置类问题（无协议模板 / 模板缺失 / 取不到凭据）：若**所有**候选都是这类问题，
//     返回第一个候选的原始状态码与文案（单候选场景与改动前逐字一致）
//   - 引擎调用失败：仍返回 200 + {ok:false, run:…}（与改动前一致），另加 attempts 轨迹
// 配置类失败用包级 cfgErr 承载（见文件末尾），以便与引擎失败区分。

// generate is the unified model gateway entry: accepts a modality-agnostic
// request, validates model capability, and dispatches to sync or async
// execution based on the protocol template's async config.

// D1：审计骨架【前移】到所有早退守卫之前。
// 原先 requestID/startTime 与 writeAudit 都定义在 4 个早退守卫【之后】，
// 于是任何早退都不留痕（实测：71 个 jobs 只对应 4 条审计，且全停在 queued）。

// auditChannelID 在渠道解析之后填入；解析前为空 —— 这是【诚实】的结果：
// 那一刻系统确实还不知道渠道，写空串比事后回填/猜测更可信。

// D4a：用量（token）落库。三个值在引擎调用之后填入，由 writeAudit 读取。
// 只记【事实】：本片【不写】cost_amount —— model_catalog.capability.billing 的字段
// 是「积分/百万 Token」（产品 UI 原文），而本表 cost_currency 硬编码 CNY，
// 单位未定；把积分写进 CNY 列是数据缺陷。价格换算待 Owner 定单位后另做（D4b）。

// T0 权威价格校准：命中模型的权威成本（model_catalog.cost_amount 经目录投影）。
// 在 AttemptEach 命中回调填入；未校准模型保持 0 + 空 unit（"预估"口径，T2 报表据此区分）。
// 这替换了上面 D4b 的搁置状态：037 迁移已建 cost_amount+cost_unit 六列、策展已写值，
// 权威价现在可可靠回写（ADR-004 §1 的 33 倍差价问题在此收口）。

// writeAudit 写一条审计。审计失败不得阻断主流程，但【必须可见】（D1：不再用 _ = 丢弃）。

// Extract product context from metadata

// T1（§3.7）：业务归因补齐 shot_id / feature（缺失置空容忍，不报错）

// 配额与限流：超限**拒绝**并写审计（status=rate_limited / quota_exceeded），
// 让「被限流」「超预算」可查，而不是静默失败或无限放行。

// Resolve model + template from catalog

// ADR-003 的候选解析（与 worker、/v1/run 同一实现）。
// ★ 这里曾漏改：P3-1 只改了同一个文件里另一处形状相似但文案不同的循环，
//   断言 count==1 通过了，却让**真正服务 /v1/generate 的这一处**留在旧行为上。
//   是"用逻辑模型 id 发一次真实请求"把它暴露出来的。

// 渠道已解析：从此之后的审计都能带上真实 channel_id。

// Capability validation: parse model capability and check mode support

// Image-to-image requires reference image support

// D1b：中段失败分支此前【不经过任何 writeAudit】⇒ 不留痕（真机实测 MISSING_PARAM 增量为 0）。

// Build runtime using dynamic parameter mapping engine (template-driven, no hardcoding)

// D1b：中段失败分支此前【不经过任何 writeAudit】⇒ 不留痕（真机实测 MISSING_PARAM 增量为 0）。

// Merge input and parameters for mapping

// Validate required parameters (if template has capability config)

// D1b：中段失败分支此前【不经过任何 writeAudit】⇒ 不留痕（真机实测 MISSING_PARAM 增量为 0）。

// Apply parameter mapping: unified API params -> model-specific params

// D1b：中段失败分支此前【不经过任何 writeAudit】⇒ 不留痕（真机实测 MISSING_PARAM 增量为 0）。

// Build runtime: non-mapped input fields become runtime, mapped params become __passthrough

// Input fields that are not reference_images go to runtime (for template params)

// Mapped parameters go to __passthrough (dynamic injection)

// D1b：中段失败分支此前【不经过任何 writeAudit】⇒ 不留痕（真机实测 MISSING_PARAM 增量为 0）。

// Determine final request path: model override > capability config > template default

// Embed final request path into runtime for worker (avoids hardcoded path switching in worker)

// 注：请求体不再在这里预构造 —— P3-2 后同步分支按【候选逐次】构造（每个候选有自己的
// 协议模板与请求路径），见下方 catalog.AttemptEach。
// Dispatch: async template → create job, sync template → run directly

// Create async job

// Embed runtime into payload for worker

// Write audit log for async job submission

// Sync execution —— P3-2：按候选顺序**失败切换**（ADR-003），顺序与判定复用
// catalog.AttemptEach（与 /internal/v1/tasks/run 同一实现）。
//
// 异步分支**不在这里**切换：它落到 job，由 worker 按 attempt 推进候选（同一套顺序）。
// 原因是异步的"失败"发生在 worker 里，而不是这次 HTTP 请求内。

// 审计如实记录"这一刻尝试的是谁"

// T0：命中模型的权威成本回写审计（契约含 costAmount；nil = 未校准，保持 0+空 unit 的预估口径）

// 首选沿用上面已 reveal 的凭据（保住"取不到凭据 ⇒ 422 CREDENTIALS_MISSING"契约），
// 备用候选才按需 reveal。

// 产物落盘（TASK-ASSET-001）：best-effort，失败不阻塞生成。
// 从上游提取结果中找产物 URL → 转存 asset（MinIO）→ 返回稳定 asset_id/asset_url。

// 落盘失败只记录，不改变任务结果（生成是主流程，落盘是增强）。

// genRequestID generates a unique request ID for audit tracing
// auditCostFor 从命中模型取权威成本（T0 价格校准）。
// 返回 (金额, 计费单位)：CostAmount=nil 表示该模型未校准 → (0, "")，即审计的"预估"口径
// （T2 报表据此区分已校准/预估，不参与预算拦截的强口径）。

// listAuditLogs returns gateway audit logs with filtering

// Parse query parameters

// D7a：筛选条件（status / model_id / channel_id / since / until）
// 筛选解析抽成 auditFilterFrom，列表与导出【共用同一口径】——避免两处漂移

// D7a：统计由【服务端】在【筛选后全集】上算 —— 前端此前在"当前页"上算，是假统计。

// 统计失败不该让列表也不可用：如实标注，便于排查。

// ★ 成功数必须把历史行的 "succeeded" 也算上（写侧已归一为 "success"）：
//   否则老数据的成功会在界面上凭空消失。失败态两条路径同名，无需兼容。

// ④ §2.3「故障定位」要求的耗时百分位（此前只有平均值）

// ④ §2.3「按错误文本聚类」：按"第一个冒号前的规范化前缀"分组

// ④ §2.2「成本归因」的 SUM 维度（token；金额 SUM 等计费单位确定后再加）

// listStats 返回按维度聚合的排行（GET /internal/v1/audit/stats）。
//
// 参数：dimension=channel|model|project|member（必填）；筛选复用 auditFilterFrom
// （status/model_id/channel_id/user_id/project_id/since/until）+ feature（T1 归因过滤）。
// 指标：调用量（成功/失败）、成功率、P95（仅成功行）、成本（已校准/预估双口径）。
// SLO：报表查询 P95 < 2s（数据量增大时以索引/聚合下推演进，见任务卡 §6）。

// statsTrend 返回时间序列（GET /internal/v1/audit/stats/trend）。
//
// 参数：granularity=day|week|month（必填）；dimension+dimension_value 可选（按单一维度值下钻）；
// 筛选与 listStats 同一口径。返回按桶升序的序列，前端直接渲染折线。

// probeChannel 是渠道连通性探测的内部端点（POST /internal/v1/channels/{id}/probe）。
//
// 只接受 workspaceID + actorID + channelID：base URL 由 probe 包从服务端来源解析
// （工作区用户渠道 / 凭据行 / 平台目录），**不接受请求体里的地址**——那正是原来的
// SSRF 面。返回结构与旧 probe.Result 一致（前端 ProbeResult 不变）。
// reconcile 触发一次 T0 价格对账（dev-plan T0 验收 #4）：
//
//	审计实际成本（最近 7 天成功调用，按 model_id 聚合） vs 目录权威价（model_catalog.cost_amount）
//	差异 > 20% 记为 alert 并写入 price_calibration_logs；端点返回本次告警列表。
//
// 一次性触发（运营/调试）；后续周期调度复用同一 reconcile 包（纯函数，无 IO 依赖本端点）。

// 目录权威价（含工作区视角）：无校准价的模型不出现在 ledger —— 未校准不告警（对账非缺失）

// 台账写入失败不吞掉结果：告警列表仍返回（可见），但必须打日志（审计的审计）

// cfgErr：配置类失败（无协议模板 / 模板缺失 / 取不到凭据）。
// 为什么要区分：失败切换后若**所有**候选都是配置问题，必须保留**第一个**候选的原始
// 状态码与文案（单候选场景与改动前逐字一致）；而引擎失败仍走 200 + {ok:false}（同改动前）。
type cfgErr struct {
	status int
	code   string
	msg    string
}

func (e *cfgErr) Error() string { return e.msg }
