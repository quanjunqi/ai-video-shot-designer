package httpapi

import (
	"encoding/json"

	"log/slog"

	"errors"
	"io"
	"strings"

	"net/http"

	"shotdesigner/services/production/internal/catalog"
)

// CurationStore 是**策展**的窄接口（ADR-009 Phase D）。
// 为什么与 CatalogStore 分开：与既有的 LogicalModelStore 同一思路 ——
// 接口按用途隔离，加方法不会牵连无关的测试 stub（本项目已多次因接口过宽改到别处）。

// ChannelSyncer 是上游同步器的【窄接口】：handler 只依赖它，
// 于是这条路由能用 stub 单测（与 CatalogStore 同一思路），不需要数据库与上游。

// ChannelSyncer 未装配时（缺 workspace 地址/令牌），路由会以 503 如实拒绝，
// 而不是静默地"同步成功但什么都没拉"。

// Episodes

// Episode Assets

// Project Characters

// Rule Templates

// ADR-009 Phase D：策展。路径刻意落在 /internal/v1/catalog/* 之下 ⇒ BFF 的
// catalog 代理（/api/v1/catalog/* → /internal/v1/catalog/*）无需改动即可转发。

// Logical Models（ADR-003：对外统一标识 + 候选渠道集合）
// ① 的第①步：触发一次上游同步（ADR-004 §4）。x-workspace-id 决定去哪取密钥。

func (h Handler) getCatalog(w http.ResponseWriter, r *http.Request) {
	workspace, _, ok := h.identity(w, r)
	if !ok {
		return
	}
	if h.CatalogStore == nil {
		writeError(w, http.StatusServiceUnavailable, "CATALOG_UNAVAILABLE", "model catalog is unavailable")
		return
	}
	dir, err := h.CatalogStore.Directory(r.Context(), workspace)
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
	workspace, _, ok := h.identity(w, r)
	if !ok {
		return
	}
	if h.CatalogStore == nil {
		writeError(w, http.StatusServiceUnavailable, "CATALOG_UNAVAILABLE", "model catalog is unavailable")
		return
	}
	modelID := r.PathValue("id")
	dir, err := h.CatalogStore.Directory(r.Context(), workspace)
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

// syncChannel 触发一次上游同步（ADR-004 §4 第①步「同步（自动）」）。
//
// 为什么要 x-workspace-id：密钥由 workspace 拥有，reveal 按 (workspace, channel) 定位 ——
// 与渠道探测同一套来源顺序（平台渠道的 base_url + 该工作区的凭据）。
func (h Handler) syncChannel(w http.ResponseWriter, r *http.Request) {
	if h.ChannelSyncer == nil {
		writeError(w, http.StatusServiceUnavailable, "SYNC_DISABLED",
			"sync is not configured (needs PRODUCTION_WORKSPACE_URL / PRODUCTION_WORKSPACE_TOKEN)")
		return
	}
	workspace, _, ok := h.identity(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")
	res, err := h.ChannelSyncer.SyncChannel(r.Context(), workspace, id)
	switch {
	case err == nil:
		writeJSON(w, http.StatusOK, map[string]any{
			"channel_id":    id,
			"raw_count":     res.RawCount,
			"added":         res.Added,
			"updated":       res.Updated,
			"missing":       res.Missing,
			"price_changed": res.PriceChanged,
		})
	case errors.Is(err, catalog.ErrSyncNotConfigured):
		writeError(w, http.StatusBadRequest, "SYNC_NOT_CONFIGURED", err.Error())
	case errors.Is(err, catalog.ErrChannelNotFound):
		writeError(w, http.StatusNotFound, "CHANNEL_NOT_FOUND", "channel not found: "+id)
	default:
		slog.Error("channel sync failed", "channel", id, "error", err)
		writeError(w, http.StatusBadGateway, "SYNC_UPSTREAM_FAILED", err.Error())
	}
}

// listSupply 列出某渠道的供给（未策展的上游模型），供界面挑选「加入我的模型目录」。
//
// 为什么必须带工作区：供给池按工作区隔离（ADR-009）—— A 同步进来的行不该出现在 B 的候选里。
func (h Handler) listSupply(w http.ResponseWriter, r *http.Request) {
	workspace, _, ok := h.identity(w, r)
	if !ok {
		return
	}
	if h.CurationStore == nil {
		writeError(w, http.StatusServiceUnavailable, "CURATION_UNAVAILABLE", "curation is not configured")
		return
	}
	channelID := r.URL.Query().Get("channel_id")
	if channelID == "" {
		writeError(w, http.StatusBadRequest, "MISSING_CHANNEL", "channel_id is required")
		return
	}
	includeMissing := r.URL.Query().Get("include_missing") == "1" || r.URL.Query().Get("include_missing") == "true"
	items, err := h.CurationStore.ListSupply(r.Context(), workspace, channelID, includeMissing)
	if err != nil {
		slog.Error("list supply", "error", err, "channel", channelID)
		writeError(w, http.StatusServiceUnavailable, "SUPPLY_UNAVAILABLE", "supply could not be loaded")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// curate 把一条供给策展成产品面的模型（**只有走到这里，模型才可能对外可见**）。

// 供给池里没有这条 ⇒ 不猜、不新建：策展的前提是"上游确实同步过它"

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

// ==================== Episode Assets ====================

// ==================== Rule Templates ====================

// Project Characters Handlers
