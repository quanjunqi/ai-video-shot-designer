package httpapi

import (
	"encoding/csv"
	"net/http"
	"strconv"
	"time"

	"shotdesigner/services/execution/internal/audit"
)

// D8b：审计导出。
//
// 为什么【不导出】request_payload / response_payload：
//   L0（密钥）已在写库前脱敏（D5a），但 L1（prompt 原文与上游响应原文的**出入策略**）
//   【尚未决策】。导出是数据离开系统的边界，风险最高 ⇒ 在 L1 定案前**保守地不带原文**，
//   只导出可机读的元数据与用量/成本。L1 定案后如需带原文，另开一片并加权限控制。
//
// maxExportRows 是防爆护栏：导出必须有上界，否则一次请求就能把整表拉进内存。

const maxExportRows = 10000

// auditFilterFrom 解析审计查询的筛选参数（列表与导出共用，避免两处口径不一致）。
// 返回空字符串表示成功；否则返回错误码。
func auditFilterFrom(r *http.Request) (audit.Filter, string) {
	f := audit.Filter{
		Status:    r.URL.Query().Get("status"),
		ModelID:   r.URL.Query().Get("model_id"),
		ChannelID: r.URL.Query().Get("channel_id"),
	}
	if v := r.URL.Query().Get("since"); v != "" {
		ts, err := time.Parse(time.RFC3339, v)
		if err != nil {
			return f, "INVALID_SINCE"
		}
		f.Since = &ts
	}
	if v := r.URL.Query().Get("until"); v != "" {
		ts, err := time.Parse(time.RFC3339, v)
		if err != nil {
			return f, "INVALID_UNTIL"
		}
		f.Until = &ts
	}
	return f, ""
}

// exportAuditLogs 以 CSV 导出筛选后的审计行（GET /internal/v1/audit/export）。
func (h Handler) exportAuditLogs(w http.ResponseWriter, r *http.Request) {
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
	f, ferr := auditFilterFrom(r)
	if ferr != "" {
		writeError(w, 400, ferr, "since/until must be RFC3339")
		return
	}

	logs, err := h.AuditStore.ExportAll(r.Context(), ws, f, maxExportRows)
	if err != nil {
		writeError(w, 500, "AUDIT_EXPORT_FAILED", err.Error())
		return
	}

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="audit-export.csv"`)
	// 导出的内容不应被任何中间层缓存
	w.Header().Set("Cache-Control", "no-store")

	cw := csv.NewWriter(w)
	defer cw.Flush()
	_ = cw.Write([]string{
		"id", "request_id", "workspace_id", "user_id", "product",
		"model_id", "channel_id", "provider_model", "mode",
		"status", "error_message", "latency_ms",
		"token_input", "token_output", "token_cached",
		"cost_amount", "cost_currency", "job_id", "provider_task_id", "created_at",
		// 刻意不含 request_payload / response_payload（见文件头说明：L1 未定案）
	})
	for _, l := range logs {
		_ = cw.Write([]string{
			strconv.FormatInt(l.ID, 10), l.RequestID, l.WorkspaceID, l.UserID, l.Product,
			l.ModelID, l.ChannelID, l.ProviderModel, l.Mode,
			l.Status, l.ErrorMessage, strconv.Itoa(l.LatencyMs),
			strconv.Itoa(l.TokenInput), strconv.Itoa(l.TokenOutput), strconv.Itoa(l.TokenCached),
			strconv.FormatFloat(l.CostAmount, 'f', 6, 64), l.CostCurrency, l.JobID, l.ProviderTaskID,
			l.CreatedAt.UTC().Format(time.RFC3339),
		})
	}
}
