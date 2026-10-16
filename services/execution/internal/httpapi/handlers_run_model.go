// runModel / 单元熔断相关辅助（TASK-PROC-007：BE-SIZE-001「一个文件一个域」拆分）。
//
// 本文件承载「直接跑单个模型」这条域：
//   - runModel：网关调用 + 审计写回（对应 /internal/v1/run-model 之类入口）
//   - unitsOf / candidatesOf：把目录模型与熔断健康单元互相映射（T4 单元熔断的适配层）
//
// 原 handlers_generate.go 783 行超上限（BE-SIZE-001），按域拆出本文件；
// **纯搬移**：函数签名、实现、注释逐字未改。
package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"shotdesigner/services/execution/internal/breaker"
	"shotdesigner/services/execution/internal/catalog"
	"shotdesigner/services/execution/internal/engine"
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
