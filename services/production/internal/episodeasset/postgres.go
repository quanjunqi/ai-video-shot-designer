package episodeasset

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresStore struct {
	Pool *pgxpool.Pool
}

// ListByEpisode 列出剧集下的所有资产
func (store PostgresStore) ListByEpisode(ctx context.Context, workspace, projectID, episodeID string) ([]EpisodeAsset, error) {
	rows, err := store.Pool.Query(ctx, `SELECT
		workspace_id, project_id, episode_id, id, kind, name, description, scope,
		source_scene, holder, current_version, versions, prompt, negative_prompt,
		image_url, status, model, stale,
		COALESCE(project_character_id, ''), COALESCE(project_prop_id, ''), COALESCE(project_scene_id, ''),
		COALESCE(episode_variant, '{}'::jsonb), COALESCE(variant_image_url, ''), COALESCE(variant_image_status, ''),
		COALESCE(variant_image_model, ''), COALESCE(variant_image_generated_at, '1970-01-01T00:00:00Z'::timestamptz),
		created_at, updated_at
		FROM episode_assets WHERE workspace_id = $1 AND project_id = $2 AND episode_id = $3
		ORDER BY kind, created_at`, workspace, projectID, episodeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var assets []EpisodeAsset
	for rows.Next() {
		a, err := scanAsset(rows)
		if err != nil {
			return nil, err
		}
		assets = append(assets, a)
	}
	return assets, rows.Err()
}

// ListByProject 列出项目下的所有资产
func (store PostgresStore) ListByProject(ctx context.Context, workspace, projectID string) ([]EpisodeAsset, error) {
	rows, err := store.Pool.Query(ctx, `SELECT
		workspace_id, project_id, episode_id, id, kind, name, description, scope,
		source_scene, holder, current_version, versions, prompt, negative_prompt,
		image_url, status, model, stale,
		COALESCE(project_character_id, ''), COALESCE(project_prop_id, ''), COALESCE(project_scene_id, ''),
		COALESCE(episode_variant, '{}'::jsonb), COALESCE(variant_image_url, ''), COALESCE(variant_image_status, ''),
		COALESCE(variant_image_model, ''), COALESCE(variant_image_generated_at, '1970-01-01T00:00:00Z'::timestamptz),
		created_at, updated_at
		FROM episode_assets WHERE workspace_id = $1 AND project_id = $2
		ORDER BY episode_id, kind, created_at`, workspace, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var assets []EpisodeAsset
	for rows.Next() {
		a, err := scanAsset(rows)
		if err != nil {
			return nil, err
		}
		assets = append(assets, a)
	}
	return assets, rows.Err()
}

// Get 获取单个资产
func (store PostgresStore) Get(ctx context.Context, workspace, projectID, episodeID, id string) (EpisodeAsset, error) {
	row := store.Pool.QueryRow(ctx, `SELECT
		workspace_id, project_id, episode_id, id, kind, name, description, scope,
		source_scene, holder, current_version, versions, prompt, negative_prompt,
		image_url, status, model, stale,
		COALESCE(project_character_id, ''), COALESCE(project_prop_id, ''), COALESCE(project_scene_id, ''),
		COALESCE(episode_variant, '{}'::jsonb), COALESCE(variant_image_url, ''), COALESCE(variant_image_status, ''),
		COALESCE(variant_image_model, ''), COALESCE(variant_image_generated_at, '1970-01-01T00:00:00Z'::timestamptz),
		created_at, updated_at
		FROM episode_assets WHERE workspace_id = $1 AND project_id = $2 AND episode_id = $3 AND id = $4`,
		workspace, projectID, episodeID, id)
	a, err := scanAsset(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return EpisodeAsset{}, ErrNotFound
	}
	return a, err
}

// Create 创建资产
func (store PostgresStore) Create(ctx context.Context, workspace, projectID, episodeID string, input CreateInput) (EpisodeAsset, error) {
	if err := input.Validate(); err != nil {
		return EpisodeAsset{}, err
	}
	scope := input.Scope
	if scope == "" {
		scope = "episode"
	}
	status := input.Status
	if status == "" {
		status = "DRAFT"
	}
	currentVersion := input.CurrentVersion
	if currentVersion == 0 {
		currentVersion = 1
	}
	versions := input.Versions
	if versions == nil {
		versions = []AssetVersion{}
	}
	_, err := store.Pool.Exec(ctx, `INSERT INTO episode_assets
		(workspace_id, project_id, episode_id, id, kind, name, description, scope,
		 source_scene, holder, current_version, versions, prompt, negative_prompt,
		 image_url, status, model, stale,
		 project_character_id, project_prop_id, project_scene_id, episode_variant)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
		workspace, projectID, episodeID, input.ID, input.Kind, input.Name,
		input.Description, scope, input.SourceScene, input.Holder, currentVersion,
		versions, input.Prompt, input.NegativePrompt, input.ImageURL, status,
		input.Model, input.Stale,
		input.ProjectCharacterID, input.ProjectPropID, input.ProjectSceneID, input.EpisodeVariant)
	if err != nil {
		return EpisodeAsset{}, err
	}
	return store.Get(ctx, workspace, projectID, episodeID, input.ID)
}

// Update 更新资产（部分更新）
func (store PostgresStore) Update(ctx context.Context, workspace, projectID, episodeID, id string, input UpdateInput) (EpisodeAsset, error) {
	var sets []string
	var args []interface{}
	argIdx := 1

	addSet := func(col string, val interface{}) {
		sets = append(sets, fmt.Sprintf("%s = $%d", col, argIdx))
		args = append(args, val)
		argIdx++
	}

	if input.Name != nil {
		addSet("name", *input.Name)
	}
	if input.Description != nil {
		addSet("description", *input.Description)
	}
	if input.Scope != nil {
		addSet("scope", *input.Scope)
	}
	if input.SourceScene != nil {
		addSet("source_scene", *input.SourceScene)
	}
	if input.Holder != nil {
		addSet("holder", *input.Holder)
	}
	if input.CurrentVersion != nil {
		addSet("current_version", *input.CurrentVersion)
	}
	if input.Versions != nil {
		addSet("versions", *input.Versions)
	}
	if input.Prompt != nil {
		addSet("prompt", *input.Prompt)
	}
	if input.NegativePrompt != nil {
		addSet("negative_prompt", *input.NegativePrompt)
	}
	if input.ImageURL != nil {
		addSet("image_url", *input.ImageURL)
	}
	if input.Status != nil {
		addSet("status", *input.Status)
	}
	if input.Model != nil {
		addSet("model", *input.Model)
	}
	if input.Stale != nil {
		addSet("stale", *input.Stale)
	}
	// 关联项目级资产
	if input.ProjectCharacterID != nil {
		addSet("project_character_id", *input.ProjectCharacterID)
	}
	if input.ProjectPropID != nil {
		addSet("project_prop_id", *input.ProjectPropID)
	}
	if input.ProjectSceneID != nil {
		addSet("project_scene_id", *input.ProjectSceneID)
	}
	// 单集状态变体
	if input.EpisodeVariant != nil {
		addSet("episode_variant", *input.EpisodeVariant)
	}
	// 单集变体立绘
	if input.VariantImageURL != nil {
		addSet("variant_image_url", *input.VariantImageURL)
	}
	if input.VariantImageStatus != nil {
		addSet("variant_image_status", *input.VariantImageStatus)
	}
	if input.VariantImageModel != nil {
		addSet("variant_image_model", *input.VariantImageModel)
	}
	if input.VariantImageGeneratedAt != nil {
		addSet("variant_image_generated_at", *input.VariantImageGeneratedAt)
	}

	if len(sets) == 0 {
		return store.Get(ctx, workspace, projectID, episodeID, id)
	}

	sets = append(sets, "updated_at = now()")
	args = append(args, workspace, projectID, episodeID, id)

	query := fmt.Sprintf(`UPDATE episode_assets SET %s WHERE workspace_id = $%d AND project_id = $%d AND episode_id = $%d AND id = $%d`,
		strings.Join(sets, ", "), argIdx, argIdx+1, argIdx+2, argIdx+3)

	cmdTag, err := store.Pool.Exec(ctx, query, args...)
	if err != nil {
		return EpisodeAsset{}, err
	}
	if cmdTag.RowsAffected() == 0 {
		return EpisodeAsset{}, ErrNotFound
	}
	return store.Get(ctx, workspace, projectID, episodeID, id)
}

// Delete 删除资产
func (store PostgresStore) Delete(ctx context.Context, workspace, projectID, episodeID, id string) error {
	cmdTag, err := store.Pool.Exec(ctx,
		`DELETE FROM episode_assets WHERE workspace_id = $1 AND project_id = $2 AND episode_id = $3 AND id = $4`,
		workspace, projectID, episodeID, id)
	if err != nil {
		return err
	}
	if cmdTag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// DeleteByEpisode 删除剧集下的所有资产
func (store PostgresStore) DeleteByEpisode(ctx context.Context, workspace, projectID, episodeID string) error {
	_, err := store.Pool.Exec(ctx,
		`DELETE FROM episode_assets WHERE workspace_id = $1 AND project_id = $2 AND episode_id = $3`,
		workspace, projectID, episodeID)
	return err
}

func scanAsset(row pgx.Row) (EpisodeAsset, error) {
	var a EpisodeAsset
	err := row.Scan(
		&a.WorkspaceID, &a.ProjectID, &a.EpisodeID, &a.ID, &a.Kind, &a.Name,
		&a.Description, &a.Scope, &a.SourceScene, &a.Holder, &a.CurrentVersion,
		&a.Versions, &a.Prompt, &a.NegativePrompt, &a.ImageURL, &a.Status,
		&a.Model, &a.Stale,
		&a.ProjectCharacterID, &a.ProjectPropID, &a.ProjectSceneID,
		&a.EpisodeVariant, &a.VariantImageURL, &a.VariantImageStatus,
		&a.VariantImageModel, &a.VariantImageGeneratedAt,
		&a.CreatedAt, &a.UpdatedAt,
	)
	return a, err
}
