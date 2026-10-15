package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"shotdesigner/services/workspace/internal/store"
)

// BudgetRuleInput 是预算规则的写请求（web 配置 UI 用）。
// Scope/Period 白名单校验在 handler 内；LimitAmount <=0 直接拒绝（不写无意义规则）。
type BudgetRuleInput struct {
	ID          string  `json:"id"`
	Scope       string  `json:"scope"`
	Period      string  `json:"period"`
	LimitAmount float64 `json:"limitAmount"`
	Action      string  `json:"action"`
	WarnAt      float64 `json:"warnAt"`
	Enabled     *bool   `json:"enabled"`
}

// listBudgetRules 返回某工作区的全部预算规则（租户级 + 工作区级）。
func (h Handler) listBudgetRules(w http.ResponseWriter, r *http.Request) {
	if !h.authenticated(w, r) {
		return
	}
	items, err := h.Store.ListBudgetRules(r.Context(), r.PathValue("workspace_id"))
	if err != nil {
		writeError(w, 503, "BUDGET_UNAVAILABLE", "budget rules could not be loaded")
		return
	}
	writeJSON(w, 200, map[string]any{"items": items})
}

// putBudgetRule 写入一条预算规则（upsert）。
func (h Handler) putBudgetRule(w http.ResponseWriter, r *http.Request) {
	if !h.authenticated(w, r) {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 256*1024+4096)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var input BudgetRuleInput
	if err := decoder.Decode(&input); err != nil {
		writeError(w, 400, "INVALID_BODY", "invalid budget rule JSON or body too large")
		return
	}
	if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
		writeError(w, 400, "INVALID_BODY", "request must contain exactly one JSON object")
		return
	}
	if input.Scope != "tenant" && input.Scope != "workspace" {
		writeError(w, 400, "INVALID_BUDGET_SCOPE", "scope must be tenant|workspace")
		return
	}
	if input.Period != "day" && input.Period != "month" {
		writeError(w, 400, "INVALID_BUDGET_PERIOD", "period must be day|month")
		return
	}
	if input.LimitAmount <= 0 {
		writeError(w, 400, "INVALID_BUDGET_LIMIT", "limitAmount must be > 0")
		return
	}
	if input.Action != "warn" && input.Action != "block" {
		writeError(w, 400, "INVALID_BUDGET_ACTION", "action must be warn|block")
		return
	}
	warnAt := input.WarnAt
	if warnAt <= 0 || warnAt >= 1 {
		warnAt = 0.80 // 默认 80%；未传或非法时取默认
	}
	enabled := true
	if input.Enabled != nil {
		enabled = *input.Enabled
	}
	id := input.ID
	if id == "" {
		id = newID("budget")
	}
	saved, err := h.Store.UpsertBudgetRule(r.Context(), r.PathValue("workspace_id"), store.BudgetRule{
		ID: id, Scope: input.Scope, Period: input.Period,
		LimitAmount: input.LimitAmount, Action: input.Action, WarnAt: warnAt, Enabled: enabled,
	})
	if err != nil {
		writeError(w, 503, "BUDGET_UNAVAILABLE", "budget rule could not be saved")
		return
	}
	writeJSON(w, 200, map[string]any{"rule": saved})
}

// deleteBudgetRule 删除某工作区下指定周期的【工作区级】规则。
// 租户级规则不在工作区维度删除（防误删全局规则）。
func (h Handler) deleteBudgetRule(w http.ResponseWriter, r *http.Request) {
	if !h.authenticated(w, r) {
		return
	}
	period := r.PathValue("period")
	if period != "day" && period != "month" {
		writeError(w, 400, "INVALID_BUDGET_PERIOD", "period must be day|month")
		return
	}
	if err := h.Store.DeleteBudgetRule(r.Context(), r.PathValue("workspace_id"), period); err != nil {
		writeError(w, 503, "BUDGET_UNAVAILABLE", "budget rule could not be removed")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// newID 生成一条记录 ID。ID 由服务端生成（客户端不传时），避免客户端控制主键。
func newID(prefix string) string {
	return prefix + "_" + randSuffix()
}

// randSuffix 生成 8 字节随机十六进制后缀（crypto/rand，非安全场景的记录主键）。
func randSuffix() string {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "0000000000000000" // 失败降级：确定性后缀仅用于非安全主键
	}
	return hex.EncodeToString(b[:])
}
