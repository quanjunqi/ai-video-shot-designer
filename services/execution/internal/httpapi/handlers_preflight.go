// /v1/generate 的**前置闸门**（TASK-PROC-007 从 handlers_generate.go 按域拆出）。
//
// 为什么单独成文件：原 generate 一个函数 471 行 + import 已使该文件超 BE-SIZE-001 的
// 500 行上限；而**纯搬移函数无法达标**（该文件除 generate 外只剩两个 <12 行的辅助）。
// 故按规则「一个文件一个域」把「请求前置校验」这一域拆出来 —— 提取的是**连续且自洽**的
// 一段：它只依赖 h/r/w/ws/writeAudit，且原本就以 return 表示拦截。
package httpapi

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"

	"shotdesigner/services/execution/internal/budget"
)

// auditWriter 是 generate 内 writeAudit 闭包的签名（前置闸门需要它写审计）。
type auditWriter func(status string, respPayload json.RawMessage, errMsg string, jobID string, providerTaskID string)

// checkQuotaAndBudget 做两项前置校验：配额与限流、T3 预算。
// **返回 true 表示已拦截** —— 审计与错误响应均已写出，调用方应直接 return。
//
// 行为与原实现逐字一致（纯提取，未改判定顺序、错误码、状态码与审计文案）：
//   - 配额超限 → 429 + 大写 status
//   - 预算超限 → 429 + BUDGET_EXCEEDED
//   - 预算系统故障 → fail-open（放行 + 审计标记 budget_unchecked）
func (h Handler) checkQuotaAndBudget(ctx context.Context, w http.ResponseWriter, ws string, writeAudit auditWriter) bool {
	// 配额与限流：超限**拒绝**并写审计（status=rate_limited / quota_exceeded），
	// 让「被限流」「超预算」可查，而不是静默失败或无限放行。
	if h.Quota != nil {
		if d := h.Quota.Check(ctx, ws); !d.Allowed {
			writeAudit(d.Status, nil, d.Reason, "", "")
			writeError(w, http.StatusTooManyRequests, strings.ToUpper(d.Status), d.Reason)
			return true
		}
	}
	// T3 预算校验（TASK-MODEL-005）：读生效规则 → 累计已用（审计花费 + 未结算预扣）
	// vs 上限。超限 block 拦截（明确配额错误码 BUDGET_EXCEEDED）；达阈值告警；
	// 预算系统故障 fail-open（放行 + 审计标记"预算未校验"）。
	if h.Budget != nil {
		var used budget.Used
		if h.BudgetHolds != nil {
			heldDay, heldMonth, heldErr := h.BudgetHolds.Outstanding(ctx, ws)
			if heldErr != nil {
				slog.Warn("budget: holds outstanding unavailable, fail-open", "workspace", ws, "error", heldErr)
				writeAudit("budget_unchecked", nil, "budget holds unavailable (fail-open)", "", "")
			} else {
				used = budget.Used{Day: heldDay, Month: heldMonth}
			}
		}
		d := h.Budget.Check(ctx, ws, used)
		if !d.Allowed {
			writeAudit(d.Status, nil, d.Reason, "", "")
			writeError(w, http.StatusTooManyRequests, "BUDGET_EXCEEDED", d.Reason)
			return true
		}
		if d.FailOpen {
			writeAudit("budget_unchecked", nil, d.Reason, "", "")
			slog.Warn("budget: check failed open", "workspace", ws, "reason", d.Reason)
		}
	}
	return false
}
