package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"

	"shotdesigner/services/production/internal/catalog"
)

// LogicalModelStore：逻辑模型与候选绑定的存储（由 catalog.PostgresStore 实现）。
type LogicalModelStore interface {
	ListLogicalModels(ctx context.Context, status, modelType string) ([]catalog.LogicalModel, error)
	GetLogicalModel(ctx context.Context, id string) (catalog.LogicalModel, error)
	CreateLogicalModel(ctx context.Context, actor string, input catalog.LogicalModelCreate) (catalog.LogicalModel, error)
	UpdateLogicalModel(ctx context.Context, id string, patch catalog.LogicalModelPatch) (catalog.LogicalModel, error)
	ListCandidates(ctx context.Context, id string) ([]catalog.Candidate, error)
	BindCandidates(ctx context.Context, id string, input catalog.BindCandidatesInput) ([]catalog.Candidate, error)
	UnbindCandidate(ctx context.Context, id, modelID string) error
	// ReconcileLogicalModels：自动归并（TASK-MODEL-007）。
	ReconcileLogicalModels(ctx context.Context, workspaceID, actor string) (catalog.ReconcileResult, error)
}

// ---- 逻辑模型（ADR-003 §3.1：对外统一标识） ----

// listLogicalModels 列出逻辑模型，可按 status / type 过滤。
func (h Handler) listLogicalModels(w http.ResponseWriter, r *http.Request) {
	if _, _, ok := h.identity(w, r); !ok {
		return
	}
	if h.LogicalModelStore == nil {
		writeError(w, http.StatusServiceUnavailable, "LOGICAL_MODEL_UNAVAILABLE", "logical models are unavailable")
		return
	}
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	if status != "" && status != "enabled" && status != "disabled" {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "status must be enabled or disabled")
		return
	}
	modelType := strings.TrimSpace(r.URL.Query().Get("type"))
	if modelType != "" && !catalog.ValidLogicalModelType(modelType) {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "type must be text, image or video")
		return
	}
	models, err := h.LogicalModelStore.ListLogicalModels(r.Context(), status, modelType)
	if err != nil {
		unavailable(w, "list logical models", "logical models could not be loaded", err)
		return
	}
	writeJSON(w, http.StatusOK, models)
}

// createLogicalModel 创建逻辑模型：id 非空且为能力型 kebab-case，type ∈ text/image/video，label 非空。
func (h Handler) createLogicalModel(w http.ResponseWriter, r *http.Request) {
	_, actor, ok := h.identity(w, r)
	if !ok {
		return
	}
	if h.LogicalModelStore == nil {
		writeError(w, http.StatusServiceUnavailable, "LOGICAL_MODEL_UNAVAILABLE", "logical models are unavailable")
		return
	}
	var input catalog.LogicalModelCreate
	if !decodeBody(w, r, &input) {
		return
	}
	if err := input.Validate(); err != nil {
		writeLogicalModelError(w, err)
		return
	}
	model, err := h.LogicalModelStore.CreateLogicalModel(r.Context(), actor, input)
	if err != nil {
		writeLogicalModelError(w, err)
		return
	}
	w.Header().Set("Location", "/internal/v1/logical-models/"+model.ID)
	writeJSON(w, http.StatusCreated, model)
}

func (h Handler) getLogicalModel(w http.ResponseWriter, r *http.Request) {
	if _, _, ok := h.identity(w, r); !ok {
		return
	}
	if h.LogicalModelStore == nil {
		writeError(w, http.StatusServiceUnavailable, "LOGICAL_MODEL_UNAVAILABLE", "logical models are unavailable")
		return
	}
	id := r.PathValue("id")
	model, err := h.LogicalModelStore.GetLogicalModel(r.Context(), id)
	if err != nil {
		writeLogicalModelError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, model)
}

// updateLogicalModel 更新 label/type/capability/status/sort/note。
// **id 不可修改**：请求体带 id 即拒绝（不静默忽略）。
func (h Handler) updateLogicalModel(w http.ResponseWriter, r *http.Request) {
	if _, _, ok := h.identity(w, r); !ok {
		return
	}
	if h.LogicalModelStore == nil {
		writeError(w, http.StatusServiceUnavailable, "LOGICAL_MODEL_UNAVAILABLE", "logical models are unavailable")
		return
	}
	id := r.PathValue("id")
	var patch catalog.LogicalModelPatch
	if !decodeBody(w, r, &patch) {
		return
	}
	// 对外契约：id 一旦使用即为契约，改名必须显式拒绝并告知。
	if patch.ID != "" && patch.ID != id {
		writeError(w, http.StatusBadRequest, "ID_IMMUTABLE",
			fmt.Sprintf("logical model id is immutable: path id %q, body id %q", id, patch.ID))
		return
	}
	// 字段级校验在 handler 就完成（store 内会再兜一层）：
	// 非法 type/空 label → 400，而不是落到 503。
	// 清空 ID 后再校验：ID 只是「改名意图」的载体，不是待写字段。
	patch.ID = ""
	if err := patch.Validate(); err != nil {
		writeLogicalModelError(w, err)
		return
	}
	model, err := h.LogicalModelStore.UpdateLogicalModel(r.Context(), id, patch)
	if err != nil {
		writeLogicalModelError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, model)
}

// ---- 候选绑定 ----

func (h Handler) listLogicalModelCandidates(w http.ResponseWriter, r *http.Request) {
	if _, _, ok := h.identity(w, r); !ok {
		return
	}
	if h.LogicalModelStore == nil {
		writeError(w, http.StatusServiceUnavailable, "LOGICAL_MODEL_UNAVAILABLE", "logical models are unavailable")
		return
	}
	candidates, err := h.LogicalModelStore.ListCandidates(r.Context(), r.PathValue("id"))
	if err != nil {
		writeLogicalModelError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, candidates)
}

// bindLogicalModelCandidates 把给定 model_catalog 行设为该逻辑模型的候选。
// 只写 logical_model_id 与 route_priority；已属于其它逻辑模型的行返回 409（不静默抢占）。
func (h Handler) bindLogicalModelCandidates(w http.ResponseWriter, r *http.Request) {
	if _, _, ok := h.identity(w, r); !ok {
		return
	}
	if h.LogicalModelStore == nil {
		writeError(w, http.StatusServiceUnavailable, "LOGICAL_MODEL_UNAVAILABLE", "logical models are unavailable")
		return
	}
	var input catalog.BindCandidatesInput
	if !decodeBody(w, r, &input) {
		return
	}
	if err := input.Validate(); err != nil {
		writeLogicalModelError(w, err)
		return
	}
	candidates, err := h.LogicalModelStore.BindCandidates(r.Context(), r.PathValue("id"), input)
	if err != nil {
		writeLogicalModelError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, candidates)
}

// unbindLogicalModelCandidate 解绑（置 logical_model_id = NULL，不删除行）。
func (h Handler) unbindLogicalModelCandidate(w http.ResponseWriter, r *http.Request) {
	if _, _, ok := h.identity(w, r); !ok {
		return
	}
	if h.LogicalModelStore == nil {
		writeError(w, http.StatusServiceUnavailable, "LOGICAL_MODEL_UNAVAILABLE", "logical models are unavailable")
		return
	}
	if err := h.LogicalModelStore.UnbindCandidate(r.Context(), r.PathValue("id"), r.PathValue("modelId")); err != nil {
		writeLogicalModelError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// reconcileLogicalModels 自动归并当前工作区未绑定的入池模型（TASK-MODEL-007）：
// 同名跨渠道合入同一逻辑模型分组并绑定候选；已有手工绑定不动；幂等可重跑。
// 这是**辅助工具**：生成的逻辑模型仍可被 Owner 编辑/删除；入池决策仍走策展。
func (h Handler) reconcileLogicalModels(w http.ResponseWriter, r *http.Request) {
	workspace, actor, ok := h.identity(w, r)
	if !ok {
		return
	}
	if h.LogicalModelStore == nil {
		writeError(w, http.StatusServiceUnavailable, "LOGICAL_MODEL_UNAVAILABLE", "logical models are unavailable")
		return
	}
	result, err := h.LogicalModelStore.ReconcileLogicalModels(r.Context(), workspace, actor)
	if err != nil {
		unavailable(w, "reconcile logical models", "logical models could not be reconciled", err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// writeLogicalModelError 把 store 的领域错误映射为状态码。
// 404 必须点名（哪个逻辑模型 / 哪个 modelId），409 必须说明被谁占用。
func writeLogicalModelError(w http.ResponseWriter, err error) {
	var missing catalog.ErrModelNotFound
	var notCandidate catalog.ErrModelNotCandidate
	var boundElsewhere catalog.ErrModelBoundElsewhere
	var boundList catalog.ErrModelsBoundElsewhereList
	switch {
	case errors.Is(err, catalog.ErrNotFound):
		writeError(w, http.StatusNotFound, "LOGICAL_MODEL_NOT_FOUND", "logical model not found")
	case errors.As(err, &missing):
		writeError(w, http.StatusNotFound, "MODEL_NOT_FOUND", "model not found: "+strings.Join(missing.ModelIDs, ", "))
	case errors.As(err, &boundList):
		writeError(w, http.StatusConflict, "MODEL_ALREADY_BOUND", conflictMessage(boundList))
	case errors.As(err, &boundElsewhere):
		writeError(w, http.StatusConflict, "MODEL_ALREADY_BOUND", boundElsewhere.Error())
	case errors.As(err, &notCandidate):
		writeError(w, http.StatusNotFound, "CANDIDATE_NOT_FOUND", notCandidate.Error())
	case errors.Is(err, catalog.ErrDuplicate):
		writeError(w, http.StatusConflict, "DUPLICATE_LOGICAL_MODEL", "a logical model with the same id already exists")
	case errors.Is(err, catalog.ErrInvalidLogicalModelID):
		writeError(w, http.StatusBadRequest, "INVALID_ID", "id must be a non-empty capability-style kebab-case identifier (max 64 chars)")
	case errors.Is(err, catalog.ErrLogicalModelIDImmutable):
		writeError(w, http.StatusBadRequest, "ID_IMMUTABLE", "logical model id is immutable")
	case errors.Is(err, catalog.ErrInvalidLogicalType):
		writeError(w, http.StatusBadRequest, "INVALID_TYPE", "type must be text, image or video")
	case errors.Is(err, catalog.ErrInvalidLabel):
		writeError(w, http.StatusBadRequest, "INVALID_LABEL", "label is required")
	case errors.Is(err, catalog.ErrInvalidStatus):
		writeError(w, http.StatusBadRequest, "INVALID_STATUS", "status must be enabled or disabled")
	case errors.Is(err, catalog.ErrInvalidRoutePriority),
		errors.Is(err, catalog.ErrInvalidCandidateInput):
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", err.Error())
	default:
		unavailable(w, "logical model request", "logical model request could not be completed", err)
	}
}

// conflictMessage 只回第一个冲突行，避免多行冲突时消息过长；
// 其余冲突写入服务端日志（错误信息里已包含全部条目）。
func conflictMessage(conflicts catalog.ErrModelsBoundElsewhereList) string {
	if len(conflicts.Conflicts) == 0 {
		return "one or more models are already bound to another logical model"
	}
	if len(conflicts.Conflicts) == 1 {
		return conflicts.Conflicts[0].Error()
	}
	first := conflicts.Conflicts[0].Error()
	slog.Warn("multiple candidate conflicts", "count", len(conflicts.Conflicts), "conflicts", conflicts.Error())
	return first + fmt.Sprintf(" (and %d more)", len(conflicts.Conflicts)-1)
}

// unavailable 统一处理 5xx：结构化日志 + 503，避免把数据库细节透给调用方。
func unavailable(w http.ResponseWriter, operation, message string, err error) {
	slog.Error(operation, "error", err)
	writeError(w, http.StatusServiceUnavailable, "LOGICAL_MODEL_UNAVAILABLE", message)
}

// decodeBody 解码单个 JSON 对象请求体（与既有 handler 相同的严格模式）。
func decodeBody(w http.ResponseWriter, r *http.Request, target any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 256*1024)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "invalid JSON or body too large")
		return false
	}
	if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "request must contain exactly one JSON object")
		return false
	}
	return true
}
