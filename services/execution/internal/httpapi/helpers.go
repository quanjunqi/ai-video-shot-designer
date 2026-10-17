package httpapi

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"shotdesigner/services/execution/internal/probe"
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
	out, err := h.Probe.Probe(r.Context(), ws, actor, r.Header.Get("X-Actor-Role"), id)
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

// cfgErr：配置类失败（无协议模板 / 模板缺失 / 取不到凭据）。
// 为什么要区分：失败切换后若**所有**候选都是配置问题，必须保留**第一个**候选的原始
// 状态码与文案（单候选场景与改动前逐字一致）；而引擎失败仍走 200 + {ok:false}（同改动前）。
