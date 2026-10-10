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

	"shotdesigner/services/workspace/internal/store"
)

type Handler struct {
	Store WorkspaceStore
	Token string
	Ready func(context.Context) error
}

// WorkspaceStore keeps the HTTP boundary independent from the PostgreSQL implementation.
type WorkspaceStore interface {
	Members(context.Context, string) ([]store.Member, error)
	Authorize(context.Context, string, string) (store.Member, error)
	PutCredential(context.Context, store.Credential) error
	Status(context.Context, string) ([]store.CredentialStatus, error)
	DeleteCredential(context.Context, string, string) error
	RevealKey(context.Context, string, string) (store.RevealedCredential, error)
	ListUserChannels(context.Context, string) ([]store.UserChannel, error)
	UpsertUserChannel(context.Context, string, store.UserChannel) (store.UserChannel, error)
	DeleteUserChannel(context.Context, string, string) error
}

// CredentialInput is the credential write payload. AuthHeader/AuthPrefix are the
// data-driven auth knobs (ADR-007 D2): omitting them keeps the stored value,
// sending "" clears it back to the auth_type fallback.
type CredentialInput struct {
	ChannelID  string  `json:"channelId"`
	BaseURL    string  `json:"baseUrl"`
	AuthType   string  `json:"authType"`
	AuthHeader *string `json:"authHeader"`
	AuthPrefix *string `json:"authPrefix"`
	APIKey     string  `json:"apiKey"` // 只写不读：不落日志、不回显、不返回
}

func (h Handler) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /live", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	mux.HandleFunc("GET /ready", func(w http.ResponseWriter, r *http.Request) {
		if h.Ready == nil || h.Ready(r.Context()) != nil {
			writeError(w, 503, "NOT_READY", "database unavailable")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("GET /internal/v1/workspaces/{workspace_id}/members", h.members)
	mux.HandleFunc("GET /internal/v1/workspaces/{workspace_id}/authorize", h.authorize)
	mux.HandleFunc("PUT /internal/v1/workspaces/{workspace_id}/credentials/{channel_id}", h.putCredential)
	mux.HandleFunc("GET /internal/v1/workspaces/{workspace_id}/credentials", h.credentialsStatus)
	mux.HandleFunc("DELETE /internal/v1/workspaces/{workspace_id}/credentials/{channel_id}", h.deleteCredential)
	mux.HandleFunc("GET /internal/v1/workspaces/{workspace_id}/credentials/{channel_id}/reveal", h.revealCredential)
	mux.HandleFunc("GET /internal/v1/workspaces/{workspace_id}/channels", h.listUserChannels)
	mux.HandleFunc("PUT /internal/v1/workspaces/{workspace_id}/channels/{channel_id}", h.putUserChannel)
	mux.HandleFunc("DELETE /internal/v1/workspaces/{workspace_id}/channels/{channel_id}", h.deleteUserChannel)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		mux.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (h Handler) authenticated(w http.ResponseWriter, r *http.Request) bool {
	provided := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if h.Token == "" || len(provided) != len(h.Token) || subtle.ConstantTimeCompare([]byte(provided), []byte(h.Token)) != 1 {
		writeError(w, 401, "UNAUTHENTICATED", "internal authentication required")
		return false
	}
	return true
}

func (h Handler) members(w http.ResponseWriter, r *http.Request) {
	if !h.authenticated(w, r) {
		return
	}
	items, err := h.Store.Members(r.Context(), r.PathValue("workspace_id"))
	if err != nil {
		writeError(w, 503, "WORKSPACE_UNAVAILABLE", "workspace could not be loaded")
		return
	}
	writeJSON(w, 200, map[string]any{"items": items})
}

func (h Handler) authorize(w http.ResponseWriter, r *http.Request) {
	if !h.authenticated(w, r) {
		return
	}
	actor := r.URL.Query().Get("actor_id")
	if actor == "" {
		writeError(w, 400, "INVALID_CONTEXT", "actor_id is required")
		return
	}
	m, err := h.Store.Authorize(r.Context(), r.PathValue("workspace_id"), actor)
	if err == store.ErrNotMember {
		writeError(w, 403, "FORBIDDEN", "actor is not a workspace member")
		return
	}
	if err != nil {
		writeError(w, 503, "WORKSPACE_UNAVAILABLE", "authorization unavailable")
		return
	}
	writeJSON(w, 200, m)
}

func (h Handler) putCredential(w http.ResponseWriter, r *http.Request) {
	if !h.authenticated(w, r) {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 256*1024+4096)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var input CredentialInput
	if err := decoder.Decode(&input); err != nil {
		writeError(w, 400, "INVALID_BODY", "invalid credential JSON or body too large")
		return
	}
	if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
		writeError(w, 400, "INVALID_BODY", "request must contain exactly one JSON object")
		return
	}
	ws := r.PathValue("workspace_id")
	channelID := r.PathValue("channel_id")
	if channelID != "" && input.ChannelID == "" {
		input.ChannelID = channelID
	}
	if input.ChannelID != channelID {
		writeError(w, 400, "INVALID_BODY", "channelId must match the URL path")
		return
	}
	if input.ChannelID == "" {
		writeError(w, 400, "INVALID_BODY", "channelId is required")
		return
	}
	if err := h.Store.PutCredential(r.Context(), store.Credential{
		WorkspaceID: ws,
		ChannelID:   input.ChannelID,
		BaseURL:     input.BaseURL,
		AuthType:    input.AuthType,
		AuthHeader:  input.AuthHeader,
		AuthPrefix:  input.AuthPrefix,
		APIKey:      input.APIKey,
		Actor:       "internal",
	}); err != nil {
		writeError(w, 503, "CREDENTIAL_UNAVAILABLE", "credential could not be stored (WORKSPACE_CRED_KEY must be set)")
		return
	}
	writeJSON(w, 200, map[string]any{"channelId": input.ChannelID, "stored": true})
}

func (h Handler) credentialsStatus(w http.ResponseWriter, r *http.Request) {
	if !h.authenticated(w, r) {
		return
	}
	items, err := h.Store.Status(r.Context(), r.PathValue("workspace_id"))
	if err != nil {
		writeError(w, 503, "CREDENTIAL_UNAVAILABLE", "credential status could not be loaded")
		return
	}
	writeJSON(w, 200, map[string]any{"items": items})
}

func (h Handler) deleteCredential(w http.ResponseWriter, r *http.Request) {
	if !h.authenticated(w, r) {
		return
	}
	if err := h.Store.DeleteCredential(r.Context(), r.PathValue("workspace_id"), r.PathValue("channel_id")); err != nil {
		writeError(w, 503, "CREDENTIAL_UNAVAILABLE", "credential could not be cleared")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// revealCredential returns the plaintext key only for an explicitly
// authenticated owner-side reveal action. The key is never included in list
// or status responses and is not logged.
func (h Handler) revealCredential(w http.ResponseWriter, r *http.Request) {
	if !h.authenticated(w, r) {
		return
	}
	revealed, err := h.Store.RevealKey(r.Context(), r.PathValue("workspace_id"), r.PathValue("channel_id"))
	if errors.Is(err, store.ErrCredentialNotFound) {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "credential not configured")
		return
	}
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "CREDENTIAL_UNAVAILABLE", "credential could not be decrypted (WORKSPACE_CRED_KEY mismatch?)")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"channelId":  r.PathValue("channel_id"),
		"baseUrl":    revealed.BaseURL,
		"authType":   revealed.AuthType,
		"authHeader": store.AuthHeaderValue(revealed.AuthHeader),
		"authPrefix": store.AuthHeaderValue(revealed.AuthPrefix),
		"apiKey":     revealed.APIKey,
	})
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]string{"code": code, "message": message})
}
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// UserChannelInput is the tenant-owned channel payload. Secret material is
// never part of this domain; API keys go to channel_credentials separately.
type UserChannelInput struct {
	Name       string  `json:"name"`
	Kind       string  `json:"kind"`
	Protocol   string  `json:"protocol"`
	BaseURL    string  `json:"baseUrl"`
	AuthType   string  `json:"authType"`
	AuthHeader *string `json:"authHeader"`
	AuthPrefix *string `json:"authPrefix"`
	Enabled    *bool   `json:"enabled"`
	Note       string  `json:"note"`
	Sort       *int    `json:"sort"`
}

func (h Handler) listUserChannels(w http.ResponseWriter, r *http.Request) {
	if !h.authenticated(w, r) {
		return
	}
	items, err := h.Store.ListUserChannels(r.Context(), r.PathValue("workspace_id"))
	if err != nil {
		writeError(w, 503, "CHANNEL_UNAVAILABLE", "user channels could not be loaded")
		return
	}
	writeJSON(w, 200, map[string]any{"items": items})
}

func (h Handler) putUserChannel(w http.ResponseWriter, r *http.Request) {
	if !h.authenticated(w, r) {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 256*1024+4096)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var input UserChannelInput
	if err := decoder.Decode(&input); err != nil {
		writeError(w, 400, "INVALID_BODY", "invalid channel JSON or body too large")
		return
	}
	ws := r.PathValue("workspace_id")
	id := r.PathValue("channel_id")
	if id == "" || input.Name == "" {
		writeError(w, 400, "INVALID_CHANNEL", "channel id and name are required")
		return
	}
	if input.Kind != "official" && input.Kind != "aggregator" && input.Kind != "local" {
		writeError(w, 400, "INVALID_KIND", "kind must be official|aggregator|local")
		return
	}
	if input.AuthType != "bearer" && input.AuthType != "none" {
		writeError(w, 400, "INVALID_AUTH", "authType must be bearer|none")
		return
	}
	protocol := input.Protocol
	if protocol == "" {
		protocol = "api"
	}
	if protocol != "api" && protocol != "local" {
		writeError(w, 400, "INVALID_PROTOCOL", "protocol must be api|local")
		return
	}
	enabled := true
	if input.Enabled != nil {
		enabled = *input.Enabled
	}
	sort := 0
	if input.Sort != nil {
		sort = *input.Sort
	}
	saved, err := h.Store.UpsertUserChannel(r.Context(), ws, store.UserChannel{
		ID: id, Name: input.Name, Kind: input.Kind, Protocol: protocol, BaseURL: input.BaseURL,
		AuthType: input.AuthType, AuthHeader: input.AuthHeader, AuthPrefix: input.AuthPrefix,
		Enabled: enabled, Note: input.Note, Sort: sort,
	})
	if err != nil {
		writeError(w, 503, "CHANNEL_UNAVAILABLE", "user channel could not be saved")
		return
	}
	writeJSON(w, 200, map[string]any{"channel": saved})
}

func (h Handler) deleteUserChannel(w http.ResponseWriter, r *http.Request) {
	if !h.authenticated(w, r) {
		return
	}
	ws := r.PathValue("workspace_id")
	channelID := r.PathValue("channel_id")
	// 级联清理：渠道删除时同步清除其加密凭据（避免孤儿 Key 残留）
	if err := h.Store.DeleteCredential(r.Context(), ws, channelID); err != nil && !errors.Is(err, store.ErrCredentialNotFound) {
		writeError(w, 503, "CHANNEL_UNAVAILABLE", "channel credential could not be cleared")
		return
	}
	if err := h.Store.DeleteUserChannel(r.Context(), ws, channelID); err != nil {
		writeError(w, 503, "CHANNEL_UNAVAILABLE", "user channel could not be removed")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
