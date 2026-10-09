package httpapi

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"shotdesigner/services/asset/internal/asset"
)

type Handler struct {
	Store asset.Store
	Token string
	Ready func(context.Context) error
}

func (h Handler) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /live", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(204) })
	mux.HandleFunc("GET /ready", func(w http.ResponseWriter, r *http.Request) {
		if h.Ready == nil || h.Ready(r.Context()) != nil {
			writeError(w, 503, "NOT_READY", "database unavailable")
			return
		}
		w.WriteHeader(204)
	})
	mux.HandleFunc("POST /internal/v1/assets/uploads", h.create)
	mux.HandleFunc("PUT /internal/v1/assets/uploads/{id}/content", h.put)
	mux.HandleFunc("POST /internal/v1/assets/uploads/{id}/commit", h.commit)
	mux.HandleFunc("GET /internal/v1/assets", h.list)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
		defer cancel()
		mux.ServeHTTP(w, r.WithContext(ctx))
	})
}
func (h Handler) auth(w http.ResponseWriter, r *http.Request) bool {
	p := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if h.Token == "" || len(p) != len(h.Token) || subtle.ConstantTimeCompare([]byte(p), []byte(h.Token)) != 1 {
		writeError(w, 401, "UNAUTHENTICATED", "internal authentication required")
		return false
	}
	return true
}
func workspace(r *http.Request) string { return strings.TrimSpace(r.Header.Get("X-Workspace-Id")) }
func actor(r *http.Request) string     { return strings.TrimSpace(r.Header.Get("X-Actor-Id")) }
func (h Handler) create(w http.ResponseWriter, r *http.Request) {
	if !h.auth(w, r) {
		return
	}
	if workspace(r) == "" || actor(r) == "" {
		writeError(w, 400, "INVALID_CONTEXT", "workspace and actor are required")
		return
	}
	var in asset.UploadInput
	if json.NewDecoder(io.LimitReader(r.Body, 64*1024)).Decode(&in) != nil {
		writeError(w, 400, "INVALID_JSON", "invalid upload request")
		return
	}
	out, err := h.Store.CreateUpload(r.Context(), workspace(r), actor(r), in)
	if err != nil {
		writeError(w, 422, "INVALID_UPLOAD", err.Error())
		return
	}
	writeJSON(w, 201, out)
}
func (h Handler) put(w http.ResponseWriter, r *http.Request) {
	if !h.auth(w, r) {
		return
	}
	if workspace(r) == "" {
		writeError(w, 400, "INVALID_CONTEXT", "workspace is required")
		return
	}
	id := r.PathValue("id")
	if id == "" {
		writeError(w, 400, "INVALID_UPLOAD", "upload id required")
		return
	}
	size := r.ContentLength
	if err := h.Store.Put(r.Context(), workspace(r), id, r.Body, size, r.Header.Get("Content-Type")); err != nil {
		status := 500
		code := "UPLOAD_FAILED"
		if errors.Is(err, asset.ErrNotFound) {
			status = 404
			code = "NOT_FOUND"
		}
		if errors.Is(err, asset.ErrConflict) {
			status = 409
			code = "CONFLICT"
		}
		if errors.Is(err, asset.ErrTooLarge) {
			status = 413
			code = "PAYLOAD_TOO_LARGE"
		}
		if errors.Is(err, asset.ErrSizeMismatch) {
			status = 400
			code = "SIZE_MISMATCH"
		}
		writeError(w, status, code, err.Error())
		return
	}
	w.WriteHeader(204)
}
func (h Handler) commit(w http.ResponseWriter, r *http.Request) {
	if !h.auth(w, r) {
		return
	}
	if workspace(r) == "" {
		writeError(w, 400, "INVALID_CONTEXT", "workspace is required")
		return
	}
	out, err := h.Store.Commit(r.Context(), workspace(r), r.PathValue("id"))
	if err != nil {
		status := 500
		code := "COMMIT_FAILED"
		if errors.Is(err, asset.ErrNotFound) {
			status = 404
			code = "NOT_FOUND"
		}
		if errors.Is(err, asset.ErrConflict) {
			status = 409
			code = "CONFLICT"
		}
		if errors.Is(err, asset.ErrHashMismatch) {
			status = 422
			code = "HASH_MISMATCH"
		}
		writeError(w, status, code, err.Error())
		return
	}
	writeJSON(w, 201, out)
}
func (h Handler) list(w http.ResponseWriter, r *http.Request) {
	if !h.auth(w, r) {
		return
	}
	if workspace(r) == "" {
		writeError(w, 400, "INVALID_CONTEXT", "workspace is required")
		return
	}
	out, err := h.Store.List(r.Context(), workspace(r), r.URL.Query().Get("project_id"))
	if err != nil {
		writeError(w, 503, "ASSET_UNAVAILABLE", err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"items": out})
}
func writeError(w http.ResponseWriter, s int, c, m string) {
	writeJSON(w, s, map[string]string{"code": c, "message": m})
}
func writeJSON(w http.ResponseWriter, s int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(s)
	_ = json.NewEncoder(w).Encode(v)
}
