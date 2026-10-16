// 生成意图（Intent）域 handler（TASK-PROC-007：BE-SIZE-001「一个文件一个域」拆分）。
//
// 原 handlers.go 517 行超上限，按域拆出本文件：/intents 的创建与查询。
// **纯搬移**：函数签名、实现、注释逐字未改。
package httpapi

import (
	"errors"
	"io"

	"net/http"

	"github.com/jackc/pgx/v5/pgconn"

	"encoding/json"

	"log/slog"

	"strings"

	"shotdesigner/services/production/internal/intent"
)

func (h Handler) createIntent(w http.ResponseWriter, r *http.Request) {
	workspace, actor, ok := h.identity(w, r)
	if !ok {
		return
	}
	if h.IntentStore == nil {
		writeError(w, http.StatusServiceUnavailable, "INTENT_UNAVAILABLE", "generation intents are unavailable")
		return
	}
	key := r.Header.Get("Idempotency-Key")
	if !validIdentity(key) {
		writeError(w, http.StatusBadRequest, "INVALID_IDEMPOTENCY_KEY", "Idempotency-Key is required (max 128 ASCII characters)")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 512*1024+4096)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var input intent.CreateInput
	if err := decoder.Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "invalid generation intent JSON or body too large")
		return
	}
	if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "request must contain exactly one JSON object")
		return
	}
	if err := input.Validate(); err != nil {
		writeError(w, http.StatusUnprocessableEntity, "INVALID_INTENT", "project_id, kind, label and an object payload are required")
		return
	}
	out, replay, err := h.IntentStore.Create(r.Context(), workspace, actor, key, input)
	if errors.Is(err, intent.ErrIdempotencyConflict) {
		writeError(w, http.StatusConflict, "IDEMPOTENCY_CONFLICT", err.Error())
		return
	}
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23503" {
			writeError(w, http.StatusNotFound, "PROJECT_NOT_FOUND", "project not found")
			return
		}
		slog.Error("create generation intent", "error", err)
		writeError(w, http.StatusServiceUnavailable, "INTENT_UNAVAILABLE", "generation intent could not be saved; retry with the same key")
		return
	}
	w.Header().Set("Location", "/internal/v1/generation-intents/"+out.ID)
	if replay {
		writeJSON(w, http.StatusOK, out)
	} else {
		writeJSON(w, http.StatusCreated, out)
	}
}

func (h Handler) getIntent(w http.ResponseWriter, r *http.Request) {
	workspace, _, ok := h.identity(w, r)
	if !ok {
		return
	}
	if h.IntentStore == nil {
		writeError(w, http.StatusServiceUnavailable, "INTENT_UNAVAILABLE", "generation intents are unavailable")
		return
	}
	id := r.PathValue("id")
	if !strings.HasPrefix(id, "intent_") || len(id) != 39 {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "generation intent not found")
		return
	}
	out, err := h.IntentStore.Get(r.Context(), workspace, id)
	if errors.Is(err, intent.ErrNotFound) {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "generation intent not found")
		return
	}
	if err != nil {
		slog.Error("get generation intent", "error", err)
		writeError(w, http.StatusServiceUnavailable, "INTENT_UNAVAILABLE", "generation intent could not be loaded")
		return
	}
	writeJSON(w, http.StatusOK, out)
}
