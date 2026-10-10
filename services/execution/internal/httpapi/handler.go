package httpapi

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"shotdesigner/services/execution/internal/audit"
	"shotdesigner/services/execution/internal/catalog"
	"shotdesigner/services/execution/internal/creds"
	"shotdesigner/services/execution/internal/engine"
	"shotdesigner/services/execution/internal/job"
	"shotdesigner/services/execution/internal/mapping"
	"shotdesigner/services/execution/internal/probe"
	"shotdesigner/services/execution/internal/quota"
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
	// 渠道探测：全仓唯一实现（BFF 只转发，不再自己在边缘发探测请求）。
	mux.HandleFunc("POST /internal/v1/channels/{id}/probe", h.probeChannel)
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
	out, replayed, err := h.Store.Create(r.Context(), ws, actor, job.Input{IntentID: in.IntentID, IdempotencyKey: key, Kind: in.Kind, Label: in.Label, ProjectID: in.ProjectID, EpisodeID: in.EpisodeID, AssetID: in.AssetID, ScopeEpoch: in.ScopeEpoch, IntentPayload: in.Payload})
	if errors.Is(err, job.ErrIdempotencyConflict) {
		writeError(w, 409, "INTENT_CONFLICT", err.Error())
		return
	}
	if err != nil {
		writeError(w, 503, "EXECUTION_UNAVAILABLE", "execution intent could not be persisted")
		return
	}
	w.Header().Set("X-Idempotent-Replay", boolString(replayed))
	if replayed {
		writeJSON(w, 200, out)
	} else {
		writeJSON(w, 201, out)
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
	out, replayed, err := h.Store.Create(r.Context(), ws, actor, job.Input{IdempotencyKey: key, Kind: in.Kind, Label: in.Label, ProjectID: in.ProjectID, EpisodeID: in.EpisodeID, AssetID: in.AssetID, ShotID: in.ShotID, Steps: in.Steps, IntentPayload: in.Payload, CostEstimate: in.CostEstimate, ContextPath: in.ContextPath})
	if errors.Is(err, job.ErrIdempotencyConflict) {
		writeError(w, 409, "IDEMPOTENCY_CONFLICT", err.Error())
		return
	}
	if err != nil {
		writeError(w, 422, "INVALID_TASK", err.Error())
		return
	}
	w.Header().Set("X-Idempotent-Replay", boolString(replayed))
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
func (h Handler) runModel(w http.ResponseWriter, r *http.Request) {
	if !h.auth(w, r) {
		return
	}
	ws, actor, ok := ctxOf(r)
	if !ok {
		writeError(w, 400, "INVALID_CONTEXT", "workspace and actor are required")
		return
	}
	if h.Catalog == nil || h.Creds == nil || h.EngineClient == nil {
		writeError(w, 503, "EXECUTION_UNAVAILABLE", "execution engine not configured")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 256*1024+4096)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	var in struct {
		ModelID string         `json:"modelId"`
		Runtime map[string]any `json:"runtime"`
	}
	if err := dec.Decode(&in); err != nil {
		writeError(w, 400, "INVALID_BODY", "invalid run request JSON")
		return
	}
	if dec.Decode(new(any)) != io.EOF {
		writeError(w, 400, "INVALID_BODY", "request must contain exactly one JSON object")
		return
	}
	if in.ModelID == "" {
		writeError(w, 422, "INVALID_RUN", "modelId is required")
		return
	}
	dir, err := h.Catalog.Get(r.Context(), ws, actor)
	if err != nil {
		writeError(w, 503, "CATALOG_UNAVAILABLE", err.Error())
		return
	}
	var model *catalog.Model
	for i := range dir.Models {
		if dir.Models[i].ID == in.ModelID {
			model = &dir.Models[i]
			break
		}
	}
	if model == nil {
		writeError(w, 404, "MODEL_NOT_FOUND", "model not found in directory")
		return
	}
	if model.ProtocolTemplateID == "" {
		writeError(w, 422, "MODEL_NO_PROTOCOL", "model has no protocol template; attach one first")
		return
	}
	var tmpl *catalog.Template
	for i := range dir.Templates {
		if dir.Templates[i].ID == model.ProtocolTemplateID {
			tmpl = &dir.Templates[i]
			break
		}
	}
	if tmpl == nil {
		writeError(w, 404, "TEMPLATE_NOT_FOUND", "protocol template not found")
		return
	}
	creds, err := h.Creds.Reveal(r.Context(), ws, model.ChannelID)
	if err != nil {
		writeError(w, 422, "CREDENTIALS_MISSING", err.Error())
		return
	}
	out, err := engine.Run(r.Context(), creds, engine.RunRequest{
		ChannelID:        model.ChannelID,
		ProviderModel:    model.ProviderModel,
		ProtocolTemplate: engine.Template{ID: tmpl.ID, Label: tmpl.Label, Method: tmpl.Method, RequestPath: tmpl.RequestPath, Params: tmpl.Params, ResponseParams: tmpl.ResponseParams, Async: tmpl.Async, RequestTemplate: tmpl.RequestTemplate},
		ModelParams:      model.Params,
		ModelRequestPath: model.RequestPath,
		Runtime:          in.Runtime,
	}, h.EngineClient)
	if err != nil {
		writeJSON(w, 200, map[string]any{"ok": false, "run": out})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "run": out})
}

// generate is the unified model gateway entry: accepts a modality-agnostic
// request, validates model capability, and dispatches to sync or async
// execution based on the protocol template's async config.
func (h Handler) generate(w http.ResponseWriter, r *http.Request) {
	if !h.auth(w, r) {
		return
	}
	ws, actor, ok := ctxOf(r)
	if !ok {
		writeError(w, 400, "INVALID_CONTEXT", "workspace and actor are required")
		return
	}
	// D1：审计骨架【前移】到所有早退守卫之前。
	// 原先 requestID/startTime 与 writeAudit 都定义在 4 个早退守卫【之后】，
	// 于是任何早退都不留痕（实测：71 个 jobs 只对应 4 条审计，且全停在 queued）。
	requestID := genRequestID()
	startTime := time.Now()
	r.Body = http.MaxBytesReader(w, r.Body, 1024*1024)
	var in struct {
		ModelID    string         `json:"modelId"`
		Modality   string         `json:"modality"`
		Mode       string         `json:"mode"`
		Input      map[string]any `json:"input"`
		Parameters map[string]any `json:"parameters"`
		Metadata   map[string]any `json:"metadata"`
	}
	var (
		product   string
		projectID string
		episodeID string
		assetID   string
	)
	// auditChannelID 在渠道解析之后填入；解析前为空 —— 这是【诚实】的结果：
	// 那一刻系统确实还不知道渠道，写空串比事后回填/猜测更可信。
	var auditChannelID string
	// writeAudit 写一条审计。审计失败不得阻断主流程，但【必须可见】（D1：不再用 _ = 丢弃）。
	writeAudit := func(status string, respPayload json.RawMessage, errMsg string, jobID string, providerTaskID string) {
		if h.AuditStore == nil {
			return
		}
		reqBytes, _ := json.Marshal(map[string]any{"input": in.Input, "parameters": in.Parameters})
		auditLog := audit.Log{
			RequestID: requestID, WorkspaceID: ws, ChannelID: auditChannelID,
			ProjectID: projectID, EpisodeID: episodeID, AssetID: assetID,
			UserID: actor, Product: product, ModelID: in.ModelID, Mode: in.Mode,
			RequestPayload: reqBytes, ResponsePayload: respPayload, ErrorMessage: errMsg,
			Status: status, LatencyMs: int(time.Since(startTime).Milliseconds()),
			JobID: jobID, ProviderTaskID: providerTaskID, CostCurrency: "CNY",
		}
		if err := h.AuditStore.Insert(r.Context(), auditLog); err != nil {
			slog.Error("audit insert failed", "requestId", requestID, "status", status, "error", err)
		}
	}
	if h.Catalog == nil || h.Creds == nil || h.EngineClient == nil {
		writeAudit("failed", nil, "execution engine not configured", "", "")
		writeError(w, 503, "EXECUTION_UNAVAILABLE", "execution engine not configured")
		return
	}
	// Extract product context from metadata
	product = ""
	projectID = ""
	episodeID = ""
	assetID = ""
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeAudit("failed", nil, "invalid generate request JSON", "", "")
		writeError(w, 400, "INVALID_BODY", "invalid generate request JSON")
		return
	}
	if in.ModelID == "" {
		writeAudit("failed", nil, "modelId is required", "", "")
		writeError(w, 422, "INVALID_GENERATE", "modelId is required")
		return
	}
	if in.Metadata != nil {
		if v, ok := in.Metadata["product"].(string); ok {
			product = v
		}
		if v, ok := in.Metadata["project_id"].(string); ok {
			projectID = v
		}
		if v, ok := in.Metadata["episode_id"].(string); ok {
			episodeID = v
		}
		if v, ok := in.Metadata["asset_id"].(string); ok {
			assetID = v
		}
	}
	// 配额与限流：超限**拒绝**并写审计（status=rate_limited / quota_exceeded），
	// 让「被限流」「超预算」可查，而不是静默失败或无限放行。
	if h.Quota != nil {
		if d := h.Quota.Check(r.Context(), ws); !d.Allowed {
			writeAudit(d.Status, nil, d.Reason, "", "")
			writeError(w, http.StatusTooManyRequests, strings.ToUpper(d.Status), d.Reason)
			return
		}
	}

	// Resolve model + template from catalog
	dir, err := h.Catalog.Get(r.Context(), ws, actor)
	if err != nil {
		writeAudit("failed", nil, "catalog unavailable: "+err.Error(), "", "")
		writeError(w, 503, "CATALOG_UNAVAILABLE", err.Error())
		return
	}
	var model *catalog.Model
	for i := range dir.Models {
		if dir.Models[i].ID == in.ModelID {
			model = &dir.Models[i]
			break
		}
	}
	if model == nil {
		writeAudit("failed", nil, "model not found in directory", "", "")
		writeError(w, 404, "MODEL_NOT_FOUND", "model not found in directory")
		return
	}
	// 渠道已解析：从此之后的审计都能带上真实 channel_id。
	auditChannelID = model.ChannelID
	if model.ProtocolTemplateID == "" {
		writeAudit("failed", nil, "model has no protocol template", "", "")
		writeError(w, 422, "MODEL_NO_PROTOCOL", "model has no protocol template")
		return
	}
	var tmpl *catalog.Template
	for i := range dir.Templates {
		if dir.Templates[i].ID == model.ProtocolTemplateID {
			tmpl = &dir.Templates[i]
			break
		}
	}
	if tmpl == nil {
		writeAudit("failed", nil, "protocol template not found", "", "")
		writeError(w, 404, "TEMPLATE_NOT_FOUND", "protocol template not found")
		return
	}
	// Capability validation: parse model capability and check mode support
	var cap struct {
		RefImage       bool     `json:"refImage"`
		SupportedModes []string `json:"supportedModes"`
		Modalities     []string `json:"modalities"`
	}
	if len(model.Capability) > 0 {
		_ = json.Unmarshal(model.Capability, &cap)
	}
	// Image-to-image requires reference image support
	if in.Mode == "image-to-image" || in.Mode == "image-to-video" {
		hasRef := false
		if in.Input != nil {
			if refs, ok := in.Input["reference_images"].([]any); ok && len(refs) > 0 {
				hasRef = true
			}
		}
		if !hasRef {
			writeAudit("failed", nil, "image-to-image/image-to-video requires reference_images", "", "")
			// D1b：中段失败分支此前【不经过任何 writeAudit】⇒ 不留痕（真机实测 MISSING_PARAM 增量为 0）。
			writeError(w, 422, "MISSING_REFERENCE", "image-to-image/image-to-video requires reference_images")
			return
		}
	}

	// Build runtime using dynamic parameter mapping engine (template-driven, no hardcoding)
	mappingEngine, err := mapping.NewEngine(tmpl.Capabilities)
	if err != nil {
		writeAudit("failed", nil, fmt.Sprintf("failed to create mapping engine: %v", err), "", "")
		// D1b：中段失败分支此前【不经过任何 writeAudit】⇒ 不留痕（真机实测 MISSING_PARAM 增量为 0）。
		writeError(w, 500, "MAPPING_ENGINE_ERROR", fmt.Sprintf("failed to create mapping engine: %v", err))
		return
	}

	// Merge input and parameters for mapping
	mergeInput := make(map[string]any)
	if in.Input != nil {
		for k, v := range in.Input {
			mergeInput[k] = v
		}
	}
	if in.Parameters != nil {
		for k, v := range in.Parameters {
			mergeInput[k] = v
		}
	}

	// Validate required parameters (if template has capability config)
	if mappingEngine.HasCapability(in.Mode) {
		if err := mappingEngine.ValidateRequired(in.Mode, mergeInput); err != nil {
			writeAudit("failed", nil, err.Error(), "", "")
			// D1b：中段失败分支此前【不经过任何 writeAudit】⇒ 不留痕（真机实测 MISSING_PARAM 增量为 0）。
			writeError(w, 422, "MISSING_PARAM", err.Error())
			return
		}
	}

	// Apply parameter mapping: unified API params -> model-specific params
	mappedParams, err := mappingEngine.ApplyMapping(mergeInput, in.Mode)
	if err != nil {
		writeAudit("failed", nil, fmt.Sprintf("failed to apply parameter mapping: %v", err), "", "")
		// D1b：中段失败分支此前【不经过任何 writeAudit】⇒ 不留痕（真机实测 MISSING_PARAM 增量为 0）。
		writeError(w, 500, "MAPPING_ERROR", fmt.Sprintf("failed to apply parameter mapping: %v", err))
		return
	}

	// Build runtime: non-mapped input fields become runtime, mapped params become __passthrough
	runtime := map[string]any{}
	passthrough := map[string]any{}

	// Input fields that are not reference_images go to runtime (for template params)
	if in.Input != nil {
		for k, v := range in.Input {
			if k != "reference_images" {
				runtime[k] = v
			}
		}
	}

	// Mapped parameters go to __passthrough (dynamic injection)
	for k, v := range mappedParams {
		passthrough[k] = v
	}

	if len(passthrough) > 0 {
		runtime["__passthrough"] = passthrough
	}

	creds, err := h.Creds.Reveal(r.Context(), ws, model.ChannelID)
	if err != nil {
		writeAudit("failed", nil, err.Error(), "", "")
		// D1b：中段失败分支此前【不经过任何 writeAudit】⇒ 不留痕（真机实测 MISSING_PARAM 增量为 0）。
		writeError(w, 422, "CREDENTIALS_MISSING", err.Error())
		return
	}

	// Determine final request path: model override > capability config > template default
	finalRequestPath := model.RequestPath
	if capabilityPath := mappingEngine.GetRequestPath(in.Mode, ""); capabilityPath != "" {
		finalRequestPath = capabilityPath
	}
	// Embed final request path into runtime for worker (avoids hardcoded path switching in worker)
	runtime["__request_path"] = finalRequestPath
	engineReq := engine.RunRequest{
		ChannelID:        model.ChannelID,
		ProviderModel:    model.ProviderModel,
		ProtocolTemplate: engine.Template{ID: tmpl.ID, Label: tmpl.Label, Method: tmpl.Method, RequestPath: tmpl.RequestPath, Params: tmpl.Params, ResponseParams: tmpl.ResponseParams, Async: tmpl.Async, RequestTemplate: tmpl.RequestTemplate},
		ModelParams:      model.Params,
		ModelRequestPath: finalRequestPath,
		Runtime:          runtime,
	}
	// Dispatch: async template → create job, sync template → run directly
	asyncEnabled := len(tmpl.Async) > 0
	var asyncCfg struct {
		Enabled bool `json:"enabled"`
	}
	if len(tmpl.Async) > 0 {
		_ = json.Unmarshal(tmpl.Async, &asyncCfg)
		asyncEnabled = asyncCfg.Enabled
	}
	if asyncEnabled {
		// Create async job
		idempotencyKey := fmt.Sprintf("gen-%d-%d", time.Now().UnixNano(), os.Getpid())
		jobInput := job.Input{
			Kind:           in.Modality,
			Label:          model.Name,
			IdempotencyKey: idempotencyKey,
			ProjectID:      "",
			Steps:          nil,
			IntentPayload:  nil,
		}
		// Embed runtime into payload for worker
		payloadBytes, _ := json.Marshal(map[string]any{
			"modelId":  in.ModelID,
			"runtime":  runtime,
			"metadata": in.Metadata,
		})
		jobInput.IntentPayload = payloadBytes
		j, _, err := h.Store.Create(r.Context(), ws, actor, jobInput)
		if err != nil {
			writeAudit("failed", nil, err.Error(), "", "")
			writeError(w, 500, "JOB_CREATE_FAILED", err.Error())
			return
		}
		// Write audit log for async job submission
		writeAudit("queued", nil, "", j.ID, "")
		writeJSON(w, 202, map[string]any{
			"task_id":  j.ID,
			"status":   j.Status,
			"poll_url": "/internal/v1/tasks/" + j.ID,
		})
		return
	}
	// Sync execution
	out, err := engine.Run(r.Context(), creds, engineReq, h.EngineClient)
	if err != nil {
		respBytes, _ := json.Marshal(out)
		writeAudit("failed", respBytes, out.Error, "", "")
		writeJSON(w, 200, map[string]any{"ok": false, "status": "failed", "error": out.Error, "run": out})
		return
	}
	respBytes, _ := json.Marshal(out)
	writeAudit("success", respBytes, "", "", "")
	writeJSON(w, 200, map[string]any{"ok": true, "status": "succeeded", "output": out.Extracted, "run": out})
}

// genRequestID generates a unique request ID for audit tracing
func genRequestID() string {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	return "req_" + hex.EncodeToString(b)
}

// listAuditLogs returns gateway audit logs with filtering
func (h Handler) listAuditLogs(w http.ResponseWriter, r *http.Request) {
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
	// Parse query parameters
	limit := 50
	offset := 0
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}
	if v := r.URL.Query().Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offset = n
		}
	}
	logs, err := h.AuditStore.ListByWorkspace(r.Context(), ws, limit, offset)
	if err != nil {
		writeError(w, 500, "AUDIT_QUERY_FAILED", err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{
		"items":  logs,
		"total":  len(logs),
		"limit":  limit,
		"offset": offset,
	})
}

// probeChannel 是渠道连通性探测的内部端点（POST /internal/v1/channels/{id}/probe）。
//
// 只接受 workspaceID + actorID + channelID：base URL 由 probe 包从服务端来源解析
// （工作区用户渠道 / 凭据行 / 平台目录），**不接受请求体里的地址**——那正是原来的
// SSRF 面。返回结构与旧 probe.Result 一致（前端 ProbeResult 不变）。
func (h Handler) probeChannel(w http.ResponseWriter, r *http.Request) {
	if !h.auth(w, r) {
		return
	}
	ws, actor, ok := ctxOf(r)
	if !ok {
		writeError(w, 400, "INVALID_CONTEXT", "workspace and actor are required")
		return
	}
	if h.Probe == nil {
		writeError(w, 503, "PROBE_UNAVAILABLE", "channel probe is unavailable")
		return
	}
	id := r.PathValue("id")
	if id == "" {
		writeError(w, 400, "INVALID_PATH", "channel id is required")
		return
	}
	out, err := h.Probe.Probe(r.Context(), ws, actor, id)
	if errors.Is(err, probe.ErrChannelNotFound) {
		writeError(w, 404, "NOT_FOUND", "channel not found")
		return
	}
	if err != nil {
		slog.Error("probe channel", "channel_id", id, "workspace_id", ws, "error", err)
		writeError(w, 503, "PROBE_UNAVAILABLE", "channel probe could not be executed")
		return
	}
	writeJSON(w, 200, out)
}

func writeError(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, map[string]string{"code": code, "message": msg})
}
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func boolString(v bool) string {
	if v {
		return "true"
	}
	return "false"
}
