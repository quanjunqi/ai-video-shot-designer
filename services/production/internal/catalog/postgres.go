package catalog

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresStore struct {
	Pool *pgxpool.Pool
}

func (store PostgresStore) Directory(ctx context.Context) (Directory, error) {
	var dir Directory
	channels, err := store.Pool.Query(ctx, `SELECT id, name, kind, base_url, auth_type, enabled, note, sort FROM model_channels ORDER BY sort, id`)
	if err != nil {
		return dir, err
	}
	defer channels.Close()
	for channels.Next() {
		var c Channel
		if err := channels.Scan(&c.ID, &c.Name, &c.Kind, &c.BaseURL, &c.AuthType, &c.Enabled, &c.Note, &c.Sort); err != nil {
			return dir, err
		}
		dir.Channels = append(dir.Channels, c)
	}
	if err := channels.Err(); err != nil {
		return dir, err
	}

	models, err := store.Pool.Query(ctx, `SELECT id, channel_id, family, name, provider_model, type, status, sort, note, protocol_template_id, request_path, method, params, response_params, capability, version FROM model_catalog ORDER BY type, sort, name`)
	if err != nil {
		return dir, err
	}
	defer models.Close()
	for models.Next() {
		var m Model
		if err := models.Scan(&m.ID, &m.ChannelID, &m.Family, &m.Name, &m.ProviderModel, &m.Type, &m.Status, &m.Sort, &m.Note, &m.ProtocolTemplateID, &m.RequestPath, &m.Method, &m.Params, &m.ResponseParams, &m.Capability, &m.Version); err != nil {
			return dir, err
		}
		dir.Models = append(dir.Models, m)
	}
	if err := models.Err(); err != nil {
		return dir, err
	}

	templates, err := store.Pool.Query(ctx, `SELECT t.id, t.label, t.description, t.type, t.method, t.request_path, t.params, t.response_params, t.async, t.capabilities, t.builtin, t.enabled, t.version, COALESCE(t.request_template, ''),
	        (SELECT count(*) FROM model_catalog mc WHERE mc.protocol_template_id = t.id) AS ref_count
	        FROM protocol_templates t ORDER BY t.builtin DESC, t.label`)
	if err != nil {
		return dir, err
	}
	defer templates.Close()
	for templates.Next() {
		var t ProtocolTemplate
		if err := templates.Scan(&t.ID, &t.Label, &t.Desc, &t.Type, &t.Method, &t.RequestPath, &t.Params, &t.ResponseParams, &t.Async, &t.Capabilities, &t.Builtin, &t.Enabled, &t.Version, &t.RequestTemplate, &t.RefCount); err != nil {
			return dir, err
		}
		dir.Templates = append(dir.Templates, t)
	}
	if err := templates.Err(); err != nil {
		return dir, err
	}
	// 内置接入方式以 Go 注册表为默认值：DB 行优先（专家覆盖），DB 缺失的 id 由注册表补齐。
	dir.Templates = MergeTemplates(dir.Templates)
	return dir, nil
}

func (store PostgresStore) GetModel(ctx context.Context, id string) (Model, error) {
	var m Model
	err := store.Pool.QueryRow(ctx, `SELECT id, channel_id, family, name, provider_model, type, status, sort, note, protocol_template_id, request_path, method, params, response_params, capability, version
        FROM model_catalog WHERE id = $1`, id).
		Scan(&m.ID, &m.ChannelID, &m.Family, &m.Name, &m.ProviderModel, &m.Type, &m.Status, &m.Sort, &m.Note, &m.ProtocolTemplateID, &m.RequestPath, &m.Method, &m.Params, &m.ResponseParams, &m.Capability, &m.Version)
	if errors.Is(err, pgx.ErrNoRows) {
		return m, ErrNotFound
	}
	return m, err
}

func (store PostgresStore) CreateModel(ctx context.Context, actor string, input Model) (Model, bool, error) {
	if err := input.Validate(); err != nil {
		return Model{}, false, err
	}
	if input.Method == "" {
		input.Method = "POST" // DB CHECK requires POST|GET; empty defaults to POST
	}
	if input.ID == "" {
		input.ID = modelID()
	}
	if input.Status == "" {
		input.Status = "enabled"
	}
	if len(input.Capability) == 0 {
		input.Capability = json.RawMessage("{}")
	}
	if len(input.Params) == 0 {
		input.Params = json.RawMessage("[]")
	}
	if len(input.ResponseParams) == 0 {
		input.ResponseParams = json.RawMessage("[]")
	}
	_, err := store.Pool.Exec(ctx, `INSERT INTO model_catalog (id, channel_id, family, name, provider_model, type, status, sort, note, protocol_template_id, request_path, method, params, response_params, capability, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
		input.ID, input.ChannelID, input.Family, input.Name, input.ProviderModel, input.Type, input.Status, input.Sort, input.Note, nullableString(input.ProtocolTemplateID), input.RequestPath, input.Method, input.Params, input.ResponseParams, input.Capability, actor)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) {
			switch pgErr.Code {
			case "23505":
				return Model{}, true, ErrDuplicate
			case "23503":
				return Model{}, false, ErrInvalidChannel
			}
		}
		return Model{}, false, err
	}
	input.Version = 1
	return input, false, nil
}

func (store PostgresStore) UpdateModel(ctx context.Context, actor string, id string, patch ModelPatch) (Model, error) {
	patch, err := normalizeModelPatch(patch)
	if err != nil {
		return Model{}, err
	}
	// empty capability means "leave unchanged"; use explicit sentinel instead
	var capability any
	if len(patch.Capability) > 0 {
		capability = patch.Capability
	}
	// params: 空 patch 视为不变；提供时整体替换
	var params any
	if len(patch.Params) > 0 {
		params = patch.Params
	}
	// responseParams: 空 patch 视为不变
	var responseParams any
	if len(patch.ResponseParams) > 0 {
		responseParams = patch.ResponseParams
	}
	row := store.Pool.QueryRow(ctx, `UPDATE model_catalog SET
            channel_id      = COALESCE($2, channel_id),
            family          = COALESCE(NULLIF($3, ''), family),
            name            = COALESCE(NULLIF($4, ''), name),
            provider_model  = COALESCE(NULLIF($5, ''), provider_model),
            type            = COALESCE(NULLIF($6, ''), type),
            status          = COALESCE(NULLIF($7, ''), status),
            sort            = COALESCE($8, sort),
            note            = COALESCE($9, note),
            protocol_template_id = COALESCE($10, protocol_template_id),
            request_path    = COALESCE(NULLIF($11, ''), request_path),
            method          = COALESCE(NULLIF($12, ''), method),
            params          = COALESCE($13, params),
            response_params = COALESCE($14, response_params),
            capability      = COALESCE($15, capability),
            created_by      = $16
        WHERE id = $1
        RETURNING id, channel_id, family, name, provider_model, type, status, sort, note, protocol_template_id, request_path, method, params, response_params, capability, version`,
		id,
		nullableString(patch.ChannelID),
		nullableString(patch.Family),
		nullableString(patch.Name),
		nullableString(patch.ProviderModel),
		nullableString(patch.Type),
		nullableString(patch.Status),
		patch.Sort,
		nullableString(patch.Note),
		nullableString(patch.ProtocolTemplateID),
		nullableString(patch.RequestPath),
		nullableString(patch.Method),
		params,
		responseParams,
		capability,
		actor)
	var m Model
	if err := row.Scan(&m.ID, &m.ChannelID, &m.Family, &m.Name, &m.ProviderModel, &m.Type, &m.Status, &m.Sort, &m.Note, &m.ProtocolTemplateID, &m.RequestPath, &m.Method, &m.Params, &m.ResponseParams, &m.Capability, &m.Version); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return m, ErrNotFound
		}
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23503" {
			return m, ErrInvalidChannel
		}
		return m, err
	}
	return m, nil
}

func (store PostgresStore) UpdateChannel(ctx context.Context, id string, patch ChannelPatch) (Channel, error) {
	if err := patch.Validate(); err != nil {
		return Channel{}, err
	}
	row := store.Pool.QueryRow(ctx, `UPDATE model_channels SET
            name      = COALESCE(NULLIF($2, ''), name),
            base_url  = COALESCE($3, base_url),
            auth_type = COALESCE(NULLIF($4, ''), auth_type),
            enabled   = COALESCE($5, enabled),
            note      = COALESCE($6, note),
            sort      = COALESCE($7, sort)
        WHERE id = $1
        RETURNING id, name, kind, base_url, auth_type, enabled, note, sort`,
		id,
		nullableString(patch.Name),
		nullableString(patch.BaseURL),
		nullableString(patch.AuthType),
		patch.Enabled,
		nullableString(patch.Note),
		patch.Sort)
	var c Channel
	if err := row.Scan(&c.ID, &c.Name, &c.Kind, &c.BaseURL, &c.AuthType, &c.Enabled, &c.Note, &c.Sort); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c, ErrNotFound
		}
		return c, err
	}
	return c, nil
}

func nullableString(v string) *string {
	if v == "" {
		return nil
	}
	return &v
}

// ---- ProtocolTemplate CRUD ----

func templateID() string {
	// 用户模板：pt_ + 22 位随机
	return "pt_" + randomHex(22)
}

func (store PostgresStore) CreateTemplate(ctx context.Context, actor string, input ProtocolTemplate) (ProtocolTemplate, bool, error) {
	if input.ID == "" {
		input.ID = templateID()
	}
	if input.Method == "" {
		input.Method = "POST"
	}
	if input.Enabled == false {
		// zero-value 语义：创建即启用；如需禁用走 Update
		input.Enabled = true
	}
	if len(input.Params) == 0 {
		input.Params = json.RawMessage("[]")
	}
	if len(input.ResponseParams) == 0 {
		input.ResponseParams = json.RawMessage("[]")
	}
	if len(input.Async) == 0 || string(input.Async) == "null" {
		input.Async = json.RawMessage("{}")
	}
	if len(input.Capabilities) == 0 || string(input.Capabilities) == "null" {
		input.Capabilities = json.RawMessage("{}")
	}
	if input.Type == "" {
		input.Type = "all"
	}
	_, err := store.Pool.Exec(ctx, `INSERT INTO protocol_templates (id, label, description, type, method, request_path, params, response_params, async, capabilities, request_template, builtin, enabled, version, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 1, $14)`,
		input.ID, input.Label, input.Desc, input.Type, input.Method, input.RequestPath, input.Params, input.ResponseParams, input.Async, input.Capabilities, nullableString(input.RequestTemplate), false, true, actor)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return ProtocolTemplate{}, true, ErrDuplicate
		}
		return ProtocolTemplate{}, false, err
	}
	input.Builtin = false
	input.Enabled = true
	input.Version = 1
	return input, false, nil
}

func (store PostgresStore) UpdateTemplate(ctx context.Context, actor string, id string, patch ProtocolTemplatePatch) (ProtocolTemplate, error) {
	if err := patch.Validate(); err != nil {
		return ProtocolTemplate{}, err
	}
	// params/responseParams：空 patch 视为不变；提供时整体替换
	var params any
	if len(patch.Params) > 0 {
		params = patch.Params
	}
	var responseParams any
	if len(patch.ResponseParams) > 0 {
		responseParams = patch.ResponseParams
	}
	var asyncVal any
	if len(patch.Async) > 0 && string(patch.Async) != "null" {
		asyncVal = patch.Async
	}
	var capabilitiesVal any
	if len(patch.Capabilities) > 0 && string(patch.Capabilities) != "null" {
		capabilitiesVal = patch.Capabilities
	}
	// request_template 用指针区分「不变」（nil）与「整体替换/清空」（含空串 → 回到 params[] 组装）。
	var requestTemplateVal any
	if patch.RequestTemplate != nil {
		requestTemplateVal = *patch.RequestTemplate
	}
	row := store.Pool.QueryRow(ctx, `UPDATE protocol_templates SET
            label           = COALESCE(NULLIF($2, ''), label),
            description     = COALESCE(NULLIF($3, ''), description),
            type            = COALESCE(NULLIF($4, ''), type),
            method          = COALESCE(NULLIF($5, ''), method),
            request_path    = COALESCE(NULLIF($6, ''), request_path),
            params          = COALESCE($7, params),
            response_params = COALESCE($8, response_params),
            async           = COALESCE($9, async),
            capabilities    = COALESCE($10, capabilities),
            enabled         = COALESCE($11, enabled),
            request_template = CASE WHEN $12::text IS NULL THEN request_template ELSE $12 END,
            version         = version + 1,
            updated_at      = now()
        WHERE id = $1
        RETURNING id, label, description, type, method, request_path, params, response_params, async, capabilities, builtin, enabled, version, COALESCE(request_template, '')`,
		id,
		nullableString(patch.Label),
		nullableString(patch.Desc),
		nullableString(patch.Type),
		nullableString(patch.Method),
		nullableString(patch.RequestPath),
		params,
		responseParams,
		asyncVal,
		capabilitiesVal,
		patch.Enabled,
		requestTemplateVal)
	var t ProtocolTemplate
	if err := row.Scan(&t.ID, &t.Label, &t.Desc, &t.Type, &t.Method, &t.RequestPath, &t.Params, &t.ResponseParams, &t.Async, &t.Capabilities, &t.Builtin, &t.Enabled, &t.Version, &t.RequestTemplate); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return t, ErrNotFound
		}
		return t, err
	}
	// 补 refCount
	if err := store.Pool.QueryRow(ctx, `SELECT count(*) FROM model_catalog WHERE protocol_template_id = $1`, id).Scan(&t.RefCount); err != nil {
		return t, err
	}
	return t, nil
}

func (store PostgresStore) DeleteTemplate(ctx context.Context, id string) error {
	// 内置模板禁删
	var builtin bool
	if err := store.Pool.QueryRow(ctx, `SELECT builtin FROM protocol_templates WHERE id = $1`, id).Scan(&builtin); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}
	if builtin {
		return ErrBuiltinProtected
	}
	// 被模型引用禁删
	var refs int
	if err := store.Pool.QueryRow(ctx, `SELECT count(*) FROM model_catalog WHERE protocol_template_id = $1`, id).Scan(&refs); err != nil {
		return err
	}
	if refs > 0 {
		return ErrTemplateInUse
	}
	_, err := store.Pool.Exec(ctx, `DELETE FROM protocol_templates WHERE id = $1`, id)
	return err
}
