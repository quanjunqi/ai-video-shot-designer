package httpapi

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"

	"shotdesigner/services/production/internal/catalog"
	"shotdesigner/services/production/internal/episode"
	"shotdesigner/services/production/internal/episodeasset"
	"shotdesigner/services/production/internal/intent"
	"shotdesigner/services/production/internal/probe"
	"shotdesigner/services/production/internal/project"
	"shotdesigner/services/production/internal/projectcharacter"
	"shotdesigner/services/production/internal/ruletemplate"
)

type Store interface {
	Create(context.Context, string, string, string, project.CreateInput) (project.Project, bool, error)
	Get(context.Context, string, string) (project.Project, error)
	List(context.Context, string, int) (project.ListResult, error)
	Delete(context.Context, string, string) error
	Update(context.Context, string, string, project.UpdateInput) (project.Project, error)
}

type EpisodeStore interface {
	ListByProject(context.Context, string, string) ([]episode.Episode, error)
	Get(context.Context, string, string, string) (episode.Episode, error)
	Create(context.Context, string, string, episode.CreateInput) (episode.Episode, error)
	Update(context.Context, string, string, string, episode.UpdateInput) (episode.Episode, error)
	Delete(context.Context, string, string, string) error
}

type EpisodeAssetStore interface {
	ListByEpisode(context.Context, string, string, string) ([]episodeasset.EpisodeAsset, error)
	ListByProject(context.Context, string, string) ([]episodeasset.EpisodeAsset, error)
	Get(context.Context, string, string, string, string) (episodeasset.EpisodeAsset, error)
	Create(context.Context, string, string, string, episodeasset.CreateInput) (episodeasset.EpisodeAsset, error)
	Update(context.Context, string, string, string, string, episodeasset.UpdateInput) (episodeasset.EpisodeAsset, error)
	Delete(context.Context, string, string, string, string) error
}

type ProjectCharacterStore interface {
	ListByProject(context.Context, string, string) ([]projectcharacter.ProjectCharacter, error)
	Get(context.Context, string, string, string) (projectcharacter.ProjectCharacter, error)
	Create(context.Context, string, string, projectcharacter.CreateInput) (projectcharacter.ProjectCharacter, error)
	Update(context.Context, string, string, string, projectcharacter.UpdateInput) (projectcharacter.ProjectCharacter, error)
	Delete(context.Context, string, string, string) error
}

type RuleTemplateStore interface {
	List(context.Context, string, string) ([]ruletemplate.RuleTemplate, error)
	Get(context.Context, string, string) (ruletemplate.RuleTemplate, error)
	Create(context.Context, string, ruletemplate.CreateInput) (ruletemplate.RuleTemplate, error)
	Update(context.Context, string, string, ruletemplate.UpdateInput) (ruletemplate.RuleTemplate, error)
	Delete(context.Context, string, string) error
}

type IntentStore interface {
	Create(context.Context, string, string, string, intent.CreateInput) (intent.Intent, bool, error)
	Get(context.Context, string, string) (intent.Intent, error)
}

type CatalogStore interface {
	Directory(context.Context) (catalog.Directory, error)
	GetModel(context.Context, string) (catalog.Model, error)
	CreateModel(context.Context, string, catalog.Model) (catalog.Model, bool, error)
	UpdateModel(context.Context, string, string, catalog.ModelPatch) (catalog.Model, error)
	UpdateChannel(context.Context, string, catalog.ChannelPatch) (catalog.Channel, error)
	CreateTemplate(context.Context, string, catalog.ProtocolTemplate) (catalog.ProtocolTemplate, bool, error)
	UpdateTemplate(context.Context, string, string, catalog.ProtocolTemplatePatch) (catalog.ProtocolTemplate, error)
	DeleteTemplate(context.Context, string) error
}

type ProbeStore interface {
	Probe(context.Context, string, string) (probe.Result, error)
}

type Handler struct {
	Store                 Store
	EpisodeStore          EpisodeStore
	EpisodeAssetStore     EpisodeAssetStore
	ProjectCharacterStore ProjectCharacterStore
	RuleTemplateStore     RuleTemplateStore
	IntentStore           IntentStore
	CatalogStore          CatalogStore
	ProbeStore            ProbeStore
	Token                 string
	Ready                 func(context.Context) error
}

func (h Handler) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /live", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	mux.HandleFunc("GET /ready", func(w http.ResponseWriter, r *http.Request) {
		if h.Ready == nil || h.Ready(r.Context()) != nil {
			writeError(w, http.StatusServiceUnavailable, "NOT_READY", "database unavailable")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("POST /internal/v1/comic-projects", h.create)
	mux.HandleFunc("GET /internal/v1/comic-projects", h.list)
	mux.HandleFunc("GET /internal/v1/comic-projects/{id}", h.get)
	mux.HandleFunc("DELETE /internal/v1/comic-projects/{id}", h.delete)
	mux.HandleFunc("PATCH /internal/v1/comic-projects/{id}", h.updateProject)
	// Episodes
	mux.HandleFunc("GET /internal/v1/comic-projects/{projectID}/episodes", h.listEpisodes)
	mux.HandleFunc("GET /internal/v1/comic-projects/{projectID}/episodes/{episodeID}", h.getEpisode)
	mux.HandleFunc("POST /internal/v1/comic-projects/{projectID}/episodes", h.createEpisode)
	mux.HandleFunc("PATCH /internal/v1/comic-projects/{projectID}/episodes/{episodeID}", h.updateEpisode)
	mux.HandleFunc("DELETE /internal/v1/comic-projects/{projectID}/episodes/{episodeID}", h.deleteEpisode)
	// Episode Assets
	mux.HandleFunc("GET /internal/v1/comic-projects/{projectID}/episodes/{episodeID}/assets", h.listEpisodeAssets)
	mux.HandleFunc("GET /internal/v1/comic-projects/{projectID}/episodes/{episodeID}/assets/{assetID}", h.getEpisodeAsset)
	mux.HandleFunc("POST /internal/v1/comic-projects/{projectID}/episodes/{episodeID}/assets", h.createEpisodeAsset)
	mux.HandleFunc("PATCH /internal/v1/comic-projects/{projectID}/episodes/{episodeID}/assets/{assetID}", h.updateEpisodeAsset)
	mux.HandleFunc("DELETE /internal/v1/comic-projects/{projectID}/episodes/{episodeID}/assets/{assetID}", h.deleteEpisodeAsset)
	// Project Characters
	mux.HandleFunc("GET /internal/v1/comic-projects/{projectID}/characters", h.listProjectCharacters)
	mux.HandleFunc("GET /internal/v1/comic-projects/{projectID}/characters/{characterID}", h.getProjectCharacter)
	mux.HandleFunc("POST /internal/v1/comic-projects/{projectID}/characters", h.createProjectCharacter)
	mux.HandleFunc("PATCH /internal/v1/comic-projects/{projectID}/characters/{characterID}", h.updateProjectCharacter)
	mux.HandleFunc("DELETE /internal/v1/comic-projects/{projectID}/characters/{characterID}", h.deleteProjectCharacter)
	// Rule Templates
	mux.HandleFunc("GET /internal/v1/rule-templates", h.listRuleTemplates)
	mux.HandleFunc("GET /internal/v1/rule-templates/{templateID}", h.getRuleTemplate)
	mux.HandleFunc("POST /internal/v1/rule-templates", h.createRuleTemplate)
	mux.HandleFunc("PATCH /internal/v1/rule-templates/{templateID}", h.updateRuleTemplate)
	mux.HandleFunc("DELETE /internal/v1/rule-templates/{templateID}", h.deleteRuleTemplate)
	mux.HandleFunc("POST /internal/v1/generation-intents", h.createIntent)
	mux.HandleFunc("GET /internal/v1/generation-intents/{id}", h.getIntent)
	mux.HandleFunc("GET /internal/v1/catalog", h.getCatalog)
	mux.HandleFunc("GET /internal/v1/catalog/models/{id}/capabilities", h.getModelCapabilities)
	mux.HandleFunc("POST /internal/v1/catalog/models", h.createCatalogModel)
	mux.HandleFunc("PUT /internal/v1/catalog/models/{id}", h.updateCatalogModel)
	mux.HandleFunc("PUT /internal/v1/catalog/channels/{id}", h.updateCatalogChannel)
	mux.HandleFunc("POST /internal/v1/catalog/protocol-templates", h.createProtocolTemplate)
	mux.HandleFunc("PUT /internal/v1/catalog/protocol-templates/{id}", h.updateProtocolTemplate)
	mux.HandleFunc("DELETE /internal/v1/catalog/protocol-templates/{id}", h.deleteProtocolTemplate)
	mux.HandleFunc("POST /internal/v1/channels/{id}/probe", h.probeChannel)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()
		mux.ServeHTTP(w, r.WithContext(ctx))
	})
}

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

func (h Handler) list(w http.ResponseWriter, r *http.Request) {
	workspace, _, ok := h.identity(w, r)
	if !ok {
		return
	}
	result, err := h.Store.List(r.Context(), workspace, 50)
	if err != nil {
		slog.Error("list projects", "error", err)
		writeError(w, http.StatusServiceUnavailable, "PROJECT_UNAVAILABLE", "projects could not be loaded")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h Handler) identity(w http.ResponseWriter, r *http.Request) (string, string, bool) {
	provided := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if h.Token == "" || len(provided) != len(h.Token) ||
		subtle.ConstantTimeCompare([]byte(provided), []byte(h.Token)) != 1 {
		writeError(w, http.StatusUnauthorized, "UNAUTHENTICATED", "internal authentication required")
		return "", "", false
	}
	workspace, actor := r.Header.Get("X-Workspace-Id"), r.Header.Get("X-Actor-Id")
	if !validIdentity(workspace) || !validIdentity(actor) {
		writeError(w, http.StatusBadRequest, "INVALID_CONTEXT", "workspace and actor are required")
		return "", "", false
	}
	return workspace, actor, true
}

func validIdentity(value string) bool {
	if value == "" || len(value) > 128 || strings.TrimSpace(value) != value {
		return false
	}
	for _, r := range value {
		if r < 33 || r > 126 {
			return false
		}
	}
	return true
}

func (h Handler) create(w http.ResponseWriter, r *http.Request) {
	workspace, actor, ok := h.identity(w, r)
	if !ok {
		return
	}
	key := r.Header.Get("Idempotency-Key")
	if !validIdentity(key) {
		writeError(w, http.StatusBadRequest, "INVALID_IDEMPOTENCY_KEY", "Idempotency-Key is required (max 128 ASCII characters)")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 2*1024*1024+4096)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var input project.CreateInput
	if err := decoder.Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "invalid project JSON or body too large")
		return
	}
	if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "request must contain exactly one JSON object")
		return
	}
	if err := input.Validate(); err != nil {
		writeError(w, http.StatusUnprocessableEntity, "INVALID_PROJECT", "title, style, models, aspect ratio and source text are required")
		return
	}
	result, replay, err := h.Store.Create(r.Context(), workspace, actor, key, input)
	if errors.Is(err, project.ErrIdempotencyConflict) {
		writeError(w, http.StatusConflict, "IDEMPOTENCY_CONFLICT", err.Error())
		return
	}
	if err != nil {
		slog.Error("create project", "error", err)
		writeError(w, http.StatusServiceUnavailable, "PROJECT_UNAVAILABLE", "project could not be saved; retry with the same key")
		return
	}
	w.Header().Set("Location", "/internal/v1/comic-projects/"+result.ID)
	if replay {
		writeJSON(w, http.StatusOK, result)
	} else {
		writeJSON(w, http.StatusCreated, result)
	}
}

func (h Handler) get(w http.ResponseWriter, r *http.Request) {
	workspace, _, ok := h.identity(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")
	if !strings.HasPrefix(id, "proj_") || len(id) != 37 {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "project not found")
		return
	}
	result, err := h.Store.Get(r.Context(), workspace, id)
	if errors.Is(err, project.ErrNotFound) {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "project not found")
		return
	}
	if err != nil {
		slog.Error("get project", "error", err)
		writeError(w, http.StatusServiceUnavailable, "PROJECT_UNAVAILABLE", "project could not be loaded")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h Handler) delete(w http.ResponseWriter, r *http.Request) {
	workspace, _, ok := h.identity(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")
	if !strings.HasPrefix(id, "proj_") || len(id) != 37 {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "project not found")
		return
	}
	if err := h.Store.Delete(r.Context(), workspace, id); err != nil {
		if errors.Is(err, project.ErrNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "project not found")
			return
		}
		slog.Error("delete project", "error", err)
		writeError(w, http.StatusServiceUnavailable, "PROJECT_UNAVAILABLE", "project could not be deleted")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h Handler) updateProject(w http.ResponseWriter, r *http.Request) {
	workspace, _, ok := h.identity(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")
	if !strings.HasPrefix(id, "proj_") || len(id) != 37 {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "project not found")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 64*1024)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var input project.UpdateInput
	if err := decoder.Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "invalid project update JSON or body too large")
		return
	}
	if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "request must contain exactly one JSON object")
		return
	}
	updated, err := h.Store.Update(r.Context(), workspace, id, input)
	if err != nil {
		if errors.Is(err, project.ErrNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "project not found")
			return
		}
		if errors.Is(err, project.ErrInvalid) {
			writeError(w, http.StatusUnprocessableEntity, "INVALID_INPUT", err.Error())
			return
		}
		slog.Error("update project", "error", err)
		writeError(w, http.StatusServiceUnavailable, "PROJECT_UNAVAILABLE", "project could not be updated")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (h Handler) getCatalog(w http.ResponseWriter, r *http.Request) {
	_, _, ok := h.identity(w, r)
	if !ok {
		return
	}
	if h.CatalogStore == nil {
		writeError(w, http.StatusServiceUnavailable, "CATALOG_UNAVAILABLE", "model catalog is unavailable")
		return
	}
	dir, err := h.CatalogStore.Directory(r.Context())
	if err != nil {
		slog.Error("get model catalog", "error", err)
		writeError(w, http.StatusServiceUnavailable, "CATALOG_UNAVAILABLE", "model catalog could not be loaded")
		return
	}
	writeJSON(w, http.StatusOK, dir)
}

// getModelCapabilities returns the capability declaration for a model.
// It merges the model's own capability field with the protocol template's capabilities.
func (h Handler) getModelCapabilities(w http.ResponseWriter, r *http.Request) {
	_, _, ok := h.identity(w, r)
	if !ok {
		return
	}
	if h.CatalogStore == nil {
		writeError(w, http.StatusServiceUnavailable, "CATALOG_UNAVAILABLE", "model catalog is unavailable")
		return
	}
	modelID := r.PathValue("id")
	dir, err := h.CatalogStore.Directory(r.Context())
	if err != nil {
		slog.Error("get model capabilities", "error", err)
		writeError(w, http.StatusServiceUnavailable, "CATALOG_UNAVAILABLE", "model catalog could not be loaded")
		return
	}
	var model *catalog.Model
	for i := range dir.Models {
		if dir.Models[i].ID == modelID {
			model = &dir.Models[i]
			break
		}
	}
	if model == nil {
		writeError(w, http.StatusNotFound, "MODEL_NOT_FOUND", "model not found in directory")
		return
	}
	// Find associated protocol template
	var tmpl *catalog.ProtocolTemplate
	if model.ProtocolTemplateID != "" {
		for i := range dir.Templates {
			if dir.Templates[i].ID == model.ProtocolTemplateID {
				tmpl = &dir.Templates[i]
				break
			}
		}
	}
	// Build capability response
	response := map[string]any{
		"model_id":   model.ID,
		"model_name": model.Name,
		"model_type": model.Type,
		"capability": model.Capability,
	}
	if tmpl != nil {
		response["protocol_template_id"] = tmpl.ID
		response["protocol_template_label"] = tmpl.Label
		response["capabilities"] = tmpl.Capabilities
		// Extract supported modes from capabilities
		if len(tmpl.Capabilities) > 0 {
			var caps map[string]any
			if err := json.Unmarshal(tmpl.Capabilities, &caps); err == nil {
				modes := make([]string, 0, len(caps))
				for mode := range caps {
					modes = append(modes, mode)
				}
				response["supported_modes"] = modes
			}
		}
	}
	writeJSON(w, http.StatusOK, response)
}

func (h Handler) createCatalogModel(w http.ResponseWriter, r *http.Request) {
	_, actor, ok := h.identity(w, r)
	if !ok {
		return
	}
	if h.CatalogStore == nil {
		writeError(w, http.StatusServiceUnavailable, "CATALOG_UNAVAILABLE", "model catalog is unavailable")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 512*1024+4096)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var input catalog.Model
	if err := decoder.Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "invalid model JSON or body too large")
		return
	}
	if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "request must contain exactly one JSON object")
		return
	}
	out, duplicate, err := h.CatalogStore.CreateModel(r.Context(), actor, input)
	if errors.Is(err, catalog.ErrDuplicate) {
		writeError(w, http.StatusConflict, "DUPLICATE_MODEL", "a model with the same id already exists")
		return
	}
	if errors.Is(err, catalog.ErrInvalidChannel) {
		writeError(w, http.StatusUnprocessableEntity, "INVALID_CHANNEL", "channel_id does not exist")
		return
	}
	if err != nil {
		slog.Error("create catalog model", "error", err)
		writeError(w, http.StatusUnprocessableEntity, "INVALID_MODEL", "model validation failed")
		return
	}
	w.Header().Set("Location", "/internal/v1/catalog/models/"+out.ID)
	if duplicate {
		writeJSON(w, http.StatusOK, out)
	} else {
		writeJSON(w, http.StatusCreated, out)
	}
}

func (h Handler) updateCatalogModel(w http.ResponseWriter, r *http.Request) {
	_, actor, ok := h.identity(w, r)
	if !ok {
		return
	}
	if h.CatalogStore == nil {
		writeError(w, http.StatusServiceUnavailable, "CATALOG_UNAVAILABLE", "model catalog is unavailable")
		return
	}
	id := r.PathValue("id")
	// 存量内置目录（seed）id 为非 mod_ 格式（如 gemini-3.1-flash-lite），
	// 编辑/停用必须兼容；新模型 id 规范（mod_+24）由 CreateModel.Validate 强制
	if id == "" {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "model not found")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 512*1024+4096)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var patch catalog.ModelPatch
	if err := decoder.Decode(&patch); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "invalid model patch JSON or body too large")
		return
	}
	if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "request must contain exactly one JSON object")
		return
	}
	out, err := h.CatalogStore.UpdateModel(r.Context(), actor, id, patch)
	if errors.Is(err, catalog.ErrNotFound) {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "model not found")
		return
	}
	if errors.Is(err, catalog.ErrInvalidChannel) {
		writeError(w, http.StatusUnprocessableEntity, "INVALID_CHANNEL", "channel_id does not exist")
		return
	}
	if err != nil {
		slog.Error("update catalog model", "error", err)
		writeError(w, http.StatusUnprocessableEntity, "INVALID_MODEL", "model validation failed")
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (h Handler) updateCatalogChannel(w http.ResponseWriter, r *http.Request) {
	_, _, ok := h.identity(w, r)
	if !ok {
		return
	}
	if h.CatalogStore == nil {
		writeError(w, http.StatusServiceUnavailable, "CATALOG_UNAVAILABLE", "model catalog is unavailable")
		return
	}
	id := r.PathValue("id")
	if !strings.HasPrefix(id, "chan_") && id != "jimeng" && id != "minimax" && id != "grsai" && id != "google" && id != "openai" && id != "comfy" {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "channel not found")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 256*1024+4096)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var patch catalog.ChannelPatch
	if err := decoder.Decode(&patch); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "invalid channel patch JSON or body too large")
		return
	}
	if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "request must contain exactly one JSON object")
		return
	}
	out, err := h.CatalogStore.UpdateChannel(r.Context(), id, patch)
	if errors.Is(err, catalog.ErrNotFound) {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "channel not found")
		return
	}
	if err != nil {
		slog.Error("update catalog channel", "error", err)
		writeError(w, http.StatusUnprocessableEntity, "INVALID_CHANNEL", "channel validation failed")
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (h Handler) probeChannel(w http.ResponseWriter, r *http.Request) {
	workspace, _, ok := h.identity(w, r)
	if !ok {
		return
	}
	if h.ProbeStore == nil {
		writeError(w, http.StatusServiceUnavailable, "PROBE_UNAVAILABLE", "channel probe is unavailable")
		return
	}
	id := r.PathValue("id")
	if !strings.HasPrefix(id, "chan_") && id != "jimeng" && id != "minimax" && id != "grsai" && id != "google" && id != "openai" && id != "comfy" {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "channel not found")
		return
	}
	out, err := h.ProbeStore.Probe(r.Context(), workspace, id)
	if errors.Is(err, probe.ErrChannelNotFound) {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "channel not found")
		return
	}
	if err != nil {
		slog.Error("probe channel", "error", err)
		writeError(w, http.StatusServiceUnavailable, "PROBE_UNAVAILABLE", "channel probe could not be executed")
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]string{"code": code, "message": message})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

// ---- ProtocolTemplate endpoints ----

func (h Handler) createProtocolTemplate(w http.ResponseWriter, r *http.Request) {
	actor := r.Header.Get("X-Actor-Id")
	if actor == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "X-Actor-Id required")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 512*1024)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var input catalog.ProtocolTemplate
	if err := decoder.Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid template json")
		return
	}
	t, dup, err := h.CatalogStore.CreateTemplate(r.Context(), actor, input)
	if err != nil {
		switch {
		case dup:
			writeError(w, http.StatusConflict, "DUPLICATE", "template already exists")
		case errors.Is(err, catalog.ErrInvalidType), errors.Is(err, catalog.ErrInvalidCapability):
			writeError(w, http.StatusBadRequest, "BAD_REQUEST", err.Error())
		default:
			writeError(w, http.StatusInternalServerError, "INTERNAL", "template create failed")
		}
		return
	}
	writeJSON(w, http.StatusCreated, t)
}

func (h Handler) updateProtocolTemplate(w http.ResponseWriter, r *http.Request) {
	actor := r.Header.Get("X-Actor-Id")
	if actor == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "X-Actor-Id required")
		return
	}
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "template not found")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 512*1024)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var patch catalog.ProtocolTemplatePatch
	if err := decoder.Decode(&patch); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid template patch")
		return
	}
	t, err := h.CatalogStore.UpdateTemplate(r.Context(), actor, id, patch)
	if err != nil {
		switch {
		case errors.Is(err, catalog.ErrNotFound):
			writeError(w, http.StatusNotFound, "NOT_FOUND", "template not found")
		case errors.Is(err, catalog.ErrBuiltinProtected):
			writeError(w, http.StatusBadRequest, "BUILTIN_PROTECTED", "builtin template is protected")
		default:
			writeError(w, http.StatusInternalServerError, "INTERNAL", "template update failed")
		}
		return
	}
	writeJSON(w, http.StatusOK, t)
}

func (h Handler) deleteProtocolTemplate(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "template not found")
		return
	}
	err := h.CatalogStore.DeleteTemplate(r.Context(), id)
	if err != nil {
		switch {
		case errors.Is(err, catalog.ErrNotFound):
			writeError(w, http.StatusNotFound, "NOT_FOUND", "template not found")
		case errors.Is(err, catalog.ErrBuiltinProtected):
			writeError(w, http.StatusBadRequest, "BUILTIN_PROTECTED", "builtin template is protected")
		case errors.Is(err, catalog.ErrTemplateInUse):
			writeError(w, http.StatusConflict, "TEMPLATE_IN_USE", "template referenced by models")
		default:
			writeError(w, http.StatusInternalServerError, "INTERNAL", "template delete failed")
		}
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ==================== Episodes ====================

func (h Handler) listEpisodes(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("projectID")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "projectID required")
		return
	}
	workspace, actor := r.Header.Get("X-Workspace-Id"), r.Header.Get("X-Actor-Id")
	if workspace == "" || actor == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "X-Workspace-Id and X-Actor-Id required")
		return
	}
	episodes, err := h.EpisodeStore.ListByProject(r.Context(), workspace, projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", "list episodes failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"items": episodes})
}

func (h Handler) getEpisode(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("projectID")
	episodeID := r.PathValue("episodeID")
	if projectID == "" || episodeID == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "projectID and episodeID required")
		return
	}
	workspace, actor := r.Header.Get("X-Workspace-Id"), r.Header.Get("X-Actor-Id")
	if workspace == "" || actor == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "X-Workspace-Id and X-Actor-Id required")
		return
	}
	ep, err := h.EpisodeStore.Get(r.Context(), workspace, projectID, episodeID)
	if err != nil {
		if errors.Is(err, episode.ErrNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "episode not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL", "get episode failed")
		return
	}
	writeJSON(w, http.StatusOK, ep)
}

func (h Handler) createEpisode(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("projectID")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "projectID required")
		return
	}
	workspace, actor := r.Header.Get("X-Workspace-Id"), r.Header.Get("X-Actor-Id")
	if workspace == "" || actor == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "X-Workspace-Id and X-Actor-Id required")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 2*1024*1024)
	var input episode.CreateInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid episode input")
		return
	}
	ep, err := h.EpisodeStore.Create(r.Context(), workspace, projectID, input)
	if err != nil {
		if errors.Is(err, episode.ErrInvalid) {
			writeError(w, http.StatusBadRequest, "BAD_REQUEST", err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL", "create episode failed")
		return
	}
	writeJSON(w, http.StatusCreated, ep)
}

func (h Handler) updateEpisode(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("projectID")
	episodeID := r.PathValue("episodeID")
	if projectID == "" || episodeID == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "projectID and episodeID required")
		return
	}
	workspace, actor := r.Header.Get("X-Workspace-Id"), r.Header.Get("X-Actor-Id")
	if workspace == "" || actor == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "X-Workspace-Id and X-Actor-Id required")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 10*1024*1024)
	var input episode.UpdateInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid episode patch")
		return
	}
	ep, err := h.EpisodeStore.Update(r.Context(), workspace, projectID, episodeID, input)
	if err != nil {
		if errors.Is(err, episode.ErrNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "episode not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL", "update episode failed")
		return
	}
	writeJSON(w, http.StatusOK, ep)
}

func (h Handler) deleteEpisode(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("projectID")
	episodeID := r.PathValue("episodeID")
	if projectID == "" || episodeID == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "projectID and episodeID required")
		return
	}
	workspace, actor := r.Header.Get("X-Workspace-Id"), r.Header.Get("X-Actor-Id")
	if workspace == "" || actor == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "X-Workspace-Id and X-Actor-Id required")
		return
	}
	err := h.EpisodeStore.Delete(r.Context(), workspace, projectID, episodeID)
	if err != nil {
		if errors.Is(err, episode.ErrNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "episode not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL", "delete episode failed")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ==================== Episode Assets ====================

func (h Handler) listEpisodeAssets(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("projectID")
	episodeID := r.PathValue("episodeID")
	if projectID == "" || episodeID == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "projectID and episodeID required")
		return
	}
	workspace, actor := r.Header.Get("X-Workspace-Id"), r.Header.Get("X-Actor-Id")
	if workspace == "" || actor == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "X-Workspace-Id and X-Actor-Id required")
		return
	}
	assets, err := h.EpisodeAssetStore.ListByEpisode(r.Context(), workspace, projectID, episodeID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", "list episode assets failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"items": assets})
}

func (h Handler) getEpisodeAsset(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("projectID")
	episodeID := r.PathValue("episodeID")
	assetID := r.PathValue("assetID")
	if projectID == "" || episodeID == "" || assetID == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "projectID, episodeID and assetID required")
		return
	}
	workspace, actor := r.Header.Get("X-Workspace-Id"), r.Header.Get("X-Actor-Id")
	if workspace == "" || actor == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "X-Workspace-Id and X-Actor-Id required")
		return
	}
	asset, err := h.EpisodeAssetStore.Get(r.Context(), workspace, projectID, episodeID, assetID)
	if err != nil {
		if errors.Is(err, episodeasset.ErrNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "asset not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL", "get episode asset failed")
		return
	}
	writeJSON(w, http.StatusOK, asset)
}

func (h Handler) createEpisodeAsset(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("projectID")
	episodeID := r.PathValue("episodeID")
	if projectID == "" || episodeID == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "projectID and episodeID required")
		return
	}
	workspace, actor := r.Header.Get("X-Workspace-Id"), r.Header.Get("X-Actor-Id")
	if workspace == "" || actor == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "X-Workspace-Id and X-Actor-Id required")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 5*1024*1024)
	var input episodeasset.CreateInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid asset input")
		return
	}
	asset, err := h.EpisodeAssetStore.Create(r.Context(), workspace, projectID, episodeID, input)
	if err != nil {
		if errors.Is(err, episodeasset.ErrInvalid) {
			writeError(w, http.StatusBadRequest, "BAD_REQUEST", err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL", "create episode asset failed")
		return
	}
	writeJSON(w, http.StatusCreated, asset)
}

func (h Handler) updateEpisodeAsset(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("projectID")
	episodeID := r.PathValue("episodeID")
	assetID := r.PathValue("assetID")
	if projectID == "" || episodeID == "" || assetID == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "projectID, episodeID and assetID required")
		return
	}
	workspace, actor := r.Header.Get("X-Workspace-Id"), r.Header.Get("X-Actor-Id")
	if workspace == "" || actor == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "X-Workspace-Id and X-Actor-Id required")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 5*1024*1024)
	var input episodeasset.UpdateInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid asset patch")
		return
	}
	asset, err := h.EpisodeAssetStore.Update(r.Context(), workspace, projectID, episodeID, assetID, input)
	if err != nil {
		if errors.Is(err, episodeasset.ErrNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "asset not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL", "update episode asset failed")
		return
	}
	writeJSON(w, http.StatusOK, asset)
}

func (h Handler) deleteEpisodeAsset(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("projectID")
	episodeID := r.PathValue("episodeID")
	assetID := r.PathValue("assetID")
	if projectID == "" || episodeID == "" || assetID == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "projectID, episodeID and assetID required")
		return
	}
	workspace, actor := r.Header.Get("X-Workspace-Id"), r.Header.Get("X-Actor-Id")
	if workspace == "" || actor == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "X-Workspace-Id and X-Actor-Id required")
		return
	}
	err := h.EpisodeAssetStore.Delete(r.Context(), workspace, projectID, episodeID, assetID)
	if err != nil {
		if errors.Is(err, episodeasset.ErrNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "asset not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL", "delete episode asset failed")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ==================== Rule Templates ====================

func (h Handler) listRuleTemplates(w http.ResponseWriter, r *http.Request) {
	workspace, actor := r.Header.Get("X-Workspace-Id"), r.Header.Get("X-Actor-Id")
	if workspace == "" || actor == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "X-Workspace-Id and X-Actor-Id required")
		return
	}
	kind := r.URL.Query().Get("kind")
	templates, err := h.RuleTemplateStore.List(r.Context(), workspace, kind)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", "list rule templates failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"items": templates})
}

func (h Handler) getRuleTemplate(w http.ResponseWriter, r *http.Request) {
	templateID := r.PathValue("templateID")
	if templateID == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "templateID required")
		return
	}
	workspace, actor := r.Header.Get("X-Workspace-Id"), r.Header.Get("X-Actor-Id")
	if workspace == "" || actor == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "X-Workspace-Id and X-Actor-Id required")
		return
	}
	template, err := h.RuleTemplateStore.Get(r.Context(), workspace, templateID)
	if err != nil {
		if errors.Is(err, ruletemplate.ErrNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "rule template not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL", "get rule template failed")
		return
	}
	writeJSON(w, http.StatusOK, template)
}

func (h Handler) createRuleTemplate(w http.ResponseWriter, r *http.Request) {
	workspace, actor := r.Header.Get("X-Workspace-Id"), r.Header.Get("X-Actor-Id")
	if workspace == "" || actor == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "X-Workspace-Id and X-Actor-Id required")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 2*1024*1024)
	var input ruletemplate.CreateInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid rule template input")
		return
	}
	template, err := h.RuleTemplateStore.Create(r.Context(), workspace, input)
	if err != nil {
		if errors.Is(err, ruletemplate.ErrInvalid) {
			writeError(w, http.StatusBadRequest, "BAD_REQUEST", err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL", "create rule template failed")
		return
	}
	writeJSON(w, http.StatusCreated, template)
}

func (h Handler) updateRuleTemplate(w http.ResponseWriter, r *http.Request) {
	templateID := r.PathValue("templateID")
	if templateID == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "templateID required")
		return
	}
	workspace, actor := r.Header.Get("X-Workspace-Id"), r.Header.Get("X-Actor-Id")
	if workspace == "" || actor == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "X-Workspace-Id and X-Actor-Id required")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 2*1024*1024)
	var input ruletemplate.UpdateInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid rule template patch")
		return
	}
	template, err := h.RuleTemplateStore.Update(r.Context(), workspace, templateID, input)
	if err != nil {
		if errors.Is(err, ruletemplate.ErrNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "rule template not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL", "update rule template failed")
		return
	}
	writeJSON(w, http.StatusOK, template)
}

func (h Handler) deleteRuleTemplate(w http.ResponseWriter, r *http.Request) {
	templateID := r.PathValue("templateID")
	if templateID == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "templateID required")
		return
	}
	workspace, actor := r.Header.Get("X-Workspace-Id"), r.Header.Get("X-Actor-Id")
	if workspace == "" || actor == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "X-Workspace-Id and X-Actor-Id required")
		return
	}
	err := h.RuleTemplateStore.Delete(r.Context(), workspace, templateID)
	if err != nil {
		if errors.Is(err, ruletemplate.ErrNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "rule template not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL", "delete rule template failed")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Project Characters Handlers

func (h Handler) listProjectCharacters(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("projectID")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "projectID required")
		return
	}
	workspace, actor := r.Header.Get("X-Workspace-Id"), r.Header.Get("X-Actor-Id")
	if workspace == "" || actor == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "X-Workspace-Id and X-Actor-Id required")
		return
	}
	characters, err := h.ProjectCharacterStore.ListByProject(r.Context(), workspace, projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", "list project characters failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"items": characters})
}

func (h Handler) getProjectCharacter(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("projectID")
	characterID := r.PathValue("characterID")
	if projectID == "" || characterID == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "projectID and characterID required")
		return
	}
	workspace, actor := r.Header.Get("X-Workspace-Id"), r.Header.Get("X-Actor-Id")
	if workspace == "" || actor == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "X-Workspace-Id and X-Actor-Id required")
		return
	}
	character, err := h.ProjectCharacterStore.Get(r.Context(), workspace, projectID, characterID)
	if err != nil {
		if errors.Is(err, projectcharacter.ErrNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "character not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL", "get project character failed")
		return
	}
	writeJSON(w, http.StatusOK, character)
}

func (h Handler) createProjectCharacter(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("projectID")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "projectID required")
		return
	}
	workspace, actor := r.Header.Get("X-Workspace-Id"), r.Header.Get("X-Actor-Id")
	if workspace == "" || actor == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "X-Workspace-Id and X-Actor-Id required")
		return
	}
	var input projectcharacter.CreateInput
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid request body")
		return
	}
	if err := input.Validate(); err != nil {
		if errors.Is(err, projectcharacter.ErrInvalid) {
			writeError(w, http.StatusBadRequest, "BAD_REQUEST", err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL", "validation failed")
		return
	}
	character, err := h.ProjectCharacterStore.Create(r.Context(), workspace, projectID, input)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", "create project character failed")
		return
	}
	writeJSON(w, http.StatusCreated, character)
}

func (h Handler) updateProjectCharacter(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("projectID")
	characterID := r.PathValue("characterID")
	if projectID == "" || characterID == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "projectID and characterID required")
		return
	}
	workspace, actor := r.Header.Get("X-Workspace-Id"), r.Header.Get("X-Actor-Id")
	if workspace == "" || actor == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "X-Workspace-Id and X-Actor-Id required")
		return
	}
	var input projectcharacter.UpdateInput
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid request body")
		return
	}
	character, err := h.ProjectCharacterStore.Update(r.Context(), workspace, projectID, characterID, input)
	if err != nil {
		if errors.Is(err, projectcharacter.ErrNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "character not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL", "update project character failed")
		return
	}
	writeJSON(w, http.StatusOK, character)
}

func (h Handler) deleteProjectCharacter(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("projectID")
	characterID := r.PathValue("characterID")
	if projectID == "" || characterID == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "projectID and characterID required")
		return
	}
	workspace, actor := r.Header.Get("X-Workspace-Id"), r.Header.Get("X-Actor-Id")
	if workspace == "" || actor == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "X-Workspace-Id and X-Actor-Id required")
		return
	}
	err := h.ProjectCharacterStore.Delete(r.Context(), workspace, projectID, characterID)
	if err != nil {
		if errors.Is(err, projectcharacter.ErrNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "character not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL", "delete project character failed")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
