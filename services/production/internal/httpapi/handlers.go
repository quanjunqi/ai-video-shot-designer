package httpapi

import (
	"errors"
	"io"

	"net/http"

	"shotdesigner/services/production/internal/projectcharacter"
	"time"

	"shotdesigner/services/production/internal/catalog"
	"shotdesigner/services/production/internal/episode"

	"shotdesigner/services/production/internal/project"

	"context"
	"crypto/subtle"
	"shotdesigner/services/production/internal/ruletemplate"

	"encoding/json"
	"shotdesigner/services/production/internal/episodeasset"

	"log/slog"

	"strings"

	"shotdesigner/services/production/internal/intent"
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
	Directory(context.Context, string) (catalog.Directory, error)
	GetModel(context.Context, string) (catalog.Model, error)
	CreateModel(context.Context, string, catalog.Model) (catalog.Model, bool, error)
	UpdateModel(context.Context, string, string, catalog.ModelPatch) (catalog.Model, error)
	UpdateChannel(context.Context, string, catalog.ChannelPatch) (catalog.Channel, error)
	CreateTemplate(context.Context, string, catalog.ProtocolTemplate) (catalog.ProtocolTemplate, bool, error)
	UpdateTemplate(context.Context, string, string, catalog.ProtocolTemplatePatch) (catalog.ProtocolTemplate, error)
	DeleteTemplate(context.Context, string) error
}

// CurationStore 是**策展**的窄接口（ADR-009 Phase D）。
// 为什么与 CatalogStore 分开：与既有的 LogicalModelStore 同一思路 ——
// 接口按用途隔离，加方法不会牵连无关的测试 stub（本项目已多次因接口过宽改到别处）。
type CurationStore interface {
	ListSupply(context.Context, string, string, bool) ([]catalog.SupplyItem, error)
	Curate(context.Context, string, string, catalog.CurateInput) (catalog.CuratedModel, error)
}

// ChannelSyncer 是上游同步器的【窄接口】：handler 只依赖它，
// 于是这条路由能用 stub 单测（与 CatalogStore 同一思路），不需要数据库与上游。
type ChannelSyncer interface {
	SyncChannel(ctx context.Context, workspaceID, channelID string) (catalog.SyncResult, error)
}

type Handler struct {
	Store                 Store
	EpisodeStore          EpisodeStore
	EpisodeAssetStore     EpisodeAssetStore
	ProjectCharacterStore ProjectCharacterStore
	RuleTemplateStore     RuleTemplateStore
	IntentStore           IntentStore
	CatalogStore          CatalogStore
	LogicalModelStore     LogicalModelStore
	CurationStore         CurationStore
	// ChannelSyncer 未装配时（缺 workspace 地址/令牌），路由会以 503 如实拒绝，
	// 而不是静默地"同步成功但什么都没拉"。
	ChannelSyncer ChannelSyncer
	Token         string
	Ready         func(context.Context) error
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
	// ADR-009 Phase D：策展。路径刻意落在 /internal/v1/catalog/* 之下 ⇒ BFF 的
	// catalog 代理（/api/v1/catalog/* → /internal/v1/catalog/*）无需改动即可转发。
	mux.HandleFunc("GET /internal/v1/catalog/supply", h.listSupply)
	mux.HandleFunc("POST /internal/v1/catalog/curate", h.curate)
	mux.HandleFunc("POST /internal/v1/catalog/protocol-templates", h.createProtocolTemplate)
	mux.HandleFunc("PUT /internal/v1/catalog/protocol-templates/{id}", h.updateProtocolTemplate)
	mux.HandleFunc("DELETE /internal/v1/catalog/protocol-templates/{id}", h.deleteProtocolTemplate)
	// Logical Models（ADR-003：对外统一标识 + 候选渠道集合）
	// ① 的第①步：触发一次上游同步（ADR-004 §4）。x-workspace-id 决定去哪取密钥。
	mux.HandleFunc("POST /internal/v1/channels/{id}/sync", h.syncChannel)
	mux.HandleFunc("GET /internal/v1/logical-models", h.listLogicalModels)
	mux.HandleFunc("POST /internal/v1/logical-models", h.createLogicalModel)
	mux.HandleFunc("GET /internal/v1/logical-models/{id}", h.getLogicalModel)
	mux.HandleFunc("PATCH /internal/v1/logical-models/{id}", h.updateLogicalModel)
	mux.HandleFunc("GET /internal/v1/logical-models/{id}/candidates", h.listLogicalModelCandidates)
	mux.HandleFunc("POST /internal/v1/logical-models/{id}/candidates", h.bindLogicalModelCandidates)
	mux.HandleFunc("DELETE /internal/v1/logical-models/{id}/candidates/{modelId}", h.unbindLogicalModelCandidate)
	// TASK-MODEL-007：自动归并（同名跨渠道 → 同一分组；辅助工具，幂等可重跑）
	mux.HandleFunc("POST /internal/v1/logical-models/reconcile", h.reconcileLogicalModels)
	// TASK-AUTH-001：角色校验中间件包在最外层（探活放行、其余按矩阵裁定，先鉴权再进超时层）
	return h.authz(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()
		mux.ServeHTTP(w, r.WithContext(ctx))
	}))
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

// getModelCapabilities returns the capability declaration for a model.
// It merges the model's own capability field with the protocol template's capabilities.

// Find associated protocol template

// Build capability response

// Extract supported modes from capabilities

// 存量内置目录（seed）id 为非 mod_ 格式（如 gemini-3.1-flash-lite），
// 编辑/停用必须兼容；新模型 id 规范（mod_+24）由 CreateModel.Validate 强制

// syncChannel 触发一次上游同步（ADR-004 §4 第①步「同步（自动）」）。
//
// 为什么要 x-workspace-id：密钥由 workspace 拥有，reveal 按 (workspace, channel) 定位 ——
// 与渠道探测同一套来源顺序（平台渠道的 base_url + 该工作区的凭据）。

// listSupply 列出某渠道的供给（未策展的上游模型），供界面挑选「加入我的模型目录」。
//
// 为什么必须带工作区：供给池按工作区隔离（ADR-009）—— A 同步进来的行不该出现在 B 的候选里。

// curate 把一条供给策展成产品面的模型（**只有走到这里，模型才可能对外可见**）。
func (h Handler) curate(w http.ResponseWriter, r *http.Request) {
	workspace, actor, ok := h.identity(w, r)
	if !ok {
		return
	}
	if h.CurationStore == nil {
		writeError(w, http.StatusServiceUnavailable, "CURATION_UNAVAILABLE", "curation is not configured")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 256*1024)
	var input catalog.CurateInput
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "invalid curate JSON")
		return
	}
	out, err := h.CurationStore.Curate(r.Context(), workspace, actor, input)
	if err != nil {
		switch {
		case errors.Is(err, catalog.ErrSupplyNotFound):
			// 供给池里没有这条 ⇒ 不猜、不新建：策展的前提是"上游确实同步过它"
			writeError(w, http.StatusNotFound, "SUPPLY_NOT_FOUND", err.Error())
		case strings.Contains(err.Error(), "unsupported model type"):
			writeError(w, http.StatusUnprocessableEntity, "INVALID_MODEL_TYPE", err.Error())
		case strings.Contains(err.Error(), "are required"):
			writeError(w, http.StatusUnprocessableEntity, "INVALID_CURATE_INPUT", err.Error())
		default:
			slog.Error("curate", "error", err, "model", input.ID)
			writeError(w, http.StatusInternalServerError, "CURATE_FAILED", err.Error())
		}
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"model": out})
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

// ==================== Episodes ====================

// ==================== Episode Assets ====================

// ==================== Rule Templates ====================

// Project Characters Handlers
