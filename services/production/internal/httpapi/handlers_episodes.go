package httpapi

import (
	"encoding/json"
	"errors"

	"net/http"

	"shotdesigner/services/production/internal/episode"
	"shotdesigner/services/production/internal/episodeasset"
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

// 供给池里没有这条 ⇒ 不猜、不新建：策展的前提是"上游确实同步过它"

// ---- ProtocolTemplate endpoints ----

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

// Project Characters Handlers
