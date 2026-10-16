package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"time"

	"shotdesigner/services/execution/internal/artifact"
	"shotdesigner/services/execution/internal/audit"
	"shotdesigner/services/execution/internal/breaker"
	"shotdesigner/services/execution/internal/catalog"
	"shotdesigner/services/execution/internal/engine"
	"shotdesigner/services/execution/internal/job"
	"shotdesigner/services/execution/internal/mapping"
)

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
		shotID    string
		feature   string
	)
	// auditChannelID 在渠道解析之后填入；解析前为空 —— 这是【诚实】的结果：
	// 那一刻系统确实还不知道渠道，写空串比事后回填/猜测更可信。
	var auditChannelID string
	// D4a：用量（token）落库。三个值在引擎调用之后填入，由 writeAudit 读取。
	// 只记【事实】：本片【不写】cost_amount —— model_catalog.capability.billing 的字段
	// 是「积分/百万 Token」（产品 UI 原文），而本表 cost_currency 硬编码 CNY，
	// 单位未定；把积分写进 CNY 列是数据缺陷。价格换算待 Owner 定单位后另做（D4b）。
	var auditTokenIn, auditTokenOut, auditTokenCached int
	// T0 权威价格校准：命中模型的权威成本（model_catalog.cost_amount 经目录投影）。
	// 在 AttemptEach 命中回调填入；未校准模型保持 0 + 空 unit（"预估"口径，T2 报表据此区分）。
	// 这替换了上面 D4b 的搁置状态：037 迁移已建 cost_amount+cost_unit 六列、策展已写值，
	// 权威价现在可可靠回写（ADR-004 §1 的 33 倍差价问题在此收口）。
	var auditCostAmount float64
	var auditCostUnit string
	// writeAudit 写一条审计。审计失败不得阻断主流程，但【必须可见】（D1：不再用 _ = 丢弃）。
	writeAudit := func(status string, respPayload json.RawMessage, errMsg string, jobID string, providerTaskID string) {
		if h.AuditStore == nil {
			return
		}
		reqBytes, _ := json.Marshal(map[string]any{"input": in.Input, "parameters": in.Parameters})
		auditLog := audit.Log{
			RequestID: requestID, WorkspaceID: ws, ChannelID: auditChannelID,
			ProjectID: projectID, EpisodeID: episodeID, AssetID: assetID, ShotID: shotID, Feature: feature,
			UserID: actor, Product: product, ModelID: in.ModelID, Mode: in.Mode,
			RequestPayload: reqBytes, ResponsePayload: respPayload, ErrorMessage: errMsg,
			Status: status, LatencyMs: int(time.Since(startTime).Milliseconds()),
			TokenInput: auditTokenIn, TokenOutput: auditTokenOut, TokenCached: auditTokenCached,
			JobID: jobID, ProviderTaskID: providerTaskID, CostCurrency: "CNY",
			CostAmount: auditCostAmount, CostUnit: auditCostUnit,
		}
		if err := h.AuditStore.Insert(r.Context(), auditLog); err != nil {
			slog.Error("audit insert failed", "requestId", requestID, "status", status, "error", err)
		}
		// T11：每次审计写入后评估该 workspace 错误率突增（唯一收口，覆盖全部调用点）。
		// fail-open：告警评估失败不阻断主流程；冷却去重防抖（alert 内部实现）。
		if h.Alert != nil && ws != "" {
			alertCtx, alertCancel := context.WithTimeout(r.Context(), 3*time.Second)
			h.Alert.EvaluateErrorRate(alertCtx, ws)
			alertCancel()
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
	shotID = ""
	feature = ""
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
		// T1（§3.7）：业务归因补齐 shot_id / feature（缺失置空容忍，不报错）
		if v, ok := in.Metadata["shot_id"].(string); ok {
			shotID = v
		}
		if v, ok := in.Metadata["feature"].(string); ok {
			feature = v
		}
	}
	if h.checkQuotaAndBudget(r.Context(), w, ws, writeAudit) {
		return
	}

	// Resolve model + template from catalog
	dir, err := h.Catalog.Get(r.Context(), ws, actor)
	if err != nil {
		writeAudit("failed", nil, "catalog unavailable: "+err.Error(), "", "")
		writeError(w, 503, "CATALOG_UNAVAILABLE", err.Error())
		return
	}
	// ADR-003 的候选解析（与 worker、/v1/run 同一实现）。
	// ★ 这里曾漏改：P3-1 只改了同一个文件里另一处形状相似但文案不同的循环，
	//   断言 count==1 通过了，却让**真正服务 /v1/generate 的这一处**留在旧行为上。
	//   是"用逻辑模型 id 发一次真实请求"把它暴露出来的。
	candidates, resolveErr := catalog.Resolve(dir, in.ModelID)
	if resolveErr != nil {
		writeAudit("failed", nil, "model not found in directory", "", "")
		writeError(w, 404, "MODEL_NOT_FOUND", "model not found in directory")
		return
	}
	// T4 单元熔断：冷却中的候选先剔除（不消耗尝试次数）；全部冷却 ⇒ 显式失败。
	if h.Breaker != nil {
		filtered, filterErr := h.Breaker.FilterHealthy(r.Context(), unitsOf(candidates))
		if errors.Is(filterErr, breaker.ErrUnitCooling) {
			writeAudit("failed", nil, "all candidate units are cooling", "", "")
			writeError(w, 503, "ALL_UNITS_COOLING", "all candidate units are cooling")
			return
		}
		if filterErr != nil {
			// fail-open：DB 故障放行全部候选（FilterHealthy 已返回原序列），仅告警
			_ = filterErr
		}
		candidates = candidatesOf(filtered, candidates)
	}
	// 此处保留 candidates[0] 用于预派发（协议模板/凭据检查、异步 job 创建）：
	// 异步分支的失败切换不在这里做 —— 它落到 job，由 worker 按 attempt 推进候选
	// （同一套顺序，见 catalog.PickForAttempt 注释）；同步分支的切换走下方 AttemptEach。
	model := &candidates[0]
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
	// 注：请求体不再在这里预构造 —— P3-2 后同步分支按【候选逐次】构造（每个候选有自己的
	// 协议模板与请求路径），见下方 catalog.AttemptEach。
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
	// Sync execution —— P3-2：按候选顺序**失败切换**（ADR-003），顺序与判定复用
	// catalog.AttemptEach（与 /internal/v1/tasks/run 同一实现）。
	//
	// 异步分支**不在这里**切换：它落到 job，由 worker 按 attempt 推进候选（同一套顺序）。
	// 原因是异步的"失败"发生在 worker 里，而不是这次 HTTP 请求内。
	var out engine.RunResult
	var syncAttempts []catalog.ChannelAttempt
	_, syncAttempts, syncErr := catalog.AttemptEach(candidates, func(m catalog.Model) error {
		// 审计如实记录"这一刻尝试的是谁"
		auditChannelID = m.ChannelID
		// T0：命中模型的权威成本回写审计（契约含 costAmount；nil = 未校准，保持 0+空 unit 的预估口径）
		auditCostAmount, auditCostUnit = auditCostFor(m)
		var mTmpl *catalog.Template
		for i := range dir.Templates {
			if dir.Templates[i].ID == m.ProtocolTemplateID {
				mTmpl = &dir.Templates[i]
				break
			}
		}
		if mTmpl == nil {
			return fmt.Errorf("protocol template %s not found", m.ProtocolTemplateID)
		}
		// 首选沿用上面已 reveal 的凭据（保住"取不到凭据 ⇒ 422 CREDENTIALS_MISSING"契约），
		// 备用候选才按需 reveal。
		mCreds := creds
		if m.ChannelID != candidates[0].ChannelID {
			mc, credErr := h.Creds.Reveal(r.Context(), ws, m.ChannelID)
			if credErr != nil {
				return credErr
			}
			mCreds = mc
		}
		mPath := m.RequestPath
		if capPath := mappingEngine.GetRequestPath(in.Mode, ""); capPath != "" {
			mPath = capPath
		}
		o, runErr := engine.Run(r.Context(), mCreds, engine.RunRequest{
			ChannelID:        m.ChannelID,
			ProviderModel:    m.ProviderModel,
			ProtocolTemplate: engine.Template{ID: mTmpl.ID, Label: mTmpl.Label, Method: mTmpl.Method, RequestPath: mTmpl.RequestPath, Params: mTmpl.Params, ResponseParams: mTmpl.ResponseParams, Async: mTmpl.Async, RequestTemplate: mTmpl.RequestTemplate},
			ModelParams:      m.Params,
			ModelRequestPath: mPath,
			Runtime:          runtime,
		}, h.EngineClient)
		out = o
		if runErr != nil {
			// T4 表 3-1：硬失败（硬 4xx / 内容安全拒绝）直返不切换；软 4xx/5xx/超时/网络
			// 计入失败计数并继续切换；成功重置该单元。
			cls := breaker.Classify(o.Status, false)
			if h.Breaker != nil {
				switch cls {
				case breaker.ClassHard4xx, breaker.ClassContentSafety:
				default:
					// T11：进入冷却 ⇒ 熔断告警（fail-open，不阻断）
					if h.Breaker.RecordFailure(r.Context(), breaker.Unit{ChannelID: m.ChannelID, ProviderModel: m.ProviderModel}) {
						h.alertBreaker(r.Context(), ws, m.ChannelID, m.ProviderModel)
					}
				}
			}
			if cls == breaker.ClassHard4xx || cls == breaker.ClassContentSafety {
				return &catalog.HardFailure{Status: o.Status, Msg: runErr.Error()}
			}
			return runErr
		}
		if h.Breaker != nil {
			h.Breaker.RecordSuccess(r.Context(), breaker.Unit{ChannelID: m.ChannelID, ProviderModel: m.ProviderModel})
		}
		return nil
	})
	auditTokenIn, auditTokenOut, auditTokenCached = engine.UsageFromExtracted(out.Extracted)
	if syncErr != nil {
		// T4 表 3-1：硬失败（硬 4xx / 内容安全拒绝）按上游状态码直返（不切换、不 200 包装）
		var hf *catalog.HardFailure
		if errors.As(syncErr, &hf) {
			writeAudit("failed", nil, hf.Msg, "", "")
			writeError(w, hf.Status, "UPSTREAM_HARD_FAILURE", hf.Msg)
			return
		}
		respBytes, _ := json.Marshal(out)
		writeAudit("failed", respBytes, out.Error, "", "")
		writeJSON(w, 200, map[string]any{"ok": false, "status": "failed", "error": out.Error, "run": out, "attempts": syncAttempts})
		return
	}
	// 产物落盘（TASK-ASSET-001）：best-effort，失败不阻塞生成。
	// 从上游提取结果中找产物 URL → 转存 asset（MinIO）→ 返回稳定 asset_id/asset_url。
	var artifactInfo map[string]any
	if h.Artifacts != nil {
		if artifactURL, reason := artifact.URLWithReason(out.Extracted); artifactURL != "" {
			persistOpts := artifact.PersistOptions{
				WorkspaceID: ws,
				ActorID:     actor,
				ProjectID:   projectID,
				EpisodeID:   episodeID,
				Kind:        in.Modality,
				Name:        model.Name + "-" + in.Modality,
				URL:         artifactURL,
			}
			res, perr := h.Artifacts.Persist(r.Context(), persistOpts)
			if perr != nil {
				// 落盘失败只记录，不改变任务结果（生成是主流程，落盘是增强）。
				slog.Error("artifact persist failed", "requestId", requestID, "reason", reason, "error", perr)
			} else {
				artifactInfo = map[string]any{
					"asset_id":   res.AssetID,
					"object_key": res.ObjectKey,
					"asset_url":  res.AssetURL,
					"byte_size":  res.ByteSize,
				}
			}
		} else {
			slog.Info("artifact skip", "requestId", requestID, "reason", reason)
		}
	}
	respBytes, _ := json.Marshal(out)
	writeAudit("success", respBytes, "", "", "")
	body := map[string]any{"ok": true, "status": "succeeded", "output": out.Extracted, "run": out}
	if artifactInfo != nil {
		body["artifact"] = artifactInfo
	}
	writeJSON(w, 200, body)
}

// genRequestID generates a unique request ID for audit tracing
// auditCostFor 从命中模型取权威成本（T0 价格校准）。
// 返回 (金额, 计费单位)：CostAmount=nil 表示该模型未校准 → (0, "")，即审计的"预估"口径
// （T2 报表据此区分已校准/预估，不参与预算拦截的强口径）。
func auditCostFor(m catalog.Model) (float64, string) {
	if m.CostAmount == nil {
		return 0, ""
	}
	return *m.CostAmount, m.CostUnit
}

func genRequestID() string {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	return "req_" + hex.EncodeToString(b)
}
