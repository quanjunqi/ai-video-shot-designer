package worker

import (
	"context"
	"encoding/json"

	"shotdesigner/services/execution/internal/audit"
	"shotdesigner/services/execution/internal/engine"
	"shotdesigner/services/execution/internal/job"
)

// auditTerminal 把任务的【确定终态】写回审计（D2）。
//
// 背景（判据 = SQL）：改动前 worker 不持有 auditStore ⇒ 异步链【零审计】；
// 且提交时的审计行永远停在 queued（UpdateResult 零调用者）。异步任务主要是
// 视频类长任务，即主要付费路径 —— 所以这条链路的审计缺失最严重。
//
// 覆盖范围：executeJob 内 s.Complete(...) 的全部 11 处调用点（含 defer 里的 panic）。
// 【本片明确未覆盖】failOrRetry 触发的终态（重试耗尽 / 死信）：那两处是否终态只有
// failOrRetry 自己知道，需要它回报终态性 —— 属 D2b。
func auditTerminal(ctx context.Context, as *audit.Store, j job.Job, ok bool, errMsg string, result []byte) {
	// 无用量场景（早退失败、panic 等）：用量本就为 0；成本同理（未执行成功，无权威价可回写）；
	// channel/provider 在早退时未知，传空（UpdateResultByJobID 空串不覆盖既有值，T1）。
	// statusCode：早退失败无上游 HTTP 状态，传 nil（不覆盖）。
	auditTerminalT(ctx, as, j, ok, errMsg, result, 0, 0, 0, 0, 0, "", "", "", nil)
}

// auditTerminalWithStatus 与 auditTerminal 同语义，额外携带【引擎失败的上游 HTTP 状态码】
// （T11 错误码分布数据源）。仅引擎调用后失败且已知 result.Status 的路径使用；
// 早退失败无状态码，继续走 auditTerminal（nil）。
func auditTerminalWithStatus(ctx context.Context, as *audit.Store, j job.Job, ok bool, errMsg string, result []byte, statusCode int) {
	auditTerminalT(ctx, as, j, ok, errMsg, result, 0, 0, 0, 0, 0, "", "", "", &statusCode)
}

// auditStatusFor 决定【审计行】里的终态词。
//
// ★ 这里必须写 "success"，而不是任务表的 "succeeded"（本项目真实缺陷）：
//
//	同步路径写的是 "success"（httpapi/handler.go 的 writeAudit），
//	契约与前端也只认 "success"（openapi：如 success/failed/queued；
//	apps/web SettingsAudit 的「成功」卡片与「成功」筛选项都取 success）。
//	而本函数原来返回 "succeeded" ⇒ **异步成功从不计入成功/成功率，
//	也不会被「成功」筛选显示**；失败态两条路径同名（failed）⇒
//	于是**成功率被系统性低估**（端到端验收实测：byStatus={succeeded:1} 而 successRate=0）。
//
// 任务表（jobs）继续用它自己的 "succeeded" —— 两套词汇各归其位，
// 审计行的词汇由**读者**决定，不由写者随手决定。
func auditStatusFor(ok bool) string {
	if ok {
		return "success"
	}
	return "failed"
}

// auditTerminalUsage 在【引擎已返回】的终态上额外记录用量（D4c）。
//
// 为什么单独一个函数、而不是给 auditTerminal 加三个参数：
//
//	auditTerminal 有 14 处调用点，而【只有引擎成功返回之后】才可能有用量
//	⇒ 给全部调用点加三个恒为 0 的参数，只会让 12 处噪音掩盖 2 处真实。
//
// 为什么必须补（D4a 的缺口）：D4a 只在同步路径记录了 token，worker 传的是
//
//	0,0,0 ⇒ **异步任务的 token 恒为 0**，而异步主要是视频类长任务（主要付费路径）。
//
// costAmount/costUnit（T0 新增）：executeJob 命中模型（PickForAttempt）的权威成本，
// 异步终态一并回写 —— 否则视频类长任务（主要付费路径）的成本恒为 0。
// channelID/providerModel（T1 新增）：submit-time 行提交时未知，命中后补齐供给单元
// （渠道×模型，T2 报表聚合字段）。
// statusCode（T11 新增）：引擎失败的 HTTP 状态码（breaker.Classify 输入），
// 供健康面板错误码分布；成功终态传 nil（status_code 保持 NULL）。
func auditTerminalUsage(ctx context.Context, as *audit.Store, j job.Job, ok bool, errMsg string, result []byte, ex map[string]any, elapsedMs int, costAmount float64, costUnit, channelID, providerModel string, statusCode *int) {
	in, out, cached := engine.UsageFromExtracted(ex)
	auditTerminalT(ctx, as, j, ok, errMsg, result, in, out, cached, elapsedMs, costAmount, costUnit, channelID, providerModel, statusCode)
}

// auditTerminalT 是两条入口的公共实现。
func auditTerminalT(ctx context.Context, as *audit.Store, j job.Job, ok bool, errMsg string, result []byte, tokenIn, tokenOut, tokenCached, latencyMs int, costAmount float64, costUnit, channelID, providerModel string, statusCode *int) {
	if as == nil {
		return
	}
	status := auditStatusFor(ok)
	var payload json.RawMessage
	if len(result) > 0 {
		payload = json.RawMessage(result)
	}
	// 第 6 个参数是 latency_ms：原来硬编码 0 ⇒ 异步任务的耗时**永远是 0**，
	// 而 P50/P95 与平均耗时都只统计 latency_ms > 0 的行 ⇒ **异步长任务（主要付费路径）
	// 被整体排除在耗时分布之外**。引擎本来就测了 Duration，这里把它传下去。
	// 第 9-10 个参数是 costAmount/costUnit（T0）：命中模型的权威成本回写，
	// 替换原硬编码 0 —— 异步成本不再恒为 0。
	n, err := as.UpdateResultByJobID(ctx, j.ID, status, payload, errMsg, latencyMs, tokenIn, tokenOut, tokenCached, costAmount, costUnit, channelID, providerModel, "", statusCode)
	if err != nil {
		Logger.Info("execution worker: audit update failed for job %s: %v", j.ID, err)
		return
	}
	if n == 0 {
		Logger.Info("execution worker: job %s has NO submit-time audit row (status=%s) —— 该任务提交路径不写审计（D2 说明：经 /internal/v1/tasks 提交的任务属此列）", j.ID, status)
	}
}
