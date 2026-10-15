package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"shotdesigner/services/execution/internal/artifact"
	"shotdesigner/services/execution/internal/audit"
	"shotdesigner/services/execution/internal/breaker"
	"shotdesigner/services/execution/internal/budget"
	"shotdesigner/services/execution/internal/catalog"
	"shotdesigner/services/execution/internal/engine"
	"shotdesigner/services/execution/internal/job"
	"shotdesigner/services/execution/internal/mapping"
)

// Quota 为 nil 时不做限流与成本判定（便于渐进启用与测试）

// Probe 是渠道连通性探测（全仓唯一实现，TASK-INFRA-004）。为 nil 时该路由 503。

// Artifacts 是产物落盘客户端（TASK-ASSET-001）。为 nil 时不落盘（best-effort 关闭）。

// ReconcileStore 是 T0 价格校准台账（price_calibration_logs）。为 nil 时对账端点 503。

// T2 运营报表聚合：四维排行 + 日/周/月趋势（成本看板数据源）。

// 渠道探测：全仓唯一实现（BFF 只转发，不再自己在边缘发探测请求）。

// T0 价格对账：触发一次「审计实际成本 vs 目录权威价」的差异检查，写入校准台账。

// 同步测试端点 /tasks/run 会真实等待上游生成（文本 ~5s、图片 30-120s、视频异步不在此同步执行），
// 超时按上游长任务放宽，避免图片/视频生成被掐断。

// T1（§3.7）：异步提交路径创建 submit-time 审计行（status=queued，含业务归因 + job_id）。
// 终结「异步任务零审计」——worker 终态更新（UpdateResultByJobID）命中本行。
// 审计失败不得阻断主流程（D1），但必须可见。

// writeSubmitAudit 为异步任务写入提交时审计行（T1）。
// 归因从意图上下文取；model_id 从 payload 尽力解析（best-effort，缺失置空容忍）；
// channel_id/provider_model 提交时未知，由 worker 终态更新补齐（UpdateResultByJobID）。

// T1（§3.7）：同 intent 提交路径，任务提交创建 submit-time 审计行（queued + 归因 + job_id）。

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
	// ADR-003 的候选解析（与 worker 同一实现，避免两条路径口径分叉）。
	candidates, resolveErr := catalog.Resolve(dir, in.ModelID)
	if resolveErr != nil {
		// 文案与改动前逐字一致（错误码 MODEL_NOT_FOUND 与消息都保持稳定）
		writeError(w, 404, "MODEL_NOT_FOUND", "model not found in directory")
		return
	}
	// P3-2：按候选顺序**失败切换**（ADR-003）。顺序与判定只保留一份实现
	// （catalog.AttemptEach），避免两条执行路径口径分叉。
	//
	// 错误语义刻意与改动前保持兼容：
	//   - 配置类问题（无协议模板 / 模板缺失 / 取不到凭据）：若**所有**候选都是这类问题，
	//     返回第一个候选的原始状态码与文案（单候选场景与改动前逐字一致）
	//   - 引擎调用失败：仍返回 200 + {ok:false, run:…}（与改动前一致），另加 attempts 轨迹
	// 配置类失败用包级 cfgErr 承载（见文件末尾），以便与引擎失败区分。
	//
	// T4 单元熔断：候选先经 Breaker 过滤（冷却中的单元不消耗尝试次数）；引擎失败按
	// 表 3-1 分类 —— 硬 4xx/内容安全拒绝 ⇒ HardFailure 直返（不切换）；软 4xx/5xx/超时
	// ⇒ 计入失败计数并继续切换；成功 ⇒ 重置该单元。
	var firstCfgErr *cfgErr
	var lastOut engine.RunResult
	if h.Breaker != nil {
		filtered, filterErr := h.Breaker.FilterHealthy(r.Context(), unitsOf(candidates))
		if errors.Is(filterErr, breaker.ErrUnitCooling) {
			writeError(w, 503, "ALL_UNITS_COOLING", "all candidate units are cooling")
			return
		}
		if filterErr != nil {
			// fail-open：DB 故障放行全部候选（FilterHealthy 已返回原序列），仅告警
			_ = filterErr
		}
		candidates = candidatesOf(filtered, candidates)
	}
	used, attempts, attemptErr := catalog.AttemptEach(candidates, func(m catalog.Model) error {
		if m.ProtocolTemplateID == "" {
			e := &cfgErr{status: 422, code: "MODEL_NO_PROTOCOL", msg: "model has no protocol template; attach one first"}
			if firstCfgErr == nil {
				firstCfgErr = e
			}
			return e
		}
		var tmpl *catalog.Template
		for i := range dir.Templates {
			if dir.Templates[i].ID == m.ProtocolTemplateID {
				tmpl = &dir.Templates[i]
				break
			}
		}
		if tmpl == nil {
			e := &cfgErr{status: 404, code: "TEMPLATE_NOT_FOUND", msg: "protocol template not found"}
			if firstCfgErr == nil {
				firstCfgErr = e
			}
			return e
		}
		creds, err := h.Creds.Reveal(r.Context(), ws, m.ChannelID)
		if err != nil {
			e := &cfgErr{status: 422, code: "CREDENTIALS_MISSING", msg: err.Error()}
			if firstCfgErr == nil {
				firstCfgErr = e
			}
			return e
		}
		out, err := engine.Run(r.Context(), creds, engine.RunRequest{
			ChannelID:        m.ChannelID,
			ProviderModel:    m.ProviderModel,
			ProtocolTemplate: engine.Template{ID: tmpl.ID, Label: tmpl.Label, Method: tmpl.Method, RequestPath: tmpl.RequestPath, Params: tmpl.Params, ResponseParams: tmpl.ResponseParams, Async: tmpl.Async, RequestTemplate: tmpl.RequestTemplate},
			ModelParams:      m.Params,
			ModelRequestPath: m.RequestPath,
			Runtime:          in.Runtime,
		}, h.EngineClient)
		lastOut = out
		if err != nil {
			// T4 表 3-1：按错误码分类决定切换/直返；失败计入该单元（软 4xx/5xx/超时/网络）
			cls := breaker.Classify(out.Status, false)
			if h.Breaker != nil {
				switch cls {
				case breaker.ClassHard4xx, breaker.ClassContentSafety:
					// 硬失败不计数（换渠道无意义）
				default:
					// T11：进入冷却 ⇒ 熔断告警（fail-open，不阻断）
					if h.Breaker.RecordFailure(r.Context(), breaker.Unit{ChannelID: m.ChannelID, ProviderModel: m.ProviderModel}) {
						h.alertBreaker(r.Context(), ws, m.ChannelID, m.ProviderModel)
					}
				}
			}
			if cls == breaker.ClassHard4xx || cls == breaker.ClassContentSafety {
				return &catalog.HardFailure{Status: out.Status, Msg: err.Error()}
			}
			return err
		}
		if h.Breaker != nil {
			h.Breaker.RecordSuccess(r.Context(), breaker.Unit{ChannelID: m.ChannelID, ProviderModel: m.ProviderModel})
		}
		return nil
	})
	if attemptErr != nil {
		// T4 表 3-1：硬失败（硬 4xx / 内容安全拒绝）直接返回该候选的状态码与原因（不切换）
		var hf *catalog.HardFailure
		if errors.As(attemptErr, &hf) {
			writeError(w, hf.Status, "UPSTREAM_HARD_FAILURE", hf.Msg)
			return
		}
		if firstCfgErr != nil {
			writeError(w, firstCfgErr.status, firstCfgErr.code, firstCfgErr.msg)
			return
		}
		writeJSON(w, 200, map[string]any{"ok": false, "run": lastOut, "attempts": attempts})
		return
	}
	_ = used
	writeJSON(w, 200, map[string]any{"ok": true, "run": lastOut})
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
	// 配额与限流：超限**拒绝**并写审计（status=rate_limited / quota_exceeded），
	// 让「被限流」「超预算」可查，而不是静默失败或无限放行。
	if h.Quota != nil {
		if d := h.Quota.Check(r.Context(), ws); !d.Allowed {
			writeAudit(d.Status, nil, d.Reason, "", "")
			writeError(w, http.StatusTooManyRequests, strings.ToUpper(d.Status), d.Reason)
			return
		}
	}
	// T3 预算校验（TASK-MODEL-005）：读生效规则 → 累计已用（审计花费 + 未结算预扣）
	// vs 上限。超限 block 拦截（明确配额错误码 BUDGET_EXCEEDED）；达阈值告警；
	// 预算系统故障 fail-open（放行 + 审计标记"预算未校验"）。
	if h.Budget != nil {
		var used budget.Used
		if h.BudgetHolds != nil {
			heldDay, heldMonth, heldErr := h.BudgetHolds.Outstanding(r.Context(), ws)
			if heldErr != nil {
				slog.Warn("budget: holds outstanding unavailable, fail-open", "workspace", ws, "error", heldErr)
				writeAudit("budget_unchecked", nil, "budget holds unavailable (fail-open)", "", "")
			} else {
				used = budget.Used{Day: heldDay, Month: heldMonth}
			}
		}
		d := h.Budget.Check(r.Context(), ws, used)
		if !d.Allowed {
			writeAudit(d.Status, nil, d.Reason, "", "")
			writeError(w, http.StatusTooManyRequests, "BUDGET_EXCEEDED", d.Reason)
			return
		}
		if d.FailOpen {
			writeAudit("budget_unchecked", nil, d.Reason, "", "")
			slog.Warn("budget: check failed open", "workspace", ws, "reason", d.Reason)
		}
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

// unitsOf 把候选序列映射为熔断单元序列（T4，供 FilterHealthy 使用）。
func unitsOf(cands []catalog.Model) []breaker.Unit {
	out := make([]breaker.Unit, 0, len(cands))
	for _, c := range cands {
		out = append(out, breaker.Unit{ChannelID: c.ChannelID, ProviderModel: c.ProviderModel})
	}
	return out
}

// candidatesOf 把健康单元序列映射回候选序列（保持原顺序；FilterHealthy 返回的单元
// 顺序与输入一致，因此按单元匹配重建候选即可）。
func candidatesOf(healthy []breaker.Unit, orig []catalog.Model) []catalog.Model {
	if len(healthy) == 0 || len(orig) == 0 {
		return orig
	}
	healthySet := make(map[string]bool, len(healthy))
	for _, u := range healthy {
		healthySet[u.String()] = true
	}
	out := make([]catalog.Model, 0, len(orig))
	for _, c := range orig {
		key := breaker.Unit{ChannelID: c.ChannelID, ProviderModel: c.ProviderModel}.String()
		if healthySet[key] {
			out = append(out, c)
		}
	}
	return out
}
